/** @vitest-environment jsdom */
import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import messages from "../../../../../../../messages/en/conventions.json";
import { CreateSkillModal } from "./CreateSkillModal";

const push = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace: vi.fn() }),
  useParams: () => ({ repoId: "repo-1" }),
  usePathname: () => "/repos/repo-1/conventions",
  useSearchParams: () => new URLSearchParams(),
}));

const DRAFT = {
  name: "repo-conventions",
  description: "3 house conventions extracted from payments-api",
  body: "# repo-conventions\n\n## always-await\nAlways await async calls\n",
};

/** Requests the modal makes, in order — lets a test assert the POST payload. */
let calls: Array<{ url: string; method: string; body: unknown }>;

function jsonResponse(data: unknown) {
  return { ok: true, status: 200, json: async () => data };
}

beforeEach(() => {
  push.mockClear();
  calls = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? "GET";
      calls.push({ url, method, body: init?.body ? JSON.parse(String(init.body)) : undefined });

      if (url.includes("/conventions/skill-draft")) return jsonResponse(DRAFT);
      if (url.includes("/conventions/skill")) return jsonResponse({ id: "skill-9", ...DRAFT });
      if (url.includes("/skills")) return jsonResponse([]);
      return jsonResponse({});
    }),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function renderModal(onClose = vi.fn()) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <NextIntlClientProvider locale="en" messages={{ conventions: messages }}>
        <CreateSkillModal
          repoId="repo-1"
          repoName="payments-api"
          acceptedCount={3}
          onClose={onClose}
        />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
  return { onClose };
}

async function hydrated() {
  return waitFor(() => screen.getByDisplayValue("repo-conventions"));
}

describe("CreateSkillModal", () => {
  it("hydrates name, description and body from the server draft", async () => {
    renderModal();
    await hydrated();
    expect(screen.getByDisplayValue(DRAFT.description)).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: /skill body/i })).toHaveValue(DRAFT.body);
  });

  it("submits the edited draft and navigates to the new skill", async () => {
    renderModal();
    const nameInput = await hydrated();
    fireEvent.change(nameInput, { target: { value: "payments-conventions" } });

    fireEvent.click(screen.getByRole("button", { name: /create skill/i }));

    await waitFor(() => expect(push).toHaveBeenCalledWith("/skills/skill-9"));
    const post = calls.find((c) => c.method === "POST");
    expect(post?.body).toMatchObject({
      name: "payments-conventions",
      body: DRAFT.body,
      enabled: true,
    });
  });

  // The trimmed name is what the upsert keys on — an all-space name must not
  // become the skill's identity.
  it("falls back to the default name when the field is blanked", async () => {
    renderModal();
    const nameInput = await hydrated();
    fireEvent.change(nameInput, { target: { value: "   " } });

    fireEvent.click(screen.getByRole("button", { name: /create skill/i }));

    await waitFor(() => expect(push).toHaveBeenCalled());
    const post = calls.find((c) => c.method === "POST");
    expect(post?.body).toMatchObject({ name: "repo-conventions" });
  });

  it("closes without saving when Cancel is pressed", async () => {
    const { onClose } = renderModal();
    await hydrated();

    fireEvent.click(screen.getByRole("button", { name: /^cancel$/i }));

    expect(onClose).toHaveBeenCalledOnce();
    expect(calls.some((c) => c.method === "POST")).toBe(false);
  });

  it("shows how many accepted conventions the skill will carry", async () => {
    renderModal();
    await hydrated();
    expect(
      screen.getByText(/3 accepted conventions in payments-api/i),
    ).toBeInTheDocument();
  });
});
