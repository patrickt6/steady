import { clamp, clamp01 } from '../audio/gain';
import { RATE_RANGE } from '../audio/modulation';
import { isNoiseColor } from '../audio/noise-dsp';
import { SCALES, type ScaleName } from '../audio/scale';
import type { Settings } from '../state/types';
import { DEFAULT_PRESET_ID, PRESETS, findPreset } from './presets';

export const SETTINGS_VERSION = 3;

/** Ranges the UI and the loader both enforce. */
export const LIMITS = {
  rate: [RATE_RANGE.min, RATE_RANGE.max] as const,
  crossover: [80, 2000] as const,
  noiseTone: [200, 16000] as const,
  musicTone: [150, 4000] as const,
  musicDensity: [2, 30] as const,
  musicRoot: [24, 72] as const,
  timerMinutes: [0, 240] as const,
};

function num(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function bool(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function isScaleName(value: unknown): value is ScaleName {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(SCALES, value);
}

/** Settings built from a preset id, with the global fields filled in. */
export function settingsFromPreset(id: string): Settings {
  const preset = findPreset(id) ?? PRESETS[0];
  return {
    version: SETTINGS_VERSION,
    presetId: preset.id,
    master: 0.6,
    timerMinutes: 0,
    fadeOutOnTimer: true,
    modulation: { ...preset.settings.modulation },
    music: { ...preset.settings.music },
    noise: { ...preset.settings.noise },
  };
}

export function defaultSettings(): Settings {
  return settingsFromPreset(DEFAULT_PRESET_ID);
}

/**
 * Coerce anything into valid Settings.
 *
 * This runs on whatever came back from localStorage, which could be from an
 * older version, hand edited, or corrupt. It never throws and never returns
 * something the audio graph would choke on.
 */
export function normalizeSettings(input: unknown): Settings {
  const base = defaultSettings();
  if (typeof input !== 'object' || input === null) return base;

  const raw = input as Record<string, unknown>;
  const modulation = (raw.modulation ?? {}) as Record<string, unknown>;
  const music = (raw.music ?? {}) as Record<string, unknown>;
  const noise = (raw.noise ?? {}) as Record<string, unknown>;

  const presetId =
    typeof raw.presetId === 'string' && findPreset(raw.presetId) ? raw.presetId : base.presetId;

  return {
    version: SETTINGS_VERSION,
    presetId,
    master: clamp01(num(raw.master, base.master)),
    timerMinutes: clamp(
      Math.round(num(raw.timerMinutes, base.timerMinutes)),
      LIMITS.timerMinutes[0],
      LIMITS.timerMinutes[1],
    ),
    fadeOutOnTimer: bool(raw.fadeOutOnTimer, base.fadeOutOnTimer),
    modulation: {
      enabled: bool(modulation.enabled, base.modulation.enabled),
      rate: clamp(num(modulation.rate, base.modulation.rate), LIMITS.rate[0], LIMITS.rate[1]),
      depth: clamp01(num(modulation.depth, base.modulation.depth)),
      crossover: clamp(
        num(modulation.crossover, base.modulation.crossover),
        LIMITS.crossover[0],
        LIMITS.crossover[1],
      ),
    },
    music: {
      enabled: bool(music.enabled, base.music.enabled),
      level: clamp01(num(music.level, base.music.level)),
      scale: isScaleName(music.scale) ? music.scale : base.music.scale,
      root: Math.round(
        clamp(num(music.root, base.music.root), LIMITS.musicRoot[0], LIMITS.musicRoot[1]),
      ),
      density: clamp(
        num(music.density, base.music.density),
        LIMITS.musicDensity[0],
        LIMITS.musicDensity[1],
      ),
      tone: clamp(num(music.tone, base.music.tone), LIMITS.musicTone[0], LIMITS.musicTone[1]),
      space: clamp01(num(music.space, base.music.space)),
      warmth: clamp01(num(music.warmth, base.music.warmth)),
    },
    noise: {
      enabled: bool(noise.enabled, base.noise.enabled),
      color: isNoiseColor(noise.color) ? noise.color : base.noise.color,
      level: clamp01(num(noise.level, base.noise.level)),
      tone: clamp(num(noise.tone, base.noise.tone), LIMITS.noiseTone[0], LIMITS.noiseTone[1]),
    },
  };
}

/** True when every shipped preset survives normalisation unchanged. */
export function presetsAreValid(): boolean {
  return PRESETS.every((preset) => {
    const built = settingsFromPreset(preset.id);
    return JSON.stringify(normalizeSettings(built)) === JSON.stringify(built);
  });
}
