import type { NoiseColor } from '../audio/noise-dsp';
import type { ScaleName } from '../audio/scale';

/**
 * The amplitude modulation stage. This is the layer the cited research is
 * about, so it is the one at the top of the file and the top of the UI.
 */
export interface ModulationSettings {
  enabled: boolean;
  /** Modulation rate in Hz. Around 16 is the beta range the studies tested. */
  rate: number;
  /** 0 for no modulation, 1 for the signal reaching silence at each trough. */
  depth: number;
  /** Only content above this frequency is modulated, in Hz. */
  crossover: number;
}

/** The generative instrumental bed. No lyrics, ever. See `audio/music.ts`. */
export interface MusicSettings {
  enabled: boolean;
  level: number;
  scale: ScaleName;
  /** MIDI note number of the root. */
  root: number;
  /** Mean seconds between notes. */
  density: number;
  /** Lowpass corner in Hz. */
  tone: number;
  /** Wet level of the generated reverb, 0 to 1. */
  space: number;
  /**
   * How much bass drone and sustained pad sit under the notes, 0 to 1. At 0 the
   * bed is notes and reverb only. An aesthetic control, not a researched one.
   */
  warmth: number;
}

/**
 * Noise. A secondary layer, included because a lot of people like it, not
 * because it is what the modulation studies tested. Its own separate evidence
 * base is in the README.
 */
export interface NoiseSettings {
  enabled: boolean;
  color: NoiseColor;
  level: number;
  /** Lowpass corner in Hz. Lower is duller and easier to sit under. */
  tone: number;
}

export interface Settings {
  version: number;
  presetId: string;
  master: number;
  /** Session length in minutes; 0 means no timer. */
  timerMinutes: number;
  fadeOutOnTimer: boolean;
  modulation: ModulationSettings;
  music: MusicSettings;
  noise: NoiseSettings;
}

export type LayerName = 'music' | 'noise';

export const LAYER_NAMES: readonly LayerName[] = ['music', 'noise'] as const;
