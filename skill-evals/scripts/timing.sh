#!/usr/bin/env bash
# Record a finished run's cost. The completion notification is the only place
# total_tokens / duration_ms exist — write them the moment they arrive.
# Usage: timing.sh <run-dir> <total_tokens> <duration_ms> <tool_uses>
set -euo pipefail
d="${1:?run dir}"; t="${2:?tokens}"; ms="${3:?duration_ms}"; tu="${4:-0}"
printf '{"total_tokens": %s, "duration_ms": %s, "total_duration_seconds": %s, "tool_uses": %s}\n' \
  "$t" "$ms" "$(python3 -c "print(round($ms/1000,1))")" "$tu" > "$d/timing.json"
echo "$d/timing.json"
