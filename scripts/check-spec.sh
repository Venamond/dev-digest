#!/usr/bin/env bash
# Deterministic conformance check for SDD feature specs under specs/.
# Judgement-free: it checks the shape a spec must have, never whether the
# requirements are the right ones. See specs/README.md for the conventions.
#
# Usage: ./scripts/check-spec.sh [path ...]     (default: every spec under specs/)
set -uo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"
cd "$root"

VERIFY_VOCAB='client|server-unit|server-integration|reviewer-core|e2e|mcp|manual'
BANNED='fast|robust|user-friendly|properly|as needed|intuitive|seamless|should work well'
REQUIRED_SECTIONS=(
  "## Problem and user"
  "## Goals / Non-goals"
  "## Acceptance criteria (EARS)"
  "## Edge cases"
  "## Open questions"
)

fail_total=0

check_one() {
  local f="$1" fails=0
  local base id_expected id_actual
  base="$(basename "$f" .md)"
  id_expected="SPEC-$base"

  err() { echo "  ✗ $1"; fails=$((fails + 1)); }

  # --- header -------------------------------------------------------------
  id_actual="$(grep -m1 '^> Spec ID:' "$f" | sed 's/^> Spec ID:[[:space:]]*//')"
  [ -n "$id_actual" ] || err "no '> Spec ID:' line"
  [ -z "$id_actual" ] || [ "$id_actual" = "$id_expected" ] \
    || err "Spec ID '$id_actual' does not mirror the file name (expected '$id_expected')"
  grep -qE '^> Status: (draft|approved|implemented)$' "$f" \
    || err "no '> Status:' line with draft|approved|implemented"

  # --- required sections --------------------------------------------------
  local s
  for s in "${REQUIRED_SECTIONS[@]}"; do
    grep -qF "$s" "$f" || err "missing section: $s"
  done

  # --- acceptance criteria ------------------------------------------------
  local ac_lines
  ac_lines="$(grep -nE '^\- \*\*AC-[0-9]+\*\*' "$f" || true)"
  if [ -z "$ac_lines" ]; then
    err "no acceptance criteria (expected lines like '- **AC-1** — …')"
  else
    local n line body
    while IFS= read -r line; do
      n="${line%%:*}"
      # the criterion plus its continuation lines, up to the next list item
      body="$(awk -v start="$n" 'NR>=start { if (NR>start && /^\- /) exit; print }' "$f")"
      local id; id="$(sed -E 's/^[0-9]+:\- \*\*(AC-[0-9]+)\*\*.*/\1/' <<<"$line")"
      grep -q 'shall' <<<"$body"        || err "$id: no 'shall'"
      # ubiquitous ("The <thing> shall …") is as valid a pattern as the conditional four
      grep -qE '(^|[^A-Za-z])(WHEN|WHILE|WHERE|IF)([^A-Za-z]|$)|The [A-Za-z][^.]*shall' <<<"$body" \
        || err "$id: no EARS pattern (WHEN / WHILE / IF…THEN / WHERE / ubiquitous)"
      grep -q 'IF' <<<"$body" && ! grep -q 'THEN' <<<"$body" && err "$id: IF without THEN"
      grep -q 'source:' <<<"$body"      || err "$id: no 'source:' annotation"
      grep -q 'verify:' <<<"$body"      || err "$id: no 'verify:' annotation"
      if grep -q 'verify:' <<<"$body"; then
        grep -qE "verify: *($VERIFY_VOCAB)" <<<"$body" \
          || err "$id: 'verify:' is not one of $VERIFY_VOCAB"
      fi
    done <<<"$ac_lines"

    # all-manual is a smell: nothing is really checkable
    local total manual
    total="$(grep -cE '^\- \*\*AC-[0-9]+\*\*' "$f")"
    manual="$(grep -cE 'verify: *manual' "$f" || true)"
    [ "$total" -gt 1 ] && [ "$manual" = "$total" ] \
      && err "every criterion is 'verify: manual' — nothing is checkable by a suite"
  fi

  # --- language and altitude ----------------------------------------------
  grep -inE "\b($BANNED)\b" "$f" | grep -v 'Banned words' \
    | while IFS= read -r hit; do echo "  ✗ rubber word: $hit"; done
  grep -qinE "\b($BANNED)\b" "$f" && fails=$((fails + 1))

  local sql_re='\bSELECT\b.*\bFROM\b|\bINSERT INTO\b|\bCREATE TABLE\b|\bUPDATE\b.*\bSET\b|\bDELETE FROM\b'
  grep -inE "$sql_re" "$f" \
    | while IFS= read -r hit; do echo "  ✗ SQL in a spec: $hit"; done
  grep -qinE "$sql_re" "$f" && fails=$((fails + 1))

  grep -qE '(TODO|TBD|FIXME)' "$f" && err "contains TODO/TBD/FIXME"

  # --- design review cap ---------------------------------------------------
  if grep -qF '## Design review' "$f"; then
    local proposals
    proposals="$(awk '/^## Design review/{f=1;next} f&&/^## /{exit} f&&/^- /{c++} END{print c+0}' "$f")"
    [ "$proposals" -le 5 ] || err "Design review has $proposals proposals (max 5)"
  fi

  # --- leakage from the agent's own example --------------------------------
  if [ "$base" != "2026-08-22-rerun-one-review-agent" ]; then
    grep -qi 'rerun-one-review-agent' "$f" \
      && err "text copied from the agent's Appendix A example"
  fi

  if [ "$fails" -eq 0 ]; then
    echo "✓ $f"
  else
    echo "✗ $f — $fails problem(s)"
    fail_total=$((fail_total + fails))
  fi
}

targets=("$@")
if [ "${#targets[@]}" -eq 0 ]; then
  while IFS= read -r f; do targets+=("$f"); done < <(
    find specs -name '*.md' ! -name 'README.md' | sort
  )
fi

if [ "${#targets[@]}" -eq 0 ]; then
  echo "No specs found under specs/ — nothing to check."
  exit 0
fi

for f in "${targets[@]}"; do
  [ -f "$f" ] || { echo "✗ $f — not a file"; fail_total=$((fail_total + 1)); continue; }
  check_one "$f"
done

if [ "$fail_total" -gt 0 ]; then
  echo
  echo "::error::spec conformance failed ($fail_total problem(s)). See specs/README.md."
  exit 1
fi
echo "All specs conform."
