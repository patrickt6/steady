/**
 * Gain arithmetic. Pure functions, no Web Audio types, so they are easy to test
 * and easy to reason about when something is too loud.
 */

/** Hard ceiling on the linear output gain of the master bus. */
export const SAFETY_CEILING = 0.7;

/** Shortest fade we will ever apply, in seconds. Below this you hear a click. */
export const MIN_FADE_SECONDS = 0.02;

export function clamp(value: number, min: number, max: number): number {
  if (Number.isNaN(value)) return min;
  return Math.min(max, Math.max(min, value));
}

export function clamp01(value: number): number {
  return clamp(value, 0, 1);
}

export function dbToGain(db: number): number {
  return Math.pow(10, db / 20);
}

export function gainToDb(gain: number): number {
  if (gain <= 0) return -Infinity;
  return 20 * Math.log10(gain);
}

/**
 * Map a 0..1 slider to a linear gain.
 *
 * A straight linear map feels wrong: the top half of the slider does almost
 * nothing and the bottom half does everything. Loudness tracks roughly with the
 * cube of amplitude over the range people actually use, so cube the slider.
 */
export function sliderToGain(slider: number): number {
  const s = clamp01(slider);
  return s * s * s;
}

export function gainToSlider(gain: number): number {
  return clamp01(Math.cbrt(clamp01(gain)));
}

/** Apply the output ceiling. Nothing writes to the destination without this. */
export function applySafetyCap(gain: number, ceiling: number = SAFETY_CEILING): number {
  return clamp(gain, 0, ceiling);
}

/** Final linear gain for one layer: layer level times master level, then capped. */
export function layerGain(layerSlider: number, masterSlider: number): number {
  return applySafetyCap(sliderToGain(layerSlider) * sliderToGain(masterSlider));
}

/** Never fade faster than MIN_FADE_SECONDS, and never negative. */
export function fadeSeconds(requested: number): number {
  if (!Number.isFinite(requested)) return MIN_FADE_SECONDS;
  return Math.max(MIN_FADE_SECONDS, requested);
}
