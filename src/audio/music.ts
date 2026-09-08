import { sliderToGain } from './gain';
import { ramp, type Layer } from './layer';
import { createReverb } from './reverb';
import { buildScale, midiToFreq, pickNote } from './scale';
import { collectDue, tickIntervalMs, type SchedulerConfig } from './scheduler';
import {
  NOTE_PARTIALS,
  PAD_VOICES,
  bassMidi,
  detuneCents,
  padCycle,
  padPitch,
  voiceGains,
} from './voicing';
import type { MusicSettings } from '../state/types';

/**
 * The music bed: a slow, non repeating instrumental texture.
 *
 * This is the signal the modulation stage acts on. The studies added amplitude
 * modulation to music, so there has to be music, but the music itself is meant
 * to carry as little information as possible.
 *
 * Design rules, all of them in service of being ignorable:
 *
 *   No lyrics, ever. Not a stylistic choice. Furnham and Bradley (1997) found
 *   pop music with lyrics hurt immediate recall for everyone, and hurt delayed
 *   recall and reading comprehension considerably more for introverts. There is
 *   no speech synthesis anywhere in this codebase and there never will be.
 *
 *   No melody, because a melody is a thing to follow and then to expect.
 *   No pulse, because a beat is a thing to entrain to and then to miss.
 *   No percussion and no sharp onsets, because transients capture attention.
 *   No key change, no build, no resolution, no surprise.
 *
 * One fixed scale for the whole session. Pentatonic and Dorian both have the
 * property that any two notes drawn at random sound acceptable together, so the
 * scheduler can pick blindly and still never produce a moment that asks to be
 * noticed.
 *
 * There are three voices, not one. A bass drone under everything, a pad of
 * sustained voices that fade in and out on their own long clocks, and the
 * scheduled notes on top. That is an aesthetic decision and nothing more: one
 * note every seven seconds obeyed all the rules above and still sounded like a
 * test signal. The rules did not move to make room for it. Every voice is
 * sustained, every envelope is measured in tens of seconds, and none of them
 * gives you anything to follow.
 *
 * If you catch yourself listening to this layer, it is doing the wrong thing,
 * and the fix is to make it duller.
 */
export class MusicBed implements Layer<MusicSettings> {
  readonly output: GainNode;

  private readonly context: AudioContext;
  private readonly dry: GainNode;
  private readonly wet: GainNode;
  private readonly filter: BiquadFilterNode;
  private readonly trim: GainNode;
  private readonly level: GainNode;
  private readonly reverb: ConvolverNode;
  private readonly bassBus: GainNode;
  private readonly padBus: GainNode;

  private settings: MusicSettings | null = null;
  private scale: number[] = [];
  private previousNote: number | undefined;
  private nextTime = 0;
  private timer: ReturnType<typeof setInterval> | null = null;
  private config: SchedulerConfig = { lookahead: 2, meanInterval: 7, jitter: 0.6 };

  /** Long lived voices. Created on start, torn down on stop, never per note. */
  private drone: DroneVoice | null = null;
  private pad: PadVoice[] = [];
  private sweep: SpectralSweep | null = null;

  constructor(context: AudioContext) {
    this.context = context;
    this.output = context.createGain();

    this.level = context.createGain();
    this.level.gain.value = 0;
    this.level.connect(this.output);

    // Warmth adds voices, so warmth also pays for them here. Everything in the
    // bed passes through this node, including the bass.
    this.trim = context.createGain();
    this.trim.gain.value = 1;
    this.trim.connect(this.level);

    this.filter = context.createBiquadFilter();
    this.filter.type = 'lowpass';
    this.filter.frequency.value = 900;
    this.filter.Q.value = 0.5;
    this.filter.connect(this.trim);

    this.dry = context.createGain();
    this.wet = context.createGain();
    this.dry.gain.value = 0.7;
    this.wet.gain.value = 0.3;

    this.reverb = createReverb(context, { seconds: 3.5, decay: 2.4 });

    this.dry.connect(this.filter);
    this.wet.connect(this.reverb).connect(this.filter);

    // The pad sits with the notes, behind the tone control and the reverb send.
    this.padBus = context.createGain();
    this.padBus.gain.value = 0;
    this.padBus.connect(this.dry);
    this.padBus.connect(this.wet);

    // The bass skips both. The tone control goes down to 150 Hz, which would
    // erase a 55 Hz drone, and reverb on the bottom octave is only mud. It still
    // goes through the trim and the level, so it is still inside the modulation.
    this.bassBus = context.createGain();
    this.bassBus.gain.value = 0;
    this.bassBus.connect(this.trim);
  }

  update(settings: MusicSettings, masterSlider: number): void {
    this.settings = settings;
    const now = this.context.currentTime;

    this.scale = buildScale(settings.root, settings.scale, 3);
    this.config = { lookahead: 2, meanInterval: settings.density, jitter: 0.6 };

    const gains = voiceGains(settings.warmth);
    ramp(this.filter.frequency, settings.tone, now, 0.3);
    ramp(this.wet.gain, settings.space, now, 0.3);
    ramp(this.dry.gain, 1 - settings.space * 0.6, now, 0.3);
    ramp(this.trim.gain, gains.busTrim, now, 0.5);
    ramp(this.padBus.gain, settings.enabled ? gains.pad : 0, now, 2);
    ramp(this.bassBus.gain, settings.enabled ? gains.bass : 0, now, 2);

    const target = settings.enabled ? sliderToGain(settings.level) * sliderToGain(masterSlider) : 0;
    ramp(this.level.gain, target, now, 0.4);

    this.drone?.retune(midiToFreq(bassMidi(settings.root, midiToFreq)), now);
    this.sweep?.setCentre(settings.tone, now);

    if (settings.enabled && !this.timer) this.start();
    if (!settings.enabled && this.timer) this.stopTimer();
  }

  start(): void {
    if (this.timer) return;
    this.nextTime = this.context.currentTime + 0.5;
    this.timer = setInterval(() => this.tick(), tickIntervalMs(this.config));
    this.startVoices();
  }

  stop(): void {
    ramp(this.level.gain, 0, this.context.currentTime, 0.5);
    this.stopTimer();
  }

  dispose(): void {
    this.stopTimer();
    for (const node of [
      this.dry,
      this.wet,
      this.reverb,
      this.filter,
      this.padBus,
      this.bassBus,
      this.trim,
      this.level,
      this.output,
    ]) {
      node.disconnect();
    }
  }

  private stopTimer(): void {
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.stopVoices();
  }

  /**
   * Build the long lived voices. Their node count is fixed: one drone, four pad
   * voices, one sweep, and they are recycled rather than replaced. A voice that
   * allocated an oscillator every time it changed pitch would be a slow leak
   * over a four hour session, which is the failure mode that matters most here.
   */
  private startVoices(): void {
    const settings = this.settings;
    if (!settings || this.drone) return;
    const now = this.context.currentTime;

    this.drone = new DroneVoice(this.context, this.bassBus);
    this.drone.start(midiToFreq(bassMidi(settings.root, midiToFreq)), now);

    for (let i = 0; i < PAD_VOICES; i += 1) {
      const voice = new PadVoice(this.context, this.padBus, i);
      // Staggered so the four voices never share a clock edge.
      voice.start(this.scale, now + i * 7 + Math.random() * 5);
      this.pad.push(voice);
    }

    this.sweep = new SpectralSweep(this.context, this.filter.frequency);
    this.sweep.start(settings.tone, now);
  }

  private stopVoices(): void {
    const now = this.context.currentTime;
    this.drone?.stop(now);
    this.drone = null;
    for (const voice of this.pad) voice.stop(now);
    this.pad = [];
    this.sweep?.stop(now);
    this.sweep = null;
  }

  private tick(): void {
    const settings = this.settings;
    if (!settings || !settings.enabled || this.scale.length === 0) return;

    const { events, nextTime } = collectDue(
      this.context.currentTime,
      this.nextTime,
      this.config,
      Math.random,
    );
    this.nextTime = nextTime;

    for (const event of events) {
      const note = pickNote(this.scale, Math.random(), this.previousNote);
      this.previousNote = note;
      this.scheduleNote(midiToFreq(note), event.time);
    }

    for (const voice of this.pad) voice.tick(this.scale, this.context.currentTime);
  }

  /**
   * One note: a handful of partials, slightly detuned, with a very long attack
   * and release and a filter that opens and closes across the life of the note.
   * The attack is long enough that there is no onset to hear, only a thing that
   * turns out to have been there for a while.
   */
  private scheduleNote(frequency: number, when: number): void {
    const attack = 2.5 + Math.random() * 2;
    const hold = 2 + Math.random() * 4;
    const release = 4 + Math.random() * 4;
    const end = when + attack + hold + release;
    const peak = voiceGains(this.settings?.warmth ?? 0).note;

    const env = this.context.createGain();
    env.gain.setValueAtTime(0, when);
    env.gain.linearRampToValueAtTime(peak, when + attack);
    env.gain.setValueAtTime(peak, when + attack + hold);
    env.gain.linearRampToValueAtTime(0, end);

    // Per note filter movement. It opens while the note swells and closes while
    // it goes, so the note has a shape without ever having an edge. The whole
    // sweep takes tens of seconds, far too slow to read as a filter effect.
    const colour = this.context.createBiquadFilter();
    colour.type = 'lowpass';
    colour.Q.value = 0.4;
    const open = frequency * (4 + Math.random() * 3);
    colour.frequency.setValueAtTime(frequency * 2, when);
    colour.frequency.linearRampToValueAtTime(open, when + attack + hold);
    colour.frequency.linearRampToValueAtTime(frequency * 1.6, end);

    const pan = this.context.createStereoPanner();
    pan.pan.value = Math.random() * 1.2 - 0.6;

    const oscillators: OscillatorNode[] = [];
    for (const [index, [ratio, gainValue]] of NOTE_PARTIALS.entries()) {
      const osc = this.context.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = frequency * ratio;
      osc.detune.value = detuneCents(index, 5);
      const partial = this.context.createGain();
      partial.gain.value = gainValue;
      osc.connect(partial).connect(colour);
      osc.start(when);
      osc.stop(end + 0.1);
      oscillators.push(osc);
      osc.onended = () => {
        osc.disconnect();
        partial.disconnect();
      };
    }

    colour.connect(env);
    env.connect(pan);
    pan.connect(this.dry);
    pan.connect(this.wet);

    oscillators[0].addEventListener('ended', () => {
      colour.disconnect();
      env.disconnect();
      pan.disconnect();
    });
  }
}

/**
 * The bass drone: two oscillators a few cents apart, lowpassed hard, moving root
 * only when the root setting moves and then over twelve seconds.
 *
 * It is a floor, not a bassline. There is no envelope, no rhythm and no
 * articulation, because anything you could tap along to is a pulse.
 */
class DroneVoice {
  private readonly gain: GainNode;
  private readonly filter: BiquadFilterNode;
  private readonly oscillators: OscillatorNode[] = [];

  constructor(
    private readonly context: AudioContext,
    destination: AudioNode,
  ) {
    this.gain = context.createGain();
    this.gain.gain.value = 1;

    this.filter = context.createBiquadFilter();
    this.filter.type = 'lowpass';
    this.filter.frequency.value = 160;
    this.filter.Q.value = 0.7;

    this.filter.connect(this.gain).connect(destination);
  }

  start(frequency: number, now: number): void {
    for (let i = 0; i < 2; i += 1) {
      const osc = this.context.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = frequency;
      // Wider than the note detune. Down here a few cents is a beat every
      // several seconds, which is the slow swell the drone is there for.
      osc.detune.value = detuneCents(i, 7);
      osc.connect(this.filter);
      osc.start(now);
      this.oscillators.push(osc);
      osc.onended = () => osc.disconnect();
    }
    // The last oscillator to end takes the shared nodes down with it.
    const last = this.oscillators[this.oscillators.length - 1];
    last.addEventListener('ended', () => {
      this.filter.disconnect();
      this.gain.disconnect();
    });
  }

  retune(frequency: number, now: number): void {
    for (const osc of this.oscillators) ramp(osc.frequency, frequency, now, 12);
  }

  stop(now: number): void {
    ramp(this.gain.gain, 0, now, 1.5);
    for (const osc of this.oscillators) osc.stop(now + 2);
    this.oscillators.length = 0;
  }
}

/**
 * One pad voice: a detuned oscillator pair on its own very long envelope.
 *
 * The oscillators run for the life of the session and the pitch only ever
 * changes while the envelope is at zero, so a voice costs a fixed three nodes no
 * matter how many hours it runs. Each voice has its own clock, so the chord
 * drifts one voice at a time and never changes all at once.
 */
class PadVoice {
  private readonly gain: GainNode;
  private readonly oscillators: OscillatorNode[] = [];
  private until = 0;
  private stopped = false;

  constructor(
    private readonly context: AudioContext,
    destination: AudioNode,
    private readonly index: number,
  ) {
    this.gain = context.createGain();
    this.gain.gain.value = 0;
    this.gain.connect(destination);
  }

  start(scale: readonly number[], when: number): void {
    for (let i = 0; i < 2; i += 1) {
      const osc = this.context.createOscillator();
      osc.type = 'sine';
      osc.detune.value = detuneCents(i, 6);
      osc.connect(this.gain);
      osc.start(this.context.currentTime);
      this.oscillators.push(osc);
      osc.onended = () => osc.disconnect();
    }
    this.oscillators[this.oscillators.length - 1].addEventListener('ended', () => {
      this.gain.disconnect();
    });
    this.until = when;
    this.schedule(scale, when);
  }

  /** Called from the scheduler tick. Starts the next swell once the last ended. */
  tick(scale: readonly number[], now: number): void {
    if (this.stopped || scale.length === 0) return;
    if (now < this.until - 1) return;
    this.schedule(scale, Math.max(now, this.until));
  }

  stop(now: number): void {
    this.stopped = true;
    ramp(this.gain.gain, 0, now, 1.5);
    for (const osc of this.oscillators) osc.stop(now + 2);
    this.oscillators.length = 0;
  }

  private schedule(scale: readonly number[], when: number): void {
    const { attack, hold, release } = padCycle(Math.random);
    const frequency = midiToFreq(padPitch(scale, this.index, PAD_VOICES, Math.random()));

    // Retune at the bottom of the envelope, so the pitch change is inaudible.
    for (const osc of this.oscillators) osc.frequency.setValueAtTime(frequency, when);

    this.gain.gain.setValueAtTime(0, when);
    this.gain.gain.linearRampToValueAtTime(1, when + attack);
    this.gain.gain.setValueAtTime(1, when + attack + hold);
    this.gain.gain.linearRampToValueAtTime(0, when + attack + hold + release);

    // A gap before the voice returns, so the chord is not always four strong.
    this.until = when + attack + hold + release + 4 + Math.random() * 20;
  }
}

/**
 * A very slow sine on the bed's lowpass cutoff, about one cycle a minute.
 *
 * The point is that the texture is never quite where it was a minute ago without
 * ever being somewhere you noticed it going. It is applied as an offset on the
 * cutoff, so the brightness control still sets the centre of the movement.
 */
class SpectralSweep {
  private readonly lfo: OscillatorNode;
  private readonly depth: GainNode;

  constructor(context: AudioContext, target: AudioParam) {
    this.lfo = context.createOscillator();
    this.lfo.type = 'sine';
    this.lfo.frequency.value = 1 / 55;

    this.depth = context.createGain();
    this.depth.gain.value = 0;

    this.lfo.connect(this.depth).connect(target);
  }

  start(centre: number, now: number): void {
    this.lfo.start(now);
    this.setCentre(centre, now);
  }

  /** Swing is a fraction of the cutoff, so it stays proportionate at any tone. */
  setCentre(centre: number, now: number): void {
    ramp(this.depth.gain, centre * 0.35, now, 1);
  }

  stop(now: number): void {
    ramp(this.depth.gain, 0, now, 1);
    this.lfo.stop(now + 1.5);
    this.lfo.onended = () => {
      this.lfo.disconnect();
      this.depth.disconnect();
    };
  }
}
