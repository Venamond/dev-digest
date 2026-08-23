#!/usr/bin/env python3
"""workflow-retro — deterministic metrics over a session's agent transcripts.

No LLM, no network, no subagents. Every number here is computed from the JSONL
the harness already wrote to disk, so two runs against the same session agree.

Usage:  metrics.py <session-id|session-dir> [--idle-gap SECONDS]  (default 300)

It REFUSES to run with no argument and prints the candidate sessions instead.
That refusal is deliberate — see resolve_session().
"""

import json
import os
import re
import sys
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path

PROJ_ROOT = Path.home() / ".claude-max" / "projects"

# ---------------------------------------------------------------- pricing ---
# List price per million tokens, Anthropic first-party API rates.
#
# SOURCE: the `claude-api` skill's model table.  CHECKED: 2026-08-23.
# Re-read that table before trusting a dollar figure computed long after this
# date. A stale price produces confidently wrong money and nothing in the
# output looks odd — which is the failure mode this whole script is built to
# avoid, so the stamp is not decoration.
# cache read = 0.1x input, 5-minute cache write = 1.25x input, 1-hour = 2x.
# A Max subscription is NOT billed this way; the figure is a comparable, and
# every caller must say so when quoting it.
PRICES = {  # model-id prefix -> (input, output) $/MTok
    "claude-fable-5": (10.0, 50.0),
    "claude-mythos-5": (10.0, 50.0),
    "claude-opus-5": (5.0, 25.0),
    "claude-opus-4-8": (5.0, 25.0),
    "claude-opus-4-7": (5.0, 25.0),
    "claude-opus-4-6": (5.0, 25.0),
    "claude-sonnet-5": (3.0, 15.0),
    "claude-sonnet-4-6": (3.0, 15.0),
    "claude-haiku-4-5": (1.0, 5.0),
}
FALLBACK_PRICE = (5.0, 25.0)  # opus-tier; the harness's default here


def price_for(model):
    if model:
        for prefix, p in sorted(PRICES.items(), key=lambda kv: -len(kv[0])):
            if model.startswith(prefix):
                return p, True
    return FALLBACK_PRICE, False


# ------------------------------------------------------------- primitives ---
def parse_ts(s):
    # Timestamps carry milliseconds (2026-08-22T22:52:55.860Z) — strip them
    # before parsing rather than reaching for a format string that rejects them.
    if not s:
        return None
    try:
        return datetime.fromisoformat(re.sub(r"\.\d+Z$", "Z", s).replace("Z", "+00:00"))
    except ValueError:
        return None


def read_jsonl(path):
    try:
        with open(path, encoding="utf-8", errors="replace") as fh:
            for line in fh:
                line = line.strip()
                if not line:
                    continue
                try:
                    yield json.loads(line)
                except json.JSONDecodeError:
                    continue
    except OSError:
        return


# Harness-generated user records that are NOT a human speaking. A retro that
# counts these as round-trips reports a workflow constantly interrupted by its
# operator when nobody touched the keyboard.
HARNESS_WRAPPERS = re.compile(
    r"<(task-notification|system-reminder|local-command-[a-z]+|command-name|command-message|"
    r"command-args|bash-input|bash-stdout|bash-stderr|user-prompt-submit-hook)\b.*?"
    r"(</\1>|$)",
    re.S,
)


def human_messages(path, since, until):
    """Real human turns inside a time window.

    NOT in the subagent transcripts and not derivable from them — the skill
    demands this figure and used to leave it to be counted by hand, which
    produced a wrong answer the first time it mattered (a window written in
    local time against UTC timestamps: it reported zero where the truth was
    one).
    """
    out = []
    for rec in read_jsonl(path):
        if rec.get("type") != "user" or rec.get("isMeta"):
            continue
        ts = parse_ts(rec.get("timestamp"))
        if not ts or not (since <= ts <= until):
            continue
        c = (rec.get("message") or {}).get("content")
        if isinstance(c, str):
            text = c
        elif isinstance(c, list):
            if any(isinstance(b, dict) and b.get("type") == "tool_result" for b in c):
                continue
            text = " ".join(
                b.get("text", "") for b in c if isinstance(b, dict) and b.get("type") == "text"
            )
        else:
            continue
        text = HARNESS_WRAPPERS.sub("", text).strip()
        if text:
            out.append((ts, " ".join(text.split())))
    return out


def human(n):
    """Exact below 10,000, abbreviated above.

    `8` has to be unmistakably eight tokens rather than eight thousand, and
    `1k` for 1,204 threw away the digits that made it readable. Comma-grouped
    exact numbers up to 10,000 solve both.
    """
    if n >= 1_000_000:
        return f"{n / 1_000_000:.1f}M"
    if n >= 10_000:
        return f"{n / 1_000:.0f}k"
    return f"{n:,}"


def dur(sec):
    sec = int(sec)
    if sec >= 3600:
        return f"{sec // 3600}h{(sec % 3600) // 60:02d}m"
    if sec >= 60:
        return f"{sec // 60}m{sec % 60:02d}s"
    return f"{sec}s"


def median(xs):
    xs = sorted(xs)
    if not xs:
        return None
    mid = len(xs) // 2
    return xs[mid] if len(xs) % 2 else (xs[mid - 1] + xs[mid]) / 2


# ------------------------------------------------------------ transcripts ---
class Run:
    """One transcript — a subagent, or the main conversation."""

    def __init__(self, key, path, meta=None, since=None, until=None):
        self.key = key
        self.path = path
        self.meta = meta or {}
        self.role = self.meta.get("agentType") or "main"
        self.desc = self.meta.get("description") or ""
        self.depth = self.meta.get("spawnDepth", 0)
        self.tool_use_id = self.meta.get("toolUseId")
        self.parent = None
        self.children = []

        self.tin = self.tout = self.cread = self.cw5 = self.cw1h = 0
        self.tools = 0
        self.turns = 0
        self.models = defaultdict(int)
        self.efforts = defaultdict(int)
        self.spawns = set()          # tool_use ids of Agent/Task calls it made
        # Two different questions, two different counters. `touched` answers
        # "how many agents saw this file" (duplicated context); `reads` answers
        # "did one agent open the same file again" (a briefing that did not
        # stick). Counting an Edit as a read makes an implementer that edited
        # one file six times look like it lost its place — and it silently
        # contradicted a previous retro that had it right.
        self.touched = defaultdict(int)
        self.reads = defaultdict(int)
        self.stamps = []

        for rec in read_jsonl(path):
            ts = parse_ts(rec.get("timestamp"))
            if since and ts and not (since <= ts <= until):
                continue
            if ts:
                self.stamps.append(ts)
            if rec.get("type") == "user" and not rec.get("isMeta"):
                self.turns += 1
            msg = rec.get("message") or {}
            usage = msg.get("usage")
            if usage:
                self.tin += usage.get("input_tokens", 0) or 0
                self.tout += usage.get("output_tokens", 0) or 0
                self.cread += usage.get("cache_read_input_tokens", 0) or 0
                cc = usage.get("cache_creation") or {}
                self.cw5 += cc.get("ephemeral_5m_input_tokens", 0) or 0
                self.cw1h += cc.get("ephemeral_1h_input_tokens", 0) or 0
                if not cc:
                    self.cw5 += usage.get("cache_creation_input_tokens", 0) or 0
                if msg.get("model"):
                    self.models[msg["model"]] += 1
                if rec.get("effort"):
                    self.efforts[rec["effort"]] += 1
            if rec.get("type") == "assistant":
                for block in msg.get("content") or []:
                    if not isinstance(block, dict) or block.get("type") != "tool_use":
                        continue
                    self.tools += 1
                    name = block.get("name")
                    if name in ("Agent", "Task"):
                        self.spawns.add(block.get("id"))
                    if name in ("Read", "Edit", "Write"):
                        fp = (block.get("input") or {}).get("file_path")
                        if fp:
                            self.touched[fp] += 1
                            if name == "Read":
                                self.reads[fp] += 1
        self.stamps.sort()

    # -- derived ------------------------------------------------------------
    @property
    def model(self):
        return max(self.models, key=self.models.get) if self.models else self.meta.get("model")

    @property
    def effort(self):
        return max(self.efforts, key=self.efforts.get) if self.efforts else None

    @property
    def start(self):
        return self.stamps[0] if self.stamps else None

    @property
    def end(self):
        return self.stamps[-1] if self.stamps else None

    @property
    def wall(self):
        return (self.end - self.start).total_seconds() if len(self.stamps) > 1 else 0

    def active(self, idle_gap):
        """Wall minus every gap longer than idle_gap.

        Measured across 18 agents in two sessions, the largest gap inside any
        subagent transcript was 152s — a test run, not a wait. A subagent's
        wait for a human resume does NOT appear in its own transcript, so do
        not read this column as stall detection; at 120s it just relabels long
        Bash calls as idle. Human waiting shows up at session level, in the
        `gaps` line. This column earns its keep on a parent agent that sits
        while its children work, or across SendMessage resumes.
        """
        total = 0.0
        for a, b in zip(self.stamps, self.stamps[1:]):
            d = (b - a).total_seconds()
            if d <= idle_gap:
                total += d
        return total

    @property
    def cwrite(self):
        return self.cw5 + self.cw1h

    @property
    def hit(self):
        seen = self.cread + self.cwrite + self.tin
        return self.cread / seen if seen else 0.0

    @property
    def cost(self):
        (pin, pout), known = price_for(self.model)
        return (
            self.tin * pin
            + self.tout * pout
            + self.cread * pin * 0.1
            + self.cw5 * pin * 1.25
            + self.cw1h * pin * 2.0
        ) / 1_000_000, known


# ---------------------------------------------------------------- session ---
def slug_for_cwd():
    # The harness slugifies the cwd by replacing BOTH "/" and "_" with "-", so
    # `course_AI_agentic` becomes `course-AI-agentic`. Slugifying only "/" finds
    # nothing, and the error then looks like a missing session, not a bad path.
    return re.sub(r"[/_]", "-", os.getcwd())


def candidates():
    root = PROJ_ROOT / slug_for_cwd()
    out = []
    if not root.is_dir():
        return out
    for d in root.iterdir():
        if d.is_dir() and list(d.glob("subagents/agent-*.jsonl")):
            out.append(d)
    return sorted(out, key=lambda p: p.stat().st_mtime, reverse=True)


def list_sessions(chosen=None, stream=sys.stdout):
    print("sessions with transcripts (newest first):", file=stream)
    for d in candidates():
        metas = [json.loads(m.read_text()) for m in sorted(d.glob("subagents/agent-*.meta.json"))]
        kinds = defaultdict(int)
        for m in metas:
            kinds[m.get("agentType", "?")] += 1
        mix = " ".join(f"{n}×{t}" for t, n in sorted(kinds.items(), key=lambda kv: -kv[1]))
        mark = "->" if chosen and d.resolve() == chosen.resolve() else "  "
        when = datetime.fromtimestamp(d.stat().st_mtime).strftime("%m-%d %H:%M")
        print(f"{mark} {when}  {len(metas):2d} agents  {mix:<44} {d.name}", file=stream)


def resolve_session(arg):
    # NEVER GUESS WHICH SESSION. This script used to fall back to "newest
    # directory with transcripts", and on 2026-08-23 that silently answered a
    # question about THIS session with numbers from a different one: a second
    # Claude Code window had written a transcript four minutes earlier and won
    # the race. The numbers were real, internally consistent, and wrong — the
    # worst failure an instrument can have, because nothing about the output
    # looks off. The caller CAN resolve it: the model's own scratchpad path is
    #   /private/tmp/claude-501/<project-slug>/<SESSION-ID>/scratchpad
    # and that id is exactly the transcript directory's name.
    p = Path(arg)
    return p if p.is_dir() else PROJ_ROOT / slug_for_cwd() / arg


# ------------------------------------------------------------------ report ---
def main(argv):
    idle_gap = 300
    args = []
    it = iter(argv)
    for a in it:
        if a == "--idle-gap":
            idle_gap = int(next(it))
        else:
            args.append(a)

    if not args:
        err = sys.stderr
        print("workflow-retro: refusing to guess which session to measure.\n", file=err)
        print("Pass one explicitly:", file=err)
        print("  metrics.py <session-id|session-dir>\n", file=err)
        print("For the CURRENT session, the id is the directory name in the", file=err)
        print("scratchpad path: /private/tmp/claude-501/<project>/<SESSION-ID>/scratchpad\n", file=err)
        list_sessions(stream=err)
        return 2

    session = resolve_session(args[0])
    sub = session / "subagents"
    if not sub.is_dir():
        print(f"workflow-retro: no transcripts at {sub}\n", file=sys.stderr)
        list_sessions(stream=sys.stderr)
        return 1

    list_sessions(chosen=session)
    print()

    # -- load ---------------------------------------------------------------
    runs = []
    for jsonl in sorted(sub.glob("agent-*.jsonl")):
        meta_path = Path(str(jsonl)[: -len(".jsonl")] + ".meta.json")
        if not meta_path.is_file():
            continue
        meta = json.loads(meta_path.read_text())
        runs.append(Run(jsonl.name[len("agent-") : -len(".jsonl")], jsonl, meta))
    if not runs:
        print(f"workflow-retro: no agent transcripts in {sub}", file=sys.stderr)
        return 1

    # The conversation's own transcript lives NEXT TO the session directory as
    # <session-id>.jsonl, not inside it. Missing that file is why this script
    # spent its first day reporting subagent cost as the run's cost and being
    # wrong by a factor of four.
    main_path = Path(str(session).rstrip("/") + ".jsonl")
    main_run = Run("main", main_path) if main_path.is_file() else None

    # -- tree: who spawned whom --------------------------------------------
    # A child's meta carries the toolUseId of the Agent call that created it.
    # Find the transcript that made that call and you have the real parent —
    # spawnDepth alone tells you the level, not the branch.
    owner = {}
    for r in runs + ([main_run] if main_run else []):
        for tid in r.spawns:
            owner[tid] = r
    for r in runs:
        parent = owner.get(r.tool_use_id)
        if parent is not None and parent is not r:
            r.parent = parent
            parent.children.append(r)

    runs.sort(key=lambda r: (r.start or datetime.max.replace(tzinfo=timezone.utc)))

    ordered, seen = [], set()

    def walk(r, level):
        if r.key in seen:
            return
        seen.add(r.key)
        ordered.append((r, level))
        for c in sorted(r.children, key=lambda c: c.start or datetime.max.replace(tzinfo=timezone.utc)):
            walk(c, level + 1)

    for r in runs:
        if r.parent is None:
            walk(r, 0)
    for r in runs:  # any orphan whose parent transcript is gone
        walk(r, 0)

    # -- header -------------------------------------------------------------
    kinds = defaultdict(int)
    for r in runs:
        kinds[r.role] += 1
    mix = " ".join(f"{n}×{t}" for t, n in sorted(kinds.items(), key=lambda kv: -kv[1]))
    nested = sum(1 for r in runs if r.parent is not None and r.parent.key != "main")
    max_depth = max((r.depth for r in runs), default=1)
    starts = [r.start for r in runs if r.start]
    ends = [r.end for r in runs if r.end]
    wall = (max(ends) - min(starts)).total_seconds() if starts and ends else 0

    print(f"session: {session}")
    print(f"run    : {len(runs)} agents ({nested} nested, max depth {max_depth}) · {mix}")
    if starts:
        print(
            f"window : {min(starts).astimezone():%Y-%m-%d %H:%M} → "
            f"{max(ends).astimezone():%H:%M}  (wall {dur(wall)})"
        )
    print()

    # -- agents table -------------------------------------------------------
    # A markdown table, not space-aligned columns: the caller pastes this
    # straight into the report and the renderer draws it. Nesting shows as a
    # `└─` prefix, because leading spaces are trimmed inside a table cell.
    print("### Agents")
    print()
    print(
        "| # | agent | role | depth | model | in (tok) | out (tok) | "
        "cache read (tok) | hit | tools | active | wall | cost | task |"
    )
    print("|--:|---|---|--:|---|--:|--:|--:|--:|--:|--:|--:|--:|---|")
    unknown_model = False
    for i, (r, level) in enumerate(ordered, 1):
        cost, known = r.cost
        unknown_model |= not known
        model = (r.model or "?").replace("claude-", "")
        if r.effort:
            model = f"{model}/{r.effort}"
        label = ("└─ " * min(level, 1)) + ("· " * max(level - 1, 0)) + r.key[:8]
        act = r.active(idle_gap)
        print(
            f"| {i} | `{label}` | {r.role} | {r.depth} | {model} | {human(r.tin)} | "
            f"{human(r.tout)} | {human(r.cread)} | {r.hit * 100:.0f}% | {r.tools} | "
            f"{dur(act)} | {dur(r.wall)} | ${cost:.2f} | {r.desc.replace('|', '/')} |"
        )
    print()
    print(
        f"Token columns are exact below 10,000 (`8` is eight tokens, `1,204` is one thousand "
        f"two hundred and four) and abbreviated above it — `53k` = 53,000, `12.4M` = 12,400,000. "
        f"**in** = uncached input only · "
        f"**cache read** = input served from cache, billed at 10% of the input rate · "
        f"**cache hit** = cache read ÷ all input tokens (uncached + written + read) · "
        f"**active** = elapsed minus every gap over {idle_gap}s · **wall** = first to last "
        f"timestamp · **cost** = Anthropic list price for that model, cache writes priced by TTL."
    )
    print()

    # -- main session -------------------------------------------------------
    main_window = None
    if main_run and starts:
        main_window = Run("main-window", main_path, since=min(starts), until=max(ends))
    if main_run:
        def line(label, r):
            print(
                f"| {label} | {r.turns} | {human(r.tin)} | {human(r.tout)} | "
                f"{human(r.cread)} | {r.hit * 100:.0f}% | {r.tools} | ${r.cost[0]:.2f} |"
            )
        print("### The conversation itself")
        print()
        print(
            "| scope | turns | in (tok) | out (tok) | cache read (tok) | hit | tools | cost |"
        )
        print("|---|--:|--:|--:|--:|--:|--:|--:|")
        line("**during the run**", main_window) if main_window else None
        line("whole session", main_run)
        print()
        print("Quote the first row as the run's cost. The second covers everything the")
        print("conversation did, including work before and after the agents ran, and its")
        print("cache-read is the conversation re-sent every turn — it grows with the")
        print("square of the session's length and no agent metric shows it.")
    else:
        print("== main session ==")
        print(f"  no transcript at {main_path} — the figures below cover subagents only")
    print()

    # -- human round-trips ---------------------------------------------------
    humans = []
    if main_run and starts:
        humans = human_messages(main_path, min(starts), max(ends))
    print("### Human round-trips")
    print()
    if humans:
        print("| time | what was said |")
        print("|---|---|")
        for ts, text in humans:
            print(f"| {ts.astimezone():%H:%M} | {text[:90].replace('|', '/')} |")
        print()
        print(
            "Harness records — task-notifications, system reminders, hook output — are excluded; "
            "these are turns a person typed. Read them for whether any of them *blocked* the "
            "workflow: a question answered while agents kept running costs nothing, a decision "
            "the fan-out waited on is the most expensive thing in the run."
        )
    else:
        print("None — the run went start to finish without a human turn.")
    print()

    # -- totals -------------------------------------------------------------
    a_in = sum(r.tin for r in runs)
    a_out = sum(r.tout for r in runs)
    a_read = sum(r.cread for r in runs)
    a_write = sum(r.cwrite for r in runs)
    a_tools = sum(r.tools for r in runs)
    a_cost = sum(r.cost[0] for r in runs)
    a_sec = sum(r.wall for r in runs)
    a_act = sum(r.active(idle_gap) for r in runs)
    hit = a_read / (a_read + a_write + a_in) if (a_read + a_write + a_in) else 0

    busy, cursor = 0.0, None
    for r in sorted((r for r in runs if r.start), key=lambda r: r.start):
        a, b = r.start, r.end or r.start
        if cursor is None or a > cursor:
            busy += (b - a).total_seconds()
            cursor = b
        elif b > cursor:
            busy += (b - cursor).total_seconds()
            cursor = b
    dead = max(wall - busy, 0)
    overlaps = sum(
        1
        for i in range(1, len(runs))
        if runs[i].start and runs[i - 1].end and runs[i].start < runs[i - 1].end
    )
    conv = main_window or main_run

    print("### Totals")
    print()
    print("| metric | value | unit | what it says |")
    print("|---|--:|---|---|")
    print(f"| agents | {len(runs)} | count | {nested} nested, max depth {max_depth} |")
    print(f"| output | {human(a_out)} | tokens | agents only; the conversation has its own table |")
    print(f"| cache read | {human(a_read)} | tokens | billed at 10% of the input rate |")
    print(f"| cache hit | {hit * 100:.0f} | % | the cheapest lever, and whether it is already spent |")
    print(f"| tool uses | {a_tools} | calls | judge per agent type, never in total |")
    print(f"| wall | {dur(wall)} | elapsed | first dispatch to last agent message |")
    print(f"| agent-seconds | {dur(a_sec)} | summed | every agent's wall added together |")
    print(
        f"| parallelism | {a_sec / wall if wall else 0:.1f} | × | agent-seconds ÷ wall; "
        f"below 1.0 means the fan-out was a queue |"
    )
    print(
        f"| gaps | {dur(dead)} | elapsed | {dead / wall * 100 if wall else 0:.0f}% of the wall "
        f"with NO agent running — waiting on the human or on the conversation |"
    )
    print(
        f"| human round-trips | {len(humans)} | turns | messages a person typed while the "
        f"agents were running; harness notifications excluded |"
    )
    print(
        f"| concurrent starts | {overlaps} of {max(len(runs) - 1, 0)} | dispatches | "
        f"0 means every dispatch queued behind the previous one |"
    )
    if conv:
        print(
            f"| **cost of the run** | **{a_cost + conv.cost[0]:.2f}** | USD | agents {a_cost:.2f} "
            f"+ conversation {conv.cost[0]:.2f}; Anthropic list price, a subscription is not "
            f"billed this way |"
        )
    else:
        print(
            f"| **cost of the run** | **{a_cost:.2f}** | USD | agents only; Anthropic list price, "
            f"a subscription is not billed this way |"
        )
    print()
    print("Totals INCLUDE every nested subagent — a parent's usage never counts its children's.")

    # -- launch waves -------------------------------------------------------
    print()
    wave, wave_end, waves = [], None, []
    for r in runs:
        if not r.start:
            continue
        if wave and wave_end and r.start >= wave_end:
            waves.append(wave)
            wave, wave_end = [], None
        wave.append(r)
        if r.end:
            wave_end = max(wave_end or r.end, r.end)
    if wave:
        waves.append(wave)

    print("### Launch order")
    print()
    if waves and max(len(w) for w in waves) == 1:
        gaps = [
            (waves[i][0].start - waves[i - 1][-1].end).total_seconds()
            for i in range(1, len(waves))
            if waves[i][0].start and waves[i - 1][-1].end
        ]
        if gaps:
            print(
                f"{len(waves)} waves of 1 — **nothing ran in parallel**. Gaps between them: "
                f"{dur(min(gaps))}–{dur(max(gaps))}, {dur(sum(gaps))} total. "
                "Every one of those gaps is a decision the workflow waited for."
            )
        else:
            print(f"{len(waves)} waves of 1 — nothing ran in parallel.")
    else:
        print("| start | agents | gap since the previous wave |")
        print("|---|---|---|")
        prev_end = None
        for w in waves:
            gap = (
                dur((w[0].start - prev_end).total_seconds())
                if prev_end and w[0].start > prev_end
                else "—"
            )
            names = ", ".join(r.role for r in w)
            par = " ∥" if len(w) > 1 else ""
            print(f"| {w[0].start.astimezone():%H:%M} | {names}{par} | {gap} |")
            prev_end = max(r.end for r in w if r.end)
    print()

    # -- critical path ------------------------------------------------------
    slowest = max(runs, key=lambda r: r.wall)
    act = slowest.active(idle_gap)
    idle = slowest.wall - act
    print()
    print("### Critical path")
    print()
    chain = []
    node = slowest
    while node:
        chain.append(f"{node.role}({dur(node.wall)})")
        node = max(node.children, key=lambda c: c.wall) if node.children else None
    print(f"`{' → '.join(chain)}`")
    print()
    print(
        f"Longest agent: **{slowest.role}** — *{slowest.desc[:60]}* — "
        f"{dur(slowest.wall)} wall, {dur(act)} active, {dur(idle)} idle."
    )
    print(
        f"Idle = gaps over {idle_gap}s inside one transcript. An agent's wait for a human "
        "resume is not recorded there — see the `gaps` row for that."
    )

    # -- duplication --------------------------------------------------------
    here = os.getcwd().rstrip("/") + "/"
    rel = lambda f: f[len(here):] if f.startswith(here) else f

    print()
    print("### Duplicated context")
    print()
    across = defaultdict(int)
    for r in runs:
        for f in r.touched:
            across[f] += 1
    dups = sorted(((n, f) for f, n in across.items() if n > 1), reverse=True)[:12]
    rereads = [
        (n, r, f)
        for r in runs
        for f, n in r.reads.items()
        if n > 2
    ]
    if dups or rereads:
        print("| agents | re-reads | file | signal |")
        print("|--:|--:|---|---|")
        for n, f in dups:
            print(f"| {n} | — | `{rel(f)}` | opened by more than one agent |")
        for n, r, f in sorted(rereads, reverse=True, key=lambda t: t[0]):
            print(f"| 1 | {n}× | `{rel(f)}` | re-read inside *{r.desc or r.role}* |")
    else:
        print("No file was opened by more than one agent, and none re-read inside one.")

    # -- flags --------------------------------------------------------------
    # Compare an agent against others of ITS OWN TYPE, never against the whole
    # session. A plan-verifier reads a great deal because that is its job;
    # measured against a session median dominated by writers it looks anomalous
    # every single time, and a flag that cries wolf at correct work teaches the
    # reader to ignore flags.
    print()
    print("### Baselines and outliers")
    print()
    this_run = defaultdict(list)
    for r in runs:
        this_run[r.role].append(r.tools)
    history = defaultdict(list)
    for meta_path in (PROJ_ROOT / slug_for_cwd()).glob("*/subagents/agent-*.meta.json"):
        jl = Path(str(meta_path)[: -len(".meta.json")] + ".jsonl")
        if not jl.is_file():
            continue
        try:
            m = json.loads(meta_path.read_text())
        except (OSError, json.JSONDecodeError):
            continue
        n = sum(
            1
            for rec in read_jsonl(jl)
            if rec.get("type") == "assistant"
            for b in (rec.get("message") or {}).get("content") or []
            if isinstance(b, dict) and b.get("type") == "tool_use"
        )
        history[m.get("agentType", "?")].append(n)

    baseline = {}
    for role, vals in this_run.items():
        if len(vals) >= 3:
            baseline[role] = (median(vals), len(vals), "this run")
        elif len(history.get(role, [])) >= 3:
            baseline[role] = (median(history[role]), len(history[role]), "history")
        else:
            baseline[role] = (None, 0, "too few runs anywhere")
    print("| role | median tools | runs | baseline from |")
    print("|---|--:|--:|---|")
    for role, (med, n, src) in sorted(baseline.items()):
        if med is None:
            print(f"| {role} | — | — | not judged: {src} |")
        else:
            print(f"| {role} | {med:.0f} | {n} | {src} |")
    print()
    flagged = 0
    for r in runs:
        med, _, src = baseline[r.role]
        if med and r.tools > med * 2:
            flagged += 1
            print(f"- **outlier** — *{r.desc or r.role}*: {r.tools} tool uses vs {med:.0f} median for `{r.role}` ({src})")
    if not flagged:
        print("No outliers within any agent type.")

    # -- what this does not cover -------------------------------------------
    print()
    print("### Not counted")
    print()
    print("- `claude -p` subprocesses (the description optimiser is the one that bites):")
    print("  they spend real tokens and write no transcript here.")
    if unknown_model:
        print("- at least one agent's model was not recorded — it is priced at opus rates.")
    print("- cost is Anthropic list price, not what a Max subscription was charged.")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
