import { describe, expect, it } from 'vitest';
import { A4_HZ, A4_MIDI, buildScale, freqToMidi, midiToFreq, pickNote } from './scale';

describe('midiToFreq', () => {
  it('anchors on A4', () => {
    expect(midiToFreq(A4_MIDI)).toBeCloseTo(A4_HZ, 10);
  });

  it('doubles every octave', () => {
    expect(midiToFreq(A4_MIDI + 12)).toBeCloseTo(880, 10);
    expect(midiToFreq(A4_MIDI - 12)).toBeCloseTo(220, 10);
  });

  it('puts middle C near 261.63 Hz', () => {
    expect(midiToFreq(60)).toBeCloseTo(261.626, 3);
  });

  it('round trips through freqToMidi', () => {
    for (const midi of [21, 45, 60, 69, 96]) {
      expect(freqToMidi(midiToFreq(midi))).toBeCloseTo(midi, 10);
    }
  });
});

describe('buildScale', () => {
  it('spans the requested octaves and ends on the octave of the root', () => {
    const notes = buildScale(60, 'pentatonic', 2);
    expect(notes[0]).toBe(60);
    expect(notes[notes.length - 1]).toBe(84);
    expect(notes).toHaveLength(11);
  });

  it('is strictly ascending', () => {
    for (const name of ['pentatonic', 'dorian'] as const) {
      const notes = buildScale(48, name, 3);
      for (let i = 1; i < notes.length; i += 1) {
        expect(notes[i]).toBeGreaterThan(notes[i - 1]);
      }
    }
  });

  it('contains no semitone clashes in the pentatonic scale', () => {
    const notes = buildScale(60, 'pentatonic', 2);
    for (let i = 1; i < notes.length; i += 1) {
      expect(notes[i] - notes[i - 1]).toBeGreaterThanOrEqual(2);
    }
  });

  it('treats an octave count below one as one', () => {
    expect(buildScale(60, 'dorian', 0)).toHaveLength(8);
  });
});

describe('pickNote', () => {
  it('always returns a note from the scale', () => {
    const scale = buildScale(45, 'dorian', 2);
    for (let i = 0; i < 200; i += 1) {
      expect(scale).toContain(pickNote(scale, i / 200));
    }
  });

  it('never repeats the previous note', () => {
    const scale = buildScale(45, 'pentatonic', 2);
    for (const previous of scale) {
      for (let i = 0; i < 50; i += 1) {
        expect(pickNote(scale, i / 50, previous)).not.toBe(previous);
      }
    }
  });

  it('falls back when the scale has a single note', () => {
    expect(pickNote([60], 0.5, 60)).toBe(60);
  });

  it('handles a random value of exactly 1 without going out of bounds', () => {
    const scale = buildScale(45, 'dorian', 1);
    expect(scale).toContain(pickNote(scale, 1));
  });

  it('throws on an empty scale rather than returning undefined', () => {
    expect(() => pickNote([], 0.5)).toThrow();
  });
});
