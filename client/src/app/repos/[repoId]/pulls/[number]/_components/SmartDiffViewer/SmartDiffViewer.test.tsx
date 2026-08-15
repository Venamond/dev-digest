import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { SmartDiff } from "@devdigest/shared";
import messages from "../../../../../../../../messages/en/prReview.json";
import { SmartDiffViewer } from "./SmartDiffViewer";

afterEach(() => cleanup());

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
      {ui}
    </NextIntlClientProvider>,
  );
}

function smartDiff(overrides: Partial<SmartDiff> = {}): SmartDiff {
  return {
    groups: [
      {
        role: "core",
        files: [
          { path: "src/service.ts", pseudocode_summary: null, additions: 5, deletions: 0, finding_lines: [] },
        ],
      },
    ],
    split_suggestion: { too_big: false, total_lines: 5, proposed_splits: [] },
    ...overrides,
  };
}

describe("SmartDiffViewer — order toggle", () => {
  it("renders the reviewer-ordered eyebrow, file stats, and both order labels", () => {
    renderWithIntl(
      <SmartDiffViewer
        smartDiff={smartDiff()}
        order="smart"
        onOrderChange={vi.fn()}
        filesCount={9}
        additions={247}
        deletions={38}
      />,
    );
    expect(screen.getByText("Reviewer-ordered diff")).toBeInTheDocument();
    expect(screen.getByText("9 files")).toBeInTheDocument();
    expect(screen.getByText("+247")).toBeInTheDocument();
    expect(screen.getByText("−38")).toBeInTheDocument();
    expect(screen.getByText("Smart order")).toBeInTheDocument();
    expect(screen.getByText("Original order")).toBeInTheDocument();
  });

  it("uses the Files changed eyebrow in Original order", () => {
    renderWithIntl(<SmartDiffViewer smartDiff={smartDiff()} order="original" onOrderChange={vi.fn()} />);
    expect(screen.getByText("Files changed")).toBeInTheDocument();
    expect(screen.queryByText("Reviewer-ordered diff")).not.toBeInTheDocument();
  });

  it("clicking Original order calls onOrderChange('original') exactly once", () => {
    const onOrderChange = vi.fn();
    renderWithIntl(<SmartDiffViewer smartDiff={smartDiff()} order="smart" onOrderChange={onOrderChange} />);
    fireEvent.click(screen.getByText("Original order"));
    expect(onOrderChange).toHaveBeenCalledTimes(1);
    expect(onOrderChange).toHaveBeenCalledWith("original");
  });

  it("clicking the already-active button calls onOrderChange with the same value, not a toggled one", () => {
    const onOrderChange = vi.fn();
    renderWithIntl(<SmartDiffViewer smartDiff={smartDiff()} order="smart" onOrderChange={onOrderChange} />);
    fireEvent.click(screen.getByText("Smart order"));
    expect(onOrderChange).toHaveBeenCalledTimes(1);
    expect(onOrderChange).toHaveBeenCalledWith("smart");
  });

  it("aria-pressed marks the button matching the order prop", () => {
    renderWithIntl(<SmartDiffViewer smartDiff={smartDiff()} order="original" onOrderChange={vi.fn()} />);
    expect(screen.getByText("Original order")).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("Smart order")).toHaveAttribute("aria-pressed", "false");
  });
});

describe("SmartDiffViewer — too_big banner", () => {
  it("too_big: true with two proposed_splits renders the banner plus two split lines", () => {
    renderWithIntl(
      <SmartDiffViewer
        smartDiff={smartDiff({
          split_suggestion: {
            too_big: true,
            total_lines: 900,
            proposed_splits: [
              { name: "alpha", files: ["alpha/a.ts", "alpha/b.ts"] },
              { name: "beta", files: ["beta/a.ts", "beta/b.ts", "beta/c.ts"] },
            ],
          },
        })}
        order="smart"
        onOrderChange={vi.fn()}
      />,
    );
    expect(screen.getByText(/large \(900 reviewable lines\)/)).toBeInTheDocument();
    expect(screen.getByText("alpha (2 files)")).toBeInTheDocument();
    expect(screen.getByText("beta (3 files)")).toBeInTheDocument();
  });

  it("too_big: false renders no banner", () => {
    renderWithIntl(<SmartDiffViewer smartDiff={smartDiff()} order="smart" onOrderChange={vi.fn()} />);
    expect(screen.queryByText(/reviewable lines/)).not.toBeInTheDocument();
  });
});

describe("SmartDiffViewer — empty state", () => {
  it("empty groups renders the empty copy, no toggle, and does not return null", () => {
    const { container } = renderWithIntl(
      <SmartDiffViewer
        smartDiff={{ groups: [], split_suggestion: { too_big: false, total_lines: 0, proposed_splits: [] } }}
        order="smart"
        onOrderChange={vi.fn()}
      />,
    );
    expect(screen.getByText(/No changed files imported yet/)).toBeInTheDocument();
    expect(screen.queryByText("Smart order")).not.toBeInTheDocument();
    expect(container.firstChild).not.toBeNull();
  });

  it("smartDiff=undefined renders the same empty copy, not null", () => {
    const { container } = renderWithIntl(
      <SmartDiffViewer smartDiff={undefined} order="smart" onOrderChange={vi.fn()} />,
    );
    expect(screen.getByText(/No changed files imported yet/)).toBeInTheDocument();
    expect(container.firstChild).not.toBeNull();
  });
});

describe("SmartDiffViewer — lists no files (regression guard)", () => {
  it("does not render a path from the fixture's groups — this component owns no file list", () => {
    renderWithIntl(<SmartDiffViewer smartDiff={smartDiff()} order="smart" onOrderChange={vi.fn()} />);
    expect(screen.queryByText("src/service.ts")).not.toBeInTheDocument();
  });
});

describe("SmartDiffViewer — token hint", () => {
  it("always claims 0 new tokens", () => {
    renderWithIntl(<SmartDiffViewer smartDiff={smartDiff()} order="smart" onOrderChange={vi.fn()} />);
    expect(screen.getByText("0 new tokens")).toBeInTheDocument();
    expect(screen.queryByText(/built on/)).not.toBeInTheDocument();
  });

  it("appends built-on when the last review wave has prompt tokens", () => {
    renderWithIntl(
      <SmartDiffViewer
        smartDiff={smartDiff()}
        order="smart"
        onOrderChange={vi.fn()}
        reviewTokensIn={41177}
      />,
    );
    expect(screen.getByText("0 new tokens")).toBeInTheDocument();
    expect(screen.getByText("built on 41177 from last review")).toBeInTheDocument();
  });
});
