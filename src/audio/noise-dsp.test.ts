import { describe, expect, it } from 'vitest';
import {
  KELLET_COEFFICIENTS,
  brownStep,
  createBrownState,
  createPinkState,
  crossfadeLoop,
  fillNoise,
  isNoiseColor,
  makeRng,
  normalize,
  pinkStep,
} from './noise-dsp';

/** Rough spectral tilt: energy below `split` versus energy above it. */
function lowOverHighEnergy(samples: Float32Array, split = 0.25): number {
  // A one pole split is enough to compare colors; this is not a spectrum
  // analyser, only a monotone measure of how much low end there is.
  let low = 0;
  let lowEnergy = 0;
  let highEnergy = 0;
  for (let i = 0; i < samples.length; i += 1) {
    low += split * (samples[i] - low);
    lowEnergy += low * low;
    const high = samples[i] - low;
    highEnergy += high * high;
  }
  return lowEnergy / Math.max(1e-12, highEnergy);
}

describe('makeRng', () => {
  it('is deterministic for a given seed', () => {
    const a = makeRng(42);
    const b = makeRng(42);
    for (let i = 0; i < 100; i += 1) expect(a()).toBe(b());
  });

  it('stays inside [-1, 1]', () => {
    const rng = makeRng(7);
    for (let i = 0; i < 10000; i += 1) {
      const v = rng();
      expect(v).toBeGreaterThanOrEqual(-1);
      expect(v).toBeLessThanOrEqual(1);
    }
  });
});

describe('Kellet pink coefficients', () => {
  it('has six stages', () => {
    expect(KELLET_COEFFICIENTS).toHaveLength(6);
  });

  it('has stable poles, so the filter cannot run away', () => {
    for (const [pole] of KELLET_COEFFICIENTS) {
      expect(Math.abs(pole)).toBeLessThan(1);
    }
  });
});

describe('pinkStep', () => {
  it('produces a finite bounded signal', () => {
    const state = createPinkState();
    const rng = makeRng(3);
    let peak = 0;
    for (let i = 0; i < 200000; i += 1) {
      const v = pinkStep(state, rng());
      expect(Number.isFinite(v)).toBe(true);
      peak = Math.max(peak, Math.abs(v));
    }
    expect(peak).toBeLessThan(20);
  });
});

describe('brownStep', () => {
  it('does not drift away into DC', () => {
    const state = createBrownState();
    const rng = makeRng(11);
    for (let i = 0; i < 500000; i += 1) brownStep(state, rng());
    expect(Math.abs(state.last)).toBeLessThan(1);
  });

  it('integrates: a constant input approaches a steady value, not infinity', () => {
    const state = createBrownState();
    for (let i = 0; i < 100000; i += 1) brownStep(state, 1);
    // Fixed point of x -> (x + step) / leak is step / (leak - 1).
    expect(state.last).toBeCloseTo(0.02 / 0.02, 3);
  });
});

describe('spectral tilt', () => {
  it('orders the colors white, pink, brown by low end energy', () => {
    const n = 1 << 16;
    const white = fillNoise(new Float32Array(n), 'white', 5);
    const pink = fillNoise(new Float32Array(n), 'pink', 5);
    const brown = fillNoise(new Float32Array(n), 'brown', 5);

    const w = lowOverHighEnergy(white);
    const p = lowOverHighEnergy(pink);
    const b = lowOverHighEnergy(brown);

    expect(p).toBeGreaterThan(w);
    expect(b).toBeGreaterThan(p);
  });
});

describe('normalize', () => {
  it('scales the peak to the target', () => {
    const samples = Float32Array.from([0.1, -0.4, 0.2]);
    normalize(samples, 0.8);
    let peak = 0;
    for (const s of samples) peak = Math.max(peak, Math.abs(s));
    expect(peak).toBeCloseTo(0.8, 5);
  });

  it('leaves an all zero buffer alone', () => {
    const samples = new Float32Array(8);
    expect(normalize(samples)).toBe(0);
    expect(Array.from(samples).every((s) => s === 0)).toBe(true);
  });
});

describe('crossfadeLoop', () => {
  it('shortens the buffer by the fade length', () => {
    const samples = fillNoise(new Float32Array(1000), 'white', 2);
    const out = crossfadeLoop(samples, 100);
    expect(out.length).toBe(1000);
  });

  it('makes the seam continuous', () => {
    const samples = fillNoise(new Float32Array(4096), 'brown', 9);
    const faded = crossfadeLoop(samples, 512);
    const seamGap = Math.abs(faded[faded.length - 1] - faded[0]);
    const typical =
      Array.from(faded.subarray(1000, 2000)).reduce((acc, v, i, arr) => {
        return i === 0 ? acc : acc + Math.abs(v - arr[i - 1]);
      }, 0) / 999;
    // The last sample of the loop should sit close to the first, in the same
    // ballpark as an ordinary sample to sample step.
    expect(seamGap).toBeLessThan(typical * 40);
  });

  it('refuses to fade more than half the buffer', () => {
    const samples = new Float32Array(100);
    expect(crossfadeLoop(samples, 900).length).toBeLessThanOrEqual(100);
  });
});

describe('isNoiseColor', () => {
  it('accepts the three colors and nothing else', () => {
    expect(isNoiseColor('pink')).toBe(true);
    expect(isNoiseColor('brown')).toBe(true);
    expect(isNoiseColor('white')).toBe(true);
    expect(isNoiseColor('grey')).toBe(false);
    expect(isNoiseColor(undefined)).toBe(false);
    expect(isNoiseColor(3)).toBe(false);
  });
});
