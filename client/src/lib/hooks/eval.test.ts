/** @vitest-environment jsdom */
import React from "react";
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { renderHook, waitFor, cleanup } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useCreateEvalCase } from "./eval";
import { useFindingAction } from "./reviews";
import { queryKeys } from "./keys";

afterEach(cleanup);

const FINDING = "f-1";
const PR = "pr-1";
const AGENT = "ag-1";

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ id: "c-1" }) })),
  );
});

function harness() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  /* Prime the seed exactly as the finding card does: fetched once when the
     card expands, while the finding is still undecided. */
  qc.setQueryData(queryKeys.findingEvalSeed(FINDING), {
    owner_id: AGENT,
    expectation: "must_find",
    existing_case_id: null,
  });
  const wrapper = ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: qc }, children);
  return { qc, wrapper };
}

const seedStale = (qc: QueryClient) =>
  qc.getQueryState(queryKeys.findingEvalSeed(FINDING))?.isInvalidated === true;

/* The seed carries the finding's disposition, and the disposition decides
   whether the case is `must_find` or `must_not_flag`. A cached seed therefore
   writes a case of the wrong KIND, silently: measured 2026-08-30, a DISMISSED
   finding produced `must-find-no-test-for-workspace-isolation` with
   `seeded_from.disposition: 'open'`. Both tests assert the cache is marked
   stale, not that some request was made — the bug was a missing invalidation,
   so only the cache state can show it. */
describe("the finding eval seed is refreshed when what it derives from changes", () => {
  it("accepting a finding invalidates its seed", async () => {
    const { qc, wrapper } = harness();
    expect(seedStale(qc)).toBe(false);

    const { result } = renderHook(() => useFindingAction(), { wrapper });
    result.current.mutate({ findingId: FINDING, action: "accept", prId: PR });

    await waitFor(() => expect(seedStale(qc)).toBe(true));
  });

  it("dismissing a finding invalidates its seed", async () => {
    const { qc, wrapper } = harness();
    const { result } = renderHook(() => useFindingAction(), { wrapper });
    result.current.mutate({ findingId: FINDING, action: "dismiss", prId: PR });

    await waitFor(() => expect(seedStale(qc)).toBe(true));
  });

  /* `existing_case_id` on the seed is what raises the duplicate warning. Left
     cached, a second press of `Turn into eval case` saw no existing case and
     made a twin — two identical rows reached the set that way. */
  it("creating a case from a finding invalidates that finding's seed", async () => {
    const { qc, wrapper } = harness();
    const { result } = renderHook(() => useCreateEvalCase(), { wrapper });
    result.current.mutate({
      agentId: AGENT,
      input: {
        owner_kind: "agent",
        owner_id: AGENT,
        name: "must-find-x",
        expectation: "must_find",
        input_diff: "",
        input_files: null,
        input_meta: null,
        expected_output: [],
        seeded_from: { finding_id: FINDING, disposition: "accepted" },
      },
    });

    await waitFor(() => expect(seedStale(qc)).toBe(true));
  });
});
