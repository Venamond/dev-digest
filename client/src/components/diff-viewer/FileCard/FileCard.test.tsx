import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { PrFile } from "@/lib/types";
import type { FindingRecord } from "@devdigest/shared";
import messages from "../../../../messages/en/shell.json";
import { FileCard } from "./FileCard";

// jsdom has no scrollIntoView — see docs/plans/2026-08-14-smart-diff.md S8's
// risk table for this exact gap.
Element.prototype.scrollIntoView = vi.fn();

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function renderWithIntl(ui: React.ReactElement) {
  return render(<NextIntlClientProvider locale="en" messages={{ shell: messages }}>{ui}</NextIntlClientProvider>);
}

function smallFile(overrides: Partial<PrFile> = {}): PrFile {
  return {
    path: "package-lock.json",
    additions: 3,
    deletions: 1,
    patch: "@@ -1,1 +1,3 @@\n+one\n+two\n-old",
    ...overrides,
  };
}

describe("FileCard — role-aware collapse seed", () => {
  it("a small (+3/-1) boilerplate file still starts collapsed — the size threshold does not rescue it", () => {
    renderWithIntl(<FileCard file={smallFile()} role="boilerplate" />);
    expect(screen.queryByText("one")).not.toBeInTheDocument();
  });

  it("the same small file with role=core starts expanded", () => {
    renderWithIntl(<FileCard file={smallFile({ path: "src/service.ts" })} role="core" />);
    expect(screen.getByText("one")).toBeInTheDocument();
  });

  it("the same small file with no role prop (Original order) starts expanded — role-blind seeding preserved", () => {
    renderWithIntl(<FileCard file={smallFile({ path: "src/service.ts" })} />);
    expect(screen.getByText("one")).toBeInTheDocument();
  });

  it("a 500-line role=core file starts collapsed (existing size rule intact)", () => {
    const bigPatch = ["@@ -1,1 +1,500 @@", ...Array.from({ length: 500 }, (_, i) => `+line${i}`)].join("\n");
    renderWithIntl(
      <FileCard
        file={{ path: "src/big.ts", additions: 500, deletions: 0, patch: bigPatch }}
        role="core"
      />,
    );
    expect(screen.queryByText("line0")).not.toBeInTheDocument();
  });
});

function finding(over: Partial<FindingRecord> = {}): FindingRecord {
  return {
    id: "f1",
    severity: "CRITICAL",
    category: "security",
    title: "Hardcoded secret",
    file: "src/service.ts",
    start_line: 28,
    end_line: 28,
    rationale: "A secret.",
    suggestion: null,
    confidence: 0.9,
    kind: "finding",
    trifecta_components: null,
    evidence: null,
    review_id: "r1",
    accepted_at: null,
    dismissed_at: null,
    ...over,
  };
}

describe("FileCard — findings badge", () => {
  it("renders an 'N findings' button; clicking it calls onOpenFinding with the first id, and does not toggle the card", () => {
    const onOpenFinding = vi.fn();
    renderWithIntl(
      <FileCard
        file={smallFile({ path: "src/service.ts" })}
        role="core"
        findings={[finding({ id: "f1", start_line: 28 }), finding({ id: "f2", start_line: 52 })]}
        onOpenFinding={onOpenFinding}
      />,
    );
    // Card starts open (role=core, small file) — diff text visible.
    expect(screen.getByText("one")).toBeInTheDocument();

    const badge = screen.getByText("2 findings");
    fireEvent.click(badge);

    expect(onOpenFinding).toHaveBeenCalledTimes(1);
    expect(onOpenFinding).toHaveBeenCalledWith("f1");
    // Card must still be open — the badge click must not bubble to the
    // header's own onClick (e.stopPropagation() in FileCard.tsx).
    expect(screen.getByText("one")).toBeInTheDocument();
  });

  it("no findings button when findings is empty or omitted", () => {
    renderWithIntl(<FileCard file={smallFile({ path: "src/service.ts" })} role="core" findings={[]} />);
    expect(screen.queryByText(/findings/)).not.toBeInTheDocument();
  });
});

describe("FileCard — large-file highlight", () => {
  it("nests the two thresholds: 250 collapsed without a chip, 350 collapsed and highlighted, Original omits the chip", () => {
    const mid = smallFile({ path: "src/big.ts", additions: 250, deletions: 0 });
    const { unmount: unmountMid } = renderWithIntl(<FileCard file={mid} smart />);
    expect(screen.queryByText("one")).not.toBeInTheDocument();
    expect(screen.queryByText("Large file")).not.toBeInTheDocument();
    unmountMid();

    const large = smallFile({ path: "src/big.ts", additions: 350, deletions: 0 });
    const { unmount: unmountLarge } = renderWithIntl(<FileCard file={large} smart />);
    expect(screen.queryByText("one")).not.toBeInTheDocument();
    expect(screen.getByText("Large file")).toBeInTheDocument();
    unmountLarge();

    renderWithIntl(<FileCard file={large} />);
    expect(screen.queryByText("Large file")).not.toBeInTheDocument();
  });

  it("opens a large Smart-order file when findings are present, including when they arrive after mount", () => {
    const large = smallFile({ path: "src/big.ts", additions: 350, deletions: 0 });
    const { rerender } = renderWithIntl(<FileCard file={large} role="core" smart />);
    expect(screen.queryByText("one")).not.toBeInTheDocument();
    expect(screen.getByText("Large file")).toBeInTheDocument();

    rerender(
      <NextIntlClientProvider locale="en" messages={{ shell: messages }}>
        <FileCard file={large} role="core" smart findings={[finding({ file: "src/big.ts", start_line: 2 })]} />
      </NextIntlClientProvider>,
    );
    expect(screen.getByText("one")).toBeInTheDocument();
    expect(screen.getByText("Large file")).toBeInTheDocument();
  });

  it("does not let findings open a boilerplate file", () => {
    renderWithIntl(
      <FileCard
        file={smallFile({ additions: 350, deletions: 0 })}
        role="boilerplate"
        smart
        findings={[finding({ file: "package-lock.json", start_line: 2 })]}
      />,
    );
    expect(screen.queryByText("one")).not.toBeInTheDocument();
  });
});

describe("FileCard — per-line finding markers", () => {
  const patchFile = () => smallFile({ path: "src/service.ts" });
  const atLine2 = finding({ file: "src/service.ts", start_line: 2, end_line: 2 });

  it("renders the marker under the matching line in Smart order; click navigates and does not collapse", () => {
    const onOpenFinding = vi.fn();
    renderWithIntl(<FileCard file={patchFile()} role="core" smart findings={[atLine2]} onOpenFinding={onOpenFinding} />);
    expect(screen.getAllByText("Hardcoded secret")).toHaveLength(1);
    fireEvent.click(screen.getByText("Hardcoded secret"));
    expect(onOpenFinding).toHaveBeenCalledTimes(1);
    expect(onOpenFinding).toHaveBeenCalledWith("f1");
    expect(screen.getByText("one")).toBeInTheDocument();
  });

  it("hides the marker in Original order while keeping the findings badge", () => {
    renderWithIntl(<FileCard file={patchFile()} findings={[atLine2]} />);
    expect(screen.queryByText("Hardcoded secret")).not.toBeInTheDocument();
    expect(screen.getByText("1 findings")).toBeInTheDocument();
  });

  it("clicking the badge calls onOpenFinding and does not toggle the card", () => {
    const onOpenFinding = vi.fn();
    renderWithIntl(
      <FileCard file={patchFile()} role="core" smart findings={[atLine2]} onOpenFinding={onOpenFinding} />,
    );
    expect(screen.getByText("one")).toBeInTheDocument();
    fireEvent.click(screen.getByText("1 findings"));
    expect(onOpenFinding).toHaveBeenCalledTimes(1);
    expect(onOpenFinding).toHaveBeenCalledWith("f1");
    expect(screen.getByText("one")).toBeInTheDocument();
  });

  it("does not render a marker for an unanchorable start_line; the badge still navigates", () => {
    const onOpenFinding = vi.fn();
    renderWithIntl(
      <FileCard
        file={patchFile()}
        role="core"
        smart
        findings={[finding({ file: "src/service.ts", start_line: 999, end_line: 999 })]}
        onOpenFinding={onOpenFinding}
      />,
    );
    expect(screen.queryByText("Hardcoded secret")).not.toBeInTheDocument();
    const badge = screen.getByText("1 findings");
    expect(badge).toBeInTheDocument();
    fireEvent.click(badge);
    expect(onOpenFinding).toHaveBeenCalledWith("f1");
  });

  it("renders no marker when the patch is null, but keeps the badge", () => {
    renderWithIntl(
      <FileCard
        file={smallFile({ path: "src/service.ts", patch: null })}
        role="core"
        smart
        findings={[atLine2]}
      />,
    );
    expect(screen.getByText("No diff text available (binary or unfetched patch).")).toBeInTheDocument();
    expect(screen.queryByText("Hardcoded secret")).not.toBeInTheDocument();
    expect(screen.getByText("1 findings")).toBeInTheDocument();
  });

  it("renders two markers when two findings share start_line 2", () => {
    renderWithIntl(
      <FileCard
        file={patchFile()}
        role="core"
        smart
        findings={[
          atLine2,
          finding({ id: "f2", title: "N+1 query", file: "src/service.ts", start_line: 2, end_line: 2 }),
        ]}
      />,
    );
    expect(screen.getByText("Hardcoded secret")).toBeInTheDocument();
    expect(screen.getByText("N+1 query")).toBeInTheDocument();
  });
});
