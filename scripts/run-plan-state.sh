#!/usr/bin/env bash
# Deterministic phase resolver for /run-plan.
#
# Prints where a plan's execution stands, derived only from files on disk:
# the plan itself and the reports in docs/reports/. There is no state file —
# the artifacts are the state.
#
# Usage: ./scripts/run-plan-state.sh <slug | path-to-plan>
# Exit:  0 resolved · 1 plan not found or structurally invalid · 2 bad usage
set -uo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"
cd "$root"

[ $# -eq 1 ] || { echo "usage: $0 <slug | path-to-plan>" >&2; exit 2; }
arg="$1"

# --- locate the plan ---------------------------------------------------------
if [ -f "$arg" ]; then
  plan="$arg"
else
  matches=(docs/plans/*"$arg"*.md)
  [ -e "${matches[0]}" ] || { echo "✗ no plan in docs/plans/ matching '$arg'" >&2; exit 1; }
  [ "${#matches[@]}" -eq 1 ] || {
    echo "✗ '$arg' matches ${#matches[@]} plans — name one:" >&2
    printf '    %s\n' "${matches[@]}" >&2; exit 1; }
  plan="${matches[0]}"
fi

base="$(basename "$plan" .md)"
slug="$(sed -E 's/^[0-9]{4}-[0-9]{2}-[0-9]{2}-//' <<<"$base")"

# --- header facts ------------------------------------------------------------
status_line="$(grep -m1 -E '^\- \*\*Status:\*\*' "$plan" || true)"
# Take ONLY the first word after the marker, never a substring of the whole line.
# A plan whose status line explains itself — "draft — the human flips this to
# `approved` before implementation" — matched *approved* under the old glob and
# was executed as an approved plan. Measured 2026-08-24: a `draft` plan ran all
# 15 of its steps because of that. The trailing prose is deliberately discarded.
# The word may be bare, backticked, or bold — `approved`, **approved**, approved.
status="$(sed -nE 's/^- \*\*Status:\*\*[[:space:]]*[`*]*([A-Za-z]+).*/\1/p' <<<"$status_line" | tr 'A-Z' 'a-z')"
case "$status" in
  approved|implemented|draft) ;;
  *) status=unknown ;;
esac

mode="$(grep -m1 -E '^\- \*\*Execution mode:\*\*' "$plan" \
        | sed -E 's/^\- \*\*Execution mode:\*\*[[:space:]]*//; s/ *—.*//' || true)"
[ -n "$mode" ] || mode="unspecified"

# --- steps and their tracks --------------------------------------------------
# One line per step: "<id> <track>"
steps="$(awk '
  /^### S[0-9]+[.:]/ { if (id != "") print id, track; id = $2; sub(/[.:].*/, "", id); track = "-" }
  /^- \*\*Track:\*\*/ { t = $0; sub(/^- \*\*Track:\*\*[[:space:]]*/, "", t); sub(/[[:space:]]*$/, "", t); if (id != "") track = t }
  END { if (id != "") print id, track }
' "$plan")"
step_ids=$(awk '{print $1}' <<<"$steps")
step_count=$(grep -c . <<<"$step_ids" || true)
tracks="$(awk '{print $2}' <<<"$steps" | sort -u | grep -v '^-$' | paste -sd, - )"
[ -n "$tracks" ] || tracks="none declared"

# --- structural validation ---------------------------------------------------
invalid=0
err() { echo "  ✗ $1"; invalid=1; }
for s in 0 1 2 3 4 5 6 7 8; do
  grep -qE "^## $s[.b-d]*[.[:space:]]" "$plan" || err "missing section '## $s'"
done
[ "$step_count" -gt 0 ] || err "no steps found (expected '### S1. …')"
grep -q -- '- \*\*Depends on:\*\*' "$plan" || err "no step declares 'Depends on'"
if [ "$invalid" -eq 1 ]; then
  echo "plan     $plan   STRUCTURALLY INVALID"; exit 1
fi

# --- reports on disk ---------------------------------------------------------
rounds() {  # highest round number among docs/reports/*-<1>-<slug>-r<N>.md
  ls docs/reports/ 2>/dev/null \
    | sed -nE "s/^.*-$1-$slug-r([0-9]+)\.md$/\1/p" | sort -n | tail -1
}
have_step() { ls docs/reports/ 2>/dev/null | grep -qE -- "-implementer-$slug-$1\.md$"; }
full_run=$(ls docs/reports/ 2>/dev/null | grep -cE -- "-implementer-$slug\.md$" || true)

done_marks=""; done_n=0
for id in $step_ids; do
  lower=$(tr 'A-Z' 'a-z' <<<"$id")
  if [ "$full_run" -gt 0 ] || have_step "$lower"; then
    done_marks+="$id ✓ "; done_n=$((done_n + 1))
  else
    done_marks+="$id — "
  fi
done

arch=$(rounds arch-review); verify=$(rounds plan-verify); fix=$(rounds "implementer-$slug" )
fix=$(ls docs/reports/ 2>/dev/null | sed -nE "s/^.*-implementer-$slug-fix-r([0-9]+)\.md$/\1/p" | sort -n | tail -1)

# --- phase -------------------------------------------------------------------
if [ "$status" != approved ]; then
  phase="blocked — plan Status is '$status'; a human approves it before execution"
elif [ "$done_n" -lt "$step_count" ]; then
  next=$(awk -v m="$done_marks" 'BEGIN{n=split(m,a," ");for(i=1;i<n;i+=2)if(a[i+1]=="—"){print a[i];exit}}')
  phase="implement — next unreported step: ${next:-?}"
elif [ -z "$arch" ] && [ -z "$verify" ]; then
  phase="review — all steps reported, no review round yet"
elif [ -n "${arch:-}" ] && [ "${fix:-0}" -lt "${arch:-0}" ]; then
  phase="fix — round $(( ${fix:-0} + 1 )); review r${arch} is the newest"
else
  phase="report — reviews and fixes are level"
fi

# --- output ------------------------------------------------------------------
printf 'plan     %s   %s   %s   tracks %s\n' "$plan" "$status" "$mode" "$tracks"
printf 'steps    %s  %s/%s reports\n' "$done_marks" "$done_n" "$step_count"
printf 'review   arch %s · verify %s · fix %s\n' \
  "${arch:+r$arch}${arch:-—}" "${verify:+r$verify}${verify:-—}" "${fix:+r$fix}${fix:-—}"
printf '→ phase: %s\n' "$phase"
