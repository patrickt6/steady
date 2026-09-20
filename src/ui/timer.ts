/**
 * Session timer. When it runs out the audio fades away; there is no alarm.
 *
 * An alarm at the end of a focus block is a startle, and a startle costs more
 * than the reminder is worth. If you need to be told, use a clock.
 */

export function formatDuration(seconds: number): string {
  const total = Math.max(0, Math.round(seconds));
  const mm = Math.floor(total / 60);
  const ss = total % 60;
  return `${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
}

/** Seconds left given the start time, length, and current time. */
export function remainingSeconds(startedAt: number, minutes: number, now: number): number {
  if (minutes <= 0) return Infinity;
  return Math.max(0, minutes * 60 - (now - startedAt) / 1000);
}

export class SessionTimer {
  private startedAt = 0;
  private minutes = 0;
  private handle: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly onTick: (secondsLeft: number) => void,
    private readonly onExpire: () => void,
  ) {}

  start(minutes: number, now: number = Date.now()): void {
    this.cancel();
    this.minutes = minutes;
    this.startedAt = now;
    if (minutes <= 0) {
      this.onTick(Infinity);
      return;
    }
    this.handle = setInterval(() => this.check(), 500);
    this.check();
  }

  cancel(): void {
    if (this.handle !== null) {
      clearInterval(this.handle);
      this.handle = null;
    }
  }

  private check(): void {
    const left = remainingSeconds(this.startedAt, this.minutes, Date.now());
    this.onTick(left);
    if (left <= 0) {
      this.cancel();
      this.onExpire();
    }
  }
}
