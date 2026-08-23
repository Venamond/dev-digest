# Workflow retro ledger

One row per measured run, appended, never rewritten. The last column is the
point: it is what lets the next retro say whether a fix worked.

`cost` is the whole run at Anthropic list price — the agents **plus** the slice
of the conversation that overlaps them. A Max subscription is not billed this
way; the figure is a comparable between rows, not an invoice. Keep the
convention constant or the column compares nothing.

Full accounts live beside this file as `YYYY-MM-DD-<slug>.md`, written only
when a run left a narrative worth keeping.

| date | workflow | agents | out | cache hit | wall | cost | rework | applied since last retro |
|---|---|---|---|---|---|---|---|---|
| 2026-08-23 | [run-plan: project-context](2026-08-23-run-plan-project-context.md) | 9 | 460k | 97% | 85m | $112 | 20% (all by design) | P1 applied (spec sweep); P2 had not been, and its failure recurred twice here — **all six proposals applied same day, plus P4–P5 from the token analysis** |
| 2026-08-23 | [spec: project-context](2026-08-23-spec-project-context.md) | 9 | 117k | 91% | 74m | $53 | 78% | — (first run) |
| 2026-08-22 | run-plan: mcp-server | 10 | 131k | 93% | 37m | $36 | ~30% (by design) | n/a — measured retroactively |
