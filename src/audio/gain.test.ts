import { describe, expect, it } from 'vitest';
import {
  SAFETY_CEILING,
  applySafetyCap,
  clamp,
  clamp01,
  dbToGain,
  fadeSeconds,
  gainToDb,
  gainToSlider,
  layerGain,
  sliderToGain,
} from './gain';

describe('clamp', () => {
  it('bounds the value', () => {
    expect(clamp(5, 0, 1)).toBe(1);
    expect(clamp(-5, 0, 1)).toBe(0);
    expect(clamp(0.5, 0, 1)).toBe(0.5);
  });

  it('returns the minimum for NaN rather than propagating it', () => {
    expect(clamp(Number.NaN, 0, 1)).toBe(0);
    expect(clamp01(Number.NaN)).toBe(0);
  });
});

describe('decibel conversion', () => {
  it('round trips', () => {
    for (const db of [-60, -20, -6, 0]) {
      expect(gainToDb(dbToGain(db))).toBeCloseTo(db, 6);
    }
  });

  it('maps 0 dB to unity and -6 dB to about half', () => {
    expect(dbToGain(0)).toBeCloseTo(1, 10);
    expect(dbToGain(-6)).toBeCloseTo(0.501, 3);
  });

  it('reports silence as negative infinity', () => {
    expect(gainToDb(0)).toBe(-Infinity);
  });
});

describe('slider mapping', () => {
  it('keeps the endpoints', () => {
    expect(sliderToGain(0)).toBe(0);
    expect(sliderToGain(1)).toBe(1);
  });

  it('is monotonic', () => {
    let previous = -1;
    for (let s = 0; s <= 1.0001; s += 0.05) {
      const gain = sliderToGain(s);
      expect(gain).toBeGreaterThan(previous);
      previous = gain;
    }
  });

  it('puts the midpoint well below halfway, which is the point', () => {
    expect(sliderToGain(0.5)).toBeLessThan(0.2);
  });

  it('round trips through gainToSlider', () => {
    for (const s of [0, 0.1, 0.35, 0.62, 1]) {
      expect(gainToSlider(sliderToGain(s))).toBeCloseTo(s, 6);
    }
  });

  it('clamps out of range sliders', () => {
    expect(sliderToGain(2)).toBe(1);
    expect(sliderToGain(-1)).toBe(0);
  });
});

describe('safety cap', () => {
  it('never exceeds the ceiling', () => {
    expect(applySafetyCap(10)).toBe(SAFETY_CEILING);
    expect(applySafetyCap(-1)).toBe(0);
  });

  it('caps the combined layer and master gain', () => {
    expect(layerGain(1, 1)).toBe(SAFETY_CEILING);
    expect(layerGain(0, 1)).toBe(0);
    expect(layerGain(0.5, 0.5)).toBeCloseTo(sliderToGain(0.5) ** 2, 10);
  });
});

describe('fadeSeconds', () => {
  it('enforces a floor so there is never a hard cut', () => {
    expect(fadeSeconds(0)).toBeGreaterThan(0);
    expect(fadeSeconds(-3)).toBeGreaterThan(0);
    expect(fadeSeconds(Number.NaN)).toBeGreaterThan(0);
    expect(fadeSeconds(2)).toBe(2);
  });
});
