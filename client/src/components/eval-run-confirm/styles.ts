import type { CSSProperties } from "react";

/** Co-located styles for EvalRunConfirm. */
export const s = {
  body: { padding: "18px 24px", display: "grid", gap: 10 } satisfies CSSProperties,
  calls: { fontSize: 14, color: "var(--text-primary)" } satisfies CSSProperties,
  note: { fontSize: 13, color: "var(--text-secondary)" } satisfies CSSProperties,
  footer: {
    display: "flex",
    justifyContent: "flex-end",
    gap: 10,
  } satisfies CSSProperties,
} as const;
