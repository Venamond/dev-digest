import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Skill, SkillVersion } from "@devdigest/shared";
import messages from "../../../../../../../../messages/en/skills.json";
import { ToastProvider } from "../../../../../../../lib/toast";

const restoreMutate = vi.fn();
const diffMutateAsync = vi.fn();

vi.mock("../../../../../../../lib/hooks/skills", () => ({
  useSkillVersions: () => ({
    data: [
      {
        skill_id: "sk1",
        version: 2,
        body: "# v2",
        created_at: "2026-08-05T12:00:00.000Z",
        note: "Tightened scope rule",
      },
      {
        skill_id: "sk1",
        version: 1,
        body: "# v1",
        created_at: "2026-08-04T12:00:00.000Z",
        note: null,
      },
    ] satisfies SkillVersion[],
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  }),
  useRestoreSkillVersion: () => ({ mutate: restoreMutate, isPending: false }),
  useSkillVersionDiff: () => ({
    mutateAsync: diffMutateAsync,
    isPending: false,
  }),
}));

import { VersionsTab } from "./VersionsTab";

afterEach(() => {
  cleanup();
  restoreMutate.mockReset();
  diffMutateAsync.mockReset();
  vi.unstubAllGlobals();
});

const SKILL: Skill = {
  id: "sk1",
  name: "over-mocking-smell",
  description: "Mock smell",
  type: "convention",
  source: "manual",
  body: "# v2",
  enabled: true,
  version: 2,
};

function renderTab() {
  return render(
    <NextIntlClientProvider locale="en" messages={{ skills: messages }}>
      <ToastProvider>
        <VersionsTab skill={SKILL} />
      </ToastProvider>
    </NextIntlClientProvider>,
  );
}

describe("VersionsTab", () => {
  it("renders note as the row title and fallback when note is null", () => {
    renderTab();
    expect(screen.getByText("Tightened scope rule")).toBeInTheDocument();
    expect(screen.getByText("Version 1")).toBeInTheDocument();
  });

  it("shows Current badge only on the current version", () => {
    renderTab();
    expect(screen.getByText("Current")).toBeInTheDocument();
    expect(screen.getAllByText("Current")).toHaveLength(1);
    expect(screen.getByText("Diff")).toBeInTheDocument();
    expect(screen.getByText("Restore")).toBeInTheDocument();
  });

  it("lists versions and restores a non-current snapshot", () => {
    vi.stubGlobal(
      "confirm",
      vi.fn(() => true),
    );
    renderTab();
    expect(screen.getByText("v2")).toBeInTheDocument();
    expect(screen.getByText("v1")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Restore"));
    expect(restoreMutate).toHaveBeenCalledWith(
      { id: "sk1", version: 1 },
      expect.anything(),
    );
  });

  it("loads and shows a diff for a non-current version", async () => {
    diffMutateAsync.mockResolvedValue({
      from_version: 1,
      to_version: 2,
      diff: "- # v1\n+ # v2",
    });
    renderTab();
    fireEvent.click(screen.getByText("Diff"));
    await waitFor(() => expect(screen.getByText(/# v1/)).toBeInTheDocument());
    expect(diffMutateAsync).toHaveBeenCalledWith({ id: "sk1", version: 1 });
  });
});
