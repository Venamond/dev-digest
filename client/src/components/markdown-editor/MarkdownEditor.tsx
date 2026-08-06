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
  const contentLineCount = Math.max(value.split("\n").length, 1);
  const lineCount = Math.max(contentLineCount, minLines);

  React.useEffect(() => {
    if (fill) return;
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "0px";
    el.style.height = `${Math.max(el.scrollHeight, lineCount * LINE_HEIGHT_PX)}px`;
  }, [value, fill, lineCount]);

  return (
    <div style={fill ? s.shellFill : s.shell}>
      <div style={s.metaBar}>
        <Icon.FileText size={14} style={{ color: "var(--text-muted)" }} />
        <span style={s.fileName}>{fileName}</span>
        {dirty && unsavedLabel != null && (
          <Badge color="var(--text-muted)">{unsavedLabel}</Badge>
        )}
        <span style={s.tokens}>{tokensLabel}</span>
      </div>
      <div style={fill ? s.paneFill : s.pane}>
        <div style={s.editorRows}>
          <div style={s.gutterCol} aria-hidden data-testid="markdown-editor-gutter">
            {Array.from({ length: lineCount }, (_, i) => (
              <div key={i} style={s.gutterLine}>
                {i + 1}
              </div>
            ))}
          </div>
          <textarea
            ref={textareaRef}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            spellCheck={false}
            style={s.textarea}
            aria-label={ariaLabel}
          />
        </div>
      </div>
    </div>
  );
}
