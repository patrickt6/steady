import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SCHEDULER,
  collectDue,
  nextEventTime,
  tickIntervalMs,
  type SchedulerConfig,
} from './scheduler';

const config: SchedulerConfig = { lookahead: 2, meanInterval: 4, jitter: 0.5 };

describe('nextEventTime', () => {
  it('stays inside the jitter window', () => {
    for (let r = 0; r <= 1.0001; r += 0.05) {
      const gap = nextEventTime(0, config, r);
      expect(gap).toBeGreaterThanOrEqual(2 - 1e-9);
      expect(gap).toBeLessThanOrEqual(6 + 1e-9);
    }
  });

  it('returns the mean when the draw is centred', () => {
    expect(nextEventTime(10, config, 0.5)).toBeCloseTo(14, 10);
  });

  it('always moves forward, even with zero mean interval', () => {
    const degenerate: SchedulerConfig = { lookahead: 1, meanInterval: 0, jitter: 0 };
    expect(nextEventTime(5, degenerate, 0)).toBeGreaterThan(5);
  });

  it('is a metronome when jitter is zero', () => {
    const strict: SchedulerConfig = { ...config, jitter: 0 };
    expect(nextEventTime(0, strict, 0)).toBe(4);
    expect(nextEventTime(0, strict, 1)).toBe(4);
  });
});

describe('collectDue', () => {
  const rand = () => 0.5;

  it('returns only events inside the lookahead horizon', () => {
    const { events } = collectDue(100, 100, config, rand);
    for (const event of events) {
      expect(event.time).toBeGreaterThanOrEqual(100);
      expect(event.time).toBeLessThan(102);
    }
  });

  it('advances the cursor past the horizon so the next tick starts clean', () => {
    const { nextTime } = collectDue(100, 100, config, rand);
    expect(nextTime).toBeGreaterThanOrEqual(102);
  });

  it('produces no gaps and no duplicates across consecutive ticks', () => {
    let cursor = 0;
    const times: number[] = [];
    for (let now = 0; now < 60; now += 0.5) {
      const result = collectDue(now, cursor, config, rand);
      cursor = result.nextTime;
      times.push(...result.events.map((e) => e.time));
    }
    const sorted = [...times].sort((a, b) => a - b);
    expect(times).toEqual(sorted);
    expect(new Set(times).size).toBe(times.length);
  });

  it('skips a backlog instead of dumping it all at once after a long stall', () => {
    // Cursor left far in the past, as after a suspended tab.
    const { events } = collectDue(1000, 0, config, rand);
    expect(events.length).toBeLessThan(5);
    for (const event of events) expect(event.time).toBeGreaterThanOrEqual(1000);
  });

  it('honours maxEvents even with a pathologically short interval', () => {
    const dense: SchedulerConfig = { lookahead: 100, meanInterval: 0.05, jitter: 0 };
    const { events } = collectDue(0, 0, dense, rand, 8);
    expect(events).toHaveLength(8);
  });

  it('numbers events from zero', () => {
    const { events } = collectDue(0, 0, config, rand);
    expect(events.map((e) => e.index)).toEqual(events.map((_, i) => i));
  });
});

describe('tickIntervalMs', () => {
  it('wakes several times per lookahead window', () => {
    expect(tickIntervalMs(DEFAULT_SCHEDULER)).toBeLessThan(DEFAULT_SCHEDULER.lookahead * 1000);
  });

  it('never busy loops', () => {
    expect(tickIntervalMs({ lookahead: 0, meanInterval: 1, jitter: 0 })).toBeGreaterThanOrEqual(50);
  });
});
