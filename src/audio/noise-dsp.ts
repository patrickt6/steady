/**
 * The noise filters, written as pure functions.
 *
 * The AudioWorklet in `public/noise-processor.js` carries its own copy of this
 * arithmetic because a worklet cannot import from the bundle. These versions
 * exist so the maths can be tested, and so the fallback path (a long looping
 * buffer, used only when AudioWorklet is missing) has something to fill.
 */

export type NoiseColor = 'white' | 'pink' | 'brown';

export const NOISE_COLORS: readonly NoiseColor[] = ['white', 'pink', 'brown'] as const;

export function isNoiseColor(value: unknown): value is NoiseColor {
  return typeof value === 'string' && (NOISE_COLORS as readonly string[]).includes(value);
}

/** Paul Kellet's pink filter coefficients: [pole, input gain] per stage. */
export const KELLET_COEFFICIENTS: readonly (readonly [number, number])[] = [
  [0.99886, 0.0555179],
  [0.99332, 0.0750759],
  [0.969, 0.153852],
  [0.8665, 0.3104856],
  [0.55, 0.5329522],
  [-0.7616, -0.016898],
] as const;

export const KELLET_DIRECT_GAIN = 0.5362;
export const KELLET_DELAY_GAIN = 0.115926;

export interface PinkState {
  b: Float64Array;
}

export function createPinkState(): PinkState {
  return { b: new Float64Array(7) };
}

/** One pink sample from one white sample. Advances `state` in place. */
export function pinkStep(state: PinkState, white: number): number {
  const b = state.b;
  for (let i = 0; i < KELLET_COEFFICIENTS.length; i += 1) {
    const [pole, gain] = KELLET_COEFFICIENTS[i];
    b[i] = pole * b[i] + white * gain;
  }
  const out = b[0] + b[1] + b[2] + b[3] + b[4] + b[5] + b[6] + white * KELLET_DIRECT_GAIN;
  b[6] = white * KELLET_DELAY_GAIN;
  return out;
}

export interface BrownState {
  last: number;
}

export function createBrownState(): BrownState {
  return { last: 0 };
}

/**
 * Leaky integrator. `leak` slightly less than 1 is what stops the running sum
 * from drifting into inaudible DC and eating all the headroom.
 */
export function brownStep(state: BrownState, white: number, step = 0.02, leak = 1.02): number {
  state.last = (state.last + white * step) / leak;
  return state.last;
}

/** Deterministic uniform noise in [-1, 1), for tests and for the fallback buffer. */
export function makeRng(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    // xorshift32
    s ^= s << 13;
    s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5;
    s >>>= 0;
    return (s / 0xffffffff) * 2 - 1;
  };
}

/** Peak normalise in place, leaving a little headroom. Returns the peak found. */
export function normalize(samples: Float32Array, target = 0.35): number {
  let peak = 0;
  for (let i = 0; i < samples.length; i += 1) {
    const a = Math.abs(samples[i]);
    if (a > peak) peak = a;
  }
  if (peak === 0) return 0;
  const scale = target / peak;
  for (let i = 0; i < samples.length; i += 1) samples[i] *= scale;
  return peak;
}

/**
 * Fill a buffer with noise of the given color, then normalise it.
 * Used only by the fallback path when AudioWorklet is unavailable.
 */
export function fillNoise(samples: Float32Array, color: NoiseColor, seed = 1): Float32Array {
  const rng = makeRng(seed);
  const pink = createPinkState();
  const brown = createBrownState();

  for (let i = 0; i < samples.length; i += 1) {
    const white = rng();
    if (color === 'white') samples[i] = white;
    else if (color === 'pink') samples[i] = pinkStep(pink, white);
    else samples[i] = brownStep(brown, white);
  }
  normalize(samples);
  return samples;
}

/**
 * Crossfade the head of a buffer into its tail so it can loop without a seam.
 * Only the fallback needs this. The worklet has no loop point at all.
 */
export function crossfadeLoop(samples: Float32Array, fadeLength: number): Float32Array {
  const n = Math.min(Math.floor(fadeLength), Math.floor(samples.length / 2));
  if (n <= 0) return samples;
  const tailStart = samples.length - n;
  for (let i = 0; i < n; i += 1) {
    const t = i / n;
    // Equal power, so the loop point does not dip in level.
    const a = Math.cos((t * Math.PI) / 2);
    const b = Math.sin((t * Math.PI) / 2);
    samples[tailStart + i] = samples[tailStart + i] * a + samples[i] * b;
  }
  return samples.subarray(0, tailStart + n);
}
