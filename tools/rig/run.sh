#!/usr/bin/env bash
# Full unattended pass: build, render every config, score every render.
#   bash tools/rig/run.sh [seconds]
set -u
cd "$(dirname "$0")/../.."
SECONDS_PER=${1:-300}
npx vite build -c tools/rig/vite.rig.config.ts || exit 1
node tools/rig/sweep.mjs "$SECONDS_PER"
tools/rig/.venv/bin/python tools/rig/score.py
