"""
Scores every WAV in tools/rig/out/ and writes results.csv.

Every column is a raw measurement. There is no composite score on purpose:
a weighted index that nothing validates is a number you cannot defend.
Combine the columns later, if and when there is an outcome to combine them
against.

None of these columns measures attention. They measure properties of the
audio signal, and the argument that those properties relate to distraction
is an argument, not a result.

  python3 tools/rig/score.py
"""

from __future__ import annotations

import csv
import json
import sys
import warnings
from pathlib import Path

import numpy as np

warnings.filterwarnings("ignore")

import librosa  # noqa: E402
import pyloudnorm  # noqa: E402
import soundfile  # noqa: E402
from statsmodels.tsa.stattools import adfuller  # noqa: E402

HERE = Path(__file__).parent
OUT = HERE / "out"


def envelope_peak(y: np.ndarray, sr: int) -> tuple[float, float]:
    """
    Dominant frequency of the amplitude envelope, and how much of the envelope
    spectrum sits there. This is the verification measurement: if the app claims
    it modulates at 16 Hz, the envelope spectrum should peak at 16 Hz.
    """
    envelope = np.abs(librosa.util.frame(y, frame_length=64, hop_length=32)).max(axis=0)
    env_sr = sr / 32
    envelope = envelope - envelope.mean()
    spectrum = np.abs(np.fft.rfft(envelope * np.hanning(len(envelope))))
    freqs = np.fft.rfftfreq(len(envelope), 1 / env_sr)
    band = (freqs > 1) & (freqs < 60)
    if not band.any() or spectrum[band].sum() == 0:
        return float("nan"), float("nan")
    peak = float(freqs[band][np.argmax(spectrum[band])])
    share = float(spectrum[band].max() / spectrum[band].sum())
    return peak, share


def score(path: Path) -> dict:
    y, sr = soundfile.read(path, dtype="float32")
    if y.ndim > 1:
        y = y.mean(axis=1)

    row: dict = {"id": path.stem, "seconds": round(len(y) / sr, 1)}

    # Spectral flux: frame to frame spectral change. A new event in the sound is
    # a spike here, and a new event is what pulls attention away from a task.
    flux = librosa.onset.onset_strength(y=y, sr=sr)
    row["flux_mean"] = float(flux.mean())
    row["flux_sd"] = float(flux.std())
    row["flux_p95"] = float(np.percentile(flux, 95))

    # Onset timing. Entropy of the gaps between events: low means a regular
    # pulse, high means unpredictable timing.
    onsets = librosa.onset.onset_detect(onset_envelope=flux, sr=sr, units="time")
    row["onset_count"] = int(len(onsets))
    row["onset_per_min"] = round(len(onsets) / (len(y) / sr) * 60, 2)
    if len(onsets) > 4:
        gaps = np.diff(onsets)
        hist, _ = np.histogram(gaps, bins=20)
        p = hist[hist > 0] / hist.sum()
        row["ioi_entropy"] = float(-(p * np.log2(p)).sum())
        row["ioi_mean"] = float(gaps.mean())
        row["ioi_cv"] = float(gaps.std() / gaps.mean()) if gaps.mean() else float("nan")
    else:
        row["ioi_entropy"] = row["ioi_mean"] = row["ioi_cv"] = float("nan")

    # Loudness. LRA is the broadcast measure of how far loudness ranges over a
    # programme, and it is the closest thing here to an accepted standard.
    meter = pyloudnorm.Meter(sr)
    row["lufs_integrated"] = float(meter.integrated_loudness(y))
    win = int(sr * 3)
    blocks = [
        meter.integrated_loudness(y[i : i + win])
        for i in range(0, len(y) - win, win)
    ]
    blocks = [b for b in blocks if np.isfinite(b)]
    if len(blocks) > 4:
        row["loudness_range"] = float(np.percentile(blocks, 95) - np.percentile(blocks, 10))
        row["loudness_sd"] = float(np.std(blocks))
    else:
        row["loudness_range"] = row["loudness_sd"] = float("nan")

    # Timbre over time.
    centroid = librosa.feature.spectral_centroid(y=y, sr=sr)[0]
    rms = librosa.feature.rms(y=y)[0]
    row["centroid_mean"] = float(centroid.mean())
    row["centroid_cv"] = float(centroid.std() / centroid.mean()) if centroid.mean() else float("nan")
    row["flatness_mean"] = float(librosa.feature.spectral_flatness(y=y)[0].mean())
    row["rms_mean"] = float(rms.mean())

    # Stationarity. An ADF test that rejects means the statistic has no unit
    # root, which supports "nothing drifted over the session". This is the one
    # column here that is an actual statistical test rather than a heuristic.
    for name, series in (("rms", rms), ("centroid", centroid)):
        try:
            stat, pval = adfuller(series[::10], maxlag=20)[:2]
            row[f"adf_{name}_stat"] = float(stat)
            row[f"adf_{name}_p"] = float(pval)
        except Exception:
            row[f"adf_{name}_stat"] = row[f"adf_{name}_p"] = float("nan")

    # Long range self similarity: does the piece keep returning to the same state.
    try:
        mfcc = librosa.feature.mfcc(y=y, sr=sr, n_mfcc=13)
        mfcc = mfcc[:, :: max(1, mfcc.shape[1] // 400)]
        rec = librosa.segment.recurrence_matrix(mfcc, mode="affinity", metric="cosine")
        row["self_similarity"] = float(rec.mean())
    except Exception:
        row["self_similarity"] = float("nan")

    # Verification: is the modulation where the settings say it is.
    peak, share = envelope_peak(y, sr)
    row["env_peak_hz"] = peak
    row["env_peak_share"] = share
    return row


def main() -> int:
    files = sorted(OUT.glob("*.wav"))
    if not files:
        print("no WAVs in tools/rig/out. Run sweep.mjs first.", file=sys.stderr)
        return 1

    configs = {}
    config_path = OUT / "configs.json"
    if config_path.exists():
        for entry in json.loads(config_path.read_text()):
            configs[entry["id"]] = entry["settings"]

    rows = []
    for index, path in enumerate(files, 1):
        try:
            row = score(path)
        except Exception as error:  # a bad render must not stop the batch
            print(f"FAIL {path.stem}: {error}", file=sys.stderr)
            continue
        settings = configs.get(path.stem)
        if settings:
            row["set_rate"] = settings["modulation"]["rate"] if settings["modulation"]["enabled"] else 0
            row["set_depth"] = settings["modulation"]["depth"]
            row["set_crossover"] = settings["modulation"]["crossover"]
            row["set_warmth"] = settings["music"]["warmth"]
            row["set_scale"] = settings["music"]["scale"]
            row["set_noise"] = settings["noise"]["color"] if settings["noise"]["enabled"] else "off"
            # Does the measured envelope peak match the requested rate.
            row["rate_verified"] = (
                ""
                if not settings["modulation"]["enabled"]
                else abs(row["env_peak_hz"] - settings["modulation"]["rate"]) < 1.0
            )
        rows.append(row)
        print(f"[{index}/{len(files)}] {path.stem}")

    if not rows:
        return 1
    keys = list(dict.fromkeys(k for r in rows for k in r))
    with (HERE / "results.csv").open("w", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=keys)
        writer.writeheader()
        writer.writerows(rows)
    print(f"wrote {len(rows)} rows to tools/rig/results.csv")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
