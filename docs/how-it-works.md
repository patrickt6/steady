# How it works

Everything you hear is computed in your browser while you listen. There are no audio files in this repository, nothing is downloaded after the page loads, and nothing is sent anywhere.

## The signal chain

```
music bed  ->  modulation stage  ->  master gain  ->  limiter  ->  speakers
noise ---------------------------->
```

There is a full block diagram of the chain, down to the individual voices, in the README.

The music goes through the modulation stage. The noise does not, because the studies behind this app modulated music, and modulated noise is a different thing that nobody tested.

## The music bed

Everything is generated as you listen. There is no loop and no recorded material.

At the start of a session the app builds a scale, either pentatonic or Dorian, spanning three octaves from a fixed root, and it uses that scale for the whole session with no key changes. Both scales have a useful property: any two notes drawn from them at random sound acceptable together. That lets the pickers choose blindly and still never produce a moment that asks to be noticed.

The bed has three voices. All three draw from that one scale.

**Notes** are picked one at a time and scheduled ahead of the clock. Each note is four harmonic partials, the fundamental, an octave, a twelfth and a fifth, each quieter than the last, with a few cents of detune between them. It has an attack of two to four seconds, a hold, and a release of four to eight seconds, and a lowpass that opens while the note swells and closes while it goes, so the note has a shape without ever having an edge. The attack is long enough that there is no onset to hear. A note does not start so much as turn out to have been there for a while. Sharp onsets are exactly what captures attention, so there are none. Notes are panned randomly across the stereo field and fed to both a dry path and a reverb.

**A bass drone** sits under everything: two sine oscillators about seven cents apart, lowpassed at 160 Hz, on the session root folded down by octaves into the 40 to 80 Hz band. Folding by octaves rather than transposing means the drone is always the root, so it can never imply a key change. The detune makes the two oscillators beat against each other at well under a hertz, which is the slow swell it is there for. It has no envelope and no articulation. It sits under everything as a steady floor and never plays a line you could follow.

**A pad** holds four sustained voices. Each voice owns its own slice of the scale and never leaves it, so the chord is always spread rather than clustered, and each runs on its own clock: eighteen to forty seconds to fade in, twenty five to seventy to sit, twenty to forty five to fade out, then a gap before it comes back somewhere else in its own band. The three stages are drawn independently per voice, so the four never line up. The chord drifts one voice at a time. It never changes all at once, because a chord change all at once is an event.

Over the top of all of that, the bed's lowpass cutoff is modulated by a sine at about one cycle a minute, so the texture is never quite where it was a minute ago without ever being somewhere you noticed it going. The brightness control sets the centre of that movement.

The drone, the pad and the slow cutoff sweep are an aesthetic decision and nothing else. There is no research behind them and no claim being made for them. Earlier the bed was one note every seven seconds, which obeyed every rule below and still sounded like a test signal rather than like music somebody meant. The rules did not move to make room for the fix: every added voice is sustained, every envelope is measured in tens of seconds, and none of them gives you anything to follow. The "Warmth" control scales the drone and the pad together, and at zero you get the notes alone.

The rules the bed follows, and the reasons:

- **No lyrics or vocals, ever.** Background music with lyrics measurably hurts recall and reading comprehension (Furnham and Bradley 1997). There is no speech synthesis in this codebase.
- **No melody.** A melody is something to follow, and then something to have expectations about.
- **No pulse.** A steady beat is something to entrain to and then to notice when it changes.
- **No percussion and no transients.** Onsets capture attention.
- **No key change, no build, no resolution.** Novelty is the thing to avoid.

## Scheduling

Notes are placed on the audio clock in advance, not fired by a timer at the moment they should sound.

A `setTimeout` callback that arrives 40 ms late is an audible stumble. A note scheduled 200 ms early against an exact `AudioContext.currentTime` value is sample accurate no matter how busy the main thread is. So a slow interval wakes up a few times a second, asks for every event falling inside a lookahead window of about two seconds, schedules all of them, and goes back to sleep.

Gaps between notes are drawn from a uniform window around a mean, so the bed never settles into a pulse. The scheduler also refuses to fire a backlog: if the tab was suspended for ten minutes, the cursor jumps forward to now rather than dumping a hundred backdated notes into the graph at once.

The logic lives in `src/audio/scheduler.ts` and is pure, so it is tested directly. The same is true of the voicing arithmetic in `src/audio/voicing.ts`: which pitch each pad voice may take, how the root folds into the bass band, how long a pad swell lasts, and what each voice is allowed to weigh.

## Node lifetimes

The bed runs for hours, so nothing in it is allowed to accumulate.

Notes are the only thing allocated per event, and every oscillator, gain, filter and panner a note creates is stopped and disconnected from the `ended` handler of its own oscillator. The drone, the four pad voices and the cutoff sweep are allocated once when playback starts and recycled after that: a pad voice changes pitch by writing a new frequency while its envelope is at zero, not by building a new oscillator, so it costs a fixed three nodes however long the session runs.

## Levels across the layers

Adding voices adds summed amplitude, so warmth also trims the whole bed as it goes up. The trim is set so that warmth changes what the bed is made of without much changing how loud it is, which is the same bargain the modulation depth control makes, and for the same reason: nobody can use a control that also changes the volume while they are moving it. The drone and the pad together are held to well under a third of the bed's peak budget, because they are the part that is there all session and so they must never be the thing that pushes the mix into the limiter.

## The modulation stage

This is the part the research is actually about, and it is the reason the app exists in this shape.

The stage multiplies the music's amplitude by a slowly varying gain:

```
gate = offset + swing * sin(2 * pi * rate * t)
```

with `offset = 1 - depth/2` and `swing = depth/2`. That arrangement peaks at exactly 1 for every depth setting and troughs at `1 - depth`. At depth 0 the stage is transparent. At depth 1 the signal reaches silence between peaks. Because the peak is always unity, moving the depth slider does not change how loud the loudest moments are, only how deep the dips go.

Two choices are worth explaining.

**The modulator is a sine.** A square gate has a discontinuity at every edge. At 16 Hz that is 32 clicks a second, and the clicks are more distracting than the modulation is helpful. Multiplying by a sine puts a pair of sidebands at the carrier frequency plus and minus the modulation rate and adds nothing else, which is about as gentle as amplitude modulation gets.

**Only content above a crossover is modulated,** 300 Hz by default and adjustable. Modulating the full band makes the bass pump, which reads as a tremolo effect and pulls your attention straight to the sound. Splitting the signal, leaving the low end steady and modulating everything above it, keeps the modulation present in the signal while making it much easier to ignore. The trade is that the effective modulation depth at the very bottom of the spectrum is lower than the slider says.

The bass drone sits below the crossover, so it is one of the things being held steady. Every voice in the bed still goes through the modulation stage, and the depth measured above the crossover is the same as it was before the drone existed, but the drone does mean a larger share of the total output is now in the unmodulated band. The crossover slider stops at 80 Hz, so there is no setting that modulates the drone. Turn Warmth down if you want more of what you hear to be modulated, and to zero if you want all of it.

The default rate is 16 Hz, in the beta range, because that is where the 2024 study found the largest benefit for listeners reporting more attention difficulties. Alpha and slower rates are offered so you can compare. There is no evidence for one correct depth, so depth is yours.

## Noise

Three colors, all generated sample by sample:

- **White** is raw uniform noise, a flat spectrum.
- **Pink** falls about 3 dB per octave. It uses Paul Kellet's approximation: six one pole filters summed with a direct term. The poles are all inside the unit circle, so the filter cannot run away.
- **Brown** falls about 6 dB per octave. It is a leaky integrator over white noise. The leak, dividing by 1.02 each step rather than 1.0, is what stops the running sum from drifting into inaudible DC and eating all the headroom.

This runs in an `AudioWorkletProcessor` on the audio rendering thread, in `public/noise-processor.js`. That matters: the main thread can be busy laying out the page, and the noise still comes out clean because this code is not on it. There is no buffer and therefore no loop point, so the noise genuinely never repeats.

If a browser has no `AudioWorklet`, the app falls back to a thirty second buffer with an equal power crossfaded seam. A thirty second loop is audible if you go looking for it, which is why it is the fallback and not the design. The status line tells you when the fallback is in use.

## Reverb

The reverb impulse response is generated at runtime: exponentially decaying noise across two channels, about three and a half seconds long. It is a passable small room, and generating it means the repository contains no binary audio assets at all.

## Levels and safety

The volume slider maps to gain through a cube, not linearly. A linear map wastes the top half of the slider and crams everything useful into the bottom. Cubing it makes the whole travel useful.

Two things sit between the mix and your ears. The master gain is capped at 0.7 linear, and after it a `DynamicsCompressor` runs as a hard limiter: threshold at -6 dB, ratio 20, no knee. It is a safety device rather than a tone control, and it is set so that no combination of sliders can produce something painful in headphones.

Every parameter change is a ramp rather than a step, because a step in a gain value is a click. Play fades in over about a second, stop fades out over about a second, and the session timer fades out rather than sounding an alarm. An alarm at the end of a focus block is a startle, and a startle costs more than the reminder is worth.

## The headphone check

Optional, tucked behind a disclosure, and it never blocks the play button.

Each trial plays three 200 Hz tones. One is 6 dB quieter than the others and in phase across both channels. One is at full level but 180 degrees out of phase between channels. The third is at full level and in phase. You pick the quietest.

Over headphones each ear gets its own channel, the phase relationship is inaudible, and the quiet tone is obviously the quiet one. Over speakers the antiphase tone partly cancels in the air before reaching you, so it sounds quietest and gets picked by mistake. Six trials, five correct to pass.

The method is from Woods et al. 2017. It is a screening tool, not a verdict on your hearing.

## Persistence and offline

Settings are stored in `localStorage` as a single JSON blob, and everything read back out is passed through a normalizer that clamps every number into range, replaces unknown enum values with defaults, and never throws. Whatever is in storage might be from an older version of the app, hand edited, or corrupt, and none of those should be able to produce a NaN in an `AudioParam`.

A service worker caches the app on first visit, so it works with no network afterward. There is nothing to sync, so the caching strategy is cache first with a quiet background refresh.

## Accessibility

Real buttons and real form controls, so keyboard navigation and screen readers work without any extra machinery. Visible focus rings. Space toggles play unless you are focused on a control that already uses it. Light and dark themes follow `prefers-color-scheme`, and animation is disabled under `prefers-reduced-motion`, of which there is very little to begin with.
