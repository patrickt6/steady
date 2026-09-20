# Measurement rig

Renders the audio engine headlessly and measures the result. No users, no
listening, no supervision. `bash tools/rig/run.sh 300` does the whole pass.

## What it does

`sweep.mjs` drives headless Chromium. It builds the same signal chain as
`Engine.start` inside an `OfflineAudioContext`, renders 1020 parameter
configurations to mono 22.05 kHz WAV, and writes them to `out/`. Re-running
skips files that already exist, so the pass is restartable.

`score.py` reads every WAV and writes one row per render to `results.csv`.

## The one non-obvious part

`MusicBed` schedules notes with a `setInterval` that reads
`AudioContext.currentTime`. An `OfflineAudioContext` renders far faster than
real time and its clock does not advance while `startRendering()` runs, so that
timer never lines up with the audio clock. Render it naively and you get a drone
with no notes.

The rig therefore wraps the context in a Proxy that reports a virtual clock, and
`MusicBed` takes a `manual` flag that suppresses the timer so the rig can drive
`tick()` across the whole timeline before rendering. That flag is the only
change to `src/`.

## Columns

| Column                                             | Meaning                                                                                                                                        |
| -------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `flux_*`                                           | Spectral flux, frame to frame spectral change. Spikes are new events.                                                                          |
| `onset_per_min`, `ioi_*`                           | Event rate, and the entropy and variability of the gaps between events.                                                                        |
| `lufs_integrated`, `loudness_range`, `loudness_sd` | ITU-R BS.1770 loudness. `loudness_range` is the broadcast LRA measure.                                                                         |
| `centroid_*`, `flatness_mean`, `rms_mean`          | Timbre and level.                                                                                                                              |
| `adf_*_p`                                          | Augmented Dickey-Fuller test on RMS and spectral centroid. A low p supports "nothing drifted over the session".                                |
| `self_similarity`                                  | Mean of the MFCC recurrence matrix. High means the piece keeps returning to the same state.                                                    |
| `env_peak_hz`, `env_peak_share`, `rate_verified`   | Dominant frequency of the amplitude envelope. This is the verification column: it checks the modulation is at the rate the settings asked for. |

## What this does not measure

Attention. None of it. These are properties of an audio signal. The argument
that a low flux, low loudness range, high self similarity signal is less
distracting is an argument from the literature, not a result produced here.

There is deliberately no composite score. A weighted index validated against
nothing is a number you cannot defend in a room. Combine the columns once there
is a human outcome to combine them against.

`rate_verified` is the exception. It is a real pass or fail on a claim the app
makes about itself, and it stands on its own.
