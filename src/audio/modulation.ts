/**
 * The amplitude modulation stage. This is the part of the app the research is
 * actually about.
 *
 * Woods et al. (2024) added amplitude modulation to music and measured better
 * sustained attention, with a larger benefit in the beta range for listeners
 * reporting more attention problems. The proposed mechanism is entrainment:
 * rhythmic sensory input pulls neural oscillations toward its rate, and those
 * oscillations are a substrate of attention (Calderone et al., 2014). Beta in
 * particular is the band a modelling literature associates with selective
 * attention (Lee et al., 2013).
 *
 * So: take the music bed, multiply its envelope at a settable rate, and expose
 * both rate and depth. Not a fixed "correct" setting, because Geen (1984) found
 * people performed best at the stimulation level they picked for themselves.
 *
 * Two implementation choices worth explaining.
 *
 * The modulator is a sine, not a square or a sharp envelope. A square gate has
 * a discontinuity at every edge; at 16 Hz that is 32 clicks a second, and the
 * clicks are far more distracting than the modulation is helpful. A sine
 * produces a pair of sidebands at carrier plus and minus the rate and nothing
 * else, which is about as gentle as amplitude modulation gets.
 *
 * The modulation is applied only above a crossover, by default 300 Hz. Full
 * band modulation makes the bass pump, which reads as a tremolo effect and
 * pulls attention to the sound. Leaving the low end steady keeps the modulation
 * present in the signal, and measurable, while making it much easier to ignore.
 * The trade is that modulation depth at the very bottom of the spectrum is
 * lower than the depth slider says.
 */

/** Named modulation rates. Beta is the default because it is what was tested. */
export interface RatePreset {
  id: string;
  label: string;
  hz: number;
  note: string;
}

export const RATE_PRESETS: readonly RatePreset[] = [
  {
    id: 'beta',
    label: 'Beta',
    hz: 16,
    note: 'The range where the 2024 study found the largest benefit for listeners reporting more attention difficulties.',
  },
  {
    id: 'alpha',
    label: 'Alpha',
    hz: 10,
    note: 'A slower rate. Included so you can compare; the studies did not single it out.',
  },
  {
    id: 'slow',
    label: 'Slow',
    hz: 4,
    note: 'Slow enough to hear as a pulse rather than as texture.',
  },
];

export const DEFAULT_RATE_HZ = 16;

export const RATE_RANGE = { min: 1, max: 30 } as const;

/**
 * Gain arithmetic for the modulator.
 *
 * The gate gain is `offset + swing * sin(2*pi*rate*t)`, so it travels between
 * `offset - swing` and `offset + swing`. Setting `swing = depth / 2` and
 * `offset = 1 - depth / 2` gives a peak of 1 at every depth, and a trough of
 * `1 - depth`. At depth 1 the signal reaches true silence between peaks; at
 * depth 0 the stage is transparent.
 */
export function modulatorGains(depth: number): { offset: number; swing: number } {
  const d = Math.min(1, Math.max(0, Number.isFinite(depth) ? depth : 0));
  return { offset: 1 - d / 2, swing: d / 2 };
}

/** The gate gain at time `t` seconds, for testing the shape without audio. */
export function modulatorValue(depth: number, rateHz: number, t: number): number {
  const { offset, swing } = modulatorGains(depth);
  return offset + swing * Math.sin(2 * Math.PI * rateHz * t);
}

/** Trough and peak of the gate for a given depth. */
export function modulationRange(depth: number): { min: number; max: number } {
  const { offset, swing } = modulatorGains(depth);
  return { min: offset - swing, max: offset + swing };
}

/**
 * Where the sidebands land for a carrier component at `carrierHz`.
 * Useful for reasoning about whether the modulation will sound rough: sidebands
 * within a critical band of the carrier are heard as beating rather than as
 * separate tones.
 */
export function sidebands(carrierHz: number, rateHz: number): [number, number] {
  return [carrierHz - rateHz, carrierHz + rateHz];
}

/**
 * The modulation stage as an audio graph.
 *
 * input -> [lowpass  -> dry ] -> output
 *          [highpass -> gate] -> output
 */
export class ModulationStage {
  readonly input: GainNode;
  readonly output: GainNode;

  private readonly low: BiquadFilterNode;
  private readonly high: BiquadFilterNode;
  private readonly gate: GainNode;
  private readonly lfo: OscillatorNode;
  private readonly swing: GainNode;
  private readonly offset: ConstantSourceNode;
  private started = false;

  constructor(context: AudioContext, crossoverHz = 300) {
    this.input = context.createGain();
    this.output = context.createGain();

    this.low = context.createBiquadFilter();
    this.low.type = 'lowpass';
    this.low.frequency.value = crossoverHz;

    this.high = context.createBiquadFilter();
    this.high.type = 'highpass';
    this.high.frequency.value = crossoverHz;

    this.gate = context.createGain();
    this.gate.gain.value = 1;

    this.offset = context.createConstantSource();
    this.offset.offset.value = 1;
    this.offset.connect(this.gate.gain);

    this.lfo = context.createOscillator();
    this.lfo.type = 'sine';
    this.lfo.frequency.value = DEFAULT_RATE_HZ;
    this.swing = context.createGain();
    this.swing.gain.value = 0;
    this.lfo.connect(this.swing).connect(this.gate.gain);

    this.input.connect(this.low).connect(this.output);
    this.input.connect(this.high).connect(this.gate).connect(this.output);
  }

  set(depth: number, rateHz: number, at: number): void {
    const { offset, swing } = modulatorGains(depth);
    // Ramp rather than step. A jump in the gate offset is a click.
    for (const [param, value] of [
      [this.offset.offset, offset],
      [this.swing.gain, swing],
      [this.lfo.frequency, rateHz],
    ] as const) {
      param.cancelScheduledValues(at);
      param.setValueAtTime(param.value, at);
      param.linearRampToValueAtTime(value, at + 0.15);
    }
  }

  setCrossover(hz: number, at: number): void {
    for (const filter of [this.low, this.high]) {
      filter.frequency.cancelScheduledValues(at);
      filter.frequency.setValueAtTime(filter.frequency.value, at);
      filter.frequency.linearRampToValueAtTime(hz, at + 0.15);
    }
  }

  start(): void {
    if (this.started) return;
    this.started = true;
    this.lfo.start();
    this.offset.start();
  }

  dispose(): void {
    for (const node of [this.lfo, this.offset]) {
      try {
        node.stop();
      } catch {
        // Never started.
      }
      node.disconnect();
    }
    for (const node of [this.input, this.low, this.high, this.gate, this.swing, this.output]) {
      node.disconnect();
    }
  }
}
