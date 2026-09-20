import { defaultSettings, normalizeSettings } from '../presets/validate';
import type { Settings } from './types';

const STORAGE_KEY = 'steady.settings.v1';

/**
 * Settings live in localStorage so a returning user presses play and gets the
 * sound they had last time. Nothing leaves the machine; there is no server.
 */
export function loadSettings(storage: Storage | undefined = safeStorage()): Settings {
  if (!storage) return defaultSettings();
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return defaultSettings();
    return normalizeSettings(JSON.parse(raw));
  } catch {
    return defaultSettings();
  }
}

export function saveSettings(
  settings: Settings,
  storage: Storage | undefined = safeStorage(),
): void {
  if (!storage) return;
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Private browsing, a full quota, or storage blocked entirely. The app works
    // without persistence, so there is nothing useful to tell the user here.
  }
}

export function clearSettings(storage: Storage | undefined = safeStorage()): void {
  try {
    storage?.removeItem(STORAGE_KEY);
  } catch {
    // Same as above.
  }
}

function safeStorage(): Storage | undefined {
  try {
    return typeof localStorage === 'undefined' ? undefined : localStorage;
  } catch {
    return undefined;
  }
}
