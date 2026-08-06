/** @vitest-environment jsdom */
import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import messages from "../../../../../../../messages/en/conventions.json";
import { ConventionsView } from "./ConventionsView";

vi.mock("next/navigation", () => ({
  useParams: () => ({ repoId: "repo-1" }),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/repos/repo-1/conventions",
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("@/lib/repo-context", () => ({
  useActiveRepo: () => ({
    activeRepo: {
      id: "repo-1",
      name: "payments-api",
      full_name: "acme/payments-api",
      clone_path: "/tmp/clone",
    },
    repoId: "repo-1",
    repos: [],
    reposLoaded: true,
    setRepoId: vi.fn(),
  }),
  useRepoNotFound: () => false,
}));

vi.mock("@/components/app-shell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

afterEach(cleanup);

function jsonResponse(data: unknown) {
  return {
    ok: true,
    status: 200,
    json: async () => data,
  };
}

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/index-state")) {
        return jsonResponse({
          status: "full",
          filesIndexed: 10,
          filesSkipped: 0,
          lastIndexedSha: "abc",
          updatedAt: new Date().toISOString(),
        });
      }
      if (url.includes("/conventions")) {
        return jsonResponse({ candidates: [], scan: null });
      }
      return jsonResponse({});
    }),
  );
});

function renderView() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <NextIntlClientProvider locale="en" messages={{ conventions: messages }}>
        <ConventionsView />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

describe("ConventionsView", () => {
  it("shows empty state and header Scan when never scanned", async () => {
    renderView();
    await waitFor(() => {
      expect(screen.getByText("No conventions extracted yet")).toBeInTheDocument();
    });
    expect(screen.getByText("payments-api")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Scan$/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Re-scan$/i })).not.toBeInTheDocument();
  });
});
