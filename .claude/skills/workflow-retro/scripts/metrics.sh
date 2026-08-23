#!/usr/bin/env bash
# workflow-retro — deterministic metrics over a session's agent transcripts.
#
# No LLM, no network, no subagents. Everything printed here is computed from
# the JSONL the harness already wrote to disk.
#
# Usage:  metrics.sh [session-dir]
#   session-dir defaults to the newest session under this project's transcript
#   root. Pass one explicitly to retro an older run.
#
# Output: four blocks — agents, totals, file overlap, flags — in that order,
# because that is the order a reader needs them: what ran, what it cost, what
# was duplicated, what looks wrong.

set -uo pipefail

command -v jq >/dev/null || { echo "workflow-retro: jq is required" >&2; exit 1; }

proj_root="$HOME/.claude-max/projects"
# The harness slugifies the cwd by replacing BOTH "/" and "_" with "-", so
# `course_AI_agentic` becomes `course-AI-agentic`. Slugifying only "/" finds
# nothing and the error looks like a missing session rather than a bad path.
slug=$(pwd | sed 's|[/_]|-|g')

# Print the candidates, always. A UUID tells the reader nothing, so show each
# one's time, agent count and agent-type mix — "that is the Blast Radius run,
# not mine" is recognisable at a glance where a UUID is not.
list_sessions() {
  echo "sessions with transcripts (newest first):"
  for d in $(ls -dt "$proj_root/$slug"/*/ 2>/dev/null); do
    compgen -G "${d}subagents/agent-*.jsonl" >/dev/null || continue
    n=$(ls "${d}"subagents/agent-*.jsonl 2>/dev/null | wc -l | tr -d ' ')
    kinds=$(cat "${d}"subagents/agent-*.meta.json 2>/dev/null \
            | jq -r '.agentType' 2>/dev/null | sort | uniq -c | sort -rn \
            | awk '{printf "%s×%s ", $1, $2}')
    mark="  "; [ -n "${1:-}" ] && [ "${d%/}" = "${1%/}" ] && mark="->"
    printf '%s %s  %2s agents  %-40s %s\n' "$mark" \
      "$(date -r "${d%/}" '+%m-%d %H:%M' 2>/dev/null || echo '?')" \
      "$n" "${kinds:-?}" "$(basename "${d%/}")"
  done
}

# NEVER GUESS WHICH SESSION. This script used to fall back to "newest directory
# with transcripts", and on 2026-08-23 that silently answered a question about
# THIS session with numbers from a different one: another Claude Code window
# had written a transcript four minutes earlier and won the race. The numbers
# were real, internally consistent, and wrong — the worst failure an instrument
# can have, because nothing about the output looks off.
#
# There is no environment variable carrying the session id, so the script
# cannot resolve it alone. The caller can: the model's own scratchpad path is
#   /private/tmp/claude-501/<project-slug>/<SESSION-ID>/scratchpad
# and that id is exactly the transcript directory's name. The skill instructs
# the caller to take it from there and pass it. Refusing to run is the whole
# point: a demanded argument cannot be silently wrong.
if [ $# -lt 1 ]; then
  {
    echo "workflow-retro: refusing to guess which session to measure."
    echo
    echo "Pass one explicitly:"
    echo "  metrics.sh <session-dir>"
    echo "  metrics.sh \$SESSION_ID          (resolved under this project)"
    echo
    echo "For the CURRENT session, the id is the directory name in the"
    echo "scratchpad path: /private/tmp/claude-501/<project>/<SESSION-ID>/scratchpad"
    echo
    list_sessions
  } >&2
  exit 2
fi

# Accept either a full path or a bare session id.
if [ -d "$1" ]; then session="$1"; else session="$proj_root/$slug/$1"; fi
[ -d "${session%/}/subagents" ] || {
  { echo "workflow-retro: no transcripts at ${session%/}/subagents"; echo; list_sessions; } >&2
  exit 1
}
sub="${session%/}/subagents"

list_sessions "$session"
echo

[ -d "$sub" ] || { echo "workflow-retro: no subagents dir at $sub" >&2; exit 1; }
shopt -s nullglob
files=("$sub"/agent-*.jsonl)
[ ${#files[@]} -gt 0 ] || { echo "workflow-retro: no agent transcripts in $sub" >&2; exit 1; }

echo "session: ${session%/}"
echo

# ---------------------------------------------------------- main session ----
# The conversation's own transcript lives NEXT TO the session directory, as
# <session-id>.jsonl — not inside it. Missing that file is why this script
# spent its first day reporting subagent cost as if it were the run's cost,
# and being wrong by a factor of four: on the session that built this skill,
# subagents burned 117k output tokens and the conversation itself burned 523k.
#
# The cache-read figure is the one to look at. It is the conversation being
# re-sent on every single turn, and it grows with the square of the session's
# length — 254 turns produced 155M cache reads here. No agent metric shows it,
# and it is where a long session's money actually goes.
main="${session%/}.jsonl"
if [ -f "$main" ]; then
  echo "== main session (the conversation itself) =="
  jq -s -r '
    [ .[] | select(.message.usage) | .message.usage ] as $u
    | [ .[] | select(.type=="user" and (.isMeta | not)) ] as $t
    | "  user turns        : \($t | length)",
      "  output tokens     : \($u | map(.output_tokens // 0) | add // 0)",
      "  input (uncached)  : \($u | map(.input_tokens // 0) | add // 0)",
      "  cache read        : \($u | map(.cache_read_input_tokens // 0) | add // 0)   <- the conversation, re-sent every turn",
      "  cache written     : \($u | map(.cache_creation_input_tokens // 0) | add // 0)"
  ' "$main" 2>/dev/null
  echo
else
  echo "== main session =="
  echo "  no transcript at $main — subagent figures below are only part of the cost"
  echo
fi

# ---------------------------------------------------------------- agents ----
# Sorted by first timestamp = launch order, which is what makes ordering
# mistakes visible. `ts` strips milliseconds: fromdateiso8601 rejects them.
echo "== agents (launch order) =="
printf '%-3s %-16s %-34s %9s %6s %6s\n' '#' TYPE TASK OUT_TOK TOOLS SEC
for f in "${files[@]}"; do
  m="${f%.jsonl}.meta.json"; [ -f "$m" ] || continue
  jq -s --slurpfile meta "$m" -r '
    def ts: sub("\\.[0-9]+Z$";"Z") | fromdateiso8601;
    [ .[] | select(.message.usage) | .message.usage ] as $u
    | [ .[] | select(.type=="assistant") | .message.content[]? | select(.type=="tool_use") ] as $tl
    | ([ .[] | .timestamp | select(.) ] | sort) as $t
    | [ $t[0],
        $meta[0].agentType,
        (($meta[0].description // "")[0:33]),
        ($u | map(.output_tokens // 0) | add // 0),
        ($tl | length),
        (if ($t|length) > 1 then (($t[-1]|ts) - ($t[0]|ts)) else 0 end),
        ($t[-1] // $t[0]) ]
    | @tsv' "$f" 2>/dev/null
done | sort | awk -F'\t' '
  { n++; printf "%-3s %-16s %-34s %9s %6s %6s\n", n, $2, $3, $4, $5, $6
    tok+=$4; tools+=$5; sec+=$6; start[n]=$1; end[n]=$7 }
  END { print ""
        printf "== totals ==\nagents: %d   output tokens: %d   tool uses: %d   agent-seconds: %d\n", n, tok, tools, sec
        # Concurrency: an agent overlaps the previous one if it started before
        # that one ended. Zero overlaps means every dispatch waited — usually
        # for a human, which is the real driver of elapsed time.
        ov=0; for (i=2; i<=n; i++) if (start[i] < end[i-1]) ov++
        printf "concurrent starts: %d of %d\n", ov, (n>1 ? n-1 : 0) }'
echo

# ------------------------------------------------------------ duplication ----
# The same file opened by many agents is duplicated context; the same file
# opened many times by ONE agent is usually a briefing that did not stick.
echo "== files touched by more than one agent =="
for f in "${files[@]}"; do
  jq -r '.. | objects | select(.name=="Read" or .name=="Edit" or .name=="Write")
         | .input.file_path? // empty' "$f" 2>/dev/null | sort -u
done | sort | uniq -c | sort -rn | awk '$1 > 1 { n=$1; $1=""; sub(/^ /,""); printf "  %2d agents  %s\n", n, $0 }' | head -12
echo
echo "== same file re-read within one agent =="
for f in "${files[@]}"; do
  m="${f%.jsonl}.meta.json"; [ -f "$m" ] || continue
  d=$(jq -r '.description // "?"' "$m")
  jq -r '.. | objects | select(.name=="Read") | .input.file_path? // empty' "$f" 2>/dev/null \
    | sort | uniq -c | awk -v d="$d" '$1 > 2 { printf "  %2dx  %-36s %s\n", $1, d, $2 }'
done
echo

# ------------------------------------------------------------------ flags ----
# Investigation-heavy agents: many tool uses AND little written per tool use.
#
# The obvious test — "ended with a short message" — does NOT work, and the
# reason is worth knowing: a resumed agent's transcript ends with the message
# it produced AFTER being resumed, so an agent that failed, was nudged, and
# then succeeded looks like it succeeded first time. Whether an agent needed a
# second push is simply not in the transcript.
#
# Output tokens per tool use survives that. An agent spending its turn reading
# rather than writing shows a low ratio, and that is the shape that runs out of
# room before it can answer.
# Compare an agent against others of ITS OWN TYPE, never against the whole
# session. A plan-verifier reads a great deal because that is its job; measured
# against a session median dominated by writers it looks anomalous every single
# time, and a flag that cries wolf at agents doing their work correctly teaches
# the reader to ignore flags. A type needs at least three instances before it
# has a baseline worth comparing against — with one or two, say so rather than
# invent a threshold.
echo "== flags =="
tmp=$(mktemp); hist=$(mktemp)
for f in "${files[@]}"; do
  m="${f%.jsonl}.meta.json"; [ -f "$m" ] || continue
  jq -s --slurpfile meta "$m" -r '
    ([ .[] | select(.type=="assistant") | .message.content[]? | select(.type=="tool_use") ] | length) as $t
    | [ $meta[0].agentType, $t, ($meta[0].description // "?") ] | @tsv' "$f" 2>/dev/null
done > "$tmp"

# A type that ran once here has no baseline in this session — and a spec
# workflow legitimately dispatches exactly one researcher, which is the case
# that matters most. Every past session in this project is still on disk, so
# borrow the baseline from the type's history instead of declining to judge.
# Marked "(history)" in the output: a cross-session median describes how that
# agent usually behaves, not how it behaved beside these particular peers.
for m in "$proj_root/$slug"/*/subagents/agent-*.meta.json; do
  [ -f "$m" ] || continue
  j="${m%.meta.json}.jsonl"; [ -f "$j" ] || continue
  jq -s --slurpfile meta "$m" -r '
    ([ .[] | select(.type=="assistant") | .message.content[]? | select(.type=="tool_use") ] | length) as $t
    | [ $meta[0].agentType, $t ] | @tsv' "$j" 2>/dev/null
done > "$hist"

awk -F'\t' '
  function median(list,   c, a, i, j, x, k, b) {
    c = split(list, a, " "); k = 0
    for (i = 1; i <= c; i++) if (a[i] != "") { k++; b[k] = a[i] + 0 }
    if (k == 0) return -1
    for (i = 1; i <= k; i++) for (j = i+1; j <= k; j++) if (b[i] > b[j]) { x=b[i]; b[i]=b[j]; b[j]=x }
    N = k
    return (k % 2) ? b[int((k+1)/2)] : int((b[int(k/2)] + b[int(k/2)+1]) / 2)
  }
  FNR == NR { hvals[$1] = hvals[$1] " " $2; next }          # history file first
  { type[++n] = $1; tools[n] = $2; desc[n] = $3
    vals[$1] = vals[$1] " " $2 }
  END {
    for (t in vals) { med[t] = median(vals[t]); num[t] = N; src[t] = "this run" }
    # Borrow a baseline from history only where this session cannot provide one.
    for (t in vals) {
      if (num[t] >= 3) continue
      hm = median(hvals[t])
      if (hm >= 0 && N >= 3) { med[t] = hm; num[t] = N; src[t] = "history" }
      else { med[t] = -1 }
    }
    for (t in vals) {
      if (med[t] < 0) { printf "  %-22s too few runs anywhere — not judged\n", t; continue }
      printf "  %-22s median %d tool uses over %d runs (%s)\n", t, med[t], num[t], src[t]
    }
    flagged = 0
    for (i = 1; i <= n; i++) {
      t = type[i]
      if (med[t] > 0 && tools[i] > med[t] * 2) {
        printf "  outlier  %s — %d tool uses vs %d median for %s (%s)\n", desc[i], tools[i], med[t], t, src[t]
        flagged++
      }
    }
    if (flagged == 0) print "  no outliers within any agent type"
  }' "$hist" "$tmp"
rm -f "$tmp" "$hist"
# `[ x -eq 0 ] && echo` as the last line makes the script exit 1 whenever
# something WAS flagged — a successful run with a finding then looks like a
# failure to every caller. Keep the explicit exit.
# Say what these numbers do NOT cover. Work done by `claude -p` subprocesses —
# the description optimiser is the one that bites — spends real tokens and
# writes no transcript into subagents/, so none of it appears above. Counting
# it would mean matching separate session directories by time window, i.e.
# guessing; naming the gap is honest where a guess would not be.
echo
echo "== not counted =="
echo "  work done by \`claude -p\` subprocesses (e.g. the description optimiser):"
echo "  it spends tokens but writes no transcript here, so none of it is above."
exit 0
