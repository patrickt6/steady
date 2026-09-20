/**
 * Offline render entry for the measurement rig.
 *
 * The app schedules notes with a `setInterval` that reads `AudioContext.currentTime`.
 * An OfflineAudioContext renders faster than real time and its clock does not tick
 * while `startRendering()` runs, so that timer never lines up with the audio clock.
 * The fix here is a Proxy over the context that reports a virtual clock, plus
 * `MusicBed(context, manual = true)` so the rig drives `tick()` itself.
 */
import { ModulationStage } from '../../src/audio/modulation';
import { MusicBed } from '../../src/audio/music';
import { NoiseLayer } from '../../src/audio/noise';
import type { Settings } from '../../src/state/types';

type RenderConfig = Pick<Settings, 'master' | 'modulation' | 'music' | 'noise'>;

/** 16 bit mono WAV, so the result survives the trip out of the browser. */
function toWav(samples: Float32Array, sampleRate: number): string {
  const bytes = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(bytes);
  const ascii = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i += 1) view.setUint8(offset + i, text.charCodeAt(i));
  };
  ascii(0, 'RIFF');
  view.setUint32(4, 36 + samples.length * 2, true);
  ascii(8, 'WAVEfmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  ascii(36, 'data');
  view.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i += 1) {
    const clamped = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(44 + i * 2, clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff, true);
  }

  let binary = '';
  const block = new Uint8Array(bytes);
  for (let i = 0; i < block.length; i += 0x8000) {
    binary += String.fromCharCode(...block.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

export async function render(
  config: RenderConfig,
  seconds: number,
  sampleRate = 22050,
): Promise<string> {
  const raw = new OfflineAudioContext(1, Math.ceil(seconds * sampleRate), sampleRate);

  let clock = 0;
  const context = new Proxy(raw, {
    get(target, key) {
      if (key === 'currentTime') return clock;
      const value = Reflect.get(target, key) as unknown;
      return typeof value === 'function' ? value.bind(target) : value;
    },
  }) as unknown as AudioContext;

  // Same chain as Engine.start, minus the fade in.
  const master = raw.createGain();
  master.gain.value = 0.7;
  const limiter = raw.createDynamicsCompressor();
  limiter.threshold.value = -6;
  limiter.knee.value = 0;
  limiter.ratio.value = 20;
  limiter.attack.value = 0.003;
  limiter.release.value = 0.25;
  master.connect(limiter).connect(raw.destination);

  const music = new MusicBed(context, true);
  const modulation = new ModulationStage(context);
  const noise = new NoiseLayer(context, null); // buffer fallback: no worklet offline

  music.output.connect(modulation.input);
  modulation.output.connect(master);
  noise.output.connect(master);

  modulation.start();
  noise.start();
  music.update(config.music, config.master);
  noise.update(config.noise, config.master);
  modulation.set(
    config.modulation.enabled ? config.modulation.depth : 0,
    config.modulation.rate,
    0,
  );
  modulation.setCrossover(config.modulation.crossover, 0);

  // Drive the scheduler across the whole timeline before rendering.
  for (clock = 0; clock < seconds; clock += 0.5) music.tick();
  clock = 0;

  const buffer = await raw.startRendering();
  return toWav(buffer.getChannelData(0), sampleRate);
}

declare global {
  interface Window {
    steadyRender: typeof render;
  }
}
window.steadyRender = render;
