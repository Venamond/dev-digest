import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { FindingRecord } from "@devdigest/shared";
import messages from "../../../../../../../messages/en/prReview.json";
import { FindingsPreviewPanel } from "./FindingsPreviewPanel";

afterEach(cleanup);

function finding(o: Partial<FindingRecord>): FindingRecord {
  return {
    id: "f-1",
    review_id: "rv-1",
    severity: "WARNING",
    category: "bug",
    title: "Some finding",
    file: "src/a.ts",
    start_line: 1,
    end_line: 1,
    rationale: "A short rationale.",
    suggestion: null,
    confidence: 0.8,
    kind: "finding",
    trifecta_components: null,
    evidence: null,
    accepted_at: null,
    dismissed_at: null,
    ...o,
  };
}

function renderPanel(findings: FindingRecord[], count = findings.length, loading = false) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
      <FindingsPreviewPanel findings={findings} count={count} loading={loading} />
    </NextIntlClientProvider>,
  );
}

describe("FindingsPreviewPanel", () => {
  it("renders nothing when there are no findings and it isn't loading", () => {
    const { container } = renderPanel([]);
    expect(container).toBeEmptyDOMElement();
  });

  it("shows the total count in the header", () => {
    renderPanel([finding({})], 1);
    expect(screen.getByText("1 FINDINGS")).toBeInTheDocument();
  });

  it("sorts findings critical → warning → suggestion", () => {
    renderPanel([
      finding({ id: "w", severity: "WARNING", title: "A warning" }),
      finding({ id: "c", severity: "CRITICAL", title: "A critical" }),
      finding({ id: "s", severity: "SUGGESTION", title: "A suggestion" }),
    ]);
    const titles = screen
      .getAllByText(/^A (critical|warning|suggestion)$/)
      .map((el) => el.textContent);
    expect(titles).toEqual(["A critical", "A warning", "A suggestion"]);
  });

  it("renders the finding's file:line, category and confidence", () => {
    renderPanel([finding({ file: "src/config.ts", start_line: 12, end_line: 12, category: "security" })]);
    expect(screen.getByText("src/config.ts:12")).toBeInTheDocument();
    expect(screen.getByText("security")).toBeInTheDocument();
    expect(screen.getByText("80% conf")).toBeInTheDocument();
  });

  it("shows an error message when error is true, even with no findings", () => {
    render(
      <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
        <FindingsPreviewPanel findings={[]} count={0} loading={false} error />
      </NextIntlClientProvider>,
    );
    expect(screen.getByText("Couldn't load findings")).toBeInTheDocument();
  });
});
