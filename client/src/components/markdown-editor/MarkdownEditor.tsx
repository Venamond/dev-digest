"use client";

import React from "react";
import { Badge, Icon } from "@devdigest/ui";
import { LINE_HEIGHT_PX, s } from "./styles";

export type MarkdownEditorProps = {
  value: string;
  onChange: (value: string) => void;
  fileName: string;
  tokensLabel: string;
  unsavedLabel?: string;
  dirty?: boolean;
  ariaLabel: string;
  fill?: boolean;
  minLines?: number;
};

export function MarkdownEditor({
  value,
  onChange,
  fileName,
  tokensLabel,
  unsavedLabel,
  dirty,
  ariaLabel,
  fill,
  minLines = 1,
}: MarkdownEditorProps) {
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);
  const mirrorRef = React.useRef<HTMLDivElement>(null);
  const lines = React.useMemo(() => value.split("\n"), [value]);
  const contentLineCount = Math.max(lines.length, 1);
  const lineCount = Math.max(contentLineCount, minLines);

  /**
   * Rendered height of each logical line. Text soft-wraps, so one logical line
   * can occupy several visual rows — the gutter has to stretch its number to
   * match, or the numbering drifts out of step with the text below the first
   * wrapped line. Empty until measured; falls back to one row per line.
   */
  const [lineHeights, setLineHeights] = React.useState<number[]>([]);
  /** Textarea content width — remeasure when it changes, since wrapping does. */
  const [contentWidth, setContentWidth] = React.useState(0);

  React.useEffect(() => {
    const el = textareaRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => {
      setContentWidth(el.clientWidth);
    });
    observer.observe(el);
    setContentWidth(el.clientWidth);
    return () => observer.disconnect();
  }, []);

  React.useLayoutEffect(() => {
    const mirror = mirrorRef.current;
    const el = textareaRef.current;
    if (!mirror || !el) return;

    // Match the text box the textarea actually wraps inside: its client width
    // minus horizontal padding.
    const style = window.getComputedStyle(el);
    const padX =
      parseFloat(style.paddingLeft || "0") + parseFloat(style.paddingRight || "0");
    const width = el.clientWidth - padX;
    if (width <= 0) return;

    mirror.style.width = `${width}px`;

    const measured = lines.map((line) => {
      // A blank line still occupies one row; an empty box would collapse to 0.
      mirror.textContent = line.length > 0 ? line : "​";
      return mirror.offsetHeight || LINE_HEIGHT_PX;
    });
    mirror.textContent = "";

    setLineHeights((prev) =>
      prev.length === measured.length && prev.every((h, i) => h === measured[i])
        ? prev
        : measured,
    );
  }, [lines, contentWidth]);

  // Grow the textarea to the full body height in both modes. With `fill`, the
  // outer pane scrolls; without it, the shell grows with the content. Skipping
  // this in fill mode left the textarea at the browser default (~2 rows) so
  // only the top of the first visible line showed over an empty pane.
  React.useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "0px";
    el.style.height = `${Math.max(el.scrollHeight, lineCount * LINE_HEIGHT_PX)}px`;
  }, [value, lineCount, contentWidth]);

  return (
    <div style={fill ? s.shellFill : s.shell}>
      <div style={s.metaBar}>
        <Icon.FileText size={14} style={{ color: "var(--text-muted)" }} />
        <span style={s.fileName}>{fileName}</span>
        {dirty && unsavedLabel != null && (
          // Warn colors, not muted: this is the one signal that a Save click
          // is needed before the body reverts on navigation — it should read
          // at a glance, not blend into the chrome.
          <Badge color="var(--warn)" bg="var(--warn-bg)">
            {unsavedLabel}
          </Badge>
        )}
        <span style={s.tokens}>{tokensLabel}</span>
      </div>
      <div style={fill ? s.paneFill : s.pane}>
        <div style={s.editorRows}>
          <div style={s.gutterCol} aria-hidden data-testid="markdown-editor-gutter">
            {Array.from({ length: lineCount }, (_, i) => {
              const height = lineHeights[i];
              return (
                <div
                  key={i}
                  style={
                    height && height !== LINE_HEIGHT_PX
                      ? { ...s.gutterLine, height }
                      : s.gutterLine
                  }
                >
                  {i + 1}
                </div>
              );
            })}
          </div>
          <textarea
            ref={textareaRef}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            spellCheck={false}
            style={s.textarea}
            aria-label={ariaLabel}
          />
          <div ref={mirrorRef} style={s.mirror} aria-hidden />
        </div>
      </div>
    </div>
  );
}
