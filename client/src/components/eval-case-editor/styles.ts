import type { CSSProperties } from "react";

/** Co-located styles for the eval-case editor modal (mockup `EvalCaseEditor`,
    img/mockup-src/screen_ciruns_and_eval_case_editor.jsx:56-104). */
export const s = {
  footer: { display: "flex", alignItems: "center", gap: 8 } satisfies CSSProperties,
  runOnSave: {
    display: "flex",
    alignItems: "center",
    gap: 7,
    fontSize: 12.5,
    color: "var(--text-secondary)",
    marginRight: "auto",
  } satisfies CSSProperties,

  body: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 0,
    height: 480,
  } satisfies CSSProperties,
  left: {
    borderRight: "1px solid var(--border)",
    display: "flex",
    flexDirection: "column",
    minWidth: 0,
    // Grid item, fixed-height parent: without this it grows to fit its
    // children instead of constraining them, and `tabBody`'s scrollbar never
    // appears because there is no height to overflow.
    minHeight: 0,
  } satisfies CSSProperties,
  right: {
    display: "flex",
    flexDirection: "column",
    minWidth: 0,
    // `body` is a grid with a fixed 480px height, and a grid item defaults to
    // `min-height: auto` — without this the column grows to fit its children
    // and spills past the modal instead of constraining them.
    minHeight: 0,
    // `auto`, not `hidden`. Three rounds were spent tuning flex so everything
    // fit inside the fixed 480px column; `hidden` turns any miscalculation
    // into an element the user cannot reach at all, while `auto` degrades to a
    // scrollbar. A layout that cannot silently swallow its own content is
    // worth more here than one that is exactly right when the maths holds.
    overflow: "auto",
  } satisfies CSSProperties,

  banner: (negative: boolean): CSSProperties => ({
    margin: "12px 16px 0",
    padding: "9px 12px",
    borderRadius: 8,
    display: "flex",
    // `flex-start`, not `center`: the reference puts the kind label on its own
    // line above the assertion, so the icon aligns to the first line rather
    // than to the middle of a two-line block.
    alignItems: "flex-start",
    gap: 9,
    /* Amber for the negative kind, accent for the positive — the reference
       draws the `NEGATIVE CASE` banner in orange, and a neutral grey box made
       the two kinds read as the same control with different words in it. The
       colour is the fastest signal of which assertion you are authoring, and
       it is the one thing on this screen that inverts the meaning of every
       field below. */
    border: "1px solid " + (negative ? "var(--warn)" : "var(--accent)"),
    background: negative ? "var(--warn-bg)" : "var(--accent-bg)",
  }),
  bannerText: {
    fontSize: 12,
    color: "var(--text-secondary)",
    // Block, so the kind label above it is a line of its own.
    display: "block",
  } satisfies CSSProperties,
  bannerKind: (negative: boolean): CSSProperties => ({
    color: negative ? "var(--warn)" : "var(--accent-text)",
    textTransform: "uppercase",
    fontSize: 10.5,
    letterSpacing: "0.05em",
    fontWeight: 700,
    // Its own line above the assertion, as the reference draws it — inline it
    // ran together with the sentence and read as a prefix.
    display: "block",
    marginBottom: 3,
  }),

  namePad: { padding: "14px 16px 0" } satisfies CSSProperties,
  /* Same control as the skill case editor's expectation picker
     (`components/skill-eval-case-editor/styles.ts`). A hand-written case has
     no disposition to derive its kind from, so without this the agent editor
     could only ever produce `must_find` — change the two together. */
  expectationTabs: { display: "flex", gap: 6 } satisfies CSSProperties,
  expectationTab: (on: boolean): CSSProperties => ({
    fontSize: 12,
    fontWeight: 600,
    padding: "4px 10px",
    borderRadius: 6,
    cursor: "pointer",
    border: "1px solid " + (on ? "var(--accent)" : "var(--border-strong)"),
    background: on ? "var(--accent-bg)" : "transparent",
    color: on ? "var(--accent-text)" : "var(--text-secondary)",
  }),
  inputHeadingPad: { padding: "0 16px" } satisfies CSSProperties,
  inputHeading: {
    fontSize: 12.5,
    fontWeight: 600,
    color: "var(--text-secondary)",
    marginBottom: 7,
  } satisfies CSSProperties,
  // `overflow: auto` alone does nothing here: a flex child defaults to
  // `min-height: auto`, so it never shrinks below its content and there is
  // nothing to scroll. The diff pane was cut off at the bottom of the modal
  // with no scrollbar until `minHeight: 0` was added.
  // A bordered box, matching the reference and the two panels in the right
  // column — the content was previously bare against the modal background.
  tabBody: {
    flex: 1,
    overflow: "auto",
    padding: 12,
    margin: "12px 16px 16px",
    minHeight: 0,
    background: "var(--code-bg)",
    borderRadius: 7,
    border: "1px solid var(--border)",
  } satisfies CSSProperties,
  /* Same frame, but the textarea inside owns the padding and the scrolling. */
  tabBodyEditing: {
    flex: 1,
    overflow: "hidden",
    padding: 0,
    margin: "12px 16px 16px",
    minHeight: 0,
    background: "var(--code-bg)",
    borderRadius: 7,
    border: "1px solid var(--border)",
  } satisfies CSSProperties,

  diff: {
    margin: 0,
    fontSize: 11.5,
    lineHeight: 1.6,
    whiteSpace: "pre-wrap",
    color: "var(--text-primary)",
  } satisfies CSSProperties,
  /* `tabBody` is ALREADY the bordered `--code-bg` box and already scrolls, so
     the editable pane must be the box's content, not a second box inside it —
     a textarea with its own border, background and overflow produced a doubled
     frame and two scrollbars (reported 2026-08-29, `img/12.png`). It fills the
     parent edge to edge, which also puts the browser's focus ring on the box's
     own outline instead of inside it. Pair with `tabBodyEditing` below, which
     hands scrolling over: a textarea always scrolls itself. */
  diffInput: {
    display: "block",
    width: "100%",
    height: "100%",
    resize: "none",
    margin: 0,
    padding: 12,
    border: "none",
    borderRadius: 7,
    background: "transparent",
    color: "var(--text-primary)",
    fontSize: 11.5,
    lineHeight: 1.6,
    whiteSpace: "pre",
    overflow: "auto",
  } satisfies CSSProperties,
  diffLine: (kind: "add" | "del" | "hunk" | "plain"): CSSProperties => ({
    background: kind === "add" ? "var(--code-add)" : kind === "del" ? "var(--code-del)" : "transparent",
    color: kind === "hunk" ? "var(--accent-text)" : "inherit",
  }),

  filesWrap: { display: "flex", gap: 10 } satisfies CSSProperties,
  fileList: {
    width: 130,
    borderRight: "1px solid var(--border)",
    paddingRight: 10,
  } satisfies CSSProperties,
  fileItem: (active: boolean): CSSProperties => ({
    fontSize: 11.5,
    color: active ? "var(--accent-text)" : "var(--text-secondary)",
    padding: "4px 6px",
    background: active ? "var(--accent-bg)" : "transparent",
    borderRadius: 5,
    cursor: "pointer",
  }),
  filePre: {
    margin: 0,
    fontSize: 11.5,
    color: "var(--text-secondary)",
    flex: 1,
    whiteSpace: "pre-wrap",
  } satisfies CSSProperties,
  readOnlyValue: {
    fontSize: 13,
    color: "var(--text-secondary)",
    padding: "8px 0",
    whiteSpace: "pre-wrap",
  } satisfies CSSProperties,
  empty: { fontSize: 12, color: "var(--text-muted)" } satisfies CSSProperties,

  expectedHeader: {
    padding: "14px 16px 8px",
    display: "flex",
    alignItems: "center",
    gap: 8,
  } satisfies CSSProperties,
  expectedTitle: {
    fontSize: 12.5,
    fontWeight: 600,
    color: "var(--text-secondary)",
  } satisfies CSSProperties,
  expectedActions: { marginLeft: "auto", display: "flex", gap: 6 } satisfies CSSProperties,
  expectedArea: {
    margin: "0 16px",
    padding: 12,
    fontSize: 11.5,
    lineHeight: 1.55,
    background: "var(--code-bg)",
    borderRadius: 7,
    color: "var(--text-primary)",
    overflow: "auto",
    flex: 1,
    // A flex child defaults to `min-height: auto` and refuses to shrink below
    // its content, which pushes the panel below it out of the modal.
    minHeight: 0,
    border: "1px solid var(--border)",
    resize: "none",
  } satisfies CSSProperties,

  /* Not on the agent mockup — added on the human's request (2026-08-29) after
     the reference video showed it, so a run's real output is readable beside
     the expectation instead of only as a one-line verdict. */
  actualPanel: {
    // Bottom margin is not decoration: without it the panel sits flush against
    // the column's edge and reads as clipped even when it rendered in full.
    margin: "12px 16px 16px",
    // The expected-output textarea is `flex: 1` in this column, so without
    // `flexShrink: 0` this panel is squeezed to nothing and never appears.
    // The height cap is the other half: the column is a fixed 480px, so an
    // unbounded panel pushes itself past the modal's edge instead.
    // The reference gives Actual output a block of its own, roughly equal to
    // Expected output above it — not a strip at the bottom edge. `flex: 1` on
    // both makes them share the column; `minHeight: 0` lets this one actually
    // shrink so its inner box can scroll.
    flex: 1,
    minHeight: 0,
    display: "flex",
    flexDirection: "column",
  } satisfies CSSProperties,
  // Same weight and case as `expectedTitle` — the reference labels the two
  // panels identically; an uppercase micro-label reads as a caption, not as
  // the twin of the box above it.
  actualTitle: {
    fontSize: 12.5,
    fontWeight: 600,
    color: "var(--text-secondary)",
    marginBottom: 8,
  } satisfies CSSProperties,
  /* The box, not just the text. In the reference `Actual output` is the same
     bordered, code-background block as `Expected output` above it; rendering
     bare text under a heading reads as "the panel has no field". */
  actualBox: {
    flex: 1,
    minHeight: 0,
    overflow: "auto",
    padding: 12,
    background: "var(--code-bg)",
    borderRadius: 7,
    border: "1px solid var(--border)",
  } satisfies CSSProperties,
  actualEmpty: { fontSize: 12, color: "var(--text-muted)" } satisfies CSSProperties,
  actualJson: {
    fontSize: 11,
    lineHeight: 1.45,
    whiteSpace: "pre-wrap",
    color: "var(--text-secondary)",
    margin: 0,
    overflow: "auto",
    minHeight: 0,
  } satisfies CSSProperties,
  result: (passed: boolean): CSSProperties => ({
    margin: "12px 16px 16px",
    padding: "11px 13px",
    borderRadius: 8,
    border: "1px solid " + (passed ? "rgba(16,185,129,0.3)" : "var(--border-strong)"),
    background: passed ? "var(--ok-bg)" : "var(--bg-elevated)",
    display: "flex",
    alignItems: "center",
    gap: 9,
  }),
  resultText: { fontSize: 12.5, color: "var(--text-secondary)" } satisfies CSSProperties,
  resultStrong: { color: "var(--text-primary)", fontWeight: 700 } satisfies CSSProperties,
} as const;
