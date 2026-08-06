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
});
