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
# which skill this iteration measures; the aggregator only prints it
SKILL_NAME="${SKILL_NAME:-onion-architecture}"
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
  # arm names are discovered, not hardcoded: a two-arm run uses
  # with_skill/without_skill, an ablation run uses intact/ablated/restored
  for arm_dir in "$case_dir"*/; do
    arm="$(basename "$arm_dir")"
    # two supported layouts: one run per arm (<case>/<arm>/grading.json), or
    # repeated trials (<case>/<arm>/run-K/grading.json)
    if [ -f "$case_dir$arm/grading.json" ]; then
      src_dirs=("$case_dir$arm")
    else
      src_dirs=()
      for rd in "$case_dir$arm"/run-*/; do
        [ -f "$rd/grading.json" ] && src_dirs+=("$rd")
      done
    fi
    [ ${#src_dirs[@]} -eq 0 ] && continue
    k=0
    for src in "${src_dirs[@]}"; do
      k=$((k+1))
      d="$SHIM/eval-$i-$name/$arm/run-$k"
      mkdir -p "$d"
      abs="$(cd "$src" && pwd)"
      ln -s "$abs/grading.json" "$d/grading.json"
      [ -f "$abs/timing.json" ] && ln -s "$abs/timing.json" "$d/timing.json"
    done
  done
  i=$((i+1))
done

(cd "$SC" && python3 -m scripts.aggregate_benchmark "$SHIM" --skill-name "$SKILL_NAME")
cp "$SHIM/benchmark.json" "$ITER/benchmark.json"
cp "$SHIM/benchmark.md"   "$ITER/benchmark.md"

# skill-creator hardcodes metadata.runs_per_configuration = 3
# (scripts/aggregate_benchmark.py) regardless of how many runs it just read, so
# benchmark.md states a run count that is simply false. Derive it from the runs
# actually aggregated and rewrite both files before anyone quotes them.
python3 - "$ITER" <<'FIXPY'
import json, re, sys, pathlib
it = pathlib.Path(sys.argv[1])
bj = json.loads((it/"benchmark.json").read_text())
per = {}
for r in bj.get("runs", []):
    per.setdefault(r["configuration"], set()).add((r["eval_id"], r["run_number"]))
counts = {c: len({rn for _, rn in v}) for c, v in per.items()}
n = min(counts.values()) if counts else 0
bj["metadata"]["runs_per_configuration"] = n
(it/"benchmark.json").write_text(json.dumps(bj, indent=2) + "\n")
md = (it/"benchmark.md").read_text()
md = re.sub(r"\(\d+ runs each per configuration\)", f"({n} runs each per configuration)", md)
(it/"benchmark.md").write_text(md)
FIXPY

cat "$ITER/benchmark.md"

ARGS=("$ITER" --skill-name "$SKILL_NAME" --benchmark "$ITER/benchmark.json")
[ -n "$PREV" ] && ARGS+=(--previous-workspace "$PREV")
nohup python3 "$SC/eval-viewer/generate_review.py" "${ARGS[@]}" >"$ITER/viewer.log" 2>&1 &
echo "viewer pid $! → http://localhost:3117"
