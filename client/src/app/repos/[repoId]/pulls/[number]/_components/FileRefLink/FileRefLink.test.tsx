import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { FileRefLink } from "./FileRefLink";
import { parseFileRef } from "./helpers";

afterEach(cleanup);

/** A real path from this repository: 78 characters, six leading segments every
 *  neighbouring path also has, and the part that tells rows apart at the end. */
const REAL_PATH =
  "client/src/app/repos/[repoId]/pulls/[number]/_components/DiffTab/DiffTab.tsx";

function renderRef(fileRef: string) {
  return render(<FileRefLink fileRef={fileRef} repoId="r1" prNumber={7} />);
}

describe("parseFileRef", () => {
  it("splits a trailing line number", () => {
    expect(parseFileRef("src/config.ts:12")).toEqual({ path: "src/config.ts", line: 12 });
  });

  it("takes the START line of a range", () => {
    expect(parseFileRef("src/mw.ts:12-18")).toEqual({ path: "src/mw.ts", line: 12 });
  });

  it("leaves a reference with no line alone", () => {
    expect(parseFileRef("src/config.ts")).toEqual({ path: "src/config.ts", line: null });
  });
});

describe("FileRefLink", () => {
  it("links into the Files changed tab at that file and line (AC-29)", () => {
    renderRef("src/config.ts:12");
    expect(screen.getByRole("link")).toHaveAttribute(
      "href",
      "/repos/r1/pulls/7?tab=diff&file=src%2Fconfig.ts&line=12",
    );
  });

  it("targets the start line of a range", () => {
    renderRef("src/mw.ts:12-18");
    expect(screen.getByRole("link").getAttribute("href")).toContain("&line=12");
  });

  it("omits the line parameter when the reference carries none", () => {
    renderRef("src/config.ts");
    const href = screen.getByRole("link").getAttribute("href") ?? "";
    expect(href).toBe("/repos/r1/pulls/7?tab=diff&file=src%2Fconfig.ts");
    expect(href).not.toContain("line=");
  });

  it("renders the path's TAIL while the whole path stays in the href and the tooltip (AC-30)", () => {
    // The trap case: against this repo's real paths, wrapping alone leaves every
    // row looking identical (client/INSIGHTS.md:120-129). All three assertions
    // matter — the tail is what is read, the href and the title are what is kept.
    renderRef(REAL_PATH);
    const link = screen.getByRole("link");
    expect(link).toHaveTextContent("…/_components/DiffTab/DiffTab.tsx");
    expect(link.getAttribute("href")).toContain(encodeURIComponent(REAL_PATH));
    expect(link).toHaveAttribute("title", REAL_PATH);
  });

  it("carries the shared hover class so the affordance matches BlastCard's file links", () => {
    renderRef("src/config.ts:12");
    expect(screen.getByRole("link")).toHaveClass("dd-fileref");
  });

  /* AC-40: the `line` prop is the line the SERVER attached from a finding. */
  it("renders and links the server-attached line for a reference that has none", () => {
    render(<FileRefLink fileRef="src/config.ts" line={12} repoId="r1" prNumber={7} />);
    const link = screen.getByRole("link");
    expect(link).toHaveTextContent("src/config.ts:12");
    expect(link).toHaveAttribute("href", "/repos/r1/pulls/7?tab=diff&file=src%2Fconfig.ts&line=12");
  });

  it("falls back to the reference's own line when none was attached", () => {
    render(<FileRefLink fileRef="src/config.ts:9" line={null} repoId="r1" prNumber={7} />);
    expect(screen.getByRole("link").getAttribute("href")).toContain("line=9");
  });

  it("renders a reference with no path as plain text, never a broken link", () => {
    renderRef(":12");
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    expect(screen.getByText(":12")).toBeInTheDocument();
  });
});
