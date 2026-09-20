import { describe, expect, it } from 'vitest';
import { formatDuration, remainingSeconds } from './timer';

describe('formatDuration', () => {
  it('pads to two digits', () => {
    expect(formatDuration(0)).toBe('00:00');
    expect(formatDuration(9)).toBe('00:09');
    expect(formatDuration(65)).toBe('01:05');
    expect(formatDuration(1500)).toBe('25:00');
  });

  it('does not go negative', () => {
    expect(formatDuration(-30)).toBe('00:00');
  });

  it('counts past an hour rather than wrapping', () => {
    expect(formatDuration(3600)).toBe('60:00');
    expect(formatDuration(5400)).toBe('90:00');
  });
});

describe('remainingSeconds', () => {
  it('is infinite when there is no timer', () => {
    expect(remainingSeconds(0, 0, 10_000)).toBe(Infinity);
  });

  it('counts down', () => {
    expect(remainingSeconds(0, 25, 0)).toBe(1500);
    expect(remainingSeconds(0, 25, 60_000)).toBe(1440);
  });

  it('floors at zero rather than going negative', () => {
    expect(remainingSeconds(0, 1, 999_999)).toBe(0);
  });
});
