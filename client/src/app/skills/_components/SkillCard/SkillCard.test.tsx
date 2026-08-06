import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { SkillListItem } from "@devdigest/shared";
import messages from "../../../../../messages/en/skills.json";

const { deleteMutate } = vi.hoisted(() => ({ deleteMutate: vi.fn() }));

vi.mock("../../../../lib/hooks/skills", () => ({
  useDeleteSkill: () => ({ mutate: deleteMutate, isPending: false }),
}));

import { SkillCard } from "./SkillCard";

afterEach(() => {
  cleanup();
  deleteMutate.mockReset();
  vi.unstubAllGlobals();
});

const SKILL: SkillListItem = {
  id: "sk1",
  name: "happy-path-coverage-gap",
  description: "Flag happy-path-only tests",
  type: "rubric",
  source: "manual",
  body: "# Rule",
  enabled: true,
  version: 1,
  agent_count: 3,
  pull_rate: 0.5,
  accept_rate: 0.75,
};

function renderWithIntl(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <NextIntlClientProvider locale="en" messages={{ skills: messages }}>
        {ui}
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

describe("SkillCard", () => {
  it("renders name, type tag, and source label", () => {
    renderWithIntl(<SkillCard skill={SKILL} />);
    expect(screen.getByText("happy-path-coverage-gap")).toBeInTheDocument();
    expect(screen.getByText("rubric")).toBeInTheDocument();
    expect(screen.getByText("Manual")).toBeInTheDocument();
  });

  it("shows stats footer when agent_count > 0", () => {
    renderWithIntl(<SkillCard skill={SKILL} />);
    expect(screen.getByText("3 agents")).toBeInTheDocument();
    expect(screen.getByText("50% pull")).toBeInTheDocument();
    expect(screen.getByText("75% accept")).toBeInTheDocument();
  });

  it("hides stats footer when agent_count is 0", () => {
    renderWithIntl(<SkillCard skill={{ ...SKILL, agent_count: 0 }} />);
    expect(screen.queryByText(/agents/)).not.toBeInTheDocument();
  });

  it("shows — for null pull/accept rates", () => {
    renderWithIntl(
      <SkillCard skill={{ ...SKILL, pull_rate: null, accept_rate: null }} />,
    );
    expect(screen.getByText("3 agents")).toBeInTheDocument();
    expect(screen.getAllByText("—")).toHaveLength(2);
  });

  it("confirms and deletes when trash is clicked", () => {
    vi.stubGlobal(
      "confirm",
      vi.fn(() => true),
    );
    renderWithIntl(<SkillCard skill={SKILL} />);
    fireEvent.click(screen.getByLabelText("Delete skill"));
    expect(window.confirm).toHaveBeenCalled();
    expect(deleteMutate).toHaveBeenCalledWith("sk1");
  });

  it("calls onToggle when the enabled switch is clicked", () => {
    const onToggle = vi.fn();
    renderWithIntl(<SkillCard skill={SKILL} onToggle={onToggle} />);
    fireEvent.click(screen.getByRole("switch"));
    expect(onToggle).toHaveBeenCalledWith(false);
  });

  it("falls back to a translated placeholder when description is empty", () => {
    renderWithIntl(<SkillCard skill={{ ...SKILL, description: "" }} />);
    expect(screen.getByText("No description")).toBeInTheDocument();
  });
});
