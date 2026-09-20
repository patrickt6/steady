/**
 * The headphone check from Woods, Siegel, Traer and McDermott (2017).
 *
 * Why it is here: the modulation stage and the stereo placement of the music
 * bed only do what they are supposed to do if the two channels reach two
 * separate ears. On laptop speakers the channels mix in the air before they get
 * anywhere near you.
 *
 * How the test works. Each trial plays three 200 Hz tones in sequence and asks
 * which was quietest.
 *
 *   one tone is 6 dB quieter than the others, in phase across both channels;
 *   one tone is at full level but 180 degrees out of phase between channels;
 *   one tone is at full level, in phase.
 *
 * Over headphones the phase relationship is inaudible, so the quiet tone is
 * obviously the quiet one and the trial is easy. Over speakers the antiphase
 * tone partly cancels in the air, so it sounds quietest and gets picked. Six
 * trials, and a listener on speakers reliably fails.
 *
 * It is offered, never required. Someone who wants to press play and get on
 * with their afternoon should not have to pass a hearing test first.
 */

export const TRIAL_COUNT = 6;
export const PASS_THRESHOLD = 5;
export const TONE_HZ = 200;
export const TONE_SECONDS = 1;
export const GAP_SECONDS = 0.25;
/** How much quieter the target tone is, in decibels. */
export const TARGET_ATTENUATION_DB = -6;

export type TonePhase = 'in-phase' | 'anti-phase';

export interface Tone {
  /** Linear gain, 1 for the loud tones. */
  gain: number;
  phase: TonePhase;
}

export interface Trial {
  tones: [Tone, Tone, Tone];
  /** Index of the genuinely quiet tone. This is the correct answer. */
  target: number;
  /** Index of the antiphase tone. Speaker listeners tend to pick this one. */
  decoy: number;
}

const QUIET_GAIN = Math.pow(10, TARGET_ATTENUATION_DB / 20);

/**
 * Build one trial. `rand` should return values in [0, 1).
 * The quiet tone and the antiphase tone are never the same tone; if they were,
 * speakers and headphones would give the same answer and the trial would tell
 * us nothing.
 */
export function makeTrial(rand: () => number): Trial {
  const target = Math.min(2, Math.floor(rand() * 3));
  const others = [0, 1, 2].filter((i) => i !== target);
  const decoy = others[Math.min(others.length - 1, Math.floor(rand() * others.length))];

  const tones = [0, 1, 2].map<Tone>((index) => ({
    gain: index === target ? QUIET_GAIN : 1,
    phase: index === decoy ? 'anti-phase' : 'in-phase',
  })) as [Tone, Tone, Tone];

  return { tones, target, decoy };
}

export function makeTrials(rand: () => number, count = TRIAL_COUNT): Trial[] {
  return Array.from({ length: count }, () => makeTrial(rand));
}

export type CheckVerdict = 'headphones' | 'speakers';

/** Pass or fail from a list of answers. */
export function scoreTrials(trials: readonly Trial[], answers: readonly number[]): number {
  return trials.reduce((total, trial, i) => total + (answers[i] === trial.target ? 1 : 0), 0);
}

export function verdict(correct: number, total = TRIAL_COUNT): CheckVerdict {
  const threshold = total === TRIAL_COUNT ? PASS_THRESHOLD : Math.ceil(total * 0.8);
  return correct >= threshold ? 'headphones' : 'speakers';
}

/** When each tone of a trial starts, relative to the start of the trial. */
export function toneOnsets(
  count = 3,
  toneSeconds = TONE_SECONDS,
  gapSeconds = GAP_SECONDS,
): number[] {
  return Array.from({ length: count }, (_, i) => i * (toneSeconds + gapSeconds));
}

/**
 * Play one trial. Resolves when the last tone has finished.
 * Each tone is one oscillator split to two channels, with the right channel
 * multiplied by -1 for the antiphase case.
 */
export function playTrial(context: AudioContext, trial: Trial, level = 0.15): Promise<void> {
  const start = context.currentTime + 0.15;
  const onsets = toneOnsets(trial.tones.length);

  trial.tones.forEach((tone, index) => {
    const when = start + onsets[index];
    const osc = context.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = TONE_HZ;

    const env = context.createGain();
    // Short raised edges so the tone does not click on or off.
    env.gain.setValueAtTime(0, when);
    env.gain.linearRampToValueAtTime(tone.gain * level, when + 0.05);
    env.gain.setValueAtTime(tone.gain * level, when + TONE_SECONDS - 0.05);
    env.gain.linearRampToValueAtTime(0, when + TONE_SECONDS);

    const merger = context.createChannelMerger(2);
    const left = context.createGain();
    const right = context.createGain();
    left.gain.value = 1;
    right.gain.value = tone.phase === 'anti-phase' ? -1 : 1;

    osc.connect(env);
    env.connect(left).connect(merger, 0, 0);
    env.connect(right).connect(merger, 0, 1);
    merger.connect(context.destination);

    osc.start(when);
    osc.stop(when + TONE_SECONDS + 0.05);
    osc.onended = () => {
      for (const node of [osc, env, left, right, merger]) node.disconnect();
    };
  });

  const total = onsets[onsets.length - 1] + TONE_SECONDS + 0.2;
  return new Promise((resolve) =>
    setTimeout(resolve, (start - context.currentTime + total) * 1000),
  );
}
