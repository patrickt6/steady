import { describe, expect, it } from 'vitest';
import { clearSettings, loadSettings, saveSettings } from './settings';
import { defaultSettings } from '../presets/validate';

/** Minimal in-memory Storage, enough for these functions. */
function memoryStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear: () => map.clear(),
    getItem: (key) => map.get(key) ?? null,
    key: (index) => [...map.keys()][index] ?? null,
    removeItem: (key) => void map.delete(key),
    setItem: (key, value) => void map.set(key, value),
  } as Storage;
}

function brokenStorage(): Storage {
  const throwing = () => {
    throw new Error('storage unavailable');
  };
  return {
    length: 0,
    clear: throwing,
    getItem: throwing,
    key: throwing,
    removeItem: throwing,
    setItem: throwing,
  } as unknown as Storage;
}

describe('settings persistence', () => {
  it('returns defaults when nothing is stored', () => {
    expect(loadSettings(memoryStorage())).toEqual(defaultSettings());
  });

  it('round trips', () => {
    const storage = memoryStorage();
    const settings = { ...defaultSettings(), master: 0.31, timerMinutes: 45 };
    saveSettings(settings, storage);
    expect(loadSettings(storage)).toEqual(settings);
  });

  it('falls back to defaults on malformed JSON instead of throwing', () => {
    const storage = memoryStorage();
    storage.setItem('steady.settings.v1', '{ not json');
    expect(loadSettings(storage)).toEqual(defaultSettings());
  });

  it('normalises whatever it reads back', () => {
    const storage = memoryStorage();
    storage.setItem('steady.settings.v1', JSON.stringify({ master: 900 }));
    expect(loadSettings(storage).master).toBe(1);
  });

  it('survives storage that throws, as in some private browsing modes', () => {
    const storage = brokenStorage();
    expect(() => saveSettings(defaultSettings(), storage)).not.toThrow();
    expect(() => clearSettings(storage)).not.toThrow();
    expect(loadSettings(storage)).toEqual(defaultSettings());
  });

  it('returns defaults when there is no storage at all', () => {
    expect(loadSettings(undefined)).toEqual(defaultSettings());
    expect(() => saveSettings(defaultSettings(), undefined)).not.toThrow();
  });

  it('clears', () => {
    const storage = memoryStorage();
    saveSettings({ ...defaultSettings(), master: 0.1 }, storage);
    clearSettings(storage);
    expect(loadSettings(storage)).toEqual(defaultSettings());
  });
});
