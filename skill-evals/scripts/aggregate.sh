#!/usr/bin/env bash
# Aggregate a finished iteration into benchmark.json + benchmark.md, then open
# skill-creator's eval viewer.
#
# Usage: ./scripts/aggregate.sh <workspace>/iteration-N [<workspace>/iteration-N-1]
#
# skill-creator's aggregator walks `eval-*/<config>/run-*/grading.json`, which is
# not the layout the viewer wants, so this builds a symlink shim for it and
# leaves the real workspace untouched.
set -euo pipefail

ITER="${1:?usage: aggregate.sh <workspace>/iteration-N [previous-iteration]}"
PREV="${2:-}"
# absolute — the aggregator runs from skill-creator's directory
ITER="$(cd "$ITER" && pwd)"
[ -n "$PREV" ] && PREV="$(cd "$PREV" && pwd)"
REL="plugins/cache/claude-plugins-official/skill-creator/unknown/skills/skill-creator"
SC="${SKILL_CREATOR_DIR:-}"
if [ -z "$SC" ]; then
  for base in "$HOME/.claude-max" "$HOME/.claude"; do
    [ -d "$base/$REL" ] && SC="$base/$REL" && break
  done
fi

[ -d "$SC" ] || { echo "skill-creator not found at $SC — set SKILL_CREATOR_DIR" >&2; exit 1; }

SHIM="$ITER/.bench-shim"
rm -rf "$SHIM"; mkdir -p "$SHIM"
i=0
for case_dir in "$ITER"/*/; do
  name="$(basename "$case_dir")"
  [ "$name" = ".bench-shim" ] && continue
  for arm in with_skill without_skill; do
    [ -f "$case_dir$arm/grading.json" ] || continue
    d="$SHIM/eval-$i-$name/$arm/run-1"
    mkdir -p "$d"
    ln -s "$(cd "$case_dir$arm" && pwd)/grading.json" "$d/grading.json"
    [ -f "$case_dir$arm/timing.json" ] && ln -s "$(cd "$case_dir$arm" && pwd)/timing.json" "$d/timing.json"
  done
  i=$((i+1))
done

(cd "$SC" && python3 -m scripts.aggregate_benchmark "$SHIM" --skill-name onion-architecture)
cp "$SHIM/benchmark.json" "$ITER/benchmark.json"
cp "$SHIM/benchmark.md"   "$ITER/benchmark.md"
cat "$ITER/benchmark.md"

ARGS=("$ITER" --skill-name onion-architecture --benchmark "$ITER/benchmark.json")
[ -n "$PREV" ] && ARGS+=(--previous-workspace "$PREV")
nohup python3 "$SC/eval-viewer/generate_review.py" "${ARGS[@]}" >"$ITER/viewer.log" 2>&1 &
echo "viewer pid $! → http://localhost:3117"
