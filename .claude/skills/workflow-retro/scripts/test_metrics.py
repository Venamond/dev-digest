#!/usr/bin/env python3
"""Golden test for metrics.py.

This is an instrument. When an instrument lies quietly there is no way to
notice — the numbers stay internally consistent and only the conclusion is
wrong, which is the same failure mode the skill warns about for picking the
wrong session. So the figures for one known run are pinned here, and they are
pinned to a run whose numbers are ALSO written down in docs/retro/ledger.md:
if this test and the ledger ever disagree, one of them is a typo and the
disagreement is the finding.

Run it after any edit to metrics.py:

    python3 .claude/skills/workflow-retro/scripts/test_metrics.py

It needs the recorded sessions on disk, so it is a local check, not CI: skip
(exit 0, loudly) when the transcripts are not there rather than failing on a
machine that never ran those workflows.
"""
import importlib.util
import re
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
METRICS = HERE / "metrics.py"

# The /run-plan project-context run. Ledger row 2026-08-23: 9 agents, 460k out,
# 97% cache hit, 85m wall. Anything that moves these moved the arithmetic.
AGENT_SESSION = "401e9627-55c6-4486-b180-e0d68a0ac1e4"
AGENT_EXPECT = [
    (r"^\| agents \| 9 \|", "agent count"),
    (r"^\| output \| 460k \|", "agent output tokens"),
    (r"^\| cache hit \| 97 \|", "cache hit"),
    (r"^\| wall \| 1h25m \|", "wall"),
    (r"^### Agents$", "agents table"),
    (r"^### Revision candidates$", "revision candidates"),
    (r"^\*\*3 of 9 agents \(33%\)\*\*", "revision candidate count"),
    (r"^### Baselines and outliers$", "baselines"),
    (r"^### Not counted$", "not counted"),
]

# A session that dispatched nothing. Its figures grow while the retro runs
# inside it, so pin the SHAPE of the report, never a token count.
SOLO_SESSION = "7cbcd2d2-bbc5-4a36-a34f-f061680a09c9"
SOLO_EXPECT = [
    (r"^run    : 0 agents", "solo header"),
    (r"^### The conversation itself$", "conversation table"),
    (r"^\| agents \| 0 \|", "zero agents in totals"),
    (r"^### Re-read within the conversation$", "re-read section"),
]
SOLO_ABSENT = [
    (r"^### Agents$", "agents table must NOT appear with no agents"),
    (r"^### Critical path$", "critical path must NOT appear with no agents"),
    (r"parallelism", "a 0.0x parallelism row reads as a finding when it is an absence"),
]


def run(session):
    p = subprocess.run(
        [sys.executable, str(METRICS), session],
        capture_output=True, text=True,
    )
    return p.returncode, p.stdout


def check(name, session, present, absent=()):
    rc, out = run(session)
    if rc != 0:
        print(f"  SKIP {name}: exit {rc} — transcripts for {session[:8]} not on this machine")
        return None
    bad = []
    for pat, what in present:
        if not re.search(pat, out, re.M):
            bad.append(f"missing: {what}  ({pat})")
    for pat, what in absent:
        if re.search(pat, out, re.M):
            bad.append(f"present but should not be: {what}  ({pat})")
    if bad:
        print(f"  FAIL {name}")
        for b in bad:
            print(f"       {b}")
        return False
    print(f"  ok   {name}  ({len(present) + len(absent)} checks)")
    return True


def main():
    if not METRICS.is_file():
        print(f"metrics.py not found at {METRICS}", file=sys.stderr)
        return 2

    # A syntax check that does not depend on any transcript being present.
    spec = importlib.util.spec_from_file_location("metrics", METRICS)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    print("  ok   metrics.py imports")

    results = [
        check("agent run (401e9627, ledger 2026-08-23)", AGENT_SESSION, AGENT_EXPECT),
        check("solo run (no subagents)", SOLO_SESSION, SOLO_EXPECT, SOLO_ABSENT),
    ]
    if any(r is False for r in results):
        print("\nFAILED — metrics.py disagrees with the pinned run.")
        return 1
    if all(r is None for r in results):
        print("\nNothing to check: none of the pinned sessions are on this machine.")
        return 0
    print("\nOK")
    return 0


if __name__ == "__main__":
    sys.exit(main())
