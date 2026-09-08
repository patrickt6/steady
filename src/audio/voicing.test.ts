import { describe, expect, it } from 'vitest';
import { buildScale, midiToFreq } from './scale';
import {
  BASS_RANGE,
  PAD_VOICES,
  PEAK_BUDGET,
  bassMidi,
  detuneCents,
  padCycle,
  padPitch,
  padVoicing,
  summedPeak,
  sustainedPeak,
  voiceBand,
  voiceGains,
} from './voicing';

/** A repeatable stand in for Math.random, so voicing tests are deterministic. */
function sequence(values: number[]): () => number {
  let i = 0;
  return () => values[i++ % values.length];
}

describe('voiceBand', () => {
  it('covers the whole scale with no gap between bands', () => {
    const bands = [0, 1, 2, 3].map((i) => voiceBand(20, i, 4));
    expect(bands[0].lo).toBe(0);
    expect(bands[3].hi).toBe(20);
    for (let i = 1; i < bands.length; i += 1) {
      expect(bands[i].lo).toBe(bands[i - 1].hi);
    }
  });

  it('never returns an empty band, even with more voices than notes', () => {
    for (let i = 0; i < 8; i += 1) {
      const band = voiceBand(3, i, 8);
      expect(band.hi).toBeGreaterThan(band.lo);
    }
  });

  it('clamps an index outside the voice count into range', () => {
    expect(voiceBand(12, 99, 4)).toEqual(voiceBand(12, 3, 4));
    expect(voiceBand(12, -5, 4)).toEqual(voiceBand(12, 0, 4));
  });
});

describe('padPitch', () => {
  const scale = buildScale(45, 'pentatonic', 3);

  it('stays inside the voice band at both ends of the random range', () => {
    for (let voice = 0; voice < PAD_VOICES; voice += 1) {
      const { lo, hi } = voiceBand(scale.length, voice, PAD_VOICES);
      for (const rand of [0, 0.5, 0.999, 1]) {
        const pitch = padPitch(scale, voice, PAD_VOICES, rand);
        expect(scale.slice(lo, hi)).toContain(pitch);
      }
    }
  });

  it('only ever returns a note that is in the scale', () => {
    for (let i = 0; i < 200; i += 1) {
      expect(scale).toContain(padPitch(scale, i % PAD_VOICES, PAD_VOICES, Math.random()));
    }
  });

  it('throws on an empty scale rather than producing a NaN frequency', () => {
    expect(() => padPitch([], 0, 4, 0.5)).toThrow();
  });
});

describe('padVoicing', () => {
  const scale = buildScale(45, 'dorian', 3);

  it('returns one ascending pitch per voice', () => {
    const chord = padVoicing(scale, PAD_VOICES, sequence([0.1, 0.4, 0.7, 0.9]));
    expect(chord).toHaveLength(PAD_VOICES);
    for (let i = 1; i < chord.length; i += 1) {
      expect(chord[i]).toBeGreaterThanOrEqual(chord[i - 1]);
    }
  });

  it('spreads the chord rather than clustering it in one octave', () => {
    for (let trial = 0; trial < 100; trial += 1) {
      const chord = padVoicing(scale, PAD_VOICES, Math.random);
      expect(chord[chord.length - 1] - chord[0]).toBeGreaterThan(6);
    }
  });
});

describe('bassMidi', () => {
  it('folds every usable root into the bass band', () => {
    for (let root = 24; root <= 72; root += 1) {
      const freq = midiToFreq(bassMidi(root, midiToFreq));
      expect(freq).toBeGreaterThanOrEqual(BASS_RANGE.min);
      expect(freq).toBeLessThanOrEqual(BASS_RANGE.max);
    }
  });

  it('moves only by whole octaves, so the bass is always the root', () => {
    for (const root of [40, 45, 52, 60]) {
      expect((root - bassMidi(root, midiToFreq)) % 12).toBe(0);
    }
  });
});

describe('padCycle', () => {
  it('gives every stage tens of seconds, so nothing has an onset', () => {
    for (let i = 0; i < 200; i += 1) {
      const { attack, hold, release } = padCycle(Math.random);
      expect(attack).toBeGreaterThanOrEqual(18);
      expect(release).toBeGreaterThanOrEqual(20);
      expect(hold).toBeGreaterThanOrEqual(25);
    }
  });

  it('draws the three stages independently, so voices do not line up', () => {
    const a = padCycle(sequence([0, 0, 0]));
    const b = padCycle(sequence([1, 1, 1]));
    expect(b.attack).toBeGreaterThan(a.attack);
    expect(b.hold).toBeGreaterThan(a.hold);
    expect(b.release).toBeGreaterThan(a.release);
  });
});

describe('detuneCents', () => {
  it('splits the spread evenly either side of the pitch', () => {
    expect(detuneCents(0, 6)).toBeCloseTo(-3, 10);
    expect(detuneCents(1, 6)).toBeCloseTo(3, 10);
    expect(detuneCents(0, 6) + detuneCents(1, 6)).toBeCloseTo(0, 10);
  });

  it('stays inside the range that reads as warmth rather than as out of tune', () => {
    for (let i = 0; i < 8; i += 1) {
      expect(Math.abs(detuneCents(i, 7))).toBeLessThanOrEqual(4);
    }
  });
});

describe('voiceGains', () => {
  it('adds no pad and no bass at all at zero warmth', () => {
    const g = voiceGains(0);
    expect(g.pad).toBe(0);
    expect(g.bass).toBe(0);
    expect(g.busTrim).toBe(1);
  });

  it('trims the bus further as warmth adds voices', () => {
    let previous = Infinity;
    for (const w of [0, 0.25, 0.5, 0.75, 1]) {
      const trim = voiceGains(w).busTrim;
      expect(trim).toBeLessThan(previous);
      previous = trim;
    }
  });

  it('coerces junk into the usable range instead of producing a NaN gain', () => {
    for (const value of [NaN, -3, 42, Infinity]) {
      const g = voiceGains(value);
      for (const gain of [g.note, g.pad, g.bass, g.busTrim]) {
        expect(Number.isFinite(gain)).toBe(true);
        expect(gain).toBeGreaterThanOrEqual(0);
      }
    }
  });
});

describe('the gain budget', () => {
  it('keeps the worst case summed peak under budget at every warmth', () => {
    for (let w = 0; w <= 1.0001; w += 0.05) {
      expect(summedPeak(w)).toBeLessThan(PEAK_BUDGET);
    }
  });

  it('keeps the always on voices to a small share of the budget', () => {
    // The drone and the pad are there for the whole session, so they must never
    // be the thing that pushes the mix into the limiter. Notes get the rest.
    expect(sustainedPeak(1)).toBeLessThan(PEAK_BUDGET * 0.3);
    expect(sustainedPeak(0)).toBe(0);
  });

  it('keeps the peak roughly flat across the warmth range', () => {
    // Warmth changes what the bed is made of, not how loud it is. Five voices
    // instead of one, and the loudest moments stay within a fifth of each other.
    for (let w = 0; w <= 1.0001; w += 0.05) {
      const ratio = summedPeak(w) / summedPeak(0);
      expect(ratio).toBeGreaterThan(0.8);
      expect(ratio).toBeLessThan(1.2);
    }
  });
});
