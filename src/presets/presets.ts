import type { Settings } from '../state/types';

export interface Preset {
  id: string;
  name: string;
  /** One line, shown under the name. Describes the sound, not a promised effect. */
  blurb: string;
  settings: Omit<Settings, 'version' | 'presetId' | 'master' | 'timerMinutes' | 'fadeOutOnTimer'>;
}

/**
 * Presets set every parameter at once. That is the whole point of them: nobody
 * who sat down to study wants to open a mixer first.
 *
 * "Deep work" is the default and it is the closest thing here to what the
 * studies actually tested: an instrumental bed with amplitude modulation in the
 * beta range. Everything else is a variation for people who want one.
 *
 * None of these is the correct setting for you. Geen (1984) found people
 * performed best at the stimulation level they chose for themselves, so the
 * presets are starting points and the sliders are the feature.
 */
export const PRESETS: readonly Preset[] = [
  {
    id: 'deep-work',
    name: 'Deep work',
    blurb: 'Instrumental bed with beta-rate modulation. The closest to what the studies tested.',
    settings: {
      modulation: { enabled: true, rate: 16, depth: 0.6, crossover: 300 },
      music: {
        enabled: true,
        level: 0.5,
        scale: 'pentatonic',
        root: 45,
        density: 5,
        tone: 1100,
        space: 0.4,
        warmth: 0.7,
      },
      noise: { enabled: true, color: 'pink', level: 0.35, tone: 6000 },
    },
  },
  {
    id: 'reading',
    name: 'Reading',
    blurb: 'Gentler modulation and a duller bed, for tasks that involve words.',
    settings: {
      modulation: { enabled: true, rate: 16, depth: 0.3, crossover: 400 },
      music: {
        enabled: true,
        level: 0.35,
        scale: 'dorian',
        root: 45,
        density: 7,
        tone: 700,
        space: 0.5,
        warmth: 0.55,
      },
      noise: { enabled: true, color: 'brown', level: 0.3, tone: 2200 },
    },
  },
  {
    id: 'low-stimulation',
    name: 'Low stimulation',
    blurb: 'Quiet, slow, barely modulated and nearly bare. For days when everything is too much.',
    settings: {
      modulation: { enabled: true, rate: 10, depth: 0.15, crossover: 500 },
      music: {
        enabled: true,
        level: 0.22,
        scale: 'pentatonic',
        root: 40,
        density: 11,
        tone: 500,
        space: 0.55,
        warmth: 0.15,
      },
      noise: { enabled: true, color: 'brown', level: 0.28, tone: 1200 },
    },
  },
  {
    id: 'noise-only',
    name: 'Noise only',
    blurb: 'Plain pink noise. No music and no modulation.',
    settings: {
      modulation: { enabled: false, rate: 16, depth: 0.5, crossover: 300 },
      music: {
        enabled: false,
        level: 0.4,
        scale: 'pentatonic',
        root: 45,
        density: 7,
        tone: 900,
        space: 0.4,
        warmth: 0,
      },
      noise: { enabled: true, color: 'pink', level: 0.6, tone: 9000 },
    },
  },
];

export const DEFAULT_PRESET_ID = 'deep-work';

export function findPreset(id: string): Preset | undefined {
  return PRESETS.find((p) => p.id === id);
}
