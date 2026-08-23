/** @vitest-environment jsdom */
import React from "react";
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ContextDocEditorRow, Skill } from "@devdigest/shared";
import messages from "../../../../../../../../messages/en/skills.json";
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

const SKILL = { id: "sk1", name: "house-style", type: "convention", version: 1 } as Skill;

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
    doc: { path, root: path.split("/")[0]!, approx_tokens, used_by_agents, used_by },
    attached: false,
    order: 0,
    inherited_from: [],
    readable: true,
    ...rest,
  };
}

/* Two attached under `specs` (in a deliberately non-alphabetical human order),
   one attached under `docs`, and NOTHING attached under `insights` — so the
   grouped index must omit the `insights` heading entirely. `docs/broken.md` is
   attached but unreadable. Tokens sum to 900 over the attached rows while a
   50 000-token unattached document sits in the list, so a total taken from all
   rows would read 50 900. */
const ROWS: ContextDocEditorRow[] = [
  doc("specs/auth.md", {
    attached: true,
    order: 0,
    approx_tokens: 500,
    used_by_agents: 2,
    // AC-35: the drawer must NAME these and let the human open each.
    used_by: [
      { agent_id: "ag1", agent_name: "Security Reviewer", via: "agent" },
      {
        agent_id: "ag2",
        agent_name: "Perf Reviewer",
        via: "skill",
        skill_id: "sk1",
        skill_name: "house-style",
      },
    ],
  }),
  doc("specs/api.md", { attached: true, order: 1, approx_tokens: 400 }),
  doc("docs/setup.md", { attached: true, order: 2, approx_tokens: 0 }),
  doc("docs/broken.md", { attached: true, order: 3, approx_tokens: 0, readable: false }),
  doc("insights/perf.md", { approx_tokens: 250 }),
  doc("docs/huge.md", { approx_tokens: 50_000 }),
];

function jsonResponse(data: unknown) {
  return { ok: true, status: 200, json: async () => data };
}

function stubFetch(rows: ContextDocEditorRow[] = ROWS, tokenCeiling = 32_000) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/context/doc")) {
        const path = new URL(url, "http://x").searchParams.get("path") ?? "";
        return jsonResponse({ path, content: `# ${path}` });
      }
      if (url.includes("/skills/sk1/context")) {
        // The ceiling travels WITH the rows: it is a per-workspace setting the
        // run caps against, not a constant the client may assume.
        return jsonResponse({ rows, token_ceiling: tokenCeiling });
      }
      return jsonResponse({});
    }),
  );
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
      <NextIntlClientProvider locale="en" messages={{ skills: messages }}>
        <ToastProvider>
          <ContextTab skill={SKILL} />
        </ToastProvider>
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

const attachLabels = () =>
  screen
    .getAllByRole("checkbox")
    .map((c) => c.getAttribute("aria-label")!.replace("Attach or detach ", ""));

describe("ContextTab (skill)", () => {
  it("renders the N of M count and the inheritance sentence (AC-10)", async () => {
    renderTab();

    expect(await screen.findByText("4 of 6 attached")).toBeTruthy();
    // AC-10 asks for a statement that agents using this skill inherit these
    // documents; the wording was shortened to the mockup's on 2026-08-23.
    expect(screen.getByText(/any agent using this skill inherits these documents/i)).toBeTruthy();
  });

  it("orders attached above unattached, unattached grouped by root (AC-14)", async () => {
    renderTab();
    await screen.findByText("4 of 6 attached");

    expect(attachLabels()).toEqual([
      // Attached, in the human's order — NOT alphabetical.
      "specs/auth.md",
      "specs/api.md",
      "docs/setup.md",
      "docs/broken.md",
      // Unattached, grouped by root and alphabetical within a root.
      "docs/huge.md",
      "insights/perf.md",
    ]);
  });

  it("narrows the list with the filter (AC-15)", async () => {
    renderTab();
    await screen.findByText("4 of 6 attached");

    fireEvent.change(screen.getByRole("textbox", { name: /filter documents/i }), {
      target: { value: "insights" },
    });

    await waitFor(() => expect(screen.getAllByRole("checkbox")).toHaveLength(1));
    expect(attachLabels()).toEqual(["insights/perf.md"]);
  });

  it("marks an attached document that can no longer be read (AC-36)", async () => {
    renderTab();
    expect(await screen.findByText(/cannot be read/i)).toBeTruthy();
  });

  it("lists exactly the attached paths under their root headings, omitting an empty root (AC-17)", async () => {
    renderTab();
    await screen.findByText("4 of 6 attached");

    const panel = screen.getByText("SERIALIZES AS").parentElement!;

    expect(screen.getByText("## Project specifications")).toBeTruthy();
    expect(screen.getByText("## Project docs")).toBeTruthy();
    // Nothing under `insights` is attached — its heading must not appear.
    expect(screen.queryByText("## Project insights")).toBeNull();

    // Exactly the attached paths, in the human's order within each group.
    const paths = Array.from(panel.querySelectorAll("span"))
      .map((el) => el.textContent ?? "")
      .filter((txt) => /^(specs|docs|insights)\/.+\.md$/.test(txt));
    expect(paths).toEqual([
      "specs/auth.md",
      "specs/api.md",
      "docs/setup.md",
      "docs/broken.md",
    ]);
    // The unattached ones are absent from the index even though they are rows.
    expect(paths).not.toContain("docs/huge.md");
    expect(paths).not.toContain("insights/perf.md");
  });

  it("says what a run actually sends, beneath the mockup's SERIALIZES AS label (AC-17)", async () => {
    // The human asked on 2026-08-23 for M4's label verbatim, having earlier
    // asked that the panel not imply it shows the block. Both hold: the label
    // is the mockup's, and the caption states the block's real shape and order.
    renderTab();
    await screen.findByText("4 of 6 attached");
    expect(screen.getByText("SERIALIZES AS")).toBeTruthy();
    expect(screen.getByText(/one ## Project context block/i)).toBeTruthy();
    expect(screen.getByText(/in the order above/i)).toBeTruthy();
  });


  it("says so when nothing is attached, rather than printing empty headings (AC-17)", async () => {
    stubFetch([doc("specs/api.md"), doc("docs/setup.md")]);
    renderTab();

    expect(await screen.findByText("0 of 2 attached")).toBeTruthy();
    expect(screen.getByText(/Nothing attached yet/)).toBeTruthy();
    expect(screen.queryByText("## Project specifications")).toBeNull();
    expect(screen.queryByText("## Project docs")).toBeNull();
  });

  it("totals over the rows it renders, excluding unattached documents (AC-18)", async () => {
    renderTab();
    // 500 + 400 + 0 + 0 — never the 50 000-token unattached one.
    expect(await screen.findByText(/~900 tokens selected/)).toBeTruthy();
    expect(screen.queryByText(/50,900/)).toBeNull();
  });

  it("warns above the ceiling and does not warn just under it (AC-24)", async () => {
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

    stubFetch([doc("specs/big.md", { attached: true, order: 0, approx_tokens: 5_000 })], 64_000);
    renderTab();
    expect(await screen.findByText("1 of 1 attached")).toBeTruthy();
    expect(screen.queryByText(/exceeds the/i)).toBeNull();
  });

  it("names every using agent in the preview drawer, each openable (AC-35)", async () => {
    renderTab();
    await screen.findByText("4 of 6 attached");

    const row = (await screen.findByRole("checkbox", { name: /specs\/auth\.md$/ }))
      .parentElement as HTMLElement;
    fireEvent.click(within(row).getByRole("button", { name: /^preview$/i }));

    const direct = await screen.findByRole("link", { name: "Security Reviewer" });
    expect(direct.getAttribute("href")).toBe("/agents/ag1");
    const viaSkill = screen.getByRole("link", { name: "Perf Reviewer" });
    expect(viaSkill.getAttribute("href")).toBe("/agents/ag2");
    expect(screen.getByText(/via house-style/)).toBeTruthy();
  });

  it("says so in the drawer when no agent uses the document (AC-35)", async () => {
    renderTab();
    await screen.findByText("4 of 6 attached");

    const row = (await screen.findByRole("checkbox", { name: /specs\/api\.md$/ }))
      .parentElement as HTMLElement;
    fireEvent.click(within(row).getByRole("button", { name: /^preview$/i }));

    expect(await screen.findByText(/No agent reads this document yet/)).toBeTruthy();
    expect(screen.queryByRole("link", { name: "Security Reviewer" })).toBeNull();
  });

  it("shows each row's file name and its OWN containing folder (AC-3)", async () => {
    renderTab();
    await screen.findByText("4 of 6 attached");

    // Bare names are ambiguous across roots, so every row states its folder:
    // three rows sit under `docs`, two under `specs`, one under `insights`.
    expect(screen.getAllByText("setup.md")).toHaveLength(1);
    expect(screen.getAllByText(/^in docs · /)).toHaveLength(3);
    expect(screen.getAllByText(/^in specs · /)).toHaveLength(2);
    expect(screen.getAllByText(/^in insights · /)).toHaveLength(1);
  });
});
