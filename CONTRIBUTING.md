# Contributing

Bug reports, fixes, and sound design improvements are welcome.

## Getting set up

Node 20 or newer.

```sh
npm install
npm run dev
```

Before opening a pull request:

```sh
npm run lint
npm run test
npm run build
```

All three run in CI on every push and pull request, so you may as well find out locally.

## The rules that are not negotiable

There are no lyrics, no vocals and no speech synthesis in this app. Background music with lyrics measurably hurts recall and reading comprehension (Furnham and Bradley 1997). A pull request adding vocals will be closed.

Every claim needs a citation, and every citation gets a grade. If a change adds or implies a claim about what the audio does to a listener, it needs a real reference, and that reference goes into the evidence table in the README at Moderate, Limited, or Preliminary. Nothing gets graded Strong. If you cannot find a source, ship the feature and say it is unsupported.

Nothing here uses medical framing. This is not a treatment, a therapy, or a device. Words like "cure", "treat", "clinically proven", and "therapy" do not belong in this repository.

Novelty is what the music bed is designed to avoid. Melodies, hooks, percussion, key changes, and anything that resolves are all things attention can grab onto. If a change makes the bed more interesting, it is making it worse.

## Sound design changes

If you change how something sounds, say what it sounds like and why the change is better for concentration specifically, not for listening pleasure. A sound that is nicer to listen to is often worse at this job.

## Code

Vanilla TypeScript with Vite. No framework, and no runtime dependencies for the audio.

Keep the pure logic separate from the audio graph. Filter coefficients, scale construction, scheduling, gain arithmetic, and settings validation are all pure functions and all tested. The graph itself is not unit tested, because a test that a `GainNode` has the gain you set is a test of the browser.

Comments should explain the reasoning, not the syntax. The interesting parts of this codebase are the choices, for example why the modulator is a sine and why the noise generator runs on a worklet.

Prettier and ESLint are configured; `npm run lint` checks both and `npm run format` fixes the formatting.

## Reporting a bug

Say what browser, what you did, what you heard, and what you expected. Audio bugs are easier to fix with a description of the sound than with a stack trace: clicking, dropouts, a sudden level jump, or the sound stopping after a while are all distinct problems with distinct causes.

## Code of conduct

By participating you agree to the [Code of Conduct](CODE_OF_CONDUCT.md).
