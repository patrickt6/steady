import { Engine } from '../audio/engine';
import { RATE_PRESETS } from '../audio/modulation';
import { NOISE_COLORS, type NoiseColor } from '../audio/noise-dsp';
import type { ScaleName } from '../audio/scale';
import { PRESETS } from '../presets/presets';
import { LIMITS, settingsFromPreset } from '../presets/validate';
import { loadSettings, saveSettings } from '../state/settings';
import type { Settings } from '../state/types';
import { el, fmt, group, select, slider, toggle } from './controls';
import { mountHeadphoneCheck } from './headphone-ui';
import { SessionTimer, formatDuration } from './timer';

/**
 * Wiring.
 *
 * The constraint that decides most of this file: a first time visitor should be
 * able to start good sound without reading anything or making a single choice.
 * So the play button is the only thing above the fold that matters, a sensible
 * preset is already loaded, and every parameter lives behind a collapsed
 * disclosure.
 */
export function mountApp(workletUrl: string): void {
  let settings = loadSettings();
  const engine = new Engine({ workletUrl });

  const playButton = must<HTMLButtonElement>('#play');
  const playLabel = must<HTMLElement>('#play-label');
  const status = must<HTMLElement>('#status');
  const masterInput = must<HTMLInputElement>('#master');
  const presetList = must<HTMLElement>('#preset-list');
  const timerSelect = must<HTMLSelectElement>('#timer');
  const countdown = must<HTMLElement>('#countdown');
  const advanced = must<HTMLElement>('#advanced');
  const checkBody = must<HTMLElement>('#check-body');

  const timer = new SessionTimer(
    (left) => {
      countdown.textContent = Number.isFinite(left) ? formatDuration(left) : '';
    },
    () => {
      void stop('Session finished.');
    },
  );

  masterInput.value = String(settings.master);
  timerSelect.value = String(settings.timerMinutes);

  renderPresets();
  renderAdvanced();
  mountHeadphoneCheck(checkBody, headphoneContext);

  playButton.addEventListener('click', () => void togglePlay());

  masterInput.addEventListener('input', () => {
    settings = { ...settings, master: Number(masterInput.value) };
    engine.apply(settings);
    persist();
  });

  timerSelect.addEventListener('change', () => {
    settings = { ...settings, timerMinutes: Number(timerSelect.value) };
    persist();
    if (engine.isPlaying) timer.start(settings.timerMinutes);
    else countdown.textContent = '';
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
    timer.start(settings.timerMinutes);
  }

  async function stop(message: string): Promise<void> {
    timer.cancel();
    countdown.textContent = '';
    playButton.setAttribute('aria-pressed', 'false');
    playLabel.textContent = 'Play';
    status.textContent = message;
    await engine.stop();
  }

  /** The headphone check needs an AudioContext, and a user gesture to make one. */
  async function headphoneContext(): Promise<AudioContext> {
    const existing = engine.audioContext;
    if (existing) {
      await existing.resume();
      return existing;
    }
    const context = new AudioContext();
    await context.resume();
    return context;
  }

  function persist(): void {
    saveSettings(settings);
  }

  function update(patch: Partial<Settings>): void {
    settings = { ...settings, ...patch };
    engine.apply(settings);
    persist();
  }

  function applyPreset(id: string): void {
    const next = settingsFromPreset(id);
    settings = { ...next, master: settings.master, timerMinutes: settings.timerMinutes };
    engine.apply(settings);
    persist();
    renderPresets();
    renderAdvanced();
  }

  function renderPresets(): void {
    presetList.replaceChildren();
    for (const preset of PRESETS) {
      const button = el('button', {
        type: 'button',
        class: 'preset',
        role: 'radio',
        'aria-checked': String(preset.id === settings.presetId),
      });
      button.append(
        el('span', { class: 'name' }, [preset.name]),
        el('span', { class: 'blurb' }, [preset.blurb]),
      );
      button.addEventListener('click', () => applyPreset(preset.id));
      presetList.append(button);
    }
  }

  function renderAdvanced(): void {
    advanced.replaceChildren();
    advanced.append(modulationGroup(), musicGroup(), noiseGroup());
  }

  /** Modulation first, because it is the part the research is about. */
  function modulationGroup(): HTMLElement {
    const rates = el('div', { class: 'bands' });
    for (const preset of RATE_PRESETS) {
      const button = el('button', { type: 'button', class: 'band', title: preset.note }, [
        `${preset.label} (${preset.hz} Hz)`,
      ]);
      button.addEventListener('click', () => {
        update({ modulation: { ...settings.modulation, rate: preset.hz } });
        renderAdvanced();
      });
      rates.append(button);
    }

    const controls = el('div', { class: 'controls' });
    controls.append(
      rates,
      slider(
        {
          id: 'mod-rate',
          label: 'Rate',
          min: LIMITS.rate[0],
          max: LIMITS.rate[1],
          step: 0.5,
          value: settings.modulation.rate,
          format: fmt.beat,
        },
        (rate) => update({ modulation: { ...settings.modulation, rate } }),
      ),
      slider(
        {
          id: 'mod-depth',
          label: 'Depth',
          min: 0,
          max: 1,
          step: 0.01,
          value: settings.modulation.depth,
          format: fmt.percent,
        },
        (depth) => update({ modulation: { ...settings.modulation, depth } }),
      ),
      slider(
        {
          id: 'mod-crossover',
          label: 'Modulate above',
          min: LIMITS.crossover[0],
          max: LIMITS.crossover[1],
          step: 10,
          value: settings.modulation.crossover,
          format: fmt.khz,
        },
        (crossover) => update({ modulation: { ...settings.modulation, crossover } }),
      ),
    );

    return group('Modulation', [
      el('h3', {}, ['Modulation']),
      el('p', { class: 'note' }, [
        'The music is amplitude modulated at this rate. Around 16 Hz is the beta range where the ' +
          '2024 study found the largest benefit, and that benefit was larger for people reporting ' +
          'more attention difficulties. Depth is yours to set; there is no evidence for one right ' +
          'value.',
      ]),
      toggle('mod-on', 'On', settings.modulation.enabled, (enabled) =>
        update({ modulation: { ...settings.modulation, enabled } }),
      ),
      controls,
    ]);
  }

  function musicGroup(): HTMLElement {
    const controls = el('div', { class: 'controls' });
    controls.append(
      select<ScaleName>(
        'music-scale',
        'Scale',
        [
          { value: 'pentatonic', label: 'Pentatonic' },
          { value: 'dorian', label: 'Dorian' },
        ],
        settings.music.scale,
        (scale) => update({ music: { ...settings.music, scale } }),
      ),
      slider(
        {
          id: 'music-level',
          label: 'Level',
          min: 0,
          max: 1,
          step: 0.01,
          value: settings.music.level,
          format: fmt.percent,
        },
        (level) => update({ music: { ...settings.music, level } }),
      ),
      slider(
        {
          id: 'music-density',
          label: 'Seconds between notes',
          min: LIMITS.musicDensity[0],
          max: LIMITS.musicDensity[1],
          step: 1,
          value: settings.music.density,
          format: fmt.seconds,
        },
        (density) => update({ music: { ...settings.music, density } }),
      ),
      slider(
        {
          id: 'music-tone',
          label: 'Brightness',
          min: LIMITS.musicTone[0],
          max: LIMITS.musicTone[1],
          step: 50,
          value: settings.music.tone,
          format: fmt.khz,
        },
        (tone) => update({ music: { ...settings.music, tone } }),
      ),
      slider(
        {
          id: 'music-space',
          label: 'Space',
          min: 0,
          max: 1,
          step: 0.01,
          value: settings.music.space,
          format: fmt.percent,
        },
        (space) => update({ music: { ...settings.music, space } }),
      ),
      slider(
        {
          id: 'music-warmth',
          label: 'Warmth',
          min: 0,
          max: 1,
          step: 0.01,
          value: settings.music.warmth,
          format: fmt.percent,
        },
        (warmth) => update({ music: { ...settings.music, warmth } }),
      ),
    );

    return group('Music bed', [
      el('h3', {}, ['Music bed']),
      el('p', { class: 'note' }, [
        'Generated as you listen, so it never repeats. No lyrics and no vocals, ever: background ' +
          'music with lyrics measurably hurts recall and reading comprehension. Warmth brings up ' +
          'a bass drone and a sustained pad under the notes; that one is taste, not evidence.',
      ]),
      toggle('music-on', 'On', settings.music.enabled, (enabled) =>
        update({ music: { ...settings.music, enabled } }),
      ),
      controls,
    ]);
  }

  function noiseGroup(): HTMLElement {
    const controls = el('div', { class: 'controls' });
    controls.append(
      select<NoiseColor>(
        'noise-color',
        'Colour',
        NOISE_COLORS.map((c) => ({ value: c, label: capitalize(c) })),
        settings.noise.color,
        (color) => update({ noise: { ...settings.noise, color } }),
      ),
      slider(
        {
          id: 'noise-level',
          label: 'Level',
          min: 0,
          max: 1,
          step: 0.01,
          value: settings.noise.level,
          format: fmt.percent,
        },
        (level) => update({ noise: { ...settings.noise, level } }),
      ),
      slider(
        {
          id: 'noise-tone',
          label: 'Brightness',
          min: LIMITS.noiseTone[0],
          max: LIMITS.noiseTone[1],
          step: 100,
          value: settings.noise.tone,
          format: fmt.khz,
        },
        (tone) => update({ noise: { ...settings.noise, tone } }),
      ),
    );

    return group('Noise', [
      el('h3', {}, ['Noise']),
      el('p', { class: 'note' }, [
        'A separate layer, not modulated. Noise is here because many people like it, and it has ' +
          'its own small evidence base, but it is not what the modulation studies tested.',
      ]),
      toggle('noise-on', 'On', settings.noise.enabled, (enabled) =>
        update({ noise: { ...settings.noise, enabled } }),
      ),
      controls,
    ]);
  }
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function must<T extends Element>(selector: string): T {
  const node = document.querySelector<T>(selector);
  if (!node) throw new Error(`missing element: ${selector}`);
  return node;
}
