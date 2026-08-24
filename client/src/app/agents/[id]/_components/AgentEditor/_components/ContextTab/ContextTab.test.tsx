/** @vitest-environment jsdom */
import React from "react";
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Agent, ContextDocEditorRow } from "@devdigest/shared";
import messages from "../../../../../../../../messages/en/agents.json";
import { ToastProvider } from "../../../../../../../lib/toast";
import { ContextTab } from "./ContextTab";

vi.mock("../../../../../../../lib/repo-context", () => ({
  useActiveRepo: () => ({
    repoId: "repo-1",
    activeRepo: { id: "repo-1", full_name: "acme/payments-api" },
    repos: [],
    reposLoaded: true,
    setRepoId: vi.fn(),
  }),
}));

afterEach(cleanup);

const AGENT = { id: "ag1", name: "Security Reviewer" } as Agent;

function doc(
  path: string,
  over: Partial<ContextDocEditorRow> & {
    approx_tokens?: number;
    used_by_agents?: number;
    used_by?: ContextDocEditorRow["doc"]["used_by"];
  } = {},
): ContextDocEditorRow {
  const { approx_tokens = 100, used_by_agents = 0, used_by = [], ...rest } = over;
  return {
    doc: {
      path,
      root: path.split("/")[0]!,
      approx_tokens,
      used_by_agents,
      used_by,
    },
    attached: false,
    order: 0,
    inherited_from: [],
    readable: true,
    ...rest,
  };
}

/* `specs/api.md` is attached AND inherited — one row, counted once (AC-34).
   `docs/broken.md` is attached but unreadable (AC-36).
   Token counts are chosen so the injected total (400 + 300 + 250 = 950)
   matches no single document and excludes the 90 000-token available one:
   a total re-asked of the payload cannot produce 950. */
const ROWS: ContextDocEditorRow[] = [
  doc("specs/api.md", {
    attached: true,
    order: 0,
    approx_tokens: 400,
    used_by_agents: 2,
    // AC-35: the drawer must NAME these and let the human open each.
    used_by: [
      { agent_id: "ag1", agent_name: "Security Reviewer", via: "agent" },
      {
        agent_id: "ag2",
        agent_name: "Perf Reviewer",
        via: "skill",
        skill_id: "s1",
        skill_name: "House Style",
      },
    ],
    inherited_from: [{ skill_id: "s1", skill_name: "House Style" }],
  }),
  doc("specs/auth.md", { attached: true, order: 1, approx_tokens: 300 }),
  doc("docs/broken.md", { attached: true, order: 2, approx_tokens: 0, readable: false }),
  doc("insights/perf.md", {
    approx_tokens: 250,
    inherited_from: [{ skill_id: "s2", skill_name: "Perf Rules" }],
  }),
  doc("docs/huge.md", { approx_tokens: 90_000 }),
];

function jsonResponse(data: unknown) {
  return { ok: true, status: 200, json: async () => data };
}

function stubFetch(rows: ContextDocEditorRow[] = ROWS, tokenCeiling = 32_000) {
  const calls: Array<{ method: string; url: string; body: unknown }> = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? "GET";
      calls.push({ method, url, body: init?.body ? JSON.parse(String(init.body)) : undefined });
      if (url.includes("/context/doc")) {
        const path = new URL(url, "http://x").searchParams.get("path") ?? "";
        return jsonResponse({ path, content: `# ${path}\n\nBody of ${path}.` });
      }
      if (url.includes("/agents/ag1/context")) {
        // The ceiling travels WITH the rows: it is a per-workspace setting the
        // run caps against, not a constant the client may assume.
        return jsonResponse({ rows, token_ceiling: tokenCeiling });
      }
      return jsonResponse({});
    }),
  );
  return calls;
}

beforeEach(() => {
  stubFetch();
});

function renderTab() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={qc}>
      <NextIntlClientProvider locale="en" messages={{ agents: messages }}>
        <ToastProvider>
          <ContextTab agent={AGENT} />
        </ToastProvider>
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

describe("ContextTab (agent)", () => {
  it("renders one row per document with an N of M attached count (AC-9)", async () => {
    renderTab();
    // 3 attached of 5 rows — both numbers over the rendered array.
    expect(await screen.findByText("3 of 5 attached")).toBeTruthy();
    expect(screen.getAllByRole("checkbox")).toHaveLength(5);
  });

  it("renders ONE row for a document that is both attached and inherited (AC-34, AC-20)", async () => {
    renderTab();
    await screen.findByText("3 of 5 attached");

    expect(
      screen.getAllByRole("checkbox", { name: /Attach or detach specs\/api\.md$/ }),
    ).toHaveLength(1);
  });

  it("totals ONLY the ticked rows (AC-18)", async () => {
    renderTab();
    // Only what the human ticked: 400 + 300 + 0. NOT the inherited 250 — a
    // skill's documents are counted on that skill's own tab — and not the
    // 90 000-token available one.
    expect(await screen.findByText(/~700 tokens selected/)).toBeTruthy();
    expect(screen.queryByText(/950/)).toBeNull();
    expect(screen.queryByText(/90,950/)).toBeNull();
  });

  it("states that the documents are injected as an untrusted ## Project context block (AC-18)", async () => {
    renderTab();
    const caption = await screen.findByText(/injected as an untrusted ## Project context block into every run/i);
    expect(caption.textContent).toMatch(/untrusted ## Project context block/);
  });

  it("orders attached above unattached, attached in the human's order (AC-14)", async () => {
    renderTab();
    await screen.findByText("3 of 5 attached");

    const names = screen
      .getAllByRole("checkbox")
      .map((c) => c.getAttribute("aria-label")!.replace("Attach or detach ", ""));
    expect(names).toEqual([
      "specs/api.md", // attached, order 0
      "specs/auth.md", // attached, order 1
      "docs/broken.md", // attached, order 2
      "insights/perf.md", // inherited
      "docs/huge.md", // available
    ]);
  });

  it("narrows the list with the filter (AC-15)", async () => {
    renderTab();
    await screen.findByText("3 of 5 attached");

    fireEvent.change(screen.getByRole("textbox", { name: /filter documents/i }), {
      target: { value: "insights" },
    });

    await waitFor(() => expect(screen.getAllByRole("checkbox")).toHaveLength(1));
    expect(
      screen.getByRole("checkbox", { name: /insights\/perf\.md$/ }),
    ).toBeTruthy();
  });

  it("marks an attached document that can no longer be read (AC-36)", async () => {
    renderTab();
    expect(await screen.findByText(/cannot be read/i)).toBeTruthy();
  });

  it("gives every row a move control, ends aside (AC-13)", async () => {
    renderTab();
    await screen.findByText("3 of 5 attached");

    // EVERY row moves. Two unticked rows side by side, one with arrows and one
    // without, reads as random — so the only rows missing a direction are the
    // ends: the first has no "up", the last no "down".
    expect(screen.queryByRole("button", { name: "Move specs/api.md up" })).toBeNull();
    expect(screen.getByRole("button", { name: "Move specs/api.md down" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Move specs/auth.md up" })).toBeTruthy();
    // Including a row that arrives through a skill: its display position is the
    // human's, and nothing about it is persisted.
    expect(screen.getAllByRole("button", { name: /Move insights\/perf\.md/ }).length)
      .toBeGreaterThan(0);
  });

  it("makes every row draggable (AC-13)", async () => {
    const { container } = renderTab();
    await screen.findByText("3 of 5 attached");

    const draggables = Array.from(container.querySelectorAll('[draggable="true"]'));
    const labels = draggables.map(
      (d) => within(d as HTMLElement).getByRole("checkbox").getAttribute("aria-label"),
    );
    // Every row is draggable — an inherited one included. Only the ends of the
    // list lack a direction, and that is the arrows' business, not drag's.
    expect(labels).toContain("Attach or detach insights/perf.md");
    expect(labels).toContain("Attach or detach specs/api.md");
    expect(labels).toContain("Attach or detach docs/broken.md");
  });

  it("reorders the LAST own row by keyboard and fires the mutation (AC-13)", async () => {
    const calls = stubFetch();
    renderTab();
    await screen.findByText("3 of 5 attached");

    fireEvent.click(screen.getByRole("button", { name: "Move docs/broken.md up" }));

    await waitFor(() => {
      const post = calls.find((c) => c.method === "POST");
      expect(post).toBeTruthy();
      expect(post!.body).toEqual({
        repo_id: "repo-1",
        paths: ["specs/api.md", "docs/broken.md", "specs/auth.md"],
      });
    });
  });

  it("moves the row VISIBLY, not only in the request body (AC-13)", async () => {
    // The sibling test above proves the POST carries the new order. This one
    // proves the list the human is looking at actually changed — the half that
    // was missing when SkillsTab's reorder shipped broken.
    stubFetch();
    renderTab();
    await screen.findByText("3 of 5 attached");

    const paths = () =>
      screen
        .getAllByRole("checkbox")
        .map((el) => el.getAttribute("aria-label") ?? "")
        .map((l) => l.replace(/^.*?(?=\S+\/)/, ""));

    expect(paths().slice(0, 3)).toEqual(["specs/api.md", "specs/auth.md", "docs/broken.md"]);

    fireEvent.click(screen.getByRole("button", { name: "Move docs/broken.md up" }));

    await waitFor(() => {
      expect(paths().slice(0, 3)).toEqual(["specs/api.md", "docs/broken.md", "specs/auth.md"]);
    });
  });

  it("ticking the LAST row hoists it to the top", async () => {
    /* This REVERSES an earlier decision on purpose. The row used to keep its
       index on tick, because a row jumping out from under the pointer had once
       been reported as a defect. In a fifty-row list the opposite complaint is
       stronger: the human ticks something and then has to hunt for it. The
       human asked for the hoist on 2026-08-23, for every list in the product.
       Do not "restore" the frozen index without asking them. */
    renderTab();
    await screen.findByText("3 of 5 attached");

    const indexOfHuge = () =>
      screen
        .getAllByRole("checkbox")
        .findIndex((c) => c.getAttribute("aria-label") === "Attach or detach docs/huge.md");

    expect(indexOfHuge()).toBeGreaterThan(2);
    fireEvent.click(screen.getByRole("checkbox", { name: /docs\/huge\.md$/ }));

    await waitFor(() => expect(screen.getByText("4 of 5 attached")).toBeTruthy());
    // It joins the ticked GROUP, which sits at the top of the list — the newest
    // one at that group's end, not above documents chosen earlier.
    await waitFor(() => expect(indexOfHuge()).toBeLessThan(4));
    const ticked = screen
      .getAllByRole("checkbox")
      .slice(0, 4)
      .every((c) => c.getAttribute("aria-checked") === "true");
    expect(ticked).toBe(true);
  });

  it("opens a preview drawer with path, root, tokens, using agents, markdown and attach (AC-16)", async () => {
    renderTab();
    await screen.findByText("3 of 5 attached");

    const row = (await screen.findByRole("checkbox", { name: /specs\/auth\.md$/ }))
      .parentElement as HTMLElement;
    fireEvent.click(within(row).getByRole("button", { name: /^preview$/i }));

    // Mockup M6 shows the root, the using-agent count and the token count as
    // three separate facts beside the path — not one combined string.
    // Scoped to the drawer itself: the row badges carry the same root text.
    const drawer = within(await screen.findByRole("dialog"));
    expect(drawer.getByText("specs")).toBeTruthy();
    expect(drawer.getByText(/300 tokens/)).toBeTruthy();
    expect(drawer.getByText(/used by no agents/i)).toBeTruthy();
    expect(await screen.findByText(/Body of specs\/auth\.md\./)).toBeTruthy();
    // M6 draws one wide toggle whose label states the current state. It is
    // unambiguous because the query is scoped to the drawer.
    expect(drawer.getByRole("button", { name: /attached/i })).toBeTruthy();
  });

  it("warns above the ceiling and does not warn just under it (AC-24)", async () => {
    // 31 999 attached — one token under the 32 000 ceiling the payload states.
    stubFetch([doc("specs/big.md", { attached: true, order: 0, approx_tokens: 31_999 })]);
    const under = renderTab();
    expect(await screen.findByText("1 of 1 attached")).toBeTruthy();
    expect(screen.queryByText(/exceeds the/i)).toBeNull();
    under.unmount();

    stubFetch([doc("specs/big.md", { attached: true, order: 0, approx_tokens: 32_001 })]);
    renderTab();
    expect(
      await screen.findByText(/exceeds the 32,000-token project-context ceiling/),
    ).toBeTruthy();
  });

  it("warns against the ceiling THIS workspace runs with, not the default (AC-24)", async () => {
    // 5 000 tokens is far under 32 000 and far over this workspace's 4 000. A
    // tab holding the default would stay silent while every run skipped.
    stubFetch([doc("specs/big.md", { attached: true, order: 0, approx_tokens: 5_000 })], 4_000);
    const over = renderTab();
    expect(
      await screen.findByText(/exceeds the 4,000-token project-context ceiling/),
    ).toBeTruthy();
    over.unmount();

    // …and the same total is fine where the workspace allows more.
    stubFetch([doc("specs/big.md", { attached: true, order: 0, approx_tokens: 5_000 })], 64_000);
    renderTab();
    expect(await screen.findByText("1 of 1 attached")).toBeTruthy();
    expect(screen.queryByText(/exceeds the/i)).toBeNull();
  });

  it("names every using agent in the preview drawer, each openable (AC-35)", async () => {
    renderTab();
    await screen.findByText("3 of 5 attached");

    const row = (await screen.findByRole("checkbox", { name: /specs\/api\.md$/ }))
      .parentElement as HTMLElement;
    fireEvent.click(within(row).getByRole("button", { name: /^preview$/i }));

    // The count alone is what AC-35 calls short — the names must be there, and
    // each must be a link to that agent.
    const direct = await screen.findByRole("link", { name: "Security Reviewer" });
    expect(direct.getAttribute("href")).toBe("/agents/ag1");
    const viaSkill = screen.getByRole("link", { name: "Perf Reviewer" });
    expect(viaSkill.getAttribute("href")).toBe("/agents/ag2");
    expect(screen.getByText(/via House Style/)).toBeTruthy();
  });

  it("says so in the drawer when no agent uses the document (AC-35)", async () => {
    renderTab();
    await screen.findByText("3 of 5 attached");

    const row = (await screen.findByRole("checkbox", { name: /specs\/auth\.md$/ }))
      .parentElement as HTMLElement;
    fireEvent.click(within(row).getByRole("button", { name: /^preview$/i }));

    expect(await screen.findByText(/No agent reads this document yet/)).toBeTruthy();
    expect(screen.queryByRole("link", { name: "Security Reviewer" })).toBeNull();
  });
});
