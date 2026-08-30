import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";
import { MarkdownEditor } from "./MarkdownEditor";

afterEach(cleanup);

function gutterLines(container: HTMLElement) {
  const gutter = container.querySelector('[data-testid="markdown-editor-gutter"]');
  expect(gutter).toBeTruthy();
  return within(gutter as HTMLElement).getAllByText(/^\d+$/);
}

describe("MarkdownEditor", () => {
  it("renders minLines gutter numbers when the value is short", () => {
    const { container } = render(
      <MarkdownEditor
        value="hello"
        onChange={vi.fn()}
        fileName="skill.md"
        tokensLabel="5 tokens"
        ariaLabel="Skill body"
        minLines={5}
      />,
    );
    const lines = gutterLines(container);
    expect(lines).toHaveLength(5);
    expect(lines.map((el) => el.textContent)).toEqual(["1", "2", "3", "4", "5"]);
  });

  it("renders one gutter number per content line when the value is long", () => {
    const value = Array.from({ length: 8 }, (_, i) => `line ${i + 1}`).join("\n");
    const { container } = render(
      <MarkdownEditor
        value={value}
        onChange={vi.fn()}
        fileName="long.md"
        tokensLabel="100 tokens"
        ariaLabel="Skill body"
        minLines={3}
      />,
    );
    const lines = gutterLines(container);
    expect(lines).toHaveLength(8);
    expect(lines.map((el) => el.textContent)).toEqual([
      "1",
      "2",
      "3",
      "4",
      "5",
      "6",
      "7",
      "8",
    ]);
  });

  it("calls onChange when the user types in the textarea", () => {
    const onChange = vi.fn();
    render(
      <MarkdownEditor
        value=""
        onChange={onChange}
        fileName="draft.md"
        tokensLabel="0 tokens"
        ariaLabel="Skill body"
      />,
    );
    fireEvent.change(screen.getByRole("textbox", { name: "Skill body" }), {
      target: { value: "# Title" },
    });
    expect(onChange).toHaveBeenCalledWith("# Title");
  });

  it("shows chrome: filename, tokens label, and unsaved badge when dirty", () => {
    render(
      <MarkdownEditor
        value="body"
        onChange={vi.fn()}
        fileName="my-skill.md"
        tokensLabel="1,234 tokens"
        unsavedLabel="unsaved"
        dirty
        ariaLabel="Skill body"
      />,
    );
    expect(screen.getByText("my-skill.md")).toBeInTheDocument();
    expect(screen.getByText("1,234 tokens")).toBeInTheDocument();
    expect(screen.getByText("unsaved")).toBeInTheDocument();
  });

  // A long rule used to run off the right edge of the working area instead of
  // wrapping, which made the body hard to edit. jsdom has no layout, so these
  // assert the wrapping setup rather than measured line breaks.
  describe("soft wrapping", () => {
    function renderLong() {
      const long = `- ${"a very long house convention sentence ".repeat(10)}`;
      return render(
        <MarkdownEditor
          value={long}
          onChange={vi.fn()}
          fileName="skill.md"
          tokensLabel="99 tokens"
          ariaLabel="Skill body"
        />,
      );
    }

    it("wraps text instead of extending the line horizontally", () => {
      renderLong();
      const textarea = screen.getByRole("textbox", { name: "Skill body" });
      expect(textarea).toHaveStyle({ whiteSpace: "pre-wrap" });
      // Long unbroken tokens (paths, URLs) must break too.
      expect(textarea).toHaveStyle({ overflowWrap: "anywhere" });
    });

    it("does not scroll the pane sideways", () => {
      const { container } = renderLong();
      const pane = container.querySelector('[data-testid="markdown-editor-gutter"]')
        ?.parentElement?.parentElement;
      expect(pane).toHaveStyle({ overflowX: "hidden" });
    });

    it("keeps one gutter number per logical line, not per visual row", () => {
      const { container } = renderLong();
      // One logical line, however many rows it wraps into.
      expect(gutterLines(container)).toHaveLength(1);
    });

    it("renders a hidden mirror used to measure wrapped line heights", () => {
      const { container } = renderLong();
      const mirror = container.querySelector('div[aria-hidden][style*="visibility"]');
      expect(mirror).toBeTruthy();
      expect(mirror).toHaveStyle({ visibility: "hidden" });
    });
  });
});
