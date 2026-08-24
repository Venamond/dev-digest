/** @vitest-environment jsdom */
import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { SpecFile } from "@devdigest/shared";
import messages from "../../../../../../../messages/en/context.json";
import { ProjectContextView } from "./ProjectContextView";

vi.mock("next/navigation", () => ({
  useParams: () => ({ repoId: "repo-1" }),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/repos/repo-1/context",
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("@/lib/repo-context", () => ({
  useRepoNotFound: () => false,
}));

vi.mock("@/components/app-shell", () => ({
  useSetCrumb: () => undefined,
}));

afterEach(cleanup);

/* Two documents sharing a file name across two roots (AC-3), with token counts
   whose SUM (1 300) equals neither one on its own — a footer reading the wrong
   field fails this fixture. `docs/api.md` carries `used_by_agents: 7` with an
   EMPTY `used_by`, so a counter re-asked of the payload is visible too. */
const FILES: SpecFile[] = [
  {
    path: "specs/api.md",
    root: "specs",
    approx_tokens: 500,
    used_by_agents: 2,
    used_by: [
      { agent_id: "a-1", agent_name: "Security Reviewer", via: "agent" },
      {
        agent_id: "a-2",
        agent_name: "Performance Reviewer",
        via: "skill",
        skill_id: "s-1",
        skill_name: "House Style",
      },
    ],
  },
  {
    path: "docs/api.md",
    root: "docs",
    approx_tokens: 800,
    used_by_agents: 7,
    used_by: [],
  },
];

function jsonResponse(data: unknown) {
  return { ok: true, status: 200, json: async () => data };
}

function errorResponse(status: number) {
  return {
    ok: false,
    status,
    statusText: "Internal Server Error",
    json: async () => ({ error: { code: "write_failed", message: "disk is read-only" } }),
  };
}

interface FetchOptions {
  agents?: Array<{ id: string; name: string; enabled: boolean }>;
  files?: SpecFile[];
  saveFails?: boolean;
}

const AGENTS = [
  { id: "a1", name: "Security Reviewer", enabled: true },
  { id: "a2", name: "Perf Reviewer", enabled: true },
  { id: "a3", name: "Retired", enabled: false },
];

function stubFetch({ files = FILES, saveFails = false, agents = AGENTS }: FetchOptions = {}) {
  const calls: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      calls.push(`${init?.method ?? "GET"} ${url}`);
      if (url.includes("/context/doc")) {
        if (init?.method === "PUT") {
          if (saveFails) return errorResponse(500);
          return jsonResponse(JSON.parse(String(init.body)));
        }
        const path = new URL(url, "http://x").searchParams.get("path") ?? "";
        return jsonResponse({ path, content: `# ${path}\n\nBody of ${path}.` });
      }
      if (url.includes("/context")) return jsonResponse(files);
      // The COVERAGE ring's denominator: agents that are switched on.
      if (url.includes("/agents")) return jsonResponse(agents);
      return jsonResponse({});
    }),
  );
  return calls;
}

beforeEach(() => {
  stubFetch();
});

function renderView() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={qc}>
      <NextIntlClientProvider locale="en" messages={{ context: messages }}>
        <ProjectContextView />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

async function selectDocument(name: string | RegExp) {
  fireEvent.click(await screen.findByRole("button", { name }));
}

async function openEditor() {
  fireEvent.click(await screen.findByRole("button", { name: /^edit$/i }));
  return (await screen.findByRole("textbox", { name: /document body/i })) as HTMLTextAreaElement;
}

describe("ProjectContextView", () => {
  it("renders one distinguishable row per document, name and folder (AC-3)", async () => {
    renderView();

    const specsRow = await screen.findByRole("button", { name: "specs/api.md" });
    const docsRow = screen.getByRole("button", { name: "docs/api.md" });

    expect(specsRow).not.toBe(docsRow);
    expect(within(specsRow).getByText("api.md")).toBeTruthy();
    expect(within(docsRow).getByText("api.md")).toBeTruthy();
  });

  it("footers the count and the SUMMED token total, not any single document's (AC-38)", async () => {
    renderView();

    // 500 + 800 — a footer reading either document's own field fails here.
    expect(await screen.findByText(/2 documents · ~1,300 tokens in total/i)).toBeTruthy();
    expect(screen.queryByText(/~500 tokens in total/i)).toBeNull();
    expect(screen.queryByText(/~800 tokens in total/i)).toBeNull();
  });

  it("captions the total as the repository's, not as what a run sends (AC-38)", async () => {
    renderView();
    // The criterion is that the footer total reads as the REPOSITORY's, told
    // apart from what any one run sends — not that it uses particular wording.
    const caption = await screen.findByText(/not what a run sends/i);
    expect(caption.textContent).toMatch(/this repository holds/i);
  });

  it("refetches the list from the refresh control (AC-4)", async () => {
    const calls = stubFetch();
    renderView();
    await screen.findByRole("button", { name: "specs/api.md" });

    const listCalls = () => calls.filter((c) => c.endsWith("/repos/repo-1/context")).length;
    const before = listCalls();
    fireEvent.click(screen.getByRole("button", { name: /^refresh$/i }));

    await waitFor(() => expect(listCalls()).toBeGreaterThan(before));
  });

  it("shows HOW MANY agents use the document, without naming them (AC-8)", async () => {
    // Naming them here was dropped by the human on 2026-08-23: a header has
    // nowhere to put a long list. The names stay reachable in the editors'
    // preview drawers, and here on the label's title.
    renderView();
    await selectDocument("specs/api.md");

    expect(await screen.findByText(/2 agents/i)).toBeTruthy();
    expect(screen.queryByRole("link", { name: "Security Reviewer" })).toBeNull();
  });


  it("counts the agents it renders, never the payload's own number (AC-35)", async () => {
    renderView();
    // `docs/api.md` claims used_by_agents: 7 while used_by is empty.
    await selectDocument("docs/api.md");

    expect(await screen.findByText(/used by no agents/i)).toBeTruthy();
    expect(screen.queryByText(/used by 7 agents/i)).toBeNull();
  });

  it("shows THAT document's own containing folder when selected (AC-29)", async () => {
    renderView();
    await selectDocument("docs/api.md");

    // Laid out to mockup M1: the selected document's own folder sits under the
    // rail heading as a bare path. The row labels read "in docs" / "in specs"
    // with no trailing slash, so `docs/` matches the rail and nothing else.
    expect(await screen.findByText("docs/")).toBeTruthy();
    expect(screen.queryByText("specs/")).toBeNull();
  });

  it("renders the document's markdown in Preview (AC-5)", async () => {
    renderView();
    await selectDocument("specs/api.md");

    expect(await screen.findByRole("heading", { name: "specs/api.md" })).toBeTruthy();
    expect(screen.getByText(/Body of specs\/api\.md\./)).toBeTruthy();
  });

  it("renders the empty state rather than an error when nothing is found", async () => {
    stubFetch({ files: [] });
    renderView();

    expect(await screen.findByText(/no markdown documents found/i)).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("warns in Edit mode that a save is local, lost on resync and never reaches GitHub (AC-7)", async () => {
    renderView();
    await selectDocument("specs/api.md");
    await openEditor();

    const notice = screen.getByText(/stays on this machine only/i);
    expect(notice.textContent).toMatch(/lost on the next resync/i);
    expect(notice.textContent).toMatch(/never reaches GitHub/i);
  });

  it("states how many agents use the document after a successful save (AC-37)", async () => {
    renderView();
    await selectDocument("specs/api.md");
    const textarea = await openEditor();

    fireEvent.change(textarea, { target: { value: "rewritten" } });
    fireEvent.click(screen.getByRole("button", { name: /^save$/i }));

    expect(await screen.findByText(/2 agents read this document/i)).toBeTruthy();
  });

  it("keeps the typed text in the editor when the save fails (AC-30)", async () => {
    stubFetch({ saveFails: true });
    renderView();
    await selectDocument("specs/api.md");
    const textarea = await openEditor();

    fireEvent.change(textarea, { target: { value: "text the human typed" } });
    fireEvent.click(screen.getByRole("button", { name: /^save$/i }));

    // The error is reported…
    expect(await screen.findByText(/couldn’t save/i)).toBeTruthy();
    // …and — the half a happy-path test misses — the typed text is STILL there,
    // not discarded and not overwritten by a re-read from disk.
    expect(
      (screen.getByRole("textbox", { name: /document body/i }) as HTMLTextAreaElement).value,
    ).toBe("text the human typed");
  });
});
