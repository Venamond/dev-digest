# `specs/` — feature specifications

What we are building, and why. One file per feature, written by
`/spec-creator`, read by `implementation-planner` before it plans anything.

## What lives here, and what does not

| This folder | `docs/superpowers/specs/` |
|---|---|
| **Feature specs** — product behaviour, acceptance criteria in EARS form | **Design documents** — how a change to this repository's own tooling was decided |
| Written by `/spec-creator` | Written by the `brainstorming` skill |

Choosing between them is choosing which process to run: `brainstorming` for
decisions about our own tooling, `/spec-creator` for product behaviour. Running
the wrong one produces a document in the wrong shape, in the wrong folder, for
the wrong reader.

The **architectural** spec — module boundaries, contracts, data flow, stack,
invariants — is neither: it lives long, it lives in `docs/`, and no agent
writes it unasked.

## Layout

```
specs/
  README.md
  YYYY-MM-DD-<slug>.md        <- the feature touches two or more modules
  server/  client/  reviewer-core/  mcp/  e2e/
    YYYY-MM-DD-<slug>.md      <- the feature touches exactly one module
```

A spec that touches more than one module lives at the root of `specs/`, never
in one module's folder — the folder would claim an ownership the feature does
not have.

## Spec ID

Module prefix plus a two-digit counter, counted **per folder**:
`SPEC-SERVER-01`, `SPEC-CLIENT-01`, `SPEC-CORE-01`, `SPEC-MCP-01`,
`SPEC-E2E-01`, and `SPEC-CROSS-01` for the cross-module specs at the root.

The ID lives inside the file, not in its name, so finding the next free number
means reading the specs already in that one folder. Plans, commits and tests
refer to a criterion as `SPEC-SERVER-03 / AC-2`.

There is deliberately **no index file** here. An index of specs goes stale the
first week and then lies; `grep` over this tree does not.

## The shape of a spec

```
# Spec: <feature name>
> Spec ID: SPEC-<MODULE>-NN
> Status: draft | approved | implemented
> Supersedes: <spec id and path, if this replaces an earlier decision>
> Superseded-by: <spec id and path, filled in on the older spec when replaced>
> Revision: <one line per revision: what changed and why>

## Problem and user
## Goals / Non-goals
## User stories
## Acceptance criteria (EARS)
## Edge cases
## Non-functional requirements
## Inputs and provenance
## Untrusted inputs
## Open questions
## Design review
```

Every acceptance criterion carries an id, one of the five EARS patterns with
`shall`, one checkable behaviour, its source, and the suite that would prove it:

```
- **AC-2** — WHILE a re-run is in progress, the system shall show that agent's
  card as running and shall keep its previous findings visible.
  *(source: human, 2026-08-22; verify: client)*
```

Sections earn their place: a category with nothing to say is omitted, not
filled with ceremony. `## Open questions` is the exception — an empty one is a
claim that every decision is made.

## Status

`draft` → `approved` (on the human's explicit word) → `implemented` (after
merge). `implementation-planner` does not plan from a spec that still carries a
`[NEEDS CLARIFICATION]` marker, unless the human names the deferred
clarification when invoking it.

When a spec is replaced, both sides say so: the new one fills `Supersedes`, the
old one gains `Superseded-by`. A spec is never deleted — the record of what was
decided, and when, is the point.
