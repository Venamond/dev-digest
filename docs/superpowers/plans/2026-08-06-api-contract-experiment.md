# API Contract Reviewer — control experiment

> Companion to Conventions Extractor. Content lives in
> `docs/agent-prompts/api-contract-reviewer.md` and `docs/skills/*`.

## Setup (once)

1. `cd server && pnpm db:seed` — creates **API Contract Reviewer** with three
   skills linked: `breaking-change`, `response-schema`, `semver-discipline`.
2. Skills Lab → Import → upload `docs/skills/deprecation-policy.md` → confirm.
3. Agents → API Contract Reviewer → Skills → enable `deprecation-policy`.

## Breaking PR (example)

Create or import a PR that **renames a response field** or **changes a route
path** with no dual-read / version bump. Minimal shape:

```diff
- export const ChargeDto = z.object({ charge_id: z.string(), amount: z.number() });
+ export const ChargeDto = z.object({ id: z.string(), amount: z.number() });
```

or

```diff
- app.get('/v1/charges/:id', handler)
+ app.get('/v1/payments/:id', handler)
```

## Runs

| Run | Agent skills | Expected |
|---|---|---|
| A | All skills **disabled** on the agent (or unlink) | Miss or weak comment — prompt alone is conservative |
| B | Skills **enabled** | CRITICAL/WARNING on the rename/path change; cites `file:line` |

Keep both runs in PR Run history for the demo video.

## Conventions Extractor quality note (for PR body)

After a real extract on a cloned+indexed repo, record:

- `candidates` count / `dropped` count from `POST .../extract`
- 1–2 examples of grounded evidence URLs that open the pinned SHA
- Confirm rejected rows are absent from the created `repo-conventions` body
