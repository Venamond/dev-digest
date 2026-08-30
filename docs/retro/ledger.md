# Workflow retro ledger

One row per measured run, appended, never rewritten. The last column is the
point: it is what lets the next retro say whether a fix worked.

`cost` is the whole run at Anthropic list price — the agents **plus** the slice
of the conversation that overlaps them. A Max subscription is not billed this
way; the figure is a comparable between rows, not an invoice. Keep the
convention constant or the column compares nothing.

A row with `0` agents is a session that dispatched none, and there its `cost` is
the conversation alone — the only half that exists. Such a row is a snapshot
rather than a total: the retro runs inside the session it measures, so the
figure grows while the report is being written. Read it as "at least this
much".

Full accounts live beside this file as `YYYY-MM-DD-<slug>.md`, written only
when a run left a narrative worth keeping.

| date | workflow | agents | out | cache hit | wall | cost | rework | applied since last retro |
|---|---|---|---|---|---|---|---|---|
| 2026-08-26 | review remarks: planner boundary + verdict artifact — **solo, no fan-out** | 0 | 90k | 98% | 53m | $11.58 | — (no agents) | n/a — no workflow ran, so the run-plan proposals had nothing to apply to; `cost` here is the conversation alone, the only half that exists |
| 2026-08-24 | [PR Why + Risk Brief (spec→plan→run-plan→10 fix rounds)](2026-08-24-pr-why-risk-brief.md) | 24 | 903k | 94% | 7h05m | $412 | 37% (29 pts accidental) | P1–P3 of the run-plan retro held: tracks stayed file-disjoint, the stalled agent was caught by the disk check, the extract kept agents off the 842-line plan |
| 2026-08-23 | [run-plan: project-context](2026-08-23-run-plan-project-context.md) | 9 | 460k | 97% | 85m | $112 | 20% (all by design) | P1 applied (spec sweep); P2 had not been, and its failure recurred twice here — **all six proposals applied same day, plus P4–P5 from the token analysis** |
| 2026-08-23 | [spec: project-context](2026-08-23-spec-project-context.md) | 9 | 117k | 91% | 74m | $53 | 78% | — (first run) |
| 2026-08-22 | run-plan: mcp-server | 10 | 131k | 93% | 37m | $36 | ~30% (by design) | n/a — measured retroactively |
