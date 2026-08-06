import type { CSSProperties } from "react";

const TYPE_COLOR: Record<string, string> = {
  rubric: "#3b82f6",
  convention: "#10b981",
  security: "#ef4444",
  custom: "#999999",
};

/** Co-located styles for the SkillEditor shell. */
export const s = {
  wrap: { flex: 1, display: "flex", flexDirection: "column", minWidth: 0 } satisfies CSSProperties,
  header: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "16px 24px 0",
  } satisfies CSSProperties,
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
    fontSize: 15,
    fontWeight: 700,
    color: "var(--text-primary)",
  } satisfies CSSProperties,
  typeBadge: (type: string): CSSProperties => {
    const c = TYPE_COLOR[type] ?? TYPE_COLOR.custom;
    return {
      fontSize: 11,
      fontWeight: 600,
      color: c,
      background: c + "1a",
      padding: "2px 8px",
      borderRadius: 4,
    };
  },
  tabsBar: { marginTop: 14 } satisfies CSSProperties,
  body: { flex: 1, overflow: "auto", padding: 28 } satisfies CSSProperties,
} as const;
