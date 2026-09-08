import { describe, expect, it } from 'vitest';
import {
  LIMITS,
  SETTINGS_VERSION,
  defaultSettings,
  normalizeSettings,
  presetsAreValid,
  settingsFromPreset,
} from './validate';
import { DEFAULT_PRESET_ID, PRESETS } from './presets';

describe('shipped presets', () => {
  it('all survive normalisation unchanged', () => {
    expect(presetsAreValid()).toBe(true);
  });

  it('have unique ids', () => {
    const ids = PRESETS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('include the default', () => {
    expect(PRESETS.some((p) => p.id === DEFAULT_PRESET_ID)).toBe(true);
  });

  it('all have a name and a blurb', () => {
    for (const preset of PRESETS) {
      expect(preset.name.length).toBeGreaterThan(0);
      expect(preset.blurb.length).toBeGreaterThan(0);
    }
  });

  it('keep modulation rates inside the allowed range', () => {
    for (const preset of PRESETS) {
      expect(preset.settings.modulation.rate).toBeGreaterThanOrEqual(LIMITS.rate[0]);
      expect(preset.settings.modulation.rate).toBeLessThanOrEqual(LIMITS.rate[1]);
    }
  });

  it('always leave something audible turned on', () => {
    for (const preset of PRESETS) {
      expect(preset.settings.music.enabled || preset.settings.noise.enabled).toBe(true);
    }
  });

  it('default to a beta-rate modulation, which is what the studies tested', () => {
    const preset = settingsFromPreset(DEFAULT_PRESET_ID);
    expect(preset.modulation.enabled).toBe(true);
    expect(preset.modulation.rate).toBeGreaterThanOrEqual(13);
    expect(preset.modulation.rate).toBeLessThanOrEqual(30);
  });
});

describe('settingsFromPreset', () => {
  it('falls back to the first preset for an unknown id', () => {
    expect(settingsFromPreset('nope').presetId).toBe(PRESETS[0].id);
  });

  it('does not share objects with the preset, so edits cannot corrupt it', () => {
    const a = settingsFromPreset('deep-work');
    const b = settingsFromPreset('deep-work');
    a.music.level = 0.01;
    expect(b.music.level).not.toBe(0.01);
    expect(PRESETS[0].settings.music.level).not.toBe(0.01);
  });
});

describe('normalizeSettings', () => {
  it('returns defaults for junk input', () => {
    for (const junk of [null, undefined, 5, 'settings', [], true]) {
      expect(normalizeSettings(junk)).toEqual(defaultSettings());
    }
  });

  it('is idempotent', () => {
    const once = normalizeSettings({ master: 3, music: { level: -1 } });
    expect(normalizeSettings(once)).toEqual(once);
  });

  it('clamps every numeric field into range', () => {
    const wild = normalizeSettings({
      master: 99,
      timerMinutes: 100000,
      modulation: { rate: 5000, depth: 12, crossover: 0 },
      music: { level: -4, density: 0, tone: 999999, root: 1, space: 7 },
      noise: { level: 50, tone: -3 },
    });

    expect(wild.master).toBe(1);
    expect(wild.timerMinutes).toBe(LIMITS.timerMinutes[1]);
    expect(wild.modulation.rate).toBe(LIMITS.rate[1]);
    expect(wild.modulation.depth).toBe(1);
    expect(wild.modulation.crossover).toBe(LIMITS.crossover[0]);
    expect(wild.music.level).toBe(0);
    expect(wild.music.density).toBe(LIMITS.musicDensity[0]);
    expect(wild.music.tone).toBe(LIMITS.musicTone[1]);
    expect(wild.music.root).toBe(LIMITS.musicRoot[0]);
    expect(wild.music.space).toBe(1);
    expect(wild.noise.level).toBe(1);
    expect(wild.noise.tone).toBe(LIMITS.noiseTone[0]);
  });

  it('rejects NaN and Infinity rather than passing them to the audio graph', () => {
    const result = normalizeSettings({
      master: Number.NaN,
      modulation: { rate: Number.POSITIVE_INFINITY, depth: Number.NaN },
    });
    for (const value of [result.master, result.modulation.rate, result.modulation.depth]) {
      expect(Number.isFinite(value)).toBe(true);
    }
  });

  it('replaces unknown enum values with the defaults', () => {
    const result = normalizeSettings({
      presetId: 'not-a-preset',
      music: { scale: 'lydian' },
      noise: { color: 'chartreuse' },
    });
    expect(result.presetId).toBe(DEFAULT_PRESET_ID);
    expect(result.music.scale).toBe(defaultSettings().music.scale);
    expect(result.noise.color).toBe(defaultSettings().noise.color);
  });

  it('keeps valid values it is given', () => {
    const result = normalizeSettings({
      presetId: 'reading',
      master: 0.42,
      modulation: { enabled: false, rate: 10, depth: 0.25, crossover: 400 },
      noise: { color: 'brown' },
    });
    expect(result.presetId).toBe('reading');
    expect(result.master).toBe(0.42);
    expect(result.modulation).toEqual({
      enabled: false,
      rate: 10,
      depth: 0.25,
      crossover: 400,
    });
    expect(result.noise.color).toBe('brown');
  });

  it('rounds the timer to whole minutes', () => {
    expect(normalizeSettings({ timerMinutes: 24.7 }).timerMinutes).toBe(25);
  });

  it('stamps the current version, so old saved settings are upgraded', () => {
    expect(normalizeSettings({ version: 0 }).version).toBe(SETTINGS_VERSION);
  });

  it('survives settings from the previous schema, which had other layers', () => {
    const old = {
      version: 1,
      presetId: 'deep-work',
      master: 0.5,
      pad: { enabled: true, level: 0.3 },
      binaural: { enabled: true, beat: 14 },
      isochronic: { enabled: true, rate: 14 },
      noise: { enabled: true, color: 'pink', level: 0.5, tone: 6000 },
    };
    const result = normalizeSettings(old);
    expect(result.version).toBe(SETTINGS_VERSION);
    expect(result.master).toBe(0.5);
    expect(result.noise.color).toBe('pink');
    expect(result.music).toEqual(defaultSettings().music);
    expect(result).not.toHaveProperty('binaural');
  });
});
