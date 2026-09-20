import { Engine } from '../audio/engine';
import { PRESETS } from '../presets/presets';
import { settingsFromPreset } from '../presets/validate';
import { loadSettings, saveSettings } from '../state/settings';
import { el } from './controls';
import { mountOrb } from './orb';

/**
 * Wiring.
 *
 * The constraint that decides most of this file: a first time visitor should be
 * able to start good sound without reading anything or making a single choice.
 * So the play button is the only thing above the fold that matters, and a
 * sensible preset is already loaded. Everything that used to live behind a
 * details panel, the timer and the advanced sliders and the headphone check,
 * has been cut: the page is now the orb, play, the four presets, and volume.
 */
export function mountApp(workletUrl: string): void {
  let settings = loadSettings();
  const engine = new Engine({ workletUrl });

  const playButton = must<HTMLButtonElement>('#play');
  const playLabel = must<HTMLElement>('#play-label');
  const status = must<HTMLElement>('#status');
  const masterInput = must<HTMLInputElement>('#master');
  const presetList = must<HTMLElement>('#preset-list');
  const presetBlurb = must<HTMLElement>('#preset-blurb');
  const orbHost = must<HTMLElement>('#orb-host');

  const orb = mountOrb(orbHost, { rateHz: settings.modulation.rate });
  orb.setState('breathing');

  masterInput.value = String(settings.master);

  renderPresets();

  playButton.addEventListener('click', () => void togglePlay());

  masterInput.addEventListener('input', () => {
    settings = { ...settings, master: Number(masterInput.value) };
    engine.apply(settings);
    persist();
  });

  // Space toggles play, unless the user is typing in or operating a control.
  document.addEventListener('keydown', (event) => {
    if (event.code !== 'Space' || event.repeat) return;
    const target = event.target as HTMLElement | null;
    if (target && ['INPUT', 'SELECT', 'TEXTAREA', 'BUTTON', 'SUMMARY'].includes(target.tagName)) {
      return;
    }
    event.preventDefault();
    void togglePlay();
  });

  let levelHandle: ReturnType<typeof requestAnimationFrame> | null = null;

  async function togglePlay(): Promise<void> {
    if (engine.isPlaying) await stop('Stopped.');
    else await start();
  }

  async function start(): Promise<void> {
    status.textContent = 'Starting.';
    try {
      await engine.start(settings);
    } catch {
      status.textContent = 'This browser would not start audio. Try a different one.';
      return;
    }
    playButton.setAttribute('aria-pressed', 'true');
    playLabel.textContent = 'Stop';
    status.textContent = engine.workletActive
      ? 'Playing.'
      : 'Playing, using the fallback noise generator.';
    orb.setState('listening');
    watchLevel();
  }

  async function stop(message: string): Promise<void> {
    playButton.setAttribute('aria-pressed', 'false');
    playLabel.textContent = 'Play';
    status.textContent = message;
    await engine.stop();
    orb.setState('breathing');
    orb.setLevel(0);
    if (levelHandle !== null) {
      cancelAnimationFrame(levelHandle);
      levelHandle = null;
    }
  }

  /** Poll the engine's analyser once a frame and feed it straight to the orb. */
  function watchLevel(): void {
    if (!engine.isPlaying) return;
    orb.setLevel(engine.level());
    levelHandle = requestAnimationFrame(watchLevel);
  }

  function persist(): void {
    saveSettings(settings);
  }

  function applyPreset(id: string): void {
    const next = settingsFromPreset(id);
    settings = { ...next, master: settings.master, timerMinutes: settings.timerMinutes };
    engine.apply(settings);
    orb.setRate(settings.modulation.rate);
    persist();
    renderPresets();
  }

  function renderPresets(): void {
    presetList.replaceChildren();
    for (const preset of PRESETS) {
      const selected = preset.id === settings.presetId;
      const button = el('button', {
        type: 'button',
        class: selected ? 'btn btn-primary preset' : 'btn btn-secondary preset',
        role: 'radio',
        'aria-checked': String(selected),
      });
      button.append(el('span', { class: 'name' }, [preset.name]));
      button.addEventListener('click', () => applyPreset(preset.id));
      presetList.append(button);
    }
    // One blurb for the selected preset rather than one per button. Four
    // sentences stacked in four pills is most of the page, and the point of
    // this layout is that there is almost nothing on it.
    const current = PRESETS.find((preset) => preset.id === settings.presetId);
    presetBlurb.textContent = current ? current.blurb : '';
  }
}

function must<T extends Element>(selector: string): T {
  const node = document.querySelector<T>(selector);
  if (!node) throw new Error(`missing element: ${selector}`);
  return node;
}
