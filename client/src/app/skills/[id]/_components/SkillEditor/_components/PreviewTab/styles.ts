import type { CSSProperties } from "react";

export const s = {
  wrap: { maxWidth: 760 } satisfies CSSProperties,
  header: { marginBottom: 16 } satisfies CSSProperties,
  h2: { fontSize: 18, fontWeight: 700 } satisfies CSSProperties,
  subtitle: { fontSize: 13, color: "var(--text-secondary)", marginTop: 4 } satisfies CSSProperties,
  panel: {
    padding: 20,
    borderRadius: 10,
    border: "1px solid var(--border)",
    background: "var(--bg-elevated)",
  } satisfies CSSProperties,
  empty: { fontSize: 14, color: "var(--text-muted)" } satisfies CSSProperties,
} as const;
