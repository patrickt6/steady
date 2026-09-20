/** Every sound layer looks the same from the outside. */
export interface Layer<TSettings> {
  readonly output: AudioNode;
  /** Apply new settings. Called on every control change, so it must be cheap. */
  update(settings: TSettings, masterSlider: number): void;
  start(): void;
  stop(): void;
  dispose(): void;
}

/**
 * Ramp a parameter instead of setting it.
 *
 * `setValueAtTime` on a gain that is currently non zero produces a step, and a
 * step in a signal is a click. Every parameter change in this app goes through
 * a ramp for that reason.
 */
export function ramp(param: AudioParam, value: number, now: number, seconds = 0.08): void {
  const target = Number.isFinite(value) ? value : 0;
  param.cancelScheduledValues(now);
  param.setValueAtTime(param.value, now);
  param.linearRampToValueAtTime(target, now + Math.max(0.005, seconds));
}
