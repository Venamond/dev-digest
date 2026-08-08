import type { CSSProperties } from "react";

const TYPE_COLOR: Record<string, string> = {
  rubric: "#3b82f6",
  convention: "#10b981",
  security: "#ef4444",
  custom: "#999999",
};

/** Co-located styles for SkillCard — matches design SkillListItem. */
export const s = {
  typeColor: (type: string) => TYPE_COLOR[type] ?? TYPE_COLOR.custom,
  card: (active: boolean, enabled: boolean): CSSProperties => ({
    padding: "10px 12px",
    borderRadius: 7,
    cursor: "pointer",
    border: "1px solid " + (active ? "var(--border-strong)" : "var(--border)"),
    background: active ? "var(--bg-hover)" : "var(--bg-elevated)",
    opacity: enabled ? 1 : 0.6,
    marginBottom: 2,
  }),
  headerRow: { display: "flex", alignItems: "center", gap: 8 } satisfies CSSProperties,
  iconBox: (type: string): CSSProperties => {
    const c = TYPE_COLOR[type] ?? TYPE_COLOR.custom;
    return {
      width: 26,
      height: 26,
      borderRadius: 7,
      background: c + "1a",
      color: c,
      display: "grid",
      placeItems: "center",
      flexShrink: 0,
    };
  },
  name: {
    fontFamily: "var(--font-mono, ui-monospace, SFMono-Regular, Menlo, monospace)",
    fontSize: 12.5,
    fontWeight: 600,
    flex: 1,
    minWidth: 0,
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
    color: "var(--text-primary)",
  } satisfies CSSProperties,
  trashBtn: (pending: boolean): CSSProperties => ({
    background: "none",
    border: "none",
    cursor: pending ? "not-allowed" : "pointer",
    color: "var(--text-muted)",
    display: "inline-flex",
    padding: 4,
  }),
  description: {
    fontSize: 11.5,
    color: "var(--text-muted)",
    marginTop: 4,
    lineHeight: 1.4,
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  } satisfies CSSProperties,
  metaRow: {
    display: "flex",
    gap: 6,
    marginTop: 7,
    alignItems: "center",
  } satisfies CSSProperties,
  typeTag: (type: string): CSSProperties => {
    const c = TYPE_COLOR[type] ?? TYPE_COLOR.custom;
    return {
      fontSize: 10.5,
      fontWeight: 600,
      color: c,
      background: c + "1a",
      padding: "1px 6px",
      borderRadius: 4,
    };
  },
  sourceTag: {
    display: "inline-flex",
    alignItems: "center",
    gap: 3,
    fontSize: 10.5,
    color: "var(--text-muted)",
  } satisfies CSSProperties,
  statsRow: {
    display: "flex",
    gap: 8,
    marginTop: 8,
    paddingTop: 8,
    borderTop: "1px solid var(--border)",
    fontSize: 11,
    color: "var(--text-muted)",
    minWidth: 0,
    flexWrap: "wrap",
    alignItems: "center",
  } satisfies CSSProperties,
  accept: (rate: number | null): CSSProperties => {
    if (rate == null) return {};
    return { color: rate >= 0.6 ? "var(--ok)" : "var(--warn)" };
  },
} as const;
