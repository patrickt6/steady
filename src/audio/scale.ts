/**
 * Pitch material for the ambient pad.
 *
 * The pad uses one fixed scale for the whole session and never modulates. A key
 * change is an event, and events pull attention. Pentatonic and Dorian both have
 * the property that any two notes drawn at random sound acceptable together, so
 * the scheduler can pick blindly and never produce a moment that asks to be
 * noticed.
 */

export type ScaleName = 'pentatonic' | 'dorian';

/** Semitone offsets from the root. */
export const SCALES: Record<ScaleName, readonly number[]> = {
  pentatonic: [0, 3, 5, 7, 10],
  dorian: [0, 2, 3, 5, 7, 9, 10],
};

export const A4_MIDI = 69;
export const A4_HZ = 440;

export function midiToFreq(midi: number): number {
  return A4_HZ * Math.pow(2, (midi - A4_MIDI) / 12);
}

export function freqToMidi(freq: number): number {
  return A4_MIDI + 12 * Math.log2(freq / A4_HZ);
}

/**
 * All MIDI note numbers of `scale` rooted at `rootMidi`, spanning `octaves`,
 * ascending. Includes the octave above the root as the final note.
 */
export function buildScale(rootMidi: number, name: ScaleName, octaves: number): number[] {
  const steps = SCALES[name];
  const notes: number[] = [];
  const span = Math.max(1, Math.floor(octaves));
  for (let o = 0; o < span; o += 1) {
    for (const step of steps) notes.push(rootMidi + o * 12 + step);
  }
  notes.push(rootMidi + span * 12);
  return notes;
}

/**
 * Pick a note, biased toward the middle of the range and away from whatever
 * played last. Repeating a pitch immediately reads as a motif, and a motif is
 * something to follow.
 */
export function pickNote(scale: readonly number[], rand: number, previous?: number): number {
  if (scale.length === 0) throw new Error('scale is empty');
  const candidates = previous === undefined ? scale : scale.filter((n) => n !== previous);
  const pool = candidates.length > 0 ? candidates : scale;
  const index = Math.min(pool.length - 1, Math.max(0, Math.floor(rand * pool.length)));
  return pool[index];
}
