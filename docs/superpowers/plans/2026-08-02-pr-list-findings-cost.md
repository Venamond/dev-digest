# PR list: total review cost + findings hover preview — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the PR list's `cost_usd` column to sum every review run's cost (not just the latest run's), and add a hover popover on the findings badge that previews the individual findings behind the count.

**Architecture:** Backend: one aggregation query change in `server/src/modules/pulls/routes.ts`, following the exact pattern already used for the (previously fixed) `findings` column. Frontend: no new backend endpoint — a new hover-triggered component lazily fetches the PR's existing `/pulls/:id/reviews` payload (already used by the PR-detail page) via a debounced-`enabled` React Query call, and renders a compact read-only findings list.

**Tech Stack:** Fastify + Drizzle (server), Next.js 15 + React 19 + TanStack Query + next-intl (client), Vitest + Testing Library for both.

## Global Constraints

- Sum `cost_usd` across **every** `agent_runs` row for a PR; a run with `cost_usd = null` (unknown model price) is excluded from the sum, not treated as `$0`. A PR reports `cost_usd: null` only when **none** of its runs have a known cost (or it has no runs at all) — spec §1.
- No new backend endpoint for the findings preview — reuse `GET /pulls/:id/reviews`, spec §2 "Data source".
- Findings preview popover: read-only. Clicking a finding does nothing (confirmed MVP scope, spec §2).
- Findings preview popover is not a clickable GitHub link on `file:line` — plain monospace text (spec's own MonoLink mention is superseded by this plan's decision below, since `MonoLink` without an `href` renders an interactive `<button>`, which contradicts "read-only").
- Popover fetch triggers ~200ms after `mouseEnter` starts (debounce so scanning the list doesn't fire N requests); closes ~150ms after `mouseLeave` (grace period so moving the pointer from the badge into the popover to scroll doesn't flicker-close it).
- All new user-facing copy goes in `client/messages/en/prReview.json` — no inlined strings (client `CLAUDE.md`).
- Component tests never hit a real API — mock the hook that would fetch, don't mock `fetch` itself (client `CLAUDE.md` gotcha).
- `score`'s "latest review" semantics are explicitly unchanged (spec non-goal).

---

### Task 1: Backend — sum cost across every run, not just the latest

**Files:**
- Modify: `server/src/modules/pulls/routes.ts:151-165` (the `latestCostByPr` block) and its usage at the `cost_usd:` field in the returned row mapper (currently `cost_usd: latestCostByPr.get(r.id) ?? null,`)
- Modify: `server/src/adapters/mocks.ts` (`MockLLMOptions`, `MockLLMProvider.completeStructured`) — add a `costUsd` override so a test can give two agents two different costs
- Test: `server/test/reviews.it.test.ts`

**Interfaces:**
- Consumes: existing `container.db`, `t.agentRuns` (Drizzle table, columns `prId`, `costUsd`), `inArray` (already imported in `routes.ts`)
- Produces: `PrMeta.cost_usd` (unchanged type, `number | null`) — now "sum of known-cost runs" instead of "latest run's cost". No other task depends on this one.

- [ ] **Step 1: Add a `costUsd` override to `MockLLMProvider`**

In `server/src/adapters/mocks.ts`, add the field to the options interface (alongside the existing `delayMs` you'll see there):

```ts
export interface MockLLMOptions {
  models?: ModelInfo[];
  structured?: unknown;
  structuredBySchema?: Record<string, unknown>;
  completionText?: string;
  embedding?: number[];
  delayMs?: number;
  /** Override the fixed $0.001 mock cost — lets a test give two agents two
   *  different costs to verify an endpoint sums them instead of picking one. */
  costUsd?: number;
}
```

Then use it in `completeStructured` (leave `complete()` and its hardcoded `0.001` alone — nothing exercises that path here):

```ts
  async completeStructured<T>(req: StructuredRequest<T>): Promise<StructuredResult<T>> {
    this.calls.push({ method: 'completeStructured', req });
    if (this.opts.delayMs) await new Promise((r) => setTimeout(r, this.opts.delayMs));
    const fixture = this.opts.structuredBySchema?.[req.schemaName] ?? this.opts.structured ?? {};
    const parsed = (req.schema as z.ZodType<T>).safeParse(fixture);
    if (!parsed.success) {
      throw new Error(`MockLLMProvider fixture failed schema: ${parsed.error.message}`);
    }
    return {
      data: parsed.data,
      model: req.model,
      tokensIn: 100,
      tokensOut: 50,
      costUsd: this.opts.costUsd ?? 0.001,
      raw: JSON.stringify(fixture),
      attempts: 1,
```

(Only the `costUsd:` line in the returned object changes — everything else in that method stays as-is.)

- [ ] **Step 2: Write the failing test**

Add to `server/test/reviews.it.test.ts`, right after the existing `it('PR-list findings badge sums every reviewer's findings, not just the latest review', ...)` test (same file already imports `MockLLMProvider`, `MockEmbedder`, `MockGitClient`, `waitForPrRuns`, `t`, `eq` — no new imports needed):

```ts
  it('PR-list cost sums every run\'s cost, not just the latest run\'s', async () => {
    const app = await buildApp({
      config: config(),
      db: pg.handle.db,
      overrides: {
        embedder: new MockEmbedder(),
        git: new MockGitClient({ diff: DIFF }),
        llm: {
          openai: new MockLLMProvider('openai', { structured: REVIEW_FIXTURE, costUsd: 0.002 }),
          anthropic: new MockLLMProvider('anthropic', { structured: REVIEW_FIXTURE, costUsd: 0.005 }),
        },
      },
    });
    const { pr } = await setupRepoAndPr(pg.handle.db, workspaceId);

    const agentA = (
      await app.inject({
        method: 'POST',
        url: '/agents',
        payload: { name: 'A', provider: 'openai', model: 'gpt-4.1', system_prompt: 'a' },
      })
    ).json();
    const agentB = (
      await app.inject({
        method: 'POST',
        url: '/agents',
        payload: { name: 'B', provider: 'anthropic', model: 'claude-3-5-sonnet-latest', system_prompt: 'b' },
      })
    ).json();

    await app.inject({ method: 'POST', url: `/pulls/${pr.id}/review`, payload: { agentId: agentA.id } });
    await app.inject({ method: 'POST', url: `/pulls/${pr.id}/review`, payload: { agentId: agentB.id } });
    await waitForPrRuns(pg.handle.db, pr.id, { expected: 2 });

    const list = (await app.inject({ method: 'GET', url: `/repos/${pr.repoId}/pulls` })).json();
    const listedPr = list.find((p: { id: string }) => p.id === pr.id);
    expect(listedPr.cost_usd).toBeCloseTo(0.007, 6);

    await app.close();
  });
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `cd server && pnpm exec vitest run test/reviews.it.test.ts -t "sums every run"`
Expected: FAIL — `listedPr.cost_usd` is whichever single run happens to be "latest" (0.002 or 0.005), not `0.007`.

- [ ] **Step 4: Fix the aggregation in `routes.ts`**

In `server/src/modules/pulls/routes.ts`, replace the `latestCostByPr` block:

```ts
    // Latest agent-run COST per PR for the list's cost column. Same pattern as
    // the score block above, but from `agent_runs` (not `reviews`) — cost is a
    // property of the RUN, not the review. "Latest", not summed across runs.
    const latestCostByPr = new Map<string, number | null>();
    if (prIds.length > 0) {
      const runRows = await container.db
        .select({ prId: t.agentRuns.prId, costUsd: t.agentRuns.costUsd })
        .from(t.agentRuns)
        .where(inArray(t.agentRuns.prId, prIds))
        .orderBy(desc(t.agentRuns.ranAt));
      // Rows are newest-first → first seen per PR is the latest run.
      for (const rr of runRows) {
        if (rr.prId && !latestCostByPr.has(rr.prId)) latestCostByPr.set(rr.prId, rr.costUsd);
      }
    }
```

with:

```ts
    // Total cost per PR — summed across every agent_runs row, same aggregation
    // shape as findingsByPr above (a review run fans out to one row per
    // reviewer agent). A run whose model has no known price persists
    // cost_usd=null; those are excluded from the sum rather than treated as
    // $0, so a PR whose runs are ALL unknown-price reports cost null
    // (unknown), not a misleadingly-precise 0.
    const totalCostByPr = new Map<string, number>();
    const hasCostByPr = new Set<string>();
    if (prIds.length > 0) {
      const runRows = await container.db
        .select({ prId: t.agentRuns.prId, costUsd: t.agentRuns.costUsd })
        .from(t.agentRuns)
        .where(inArray(t.agentRuns.prId, prIds));
      for (const rr of runRows) {
        if (!rr.prId || rr.costUsd == null) continue;
        hasCostByPr.add(rr.prId);
        totalCostByPr.set(rr.prId, (totalCostByPr.get(rr.prId) ?? 0) + rr.costUsd);
      }
    }
```

Then update the field in the row mapper further down (currently `cost_usd: latestCostByPr.get(r.id) ?? null,`):

```ts
        cost_usd: hasCostByPr.has(r.id) ? totalCostByPr.get(r.id)! : null,
```

`desc` may now be unused if nothing else in this file uses it — check with `grep -n "desc(" server/src/modules/pulls/routes.ts`; if the only remaining use is the `latestReviewByPr` block above (`orderBy(desc(t.reviews.createdAt))`), leave the import as-is (still used there).

- [ ] **Step 5: Run the test to verify it passes**

Run: `cd server && pnpm exec vitest run test/reviews.it.test.ts -t "sums every run"`
Expected: PASS

- [ ] **Step 6: Run the full server test suite**

Run: `cd server && pnpm test`
Expected: all tests pass (131+ tests, no regressions in the existing cost/findings tests in the same file)

- [ ] **Step 7: Commit**

```bash
cd server
git add src/adapters/mocks.ts src/modules/pulls/routes.ts test/reviews.it.test.ts
git commit -m "fix(pulls): sum every run's cost on the PR list, not just the latest"
```

---

### Task 2: `usePrReviews` — support a conditional, lazily-enabled fetch

**Files:**
- Modify: `client/src/lib/hooks/reviews.ts:50-56` (the `usePrReviews` function)

**Interfaces:**
- Consumes: existing `useQuery` from `@tanstack/react-query`, `api.get`, `ReviewRecord` type — all already imported in this file.
- Produces: `usePrReviews(prId: string | null | undefined, opts?: { enabled?: boolean; staleTime?: number }): UseQueryResult<ReviewRecord[]>` — Task 4's `FindingsPreviewPopover` calls this with `{ enabled: open, staleTime: 60_000 }`.

This task has no isolated unit test of its own (it's a 2-line signature change to a passthrough options object); it's verified by Task 4's popover test and by the existing detail-page call site continuing to compile/behave unchanged.

- [ ] **Step 1: Change the function**

Replace:

```ts
// ---- Persisted reviews + findings for a PR ----
export function usePrReviews(prId: string | null | undefined) {
  return useQuery({
    queryKey: ["reviews", prId],
    queryFn: () => api.get<ReviewRecord[]>(`/pulls/${prId}/reviews`),
    enabled: !!prId,
  });
}
```

with:

```ts
// ---- Persisted reviews + findings for a PR ----
/** `opts.enabled` lets a caller gate the fetch behind its own condition (e.g.
 *  "only after the user has hovered for 200ms") without losing the `!!prId`
 *  guard. `opts.staleTime` lets a caller that only needs an occasional lazy
 *  read (e.g. a hover preview) avoid refetching on every re-hover. */
export function usePrReviews(
  prId: string | null | undefined,
  opts: { enabled?: boolean; staleTime?: number } = {},
) {
  return useQuery({
    queryKey: ["reviews", prId],
    queryFn: () => api.get<ReviewRecord[]>(`/pulls/${prId}/reviews`),
    enabled: !!prId && (opts.enabled ?? true),
    staleTime: opts.staleTime,
  });
}
```

- [ ] **Step 2: Typecheck**

Run: `cd client && pnpm typecheck`
Expected: PASS — the one existing call site, `usePrReviews(prId)` in `client/src/app/repos/[repoId]/pulls/[number]/page.tsx:40`, still compiles because `opts` defaults to `{}`.

- [ ] **Step 3: Commit**

```bash
cd client
git add src/lib/hooks/reviews.ts
git commit -m "feat(reviews): let usePrReviews take an enabled/staleTime override"
```

---

### Task 3: `FindingsPreviewPanel` — pure, read-only findings list

**Files:**
- Create: `client/src/app/repos/[repoId]/pulls/_components/PRRow/FindingsPreviewPopover/FindingsPreviewPanel.tsx`
- Create: `client/src/app/repos/[repoId]/pulls/_components/PRRow/FindingsPreviewPopover/styles.ts`
- Modify: `client/messages/en/prReview.json` (add `list.findingsPreview.title`)
- Test: `client/src/app/repos/[repoId]/pulls/_components/PRRow/FindingsPreviewPopover/FindingsPreviewPanel.test.tsx`

**Interfaces:**
- Consumes: `FindingRecord`, `Severity` from `@devdigest/shared`; `Icon`, `SeverityBadge`, `CategoryTag`, `ConfidenceNum` from `@devdigest/ui`; `useTranslations` from `next-intl`.
- Produces: `FindingsPreviewPanel({ findings: FindingRecord[]; count: number; loading?: boolean }): JSX.Element | null` — Task 4's `FindingsPreviewPopover` renders this.

- [ ] **Step 1: Add the i18n key**

In `client/messages/en/prReview.json`, inside the existing `"list"` object (which already has `"columns"`, `"filter"`, etc. — see the block starting `"list": {` around line 63), add a new `findingsPreview` key. For example, right after the closing `}` of `"columns"` (or anywhere else inside `"list"` — object key order doesn't matter for JSON):

```json
    "findingsPreview": {
      "title": "{count} FINDINGS"
    }
```

Make sure the JSON stays valid (comma before this key if it's not the last one, no trailing comma if it is).

- [ ] **Step 2: Write the failing test**

Create `client/src/app/repos/[repoId]/pulls/_components/PRRow/FindingsPreviewPopover/FindingsPreviewPanel.test.tsx`:

```tsx
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { FindingRecord } from "@devdigest/shared";
import messages from "../../../../../../../../messages/en/prReview.json";
import { FindingsPreviewPanel } from "./FindingsPreviewPanel";

afterEach(cleanup);

function finding(o: Partial<FindingRecord>): FindingRecord {
  return {
    id: "f-1",
    review_id: "rv-1",
    severity: "WARNING",
    category: "bug",
    title: "Some finding",
    file: "src/a.ts",
    start_line: 1,
    end_line: 1,
    rationale: "A short rationale.",
    suggestion: null,
    confidence: 0.8,
    kind: "finding",
    trifecta_components: null,
    evidence: null,
    accepted_at: null,
    dismissed_at: null,
    ...o,
  };
}

function renderPanel(findings: FindingRecord[], count = findings.length, loading = false) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
      <FindingsPreviewPanel findings={findings} count={count} loading={loading} />
    </NextIntlClientProvider>,
  );
}

describe("FindingsPreviewPanel", () => {
  it("renders nothing when there are no findings and it isn't loading", () => {
    const { container } = renderPanel([]);
    expect(container).toBeEmptyDOMElement();
  });

  it("shows the total count in the header", () => {
    renderPanel([finding({})], 1);
    expect(screen.getByText("1 FINDINGS")).toBeInTheDocument();
  });

  it("sorts findings critical → warning → suggestion", () => {
    renderPanel([
      finding({ id: "w", severity: "WARNING", title: "A warning" }),
      finding({ id: "c", severity: "CRITICAL", title: "A critical" }),
      finding({ id: "s", severity: "SUGGESTION", title: "A suggestion" }),
    ]);
    const titles = screen
      .getAllByText(/^A (critical|warning|suggestion)$/)
      .map((el) => el.textContent);
    expect(titles).toEqual(["A critical", "A warning", "A suggestion"]);
  });

  it("renders the finding's file:line, category and confidence", () => {
    renderPanel([finding({ file: "src/config.ts", start_line: 12, end_line: 12, category: "security" })]);
    expect(screen.getByText("src/config.ts:12")).toBeInTheDocument();
    expect(screen.getByText("security")).toBeInTheDocument();
    expect(screen.getByText("80% conf")).toBeInTheDocument();
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `cd client && pnpm exec vitest run src/app/repos/\[repoId\]/pulls/_components/PRRow/FindingsPreviewPopover/FindingsPreviewPanel.test.tsx`
Expected: FAIL with "Cannot find module './FindingsPreviewPanel'"

- [ ] **Step 4: Write the styles file**

Create `client/src/app/repos/[repoId]/pulls/_components/PRRow/FindingsPreviewPopover/styles.ts`:

```ts
import type { CSSProperties } from "react";

export const s = {
  wrapper: {
    position: "relative",
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
  } satisfies CSSProperties,
  popoverAnchor: {
    position: "absolute",
    top: "calc(100% + 6px)",
    left: 0,
    zIndex: 20,
  } satisfies CSSProperties,
  panel: {
    width: 360,
    maxHeight: 320,
    overflowY: "auto",
    background: "var(--bg-elevated)",
    border: "1px solid var(--border)",
    borderRadius: 8,
    boxShadow: "var(--shadow-modal)",
    padding: "10px 0",
  } satisfies CSSProperties,
  header: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    padding: "0 14px 8px",
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: "0.04em",
    textTransform: "uppercase",
    color: "var(--text-muted)",
    borderBottom: "1px solid var(--border)",
    marginBottom: 8,
  } satisfies CSSProperties,
  loading: {
    display: "flex",
    justifyContent: "center",
    padding: "12px 0",
    color: "var(--text-muted)",
  } satisfies CSSProperties,
  list: {
    display: "flex",
    flexDirection: "column",
  } satisfies CSSProperties,
  item: {
    padding: "8px 14px",
    borderBottom: "1px solid var(--border)",
  } satisfies CSSProperties,
  itemHeader: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    marginBottom: 4,
  } satisfies CSSProperties,
  itemTitle: {
    fontSize: 13,
    fontWeight: 600,
    color: "var(--text-primary)",
    flex: 1,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  } satisfies CSSProperties,
  itemMeta: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    marginBottom: 4,
  } satisfies CSSProperties,
  fileLine: {
    fontSize: 12,
    color: "var(--text-secondary)",
  } satisfies CSSProperties,
  rationale: {
    margin: 0,
    fontSize: 12,
    lineHeight: 1.4,
    color: "var(--text-secondary)",
    display: "-webkit-box",
    WebkitLineClamp: 2,
    WebkitBoxOrient: "vertical",
    overflow: "hidden",
  } satisfies CSSProperties,
} satisfies Record<string, CSSProperties>;
```

- [ ] **Step 5: Write the component**

Create `client/src/app/repos/[repoId]/pulls/_components/PRRow/FindingsPreviewPopover/FindingsPreviewPanel.tsx`:

```tsx
/* FindingsPreviewPanel — pure, read-only preview of a PR's findings, shown in
   the PR-list hover popover. Deliberately NOT a reuse of the PR-detail page's
   FindingCard: no accept/dismiss actions, no click-to-expand, no GitHub link
   on file:line (this is a glance-and-move-on preview, not the full finding
   view). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon, SeverityBadge, CategoryTag, ConfidenceNum } from "@devdigest/ui";
import type { FindingRecord, Severity } from "@devdigest/shared";
import { s } from "./styles";

const SEVERITY_ORDER: Record<Severity, number> = {
  CRITICAL: 0,
  WARNING: 1,
  SUGGESTION: 2,
};

function lineLabel(f: Pick<FindingRecord, "start_line" | "end_line">): string {
  return f.start_line === f.end_line ? `${f.start_line}` : `${f.start_line}-${f.end_line}`;
}

export function FindingsPreviewPanel({
  findings,
  count,
  loading,
}: {
  findings: FindingRecord[];
  count: number;
  loading?: boolean;
}) {
  const t = useTranslations("prReview");
  if (!loading && findings.length === 0) return null;

  const sorted = [...findings].sort(
    (a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity],
  );

  return (
    <div style={s.panel} onClick={(e) => e.stopPropagation()}>
      <div style={s.header}>
        <Icon.AlertOctagon size={14} />
        {t("list.findingsPreview.title", { count })}
      </div>
      {loading ? (
        <div style={s.loading}>
          <Icon.RefreshCw size={14} style={{ animation: "ddspin 1s linear infinite" }} />
        </div>
      ) : (
        <div style={s.list}>
          {sorted.map((f) => (
            <div key={f.id} style={s.item}>
              <div style={s.itemHeader}>
                <SeverityBadge severity={f.severity} compact />
                <span style={s.itemTitle}>{f.title}</span>
                <CategoryTag category={f.category} />
              </div>
              <div style={s.itemMeta}>
                <span className="mono" style={s.fileLine}>
                  {f.file}:{lineLabel(f)}
                </span>
                <ConfidenceNum value={f.confidence} />
              </div>
              <p style={s.rationale}>{f.rationale}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `cd client && pnpm exec vitest run src/app/repos/\[repoId\]/pulls/_components/PRRow/FindingsPreviewPopover/FindingsPreviewPanel.test.tsx`
Expected: PASS (all 4 cases)

- [ ] **Step 7: Commit**

```bash
cd client
git add messages/en/prReview.json "src/app/repos/[repoId]/pulls/_components/PRRow/FindingsPreviewPopover/styles.ts" "src/app/repos/[repoId]/pulls/_components/PRRow/FindingsPreviewPopover/FindingsPreviewPanel.tsx" "src/app/repos/[repoId]/pulls/_components/PRRow/FindingsPreviewPopover/FindingsPreviewPanel.test.tsx"
git commit -m "feat(pulls): add read-only findings preview panel component"
```

---

### Task 4: `FindingsPreviewPopover` — hover trigger, debounce, lazy fetch

**Files:**
- Create: `client/src/app/repos/[repoId]/pulls/_components/PRRow/FindingsPreviewPopover/FindingsPreviewPopover.tsx`
- Create: `client/src/app/repos/[repoId]/pulls/_components/PRRow/FindingsPreviewPopover/index.ts`
- Test: `client/src/app/repos/[repoId]/pulls/_components/PRRow/FindingsPreviewPopover/FindingsPreviewPopover.test.tsx`

**Interfaces:**
- Consumes: `usePrReviews(prId, { enabled, staleTime }): { data: ReviewRecord[] | undefined; isLoading: boolean }` from Task 2; `FindingsPreviewPanel` from Task 3; `s` from `./styles` (Task 3).
- Produces: `FindingsPreviewPopover({ prId: string; count: number; children: React.ReactNode }): JSX.Element` — Task 5's `PRRow.tsx` wraps the findings badges with this. The rendered wrapper `<div>` carries a `data-findings-preview` attribute (used by Task 5's `PRRow.test.tsx` to assert it's present/absent).

- [ ] **Step 1: Write the failing test**

Create `client/src/app/repos/[repoId]/pulls/_components/PRRow/FindingsPreviewPopover/FindingsPreviewPopover.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NextIntlClientProvider } from "next-intl";
import type { ReviewRecord } from "@devdigest/shared";
import messages from "../../../../../../../../messages/en/prReview.json";
import { FindingsPreviewPopover } from "./FindingsPreviewPopover";
import { usePrReviews } from "@/lib/hooks/reviews";

vi.mock("@/lib/hooks/reviews", () => ({ usePrReviews: vi.fn() }));

const mockedUsePrReviews = vi.mocked(usePrReviews);

const REVIEW: ReviewRecord = {
  id: "rv-1",
  pr_id: "pr-1",
  agent_id: null,
  run_id: null,
  agent_name: "Security",
  kind: "review",
  verdict: "request_changes",
  summary: "…",
  score: 40,
  model: "gpt-4.1",
  grounding: "1/1 passed",
  created_at: "2026-08-01T00:00:00.000Z",
  findings: [
    {
      id: "f-1",
      review_id: "rv-1",
      severity: "CRITICAL",
      category: "security",
      title: "Hardcoded secret",
      file: "src/config.ts",
      start_line: 12,
      end_line: 12,
      rationale: "A live key is committed.",
      suggestion: null,
      confidence: 0.98,
      kind: "finding",
      trifecta_components: null,
      evidence: null,
      accepted_at: null,
      dismissed_at: null,
    },
  ],
};

function renderPopover() {
  const qc = new QueryClient();
  return render(
    <QueryClientProvider client={qc}>
      <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
        <FindingsPreviewPopover prId="pr-1" count={1}>
          <span>2</span>
        </FindingsPreviewPopover>
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.useFakeTimers();
  mockedUsePrReviews.mockReturnValue({ data: undefined, isLoading: false } as ReturnType<
    typeof usePrReviews
  >);
});
afterEach(() => {
  vi.useRealTimers();
  cleanup();
});

describe("FindingsPreviewPopover", () => {
  it("does not render a popover before hover, and starts the query disabled", () => {
    renderPopover();
    expect(mockedUsePrReviews).toHaveBeenCalledWith("pr-1", { enabled: false, staleTime: 60_000 });
    expect(screen.queryByText("Hardcoded secret")).not.toBeInTheDocument();
  });

  it("opens after the hover delay and renders the fetched findings", () => {
    mockedUsePrReviews.mockReturnValue({ data: [REVIEW], isLoading: false } as ReturnType<
      typeof usePrReviews
    >);
    renderPopover();
    fireEvent.mouseEnter(screen.getByText("2").parentElement!);
    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(screen.getByText("Hardcoded secret")).toBeInTheDocument();
  });

  it("does not open if the pointer leaves before the hover delay elapses", () => {
    mockedUsePrReviews.mockReturnValue({ data: [REVIEW], isLoading: false } as ReturnType<
      typeof usePrReviews
    >);
    renderPopover();
    const trigger = screen.getByText("2").parentElement!;
    fireEvent.mouseEnter(trigger);
    act(() => {
      vi.advanceTimersByTime(100);
    });
    fireEvent.mouseLeave(trigger);
    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(screen.queryByText("Hardcoded secret")).not.toBeInTheDocument();
  });

  it("closes after the pointer leaves and the close delay elapses", () => {
    mockedUsePrReviews.mockReturnValue({ data: [REVIEW], isLoading: false } as ReturnType<
      typeof usePrReviews
    >);
    renderPopover();
    const trigger = screen.getByText("2").parentElement!;
    fireEvent.mouseEnter(trigger);
    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(screen.getByText("Hardcoded secret")).toBeInTheDocument();

    fireEvent.mouseLeave(trigger);
    act(() => {
      vi.advanceTimersByTime(150);
    });
    expect(screen.queryByText("Hardcoded secret")).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd client && pnpm exec vitest run src/app/repos/\[repoId\]/pulls/_components/PRRow/FindingsPreviewPopover/FindingsPreviewPopover.test.tsx`
Expected: FAIL with "Cannot find module './FindingsPreviewPopover'"

- [ ] **Step 3: Write the component**

Create `client/src/app/repos/[repoId]/pulls/_components/PRRow/FindingsPreviewPopover/FindingsPreviewPopover.tsx`:

```tsx
/* FindingsPreviewPopover — wraps the PR-list findings badge. On hover (after a
   short delay), lazily fetches this PR's reviews (the same data the PR-detail
   page uses) and shows a read-only preview of the individual findings behind
   the badge's count. Closes on mouse-leave after a short grace delay so
   moving the pointer from the badge into the popover doesn't flicker-close
   it — both the badge and the popover live inside one relatively-positioned
   wrapper, so a single pair of mouseEnter/mouseLeave handlers on that wrapper
   covers both. */
"use client";

import React from "react";
import { usePrReviews } from "@/lib/hooks/reviews";
import { FindingsPreviewPanel } from "./FindingsPreviewPanel";
import { s } from "./styles";

const HOVER_OPEN_DELAY_MS = 200;
const HOVER_CLOSE_DELAY_MS = 150;

export function FindingsPreviewPopover({
  prId,
  count,
  children,
}: {
  prId: string;
  count: number;
  children: React.ReactNode;
}) {
  const [open, setOpen] = React.useState(false);
  const openTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const closeTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const { data, isLoading } = usePrReviews(prId, { enabled: open, staleTime: 60_000 });

  const handleEnter = () => {
    if (closeTimer.current) {
      clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
    if (open || openTimer.current) return;
    openTimer.current = setTimeout(() => {
      setOpen(true);
      openTimer.current = null;
    }, HOVER_OPEN_DELAY_MS);
  };

  const handleLeave = () => {
    if (openTimer.current) {
      clearTimeout(openTimer.current);
      openTimer.current = null;
    }
    closeTimer.current = setTimeout(() => {
      setOpen(false);
      closeTimer.current = null;
    }, HOVER_CLOSE_DELAY_MS);
  };

  React.useEffect(
    () => () => {
      if (openTimer.current) clearTimeout(openTimer.current);
      if (closeTimer.current) clearTimeout(closeTimer.current);
    },
    [],
  );

  const findings = React.useMemo(() => (data ?? []).flatMap((r) => r.findings), [data]);

  return (
    <div data-findings-preview style={s.wrapper} onMouseEnter={handleEnter} onMouseLeave={handleLeave}>
      {children}
      {open && (
        <div style={s.popoverAnchor}>
          <FindingsPreviewPanel findings={findings} count={count} loading={isLoading} />
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Create the barrel**

Create `client/src/app/repos/[repoId]/pulls/_components/PRRow/FindingsPreviewPopover/index.ts`:

```ts
export { FindingsPreviewPopover } from "./FindingsPreviewPopover";
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `cd client && pnpm exec vitest run src/app/repos/\[repoId\]/pulls/_components/PRRow/FindingsPreviewPopover/FindingsPreviewPopover.test.tsx`
Expected: PASS (all 4 cases)

- [ ] **Step 6: Commit**

```bash
cd client
git add "src/app/repos/[repoId]/pulls/_components/PRRow/FindingsPreviewPopover/FindingsPreviewPopover.tsx" "src/app/repos/[repoId]/pulls/_components/PRRow/FindingsPreviewPopover/index.ts" "src/app/repos/[repoId]/pulls/_components/PRRow/FindingsPreviewPopover/FindingsPreviewPopover.test.tsx"
git commit -m "feat(pulls): add hover-triggered findings preview popover"
```

---

### Task 5: Wire the popover into `PRRow`

**Files:**
- Modify: `client/src/app/repos/[repoId]/pulls/_components/PRRow/PRRow.tsx`
- Modify: `client/src/app/repos/[repoId]/pulls/_components/PRRow/PRRow.test.tsx`

**Interfaces:**
- Consumes: `FindingsPreviewPopover` from `./FindingsPreviewPopover` (Task 4).
- Produces: nothing further downstream — this is the last task.

- [ ] **Step 1: Write the failing tests**

In `client/src/app/repos/[repoId]/pulls/_components/PRRow/PRRow.test.tsx`, add the `QueryClientProvider` import and wrap `renderRow`'s output (the popover always calls `usePrReviews`, even when closed, so a `QueryClient` must be in context or `useQuery` throws — the query stays disabled until hover, so this does **not** trigger a real fetch and needs no `fetch`/`api` mocking):

Replace:

```tsx
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { PrMeta } from "@/lib/types";
import messages from "../../../../../../../messages/en/prReview.json";
import { PRRow } from "./PRRow";
```

with:

```tsx
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { PrMeta } from "@/lib/types";
import messages from "../../../../../../../messages/en/prReview.json";
import { PRRow } from "./PRRow";
```

Replace the `renderRow` helper:

```tsx
function renderRow(p: PrMeta) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
      <PRRow pr={p} repoId="r1" />
    </NextIntlClientProvider>,
  );
}
```

with:

```tsx
function renderRow(p: PrMeta) {
  const qc = new QueryClient();
  return render(
    <QueryClientProvider client={qc}>
      <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
        <PRRow pr={p} repoId="r1" />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}
```

Then add two cases to the existing `describe("PRRow — findings column", ...)` block (after its current two `it`s):

```tsx
  it("wraps a non-empty findings badge in a hover trigger for the findings preview", () => {
    const { container } = renderRow(pr({ findings: { critical: 1, warning: 0, suggestion: 0 } }));
    expect(container.querySelector("[data-findings-preview]")).not.toBeNull();
  });

  it("does not render a findings-preview trigger when there are no findings", () => {
    const { container } = renderRow(pr({ findings: { critical: 0, warning: 0, suggestion: 0 } }));
    expect(container.querySelector("[data-findings-preview]")).toBeNull();
  });
```

- [ ] **Step 2: Run the tests to verify the new ones fail**

Run: `cd client && pnpm exec vitest run src/app/repos/\[repoId\]/pulls/_components/PRRow/PRRow.test.tsx`
Expected: the two new tests FAIL (no `data-findings-preview` element exists yet); the four pre-existing tests still PASS (confirms the `QueryClientProvider` wrapping change alone didn't break anything).

- [ ] **Step 3: Wire `FindingsPreviewPopover` into `PRRow.tsx`**

In `client/src/app/repos/[repoId]/pulls/_components/PRRow/PRRow.tsx`, add the import (alongside the existing `@devdigest/ui`/`@/components/cost-badge` imports at the top):

```tsx
import { FindingsPreviewPopover } from "./FindingsPreviewPopover";
```

Replace the findings cell:

```tsx
      <div style={s.findingsCell}>
        {pr.findings && (pr.findings.critical || pr.findings.warning || pr.findings.suggestion) ? (
          FINDINGS_LEVELS.filter(([key]) => pr.findings![key] > 0).map(([key, sevKey]) => {
            const SevIcon = Icon[SEV[sevKey].icon];
            return (
              <span
                key={key}
                style={{ display: "inline-flex", alignItems: "center", gap: 2, color: SEV[sevKey].c }}
              >
                <SevIcon size={13} />
                {pr.findings![key]}
              </span>
            );
          })
        ) : (
          <span style={s.muted}>—</span>
        )}
      </div>
```

with:

```tsx
      <div style={s.findingsCell}>
        {pr.findings && (pr.findings.critical || pr.findings.warning || pr.findings.suggestion) ? (
          <FindingsPreviewPopover
            prId={pr.id}
            count={pr.findings.critical + pr.findings.warning + pr.findings.suggestion}
          >
            {FINDINGS_LEVELS.filter(([key]) => pr.findings![key] > 0).map(([key, sevKey]) => {
              const SevIcon = Icon[SEV[sevKey].icon];
              return (
                <span
                  key={key}
                  style={{ display: "inline-flex", alignItems: "center", gap: 2, color: SEV[sevKey].c }}
                >
                  <SevIcon size={13} />
                  {pr.findings![key]}
                </span>
              );
            })}
          </FindingsPreviewPopover>
        ) : (
          <span style={s.muted}>—</span>
        )}
      </div>
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd client && pnpm exec vitest run src/app/repos/\[repoId\]/pulls/_components/PRRow/PRRow.test.tsx`
Expected: all 6 tests PASS

- [ ] **Step 5: Run the full client test suite and typecheck**

Run: `cd client && pnpm test && pnpm typecheck`
Expected: all pass, no regressions elsewhere in the PR-list feature

- [ ] **Step 6: Commit**

```bash
cd client
git add "src/app/repos/[repoId]/pulls/_components/PRRow/PRRow.tsx" "src/app/repos/[repoId]/pulls/_components/PRRow/PRRow.test.tsx"
git commit -m "feat(pulls): show a findings preview on hover in the PR list"
```

---

## Final verification

- [ ] `cd server && pnpm test` — full suite green (includes Task 1's new cost test + the earlier findings-sum test)
- [ ] `cd client && pnpm test && pnpm typecheck` — full suite green
- [ ] Manually smoke-test in the browser (`./scripts/dev.sh`): open the PR list, confirm (a) the COST column shows a sum when a PR has multiple runs with different costs, (b) hovering a non-dash findings badge shows the popover after a brief delay, listing findings sorted by severity with a working scroll for PRs with many findings, and closes smoothly when the pointer leaves.
- [ ] Re-read `server/INSIGHTS.md` and `client/INSIGHTS.md` per the root `CLAUDE.md`'s "on finishing work" instruction; append only if something genuinely new and non-obvious surfaced beyond what Task 1–5's code comments already capture.
