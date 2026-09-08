import { sliderToGain } from './gain';
import { ramp, type Layer } from './layer';
import { crossfadeLoop, fillNoise } from './noise-dsp';
import type { NoiseSettings } from '../state/types';

/**
 * The noise layer.
 *
 * Preferred path is an AudioWorklet, which generates noise on the audio thread
 * and therefore has no loop point and no glitch when the main thread stalls.
 * The fallback is a thirty second buffer with a crossfaded seam, used only when
 * AudioWorklet is missing. A thirty second loop is audible if you go looking for
 * it, which is why it is the fallback and not the design.
 */
export class NoiseLayer implements Layer<NoiseSettings> {
  readonly output: GainNode;

  private readonly context: AudioContext;
  private readonly filter: BiquadFilterNode;
  private readonly gain: GainNode;
  private worklet: AudioWorkletNode | null = null;
  private source: AudioBufferSourceNode | null = null;
  private currentColor: NoiseSettings['color'] = 'pink';
  private running = false;

  constructor(context: AudioContext, worklet: AudioWorkletNode | null) {
    this.context = context;
    this.gain = context.createGain();
    this.gain.gain.value = 0;
    this.filter = context.createBiquadFilter();
    this.filter.type = 'lowpass';
    this.filter.frequency.value = 6000;
    this.filter.Q.value = 0.7;
    this.output = context.createGain();

    this.filter.connect(this.gain).connect(this.output);

    if (worklet) {
      this.worklet = worklet;
      worklet.connect(this.filter);
    }
  }

  /** Build the worklet node, or return null if the browser cannot. */
  static async createWorklet(context: AudioContext, url: string): Promise<AudioWorkletNode | null> {
    if (!context.audioWorklet) return null;
    try {
      await context.audioWorklet.addModule(url);
      return new AudioWorkletNode(context, 'noise-processor', {
        numberOfInputs: 0,
        numberOfOutputs: 1,
        outputChannelCount: [2],
        processorOptions: { color: 'pink' },
      });
    } catch {
      return null;
    }
  }

  update(settings: NoiseSettings, masterSlider: number): void {
    const now = this.context.currentTime;
    const target = settings.enabled ? sliderToGain(settings.level) * sliderToGain(masterSlider) : 0;
    ramp(this.gain.gain, target, now, 0.12);
    ramp(this.filter.frequency, settings.tone, now, 0.12);

    if (settings.color !== this.currentColor) {
      this.currentColor = settings.color;
      if (this.worklet) {
        this.worklet.port.postMessage({ color: settings.color });
      } else if (this.running) {
        this.startFallback();
      }
    }
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    if (!this.worklet) this.startFallback();
  }

  stop(): void {
    this.running = false;
    this.stopFallback();
  }

  dispose(): void {
    this.stop();
    this.worklet?.disconnect();
    this.filter.disconnect();
    this.gain.disconnect();
    this.output.disconnect();
  }

  private startFallback(): void {
    this.stopFallback();
    const seconds = 30;
    const rate = this.context.sampleRate;
    const raw = new Float32Array(Math.floor(rate * (seconds + 0.5)));
    fillNoise(raw, this.currentColor, 0x5eed);
    const looped = crossfadeLoop(raw, Math.floor(rate * 0.5));

    const buffer = this.context.createBuffer(1, looped.length, rate);
    // Copy into a fresh array: `subarray` keeps a view on the original buffer,
    // which `copyToChannel` will not accept.
    buffer.copyToChannel(Float32Array.from(looped), 0);

    const source = this.context.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    source.connect(this.filter);
    source.start();
    this.source = source;
  }

  private stopFallback(): void {
    if (!this.source) return;
    try {
      this.source.stop();
    } catch {
      // Already stopped.
    }
    this.source.disconnect();
    this.source = null;
  }
}
