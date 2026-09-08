import { SAFETY_CEILING, fadeSeconds } from './gain';
import { ramp } from './layer';
import { ModulationStage } from './modulation';
import { MusicBed } from './music';
import { NoiseLayer } from './noise';
import type { Settings } from '../state/types';

export interface EngineOptions {
  /** URL of the noise worklet module. */
  workletUrl: string;
  fadeIn?: number;
  fadeOut?: number;
}

/**
 * Owns the AudioContext and the signal chain.
 *
 *   music bed -> modulation stage --.
 *                                    >-- master gain -> limiter -> output
 *   noise ---------------------------'
 *
 * The music goes through the modulation stage and the noise does not. The
 * studies modulated music, so that is what gets modulated here. Modulated noise
 * is a different thing that nobody in the reference list tested.
 *
 * The limiter is a DynamicsCompressor set very high and very hard. It is a
 * safety device rather than a tone control, and it is set so that no
 * combination of sliders can produce something painful in headphones. The
 * master gain is separately capped at SAFETY_CEILING.
 */
export class Engine {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private modulation: ModulationStage | null = null;
  private music: MusicBed | null = null;
  private noise: NoiseLayer | null = null;
  private playing = false;
  private usingWorklet = false;

  constructor(private readonly options: EngineOptions) {}

  get isPlaying(): boolean {
    return this.playing;
  }

  /** True once running, and only then, whether the worklet path is in use. */
  get workletActive(): boolean {
    return this.usingWorklet;
  }

  /** The live AudioContext, if there is one. The headphone check borrows it. */
  get audioContext(): AudioContext | null {
    return this.context;
  }

  /**
   * Build the graph. Must be called from a user gesture: browsers will not let
   * an AudioContext start on its own, and quite rightly.
   */
  async start(settings: Settings): Promise<void> {
    if (this.playing) return;

    if (!this.context) {
      const context = new AudioContext();
      const master = context.createGain();
      master.gain.value = 0;

      const limiter = context.createDynamicsCompressor();
      limiter.threshold.value = -6;
      limiter.knee.value = 0;
      limiter.ratio.value = 20;
      limiter.attack.value = 0.003;
      limiter.release.value = 0.25;

      master.connect(limiter).connect(context.destination);

      const workletNode = await NoiseLayer.createWorklet(context, this.options.workletUrl);
      this.usingWorklet = workletNode !== null;

      this.music = new MusicBed(context);
      this.modulation = new ModulationStage(context);
      this.noise = new NoiseLayer(context, workletNode);

      this.music.output.connect(this.modulation.input);
      this.modulation.output.connect(master);
      this.noise.output.connect(master);

      this.context = context;
      this.master = master;
    }

    await this.context.resume();

    this.modulation?.start();
    this.noise?.start();
    this.apply(settings);

    if (this.master) {
      const now = this.context.currentTime;
      ramp(this.master.gain, SAFETY_CEILING, now, fadeSeconds(this.options.fadeIn ?? 1.2));
    }
    this.playing = true;
  }

  /** Fade out, then suspend. Never a hard cut. */
  async stop(): Promise<void> {
    if (!this.playing || !this.context || !this.master) return;
    const seconds = fadeSeconds(this.options.fadeOut ?? 1.2);
    ramp(this.master.gain, 0, this.context.currentTime, seconds);
    this.playing = false;

    const context = this.context;
    await new Promise((resolve) => setTimeout(resolve, seconds * 1000 + 60));
    this.music?.stop();
    if (!this.playing) await context.suspend();
  }

  /** Push settings into a running graph. Safe to call before start. */
  apply(settings: Settings): void {
    this.music?.update(settings.music, settings.master);
    this.noise?.update(settings.noise, settings.master);

    if (this.modulation && this.context) {
      const now = this.context.currentTime;
      const depth = settings.modulation.enabled ? settings.modulation.depth : 0;
      this.modulation.set(depth, settings.modulation.rate, now);
      this.modulation.setCrossover(settings.modulation.crossover, now);
    }
  }

  async dispose(): Promise<void> {
    this.music?.dispose();
    this.modulation?.dispose();
    this.noise?.dispose();
    this.master?.disconnect();
    await this.context?.close();
    this.context = null;
    this.master = null;
    this.playing = false;
  }
}
