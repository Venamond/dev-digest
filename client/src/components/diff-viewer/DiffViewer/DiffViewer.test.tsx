import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { PrFile } from "@/lib/types";
import type { FindingRecord, SmartDiff } from "@devdigest/shared";
import messages from "../../../../messages/en/shell.json";
import { DiffViewer } from "./DiffViewer";

// jsdom has no scrollIntoView.
Element.prototype.scrollIntoView = vi.fn();

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function renderWithIntl(ui: React.ReactElement) {
  return render(<NextIntlClientProvider locale="en" messages={{ shell: messages }}>{ui}</NextIntlClientProvider>);
}

const CORE_FILE: PrFile = {
  path: "src/service.ts",
  additions: 5,
  deletions: 0,
  patch: "@@ -1,1 +1,2 @@\n+coreLine",
};
const WIRING_FILE: PrFile = {
  path: "package.json",
  additions: 2,
  deletions: 0,
  patch: "@@ -1,1 +1,2 @@\n+wiringLine",
};
const BOILERPLATE_FILE: PrFile = {
  path: "pnpm-lock.yaml",
  additions: 3,
  deletions: 1,
  patch: "@@ -1,1 +1,3 @@\n+lockLine",
};
const LEFTOVER_FILE: PrFile = {
  path: "src/orphan.ts",
  additions: 1,
  deletions: 0,
  patch: "@@ -1,1 +1,2 @@\n+orphanLine",
};

function smartDiff(): SmartDiff {
  return {
    groups: [
      { role: "core", files: [{ path: CORE_FILE.path, pseudocode_summary: null, additions: 5, deletions: 0, finding_lines: [] }] },
      { role: "wiring", files: [{ path: WIRING_FILE.path, pseudocode_summary: null, additions: 2, deletions: 0, finding_lines: [] }] },
      { role: "boilerplate", files: [{ path: BOILERPLATE_FILE.path, pseudocode_summary: null, additions: 3, deletions: 1, finding_lines: [] }] },
    ],
    split_suggestion: { too_big: false, total_lines: 7, proposed_splits: [] },
  };
}

describe("DiffViewer — grouped=false / Original order", () => {
  it("renders the flat, ungrouped list exactly as before this feature", () => {
    renderWithIntl(<DiffViewer files={[CORE_FILE, BOILERPLATE_FILE]} smartDiff={smartDiff()} grouped={false} />);
    expect(screen.queryByText("Core logic")).not.toBeInTheDocument();
    expect(screen.queryByText("Boilerplate & lock files")).not.toBeInTheDocument();
    // Small boilerplate file expanded in Original order (role-blind seeding).
    expect(screen.getByText("lockLine")).toBeInTheDocument();
  });
});

describe("DiffViewer — grouped=true / Smart order", () => {
  it("renders group sections in server-provided order, boilerplate group collapsed by default", () => {
    renderWithIntl(
      <DiffViewer files={[CORE_FILE, WIRING_FILE, BOILERPLATE_FILE]} smartDiff={smartDiff()} grouped />,
    );
    const headers = screen.getAllByRole("button", { name: /Core logic|Wiring & config|Boilerplate & lock files/ });
    expect(headers.map((h) => h.textContent)).toEqual([
      expect.stringContaining("Core logic"),
      expect.stringContaining("Wiring & config"),
      expect.stringContaining("Boilerplate & lock files"),
    ]);
    // Boilerplate group starts collapsed: its file's diff text is absent.
    expect(screen.queryByText("lockLine")).not.toBeInTheDocument();
    // Core group starts open.
    expect(screen.getByText("coreLine")).toBeInTheDocument();

    fireEvent.click(screen.getByText("Boilerplate & lock files"));
    expect(screen.queryByText("lockLine")).not.toBeInTheDocument(); // still collapsed at FileCard level (role=boilerplate)
  });

  it("a file present in files but absent from any smartDiff group renders in an Other files section rather than vanishing", () => {
    renderWithIntl(
      <DiffViewer files={[CORE_FILE, LEFTOVER_FILE]} smartDiff={smartDiff()} grouped />,
    );
    expect(screen.getByText("Other files")).toBeInTheDocument();
    expect(screen.getByText("orphanLine")).toBeInTheDocument();
  });
});

describe("DiffViewer — no smart-diff data", () => {
  it("smartDiff=null renders identical output to today's flat list, no crash", () => {
    renderWithIntl(<DiffViewer files={[CORE_FILE]} smartDiff={null} grouped />);
    expect(screen.queryByText("Core logic")).not.toBeInTheDocument();
    expect(screen.getByText("coreLine")).toBeInTheDocument();
  });
});

function finding(over: Partial<FindingRecord> = {}): FindingRecord {
  return {
    id: "f1",
    severity: "CRITICAL",
    category: "security",
    title: "Hardcoded secret",
    file: CORE_FILE.path,
    start_line: 1,
    end_line: 1,
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

describe("DiffViewer — finding markers", () => {
  it("renders the marker inside the core group in Smart order; click calls onOpenFinding", () => {
    const onOpenFinding = vi.fn();
    renderWithIntl(
      <DiffViewer
        files={[CORE_FILE, WIRING_FILE, BOILERPLATE_FILE]}
        smartDiff={smartDiff()}
        grouped
        findings={[finding()]}
        onOpenFinding={onOpenFinding}
      />,
    );
    expect(screen.getByText("Hardcoded secret")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Hardcoded secret"));
    expect(onOpenFinding).toHaveBeenCalledWith("f1");
  });

  it("hides the marker in Original order while keeping the findings badge", () => {
    renderWithIntl(
      <DiffViewer files={[CORE_FILE]} smartDiff={smartDiff()} grouped={false} findings={[finding()]} />,
    );
    expect(screen.queryByText("Hardcoded secret")).not.toBeInTheDocument();
    expect(screen.getByText("1 findings")).toBeInTheDocument();
  });

  it("renders a leftover-file marker inside Other files", () => {
    renderWithIntl(
      <DiffViewer
        files={[CORE_FILE, LEFTOVER_FILE]}
        smartDiff={smartDiff()}
        grouped
        findings={[finding({ file: LEFTOVER_FILE.path })]}
      />,
    );
    expect(screen.getByText("Other files")).toBeInTheDocument();
    expect(screen.getByText("Hardcoded secret")).toBeInTheDocument();
  });
});
