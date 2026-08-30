import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { SkillImportDraft } from "@devdigest/shared";
import messages from "../../../../../../../messages/en/skills.json";
import { ToastProvider } from "../../../../../../lib/toast";

const mutatePreview = vi.fn();
const mutateConfirm = vi.fn();
const push = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace: vi.fn() }),
}));

vi.mock("../../../../../../lib/hooks/skills", () => ({
  useImportSkillPreview: () => ({
    mutateAsync: mutatePreview,
    isPending: false,
  }),
  useImportSkillConfirm: () => ({
    mutateAsync: mutateConfirm,
    isPending: false,
  }),
}));

import { ImportSkillDrawer } from "./ImportSkillDrawer";

afterEach(() => {
  cleanup();
  mutatePreview.mockReset();
  mutateConfirm.mockReset();
  push.mockReset();
});

const DRAFT: SkillImportDraft = {
  name: "imported-skill",
  description: "From file",
  type: "security",
  body: "# Security\n\nCheck for secrets.",
  trust_note: "Review before enabling.",
};

function renderDrawer() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <NextIntlClientProvider locale="en" messages={{ skills: messages }}>
        <ToastProvider>
          <ImportSkillDrawer onClose={() => {}} />
        </ToastProvider>
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

describe("ImportSkillDrawer", () => {
  it("keeps Confirm disabled until a draft is previewed", () => {
    renderDrawer();
    const confirm = screen.getByText("Confirm import").closest("button");
    expect(confirm).toBeDisabled();
    expect(screen.getByText(/never executed/i)).toBeInTheDocument();
  });

  it("shows draft after preview and confirms import", async () => {
    mutatePreview.mockResolvedValue(DRAFT);
    mutateConfirm.mockResolvedValue({
      id: "sk-new",
      ...DRAFT,
      source: "manual",
      enabled: true,
      version: 1,
    });
    renderDrawer();

    const file = new File(["---\nname: imported-skill\n---\n# Security"], "skill.md", {
      type: "text/markdown",
    });
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    expect(input).toBeTruthy();
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => expect(screen.getByText("imported-skill")).toBeInTheDocument());
    expect(screen.getByText("Review before enabling.")).toBeInTheDocument();

    fireEvent.click(screen.getByText("Confirm import"));
    await waitFor(() =>
      expect(mutateConfirm).toHaveBeenCalledWith(
        expect.objectContaining({ name: "imported-skill", type: "security" }),
      ),
    );
    await waitFor(() => expect(push).toHaveBeenCalledWith("/skills/sk-new"));
  });
});
