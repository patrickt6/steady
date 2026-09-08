/**
 * Voicing and gain arithmetic for the extra music voices.
 *
 * The bed is more than one note generator now: there is a bass drone, a pad of
 * sustained voices, and the notes themselves. All three draw from the same fixed
 * scale, and all three need numbers picked before any audio node exists. Those
 * numbers live here, as pure functions, for the same reason the rest of the DSP
 * arithmetic does: they are the part that can be wrong quietly, so they are the
 * part that gets tested.
 *
 * Nothing here is research backed. The extra voices are an aesthetic choice to
 * stop the bed sounding like a test signal, and they follow the same rules as
 * everything else: no melody, no pulse, no onset, no surprise.
 */

import { clamp, clamp01 } from './gain';

/** Number of pad voices held at once. Enough for a chord, few enough to blur. */
export const PAD_VOICES = 4;

/** The band the bass fundamental is folded into, in Hz. */
export const BASS_RANGE = { min: 40, max: 80 } as const;

/**
 * The slice of the scale one pad voice may draw from.
 *
 * Each voice owns a band and never leaves it. If every voice could pick from
 * the whole scale they would sometimes all land in the same octave, which is a
 * cluster and reads as a chord being played rather than a texture being there.
 */
export function voiceBand(
  length: number,
  index: number,
  count: number,
): { lo: number; hi: number } {
  const total = Math.max(1, Math.floor(length));
  const voices = Math.max(1, Math.floor(count));
  const slot = clamp(Math.floor(index), 0, voices - 1);
  const width = total / voices;
  const lo = Math.min(total - 1, Math.floor(slot * width));
  const hi = Math.max(lo + 1, Math.min(total, Math.ceil((slot + 1) * width)));
  return { lo, hi };
}

/** The pitch one pad voice takes next, drawn from its own band only. */
export function padPitch(
  scale: readonly number[],
  index: number,
  count: number,
  rand: number,
): number {
  if (scale.length === 0) throw new Error('scale is empty');
  const { lo, hi } = voiceBand(scale.length, index, count);
  const span = hi - lo;
  const offset = Math.min(span - 1, Math.max(0, Math.floor(clamp01(rand) * span)));
  return scale[lo + offset];
}

/**
 * A whole chord, one pitch per voice, ascending.
 *
 * Because each voice is confined to its own band the result is always spread
 * rather than clustered, and because the bands come from the fixed scale it is
 * always a chord that belongs to the session's one key.
 */
export function padVoicing(scale: readonly number[], count: number, rand: () => number): number[] {
  const voices = Math.max(1, Math.floor(count));
  const pitches: number[] = [];
  for (let i = 0; i < voices; i += 1) pitches.push(padPitch(scale, i, voices, rand()));
  return pitches.sort((a, b) => a - b);
}

/**
 * The MIDI note for the bass drone: the session root folded down into the
 * 40 to 80 Hz band. Folding by octaves rather than transposing means the bass is
 * always the root, so it can never imply a key change.
 */
export function bassMidi(rootMidi: number, freqOf: (midi: number) => number): number {
  let midi = Math.round(rootMidi);
  let guard = 0;
  while (freqOf(midi) > BASS_RANGE.max && guard < 16) {
    midi -= 12;
    guard += 1;
  }
  while (freqOf(midi) < BASS_RANGE.min && guard < 16) {
    midi += 12;
    guard += 1;
  }
  return midi;
}

/**
 * How long one pad voice takes to appear, sit, and go, in seconds.
 *
 * The three numbers are drawn independently per voice so that four voices never
 * line up. A chord where every voice changes at once is a chord change, and a
 * chord change is an event.
 */
export function padCycle(rand: () => number): { attack: number; hold: number; release: number } {
  return {
    attack: 18 + rand() * 22,
    hold: 25 + rand() * 45,
    release: 20 + rand() * 25,
  };
}

/**
 * Detune for one oscillator in a pair, in cents.
 *
 * Two oscillators a few cents apart beat against each other at well under a
 * hertz, which reads as warmth rather than as vibrato. Wider than about eight
 * cents starts to sound out of tune instead of thick.
 */
export function detuneCents(index: number, spread: number): number {
  const half = Math.abs(spread) / 2;
  return index % 2 === 0 ? -half : half;
}

/**
 * The partials of one scheduled note, as [frequency ratio, relative level].
 *
 * The fundamental, an octave, a twelfth and a fifth, each quieter than the last.
 * Every ratio is harmonic, so nothing in the stack beats against anything except
 * its own detune, and the whole thing still reads as one sound rather than as a
 * chord. Four partials is enough to have a body and few enough to stay dull.
 */
export const NOTE_PARTIALS: readonly (readonly [number, number])[] = [
  [1, 0.8],
  [2, 0.14],
  [3, 0.07],
  [1.5, 0.16],
] as const;

/** Summed level of the partials, which is what one note actually peaks at. */
export function partialSum(): number {
  return NOTE_PARTIALS.reduce((total, [, level]) => total + level, 0);
}

export interface VoiceGains {
  /** Peak of one scheduled note's envelope, before the partials are summed. */
  note: number;
  /** Peak of one pad voice. */
  pad: number;
  /** Steady level of the bass drone. */
  bass: number;
  /** Trim on the whole bed, compensating for the voices warmth adds. */
  busTrim: number;
}

/**
 * Level for each voice at a given warmth, plus the trim that pays for them.
 *
 * More voices means more summed amplitude, so the bus is trimmed as warmth goes
 * up, and the trim is set so that warmth changes what the bed is made of without
 * much changing how loud it is. That is the same bargain the modulation stage
 * makes with its depth control, and for the same reason: nobody can use a
 * control that also changes the volume while they are moving it.
 *
 * The trim is not an exact worst case compensation, because the voices almost
 * never peak together. It is set so the summed peak stays under PEAK_BUDGET at
 * every warmth setting and the loudness stays close to flat across the range.
 */
export function voiceGains(warmth: number): VoiceGains {
  const w = clamp01(warmth);
  const busTrim = 1 / (1 + 0.5 * w);
  return {
    note: 0.2,
    pad: 0.03 * w,
    bass: 0.075 * w,
    busTrim,
  };
}

/** The most the bed is allowed to sum to before the layer level is applied. */
export const PEAK_BUDGET = 0.7;

/**
 * Peak of the always on part of the bed: the drone plus every pad voice, with no
 * note playing. This is the part that is there all session, so it is the part
 * that must never be what pushes the mix into the limiter.
 */
export function sustainedPeak(warmth: number): number {
  const g = voiceGains(warmth);
  return (g.bass + g.pad * PAD_VOICES) * g.busTrim;
}

/**
 * Worst case summed peak of the bed at a given warmth: bass, every pad voice,
 * and two overlapping notes, all at once. Used by the tests to hold the gain
 * budget honest, and by nothing at runtime.
 */
export function summedPeak(warmth: number, overlappingNotes = 2): number {
  const g = voiceGains(warmth);
  const notes = g.note * partialSum() * Math.max(0, overlappingNotes);
  return (g.bass + g.pad * PAD_VOICES + notes) * g.busTrim;
}
