/**
 * The orb. A small canvas animation that stands in for a status light: warm,
 * soft, and slow to move, so it reads as calm rather than as a meter.
 *
 * It has no dependencies. It is not the thinking-orbs React component; that
 * package requires React, and this app carries no runtime dependencies at
 * all, so the same idea is redrawn here by hand with the 2D canvas API.
 *
 * The nine state names below are the vocabulary that component defines. This
 * app only ever asks for two of them, breathing while stopped and listening
 * while playing, but every name gets a tuning entry so the full vocabulary is
 * honoured and any future caller can use the rest without adding to this
 * file.
 */

export type OrbState =
  | 'working'
  | 'searching'
  | 'solving'
  | 'listening'
  | 'connecting'
  | 'weaving'
  | 'composing'
  | 'breathing'
  | 'shaping';

export interface OrbOptions {
  /** Modulation rate in Hz that the visual pulse should track. */
  rateHz?: number;
}

export interface OrbHandle {
  /** Switch the named behaviour. Safe to call with the state already set. */
  setState(state: OrbState): void;
  /** Feed the live audio level, 0 to 1. Ignored while reduced motion is on. */
  setLevel(level: number): void;
  /** Update the rate, in Hz, that the audio-linked pulse should track. */
  setRate(rateHz: number): void;
  /** Stop the animation loop and remove everything this call added. */
  destroy(): void;
}

/** One entry per state name. Values are small multipliers, not physical units. */
interface StateTuning {
  /** How fast the internal blobs drift, in radians per second. */
  driftSpeed: number;
  /** Idle breathing cycle rate, in Hz (cycles per second). */
  breatheHz: number;
  /** Idle breathing amplitude, as a fraction of the orb radius. */
  breatheDepth: number;
  /** Base brightness multiplier for the inner light. */
  brightness: number;
}

const TUNING: Record<OrbState, StateTuning> = {
  working: { driftSpeed: 0.05, breatheHz: 0.18, breatheDepth: 0.025, brightness: 1.0 },
  searching: { driftSpeed: 0.09, breatheHz: 0.22, breatheDepth: 0.03, brightness: 1.05 },
  solving: { driftSpeed: 0.04, breatheHz: 0.15, breatheDepth: 0.025, brightness: 0.95 },
  listening: { driftSpeed: 0.05, breatheHz: 0.14, breatheDepth: 0.03, brightness: 1.1 },
  connecting: { driftSpeed: 0.07, breatheHz: 0.2, breatheDepth: 0.035, brightness: 1.0 },
  weaving: { driftSpeed: 0.1, breatheHz: 0.17, breatheDepth: 0.03, brightness: 1.0 },
  composing: { driftSpeed: 0.06, breatheHz: 0.16, breatheDepth: 0.025, brightness: 1.0 },
  breathing: { driftSpeed: 0.025, breatheHz: 0.08, breatheDepth: 0.028, brightness: 0.9 },
  shaping: { driftSpeed: 0.08, breatheHz: 0.19, breatheDepth: 0.03, brightness: 1.0 },
};

interface Palette {
  center: string;
  mid: string;
  edge: string;
  blobA: string;
  blobB: string;
}

/**
 * Warm stone tones, matching the anon-marketing design system's gray scale
 * (gray-50 through gray-900). Two sets, one per colour scheme, read once at
 * mount and again whenever the OS scheme changes, never per frame.
 */
const LIGHT_PALETTE: Palette = {
  center: '#faf8f8',
  mid: '#ebe8e4',
  edge: '#a59f97',
  blobA: '#f5f3f1',
  blobB: '#d7d2cc',
};

const DARK_PALETTE: Palette = {
  center: '#59544f',
  mid: '#292524',
  edge: '#0c0a09',
  blobA: '#44403b',
  blobB: '#1c1917',
};

interface Blob {
  angle: number;
  radius: number;
  size: number;
  speed: number;
}

const STYLE_ID = 'steady-orb-styles';

function ensureStyles(): void {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    .steady-orb-wrap {
      width: clamp(180px, 60vw, 260px);
      height: clamp(180px, 60vw, 260px);
      margin: 0 auto;
      border-radius: 50%;
      overflow: hidden;
      position: relative;
      isolation: isolate;
      box-shadow: inset 0 0 50px rgba(255, 255, 255, 0.4), 0 8px 32px rgba(0, 0, 0, 0.06);
    }
    .steady-orb-wrap canvas {
      display: block;
      width: 100%;
      height: 100%;
    }
  `;
  document.head.append(style);
}

function makeBlobs(count: number): Blob[] {
  const blobs: Blob[] = [];
  for (let i = 0; i < count; i += 1) {
    blobs.push({
      angle: (i / count) * Math.PI * 2,
      radius: 0.25 + (i % 3) * 0.12,
      size: 0.32 + (i % 2) * 0.1,
      speed: 0.6 + i * 0.15,
    });
  }
  return blobs;
}

/**
 * Mount the orb into `host`. The host should be an otherwise empty element;
 * the orb owns everything inside it until `destroy` is called.
 */
export function mountOrb(host: HTMLElement, opts: OrbOptions = {}): OrbHandle {
  ensureStyles();

  const wrap = document.createElement('div');
  wrap.className = 'steady-orb-wrap';
  const canvas = document.createElement('canvas');
  wrap.append(canvas);
  host.append(wrap);

  const ctx = canvas.getContext('2d');
  const noise = makeNoiseTile();
  const blobs = makeBlobs(4);

  let state: OrbState = 'breathing';
  let level = 0;
  let rateHz = opts.rateHz ?? 16;
  let audioPhaseStart = 0;
  let dpr = 1;
  let size = 0;
  let running = true;
  let destroyed = false;

  const reducedMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  const darkQuery = window.matchMedia('(prefers-color-scheme: dark)');

  function currentPalette(): Palette {
    return darkQuery.matches ? DARK_PALETTE : LIGHT_PALETTE;
  }

  // Read after darkQuery exists. Function declarations hoist but a const does
  // not, so calling currentPalette any earlier would hit the dead zone.
  let palette = currentPalette();

  function onPaletteChange(): void {
    palette = currentPalette();
    if (reducedMotionQuery.matches) draw(0);
  }
  darkQuery.addEventListener('change', onPaletteChange);

  function onVisibility(): void {
    running = document.visibilityState === 'visible';
    if (running) requestAnimationFrame(loop);
  }
  document.addEventListener('visibilitychange', onVisibility);

  function onReducedMotionChange(): void {
    if (reducedMotionQuery.matches) draw(0);
  }
  reducedMotionQuery.addEventListener('change', onReducedMotionChange);

  function resize(): void {
    const rect = wrap.getBoundingClientRect();
    size = Math.max(1, rect.width);
    dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(size * dpr);
    canvas.height = Math.round(size * dpr);
  }

  const resizeObserver = new ResizeObserver(() => {
    resize();
    if (reducedMotionQuery.matches) draw(0);
  });
  resizeObserver.observe(wrap);
  resize();

  const start = performance.now();

  function draw(elapsedSeconds: number): void {
    if (!ctx || size <= 0) return;
    const reduced = reducedMotionQuery.matches;
    const tuning = TUNING[state];
    const t = reduced ? 0 : elapsedSeconds;

    const px = size * dpr;
    ctx.clearRect(0, 0, px, px);
    ctx.save();
    ctx.scale(dpr, dpr);

    const cx = size / 2;
    const cy = size / 2;
    const baseRadius = size * 0.42;

    const breathe = reduced
      ? 0
      : Math.sin(2 * Math.PI * tuning.breatheHz * t) * tuning.breatheDepth;

    // The audio level swells the orb. This term is close to constant while
    // the sound is running, because the level is smoothed, so on its own it
    // sets the size rather than creating movement. The movement comes from
    // the rate term below.
    const levelBoost = reduced ? 0 : level * 0.12;

    // A second, faster wobble tracks the modulation rate itself, so the orb
    // visibly throbs at roughly the same rate the ear is getting. There is no
    // way to read the true phase of the audio oscillator from here, so this
    // is rate-matched, not phase-locked to the actual signal: it starts its
    // own sine from the moment the state last became "listening". At 16 Hz
    // the amplitude is kept to a few percent of the radius so it reads as a
    // shimmer rather than a strobe.
    const ratePhase = reduced ? 0 : 2 * Math.PI * rateHz * (t - audioPhaseStart);
    const rateBoost = reduced || level <= 0 ? 0 : Math.sin(ratePhase) * level * 0.055;

    const radius = baseRadius * (1 + breathe + levelBoost + rateBoost);
    const brightness =
      tuning.brightness * (1 + (reduced ? 0 : level * (0.3 + 0.25 * Math.sin(ratePhase))));

    const gradient = ctx.createRadialGradient(
      cx - radius * 0.3,
      cy - radius * 0.35,
      radius * 0.05,
      cx,
      cy,
      radius,
    );
    gradient.addColorStop(0, scaleLightness(palette.center, brightness));
    gradient.addColorStop(0.55, palette.mid);
    gradient.addColorStop(1, palette.edge);

    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.fillStyle = gradient;
    ctx.fill();

    // Slow drifting blobs, layered underneath with soft-light blending so
    // they read as internal light rather than as shapes on top of the sphere.
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.clip();
    ctx.globalCompositeOperation = 'soft-light';
    for (const blob of blobs) {
      const angle = blob.angle + (reduced ? 0 : t * tuning.driftSpeed * blob.speed);
      const bx = cx + Math.cos(angle) * radius * blob.radius;
      const by = cy + Math.sin(angle) * radius * blob.radius;
      const bradius = radius * blob.size;
      const blobGradient = ctx.createRadialGradient(bx, by, 0, bx, by, bradius);
      const colour = blob.speed > 1 ? palette.blobA : palette.blobB;
      blobGradient.addColorStop(0, colour);
      blobGradient.addColorStop(1, 'transparent');
      ctx.fillStyle = blobGradient;
      ctx.beginPath();
      ctx.arc(bx, by, bradius, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    // A light dusting of grain, so the surface does not look like a flat
    // gradient. Static in position, drawn at very low alpha.
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.clip();
    ctx.globalAlpha = 0.05;
    ctx.globalCompositeOperation = 'overlay';
    ctx.drawImage(noise, 0, 0, size, size);
    ctx.restore();

    ctx.restore();
  }

  function loop(now: number): void {
    if (destroyed || !running) return;
    if (!reducedMotionQuery.matches) {
      const elapsed = (now - start) / 1000;
      draw(elapsed);
      requestAnimationFrame(loop);
    }
  }

  if (reducedMotionQuery.matches) {
    draw(0);
  } else {
    requestAnimationFrame(loop);
  }

  return {
    setState(next: OrbState): void {
      if (next === 'listening' && state !== 'listening') {
        audioPhaseStart = (performance.now() - start) / 1000;
      }
      state = next;
      if (reducedMotionQuery.matches) draw(0);
    },
    setLevel(next: number): void {
      level = Math.min(1, Math.max(0, next));
    },
    setRate(next: number): void {
      rateHz = next;
    },
    destroy(): void {
      destroyed = true;
      resizeObserver.disconnect();
      darkQuery.removeEventListener('change', onPaletteChange);
      reducedMotionQuery.removeEventListener('change', onReducedMotionChange);
      document.removeEventListener('visibilitychange', onVisibility);
      wrap.remove();
    },
  };
}

/** A small tile of random grey noise, drawn once and reused every frame. */
function makeNoiseTile(): HTMLCanvasElement {
  const tile = document.createElement('canvas');
  tile.width = 64;
  tile.height = 64;
  const ctx = tile.getContext('2d');
  if (!ctx) return tile;
  const image = ctx.createImageData(64, 64);
  for (let i = 0; i < image.data.length; i += 4) {
    const value = Math.floor(Math.random() * 255);
    image.data[i] = value;
    image.data[i + 1] = value;
    image.data[i + 2] = value;
    image.data[i + 3] = 255;
  }
  ctx.putImageData(image, 0, 0);
  return tile;
}

/**
 * Lighten or darken a "#rrggbb" colour by a multiplier around 1. Used to bring
 * the centre highlight up or down with the audio level without keeping a
 * second full palette around for it.
 */
function scaleLightness(hex: string, factor: number): string {
  const value = hex.replace('#', '');
  const r = parseInt(value.slice(0, 2), 16);
  const g = parseInt(value.slice(2, 4), 16);
  const b = parseInt(value.slice(4, 6), 16);
  const clamp = (n: number) => Math.min(255, Math.max(0, Math.round(n * factor)));
  return `rgb(${clamp(r)}, ${clamp(g)}, ${clamp(b)})`;
}
