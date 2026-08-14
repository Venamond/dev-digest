import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { PrFile } from "@/lib/types";
import type { DiffLineTarget } from "../target";
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

describe("FileCard — findings badge", () => {
  it("renders an 'N findings' button; clicking it calls onJumpToLine with the first line, and does not toggle the card", () => {
    const onJumpToLine = vi.fn();
    renderWithIntl(
      <FileCard
        file={smallFile({ path: "src/service.ts" })}
        role="core"
        findingLines={[28, 52]}
        onJumpToLine={onJumpToLine}
      />,
    );
    // Card starts open (role=core, small file) — diff text visible.
    expect(screen.getByText("one")).toBeInTheDocument();

    const badge = screen.getByText("2 findings");
    fireEvent.click(badge);

    expect(onJumpToLine).toHaveBeenCalledTimes(1);
    expect(onJumpToLine).toHaveBeenCalledWith("src/service.ts", 28);
    // Card must still be open — the badge click must not bubble to the
    // header's own onClick (e.stopPropagation() in FileCard.tsx).
    expect(screen.getByText("one")).toBeInTheDocument();
  });

  it("no findings button when findingLines is empty or omitted", () => {
    renderWithIntl(<FileCard file={smallFile({ path: "src/service.ts" })} role="core" findingLines={[]} />);
    expect(screen.queryByText(/findings/)).not.toBeInTheDocument();
  });
});

describe("FileCard — target force-expand + scroll", () => {
  const target = (over: Partial<DiffLineTarget> = {}): DiffLineTarget => ({
    path: "package-lock.json",
    line: 999,
    nonce: 1,
    ...over,
  });

  it("a matching target expands a collapsed card and calls scrollIntoView once", () => {
    const scrollSpy = Element.prototype.scrollIntoView as ReturnType<typeof vi.fn>;
    renderWithIntl(<FileCard file={smallFile()} role="boilerplate" target={target({ line: 1 })} />);
    // Collapsed-by-role card force-expanded by the matching target.
    expect(screen.getByText("one")).toBeInTheDocument();
    expect(scrollSpy).toHaveBeenCalledTimes(1);
  });

  it("a target.line present in no hunk still expands the card and calls scrollIntoView (rootRef fallback), without throwing", () => {
    const scrollSpy = Element.prototype.scrollIntoView as ReturnType<typeof vi.fn>;
    renderWithIntl(<FileCard file={smallFile()} role="boilerplate" target={target({ line: 12345 })} />);
    expect(screen.getByText("one")).toBeInTheDocument();
    expect(scrollSpy).toHaveBeenCalledTimes(1);
  });

  it("a target for another path leaves this card untouched and calls scrollIntoView zero times", () => {
    const scrollSpy = Element.prototype.scrollIntoView as ReturnType<typeof vi.fn>;
    renderWithIntl(
      <FileCard file={smallFile()} role="boilerplate" target={target({ path: "other/file.ts", line: 1 })} />,
    );
    expect(screen.queryByText("one")).not.toBeInTheDocument();
    expect(scrollSpy).not.toHaveBeenCalled();
  });

  it("bumping only nonce fires the scroll again", () => {
    const scrollSpy = Element.prototype.scrollIntoView as ReturnType<typeof vi.fn>;
    const { rerender } = renderWithIntl(
      <FileCard file={smallFile()} role="boilerplate" target={target({ line: 1, nonce: 1 })} />,
    );
    expect(scrollSpy).toHaveBeenCalledTimes(1);
    rerender(
      <NextIntlClientProvider locale="en" messages={{ shell: messages }}>
        <FileCard file={smallFile()} role="boilerplate" target={target({ line: 1, nonce: 2 })} />
      </NextIntlClientProvider>,
    );
    expect(scrollSpy).toHaveBeenCalledTimes(2);
  });
});
