import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Skill } from "@devdigest/shared";
import messages from "../../../../../../../../messages/en/skills.json";
import { ToastProvider } from "../../../../../../../lib/toast";

const mutate = vi.fn();
const deleteMutate = vi.fn();
const replace = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace, push: vi.fn() }),
}));

vi.mock("../../../../../../../lib/hooks/skills", () => ({
  useUpdateSkill: () => ({
    mutate,
    isPending: false,
    isSuccess: false,
    data: undefined,
  }),
  useDeleteSkill: () => ({ mutate: deleteMutate, isPending: false }),
  useSkills: () => ({ data: [{ id: "sk1" }, { id: "sk2" }] }),
}));

import { ConfigTab } from "./ConfigTab";

afterEach(() => {
  cleanup();
  mutate.mockReset();
  deleteMutate.mockReset();
  replace.mockReset();
  vi.unstubAllGlobals();
});

const SKILL: Skill = {
  id: "sk1",
  name: "flaky-test-patterns",
  description: "Timing smells",
  type: "custom",
  source: "manual",
  body: "# Flaky\n\nAvoid shared mutable state.",
  enabled: true,
  version: 1,
};

function renderTab(skill: Skill = SKILL) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ skills: messages }}>
      <ToastProvider>
        <ConfigTab skill={skill} />
      </ToastProvider>
    </NextIntlClientProvider>,
  );
}

describe("ConfigTab", () => {
  it("shows body hint and no description hint", () => {
    renderTab();
    expect(screen.getByText(/The only text sent to the model/i)).toBeInTheDocument();
    expect(screen.queryByText(/Directive interface/i)).not.toBeInTheDocument();
  });

  it("saves patch when Save is clicked after an edit", () => {
    renderTab();
    const nameInput = screen.getByDisplayValue("flaky-test-patterns");
    fireEvent.change(nameInput, { target: { value: "flaky-patterns-v2" } });
    fireEvent.click(screen.getByText("Save skill"));
    expect(mutate).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "sk1",
        patch: expect.objectContaining({ name: "flaky-patterns-v2" }),
      }),
      expect.anything(),
    );
  });

  it("disables Save when there are no unsaved changes", () => {
    renderTab();
    const save = screen.getByText("Save skill").closest("button");
    expect(save).toBeDisabled();
  });

  it("danger-zone Delete confirms and fires the delete mutation", () => {
    vi.stubGlobal(
      "confirm",
      vi.fn(() => true),
    );
    renderTab();
    fireEvent.click(screen.getByRole("button", { name: /^Delete$/i }));
    expect(window.confirm).toHaveBeenCalled();
    expect(deleteMutate).toHaveBeenCalledWith("sk1", expect.anything());
  });
});
