/**
 * Lookahead scheduling.
 *
 * Notes are placed on the audio clock ahead of time, not fired by a timer at
 * the moment they should sound. A timer callback that is late by 40 ms is a
 * rhythmic stumble; a note scheduled 200 ms early with an exact
 * `AudioContext.currentTime` value is sample accurate no matter how busy the
 * main thread gets.
 *
 * A slow interval wakes up, asks for every event that falls inside the horizon,
 * schedules them all, and goes back to sleep.
 */

export interface SchedulerConfig {
  /** How far ahead of the audio clock we schedule, in seconds. */
  lookahead: number;
  /** Mean gap between pad notes, in seconds. */
  meanInterval: number;
  /** Fractional jitter on the gap, 0 for a metronome, 1 for wide spread. */
  jitter: number;
}

export const DEFAULT_SCHEDULER: SchedulerConfig = {
  lookahead: 1.5,
  meanInterval: 6,
  jitter: 0.6,
};

/**
 * Next event time given the last one. The gap is drawn from a uniform window
 * around the mean so the pad never settles into a pulse. A pulse is a beat, and
 * a beat is something to entrain to and then notice when it stops.
 */
export function nextEventTime(lastTime: number, config: SchedulerConfig, rand: number): number {
  const jitter = Math.min(0.95, Math.max(0, config.jitter));
  const low = config.meanInterval * (1 - jitter);
  const high = config.meanInterval * (1 + jitter);
  const gap = low + rand * (high - low);
  return lastTime + Math.max(0.05, gap);
}

export interface DueEvent {
  time: number;
  index: number;
}

/**
 * Every event time between `nextTime` and `now + lookahead`.
 *
 * Returns the events plus the new cursor, so the caller keeps no hidden state.
 * `maxEvents` is a safety valve: if the tab was suspended for ten minutes we
 * must not try to schedule a hundred backdated notes on wake.
 */
export function collectDue(
  now: number,
  nextTime: number,
  config: SchedulerConfig,
  rand: () => number,
  maxEvents = 32,
): { events: DueEvent[]; nextTime: number } {
  const horizon = now + config.lookahead;
  const events: DueEvent[] = [];
  let cursor = nextTime;

  // If we fell behind, jump the cursor forward rather than firing the backlog.
  if (cursor < now) cursor = now;

  let index = 0;
  while (cursor < horizon && events.length < maxEvents) {
    events.push({ time: cursor, index });
    cursor = nextEventTime(cursor, config, rand());
    index += 1;
  }

  return { events, nextTime: cursor };
}

/** How often the scheduling timer should wake, in milliseconds. */
export function tickIntervalMs(config: SchedulerConfig): number {
  return Math.max(50, Math.round((config.lookahead * 1000) / 3));
}
