import { describe, expect, it } from 'vitest';
import {
  DEFAULT_RATE_HZ,
  RATE_PRESETS,
  RATE_RANGE,
  modulationRange,
  modulatorGains,
  modulatorValue,
  sidebands,
} from './modulation';

describe('modulatorGains', () => {
  it('is transparent at depth zero', () => {
    expect(modulatorGains(0)).toEqual({ offset: 1, swing: 0 });
  });

  it('reaches silence at the trough at full depth', () => {
    const { min, max } = modulationRange(1);
    expect(min).toBeCloseTo(0, 12);
    expect(max).toBeCloseTo(1, 12);
  });

  it('always peaks at unity, so depth changes do not change loudness at the peak', () => {
    for (const depth of [0, 0.15, 0.4, 0.75, 1]) {
      expect(modulationRange(depth).max).toBeCloseTo(1, 12);
    }
  });

  it('gives a trough of exactly 1 minus depth', () => {
    for (const depth of [0.1, 0.3, 0.9]) {
      expect(modulationRange(depth).min).toBeCloseTo(1 - depth, 12);
    }
  });

  it('clamps out of range and non-finite depths', () => {
    expect(modulatorGains(5)).toEqual(modulatorGains(1));
    expect(modulatorGains(-2)).toEqual(modulatorGains(0));
    expect(modulatorGains(Number.NaN)).toEqual(modulatorGains(0));
  });
});

describe('modulatorValue', () => {
  it('never goes negative, which would invert the signal', () => {
    for (const depth of [0, 0.5, 1]) {
      for (let i = 0; i < 500; i += 1) {
        expect(modulatorValue(depth, 16, i / 5000)).toBeGreaterThanOrEqual(-1e-12);
      }
    }
  });

  it('never exceeds unity, so the stage cannot add gain', () => {
    for (const depth of [0, 0.33, 1]) {
      for (let i = 0; i < 500; i += 1) {
        expect(modulatorValue(depth, 16, i / 5000)).toBeLessThanOrEqual(1 + 1e-12);
      }
    }
  });

  it('is periodic at the modulation rate', () => {
    const rate = 16;
    const period = 1 / rate;
    for (const t of [0, 0.003, 0.017]) {
      expect(modulatorValue(0.8, rate, t)).toBeCloseTo(modulatorValue(0.8, rate, t + period), 10);
    }
  });

  it('is flat at depth zero', () => {
    for (let i = 0; i < 50; i += 1) {
      expect(modulatorValue(0, 16, i / 100)).toBe(1);
    }
  });
});

describe('sidebands', () => {
  it('places them symmetrically about the carrier', () => {
    const [lower, upper] = sidebands(440, 16);
    expect(lower).toBe(424);
    expect(upper).toBe(456);
  });
});

describe('rate presets', () => {
  it('defaults to the beta rate the studies tested', () => {
    const beta = RATE_PRESETS.find((p) => p.id === 'beta');
    expect(beta?.hz).toBe(DEFAULT_RATE_HZ);
  });

  it('keeps every preset inside the slider range', () => {
    for (const preset of RATE_PRESETS) {
      expect(preset.hz).toBeGreaterThanOrEqual(RATE_RANGE.min);
      expect(preset.hz).toBeLessThanOrEqual(RATE_RANGE.max);
    }
  });
});
