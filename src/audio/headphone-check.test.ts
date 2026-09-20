import { describe, expect, it } from 'vitest';
import {
  PASS_THRESHOLD,
  TARGET_ATTENUATION_DB,
  TRIAL_COUNT,
  makeTrial,
  makeTrials,
  scoreTrials,
  toneOnsets,
  verdict,
} from './headphone-check';
import { dbToGain } from './gain';

/** Deterministic sequence, cycling through the given values. */
function fixed(values: number[]): () => number {
  let i = 0;
  return () => values[i++ % values.length];
}

describe('makeTrial', () => {
  it('always has three tones', () => {
    expect(makeTrial(Math.random).tones).toHaveLength(3);
  });

  it('never puts the quiet tone and the antiphase tone on the same tone', () => {
    for (let i = 0; i < 2000; i += 1) {
      const trial = makeTrial(Math.random);
      expect(trial.target).not.toBe(trial.decoy);
    }
  });

  it('makes exactly one tone quiet and exactly one antiphase', () => {
    for (let i = 0; i < 500; i += 1) {
      const trial = makeTrial(Math.random);
      expect(trial.tones.filter((t) => t.gain < 1)).toHaveLength(1);
      expect(trial.tones.filter((t) => t.phase === 'anti-phase')).toHaveLength(1);
      expect(trial.tones[trial.target].gain).toBeLessThan(1);
      expect(trial.tones[trial.decoy].phase).toBe('anti-phase');
    }
  });

  it('attenuates the target by the stated number of decibels', () => {
    const trial = makeTrial(fixed([0, 0]));
    expect(trial.tones[trial.target].gain).toBeCloseTo(dbToGain(TARGET_ATTENUATION_DB), 10);
  });

  it('keeps indices in range even when the random source returns values near one', () => {
    const trial = makeTrial(fixed([0.9999999, 0.9999999]));
    for (const index of [trial.target, trial.decoy]) {
      expect(index).toBeGreaterThanOrEqual(0);
      expect(index).toBeLessThanOrEqual(2);
    }
  });

  it('uses every position as the target over many draws', () => {
    const seen = new Set<number>();
    for (let i = 0; i < 500; i += 1) seen.add(makeTrial(Math.random).target);
    expect(seen).toEqual(new Set([0, 1, 2]));
  });
});

describe('makeTrials', () => {
  it('produces the standard number of trials', () => {
    expect(makeTrials(Math.random)).toHaveLength(TRIAL_COUNT);
  });
});

describe('scoreTrials', () => {
  const trials = makeTrials(Math.random);

  it('scores a perfect run', () => {
    expect(
      scoreTrials(
        trials,
        trials.map((t) => t.target),
      ),
    ).toBe(TRIAL_COUNT);
  });

  it('scores the speaker failure mode, where the antiphase tone is picked every time', () => {
    expect(
      scoreTrials(
        trials,
        trials.map((t) => t.decoy),
      ),
    ).toBe(0);
  });

  it('treats a missing answer as wrong rather than throwing', () => {
    expect(scoreTrials(trials, [])).toBe(0);
  });
});

describe('verdict', () => {
  it('passes at the threshold and fails just below it', () => {
    expect(verdict(PASS_THRESHOLD)).toBe('headphones');
    expect(verdict(PASS_THRESHOLD - 1)).toBe('speakers');
    expect(verdict(TRIAL_COUNT)).toBe('headphones');
    expect(verdict(0)).toBe('speakers');
  });
});

describe('toneOnsets', () => {
  it('is ascending and starts at zero', () => {
    const onsets = toneOnsets();
    expect(onsets[0]).toBe(0);
    for (let i = 1; i < onsets.length; i += 1) {
      expect(onsets[i]).toBeGreaterThan(onsets[i - 1]);
    }
  });

  it('leaves a gap between tones so they do not run together', () => {
    const onsets = toneOnsets(3, 1, 0.25);
    expect(onsets[1] - onsets[0]).toBeCloseTo(1.25, 10);
  });
});
