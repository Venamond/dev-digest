"use client";

import { Icon } from "@devdigest/ui";
import type { PrCommit } from "@devdigest/shared";
import { commitRowStyle } from "./styles";

export function CommitRow({ commit: c }: { commit: PrCommit }) {
  return (
    <div style={commitRowStyle}>
      <Icon.GitCommit size={15} style={{ color: "var(--text-muted)", flexShrink: 0 }} />
      <span className="mono" style={{ fontSize: 12, color: "var(--text-secondary)", flexShrink: 0 }}>
        {c.sha.slice(0, 7)}
      </span>
      <span
        style={{
          fontSize: 12.5,
          color: "var(--text-secondary)",
          flex: 1,
          minWidth: 0,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
        title={c.message}
      >
        {c.message.split("\n")[0]}
      </span>
      <span style={{ fontSize: 11, color: "var(--text-muted)", flexShrink: 0 }}>{c.author}</span>
      {c.committed_at && (
        <span style={{ fontSize: 11, color: "var(--text-muted)", flexShrink: 0 }}>
          {new Date(c.committed_at).toLocaleTimeString()}
        </span>
      )}
    </div>
  );
}
