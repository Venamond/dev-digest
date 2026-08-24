import type { CSSProperties } from "react";

/* Laid out to mockup M1: a fixed-width rail carrying its own heading, toolbar,
   list and footer, separated from the detail pane by a single vertical rule.
   No page-level title and no card gap — the mockup has neither. */
export const s = {
  /* The app's established full-height split: `AgentsListView`, `SkillsListView`
     and `SettingsView` all size against `calc(100vh - 52px)`. `minHeight: 100%`
     gives the rail no definite height, so its footer would not pin to the
     bottom and its list would not scroll inside itself. */
  page: {
    display: "flex",
    alignItems: "stretch",
    height: "calc(100vh - 52px)",
    minHeight: 0,
  } satisfies CSSProperties,

  /* ---------------------------------------------------------------- rail */
  rail: {
    width: 340,
    flexShrink: 0,
    display: "flex",
    flexDirection: "column",
    borderRightWidth: 1,
    borderRightStyle: "solid",
    borderRightColor: "var(--border)",
    minWidth: 0,
  } satisfies CSSProperties,

  railHead: {
    padding: "18px 18px 6px",
    minWidth: 0,
  } satisfies CSSProperties,

  railTitle: {
    margin: 0,
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: "0.1em",
    textTransform: "uppercase",
    color: "var(--text-secondary)",
  } satisfies CSSProperties,

  /* The SELECTED document's own folder — a property of that document, never a
     statement of where documents are searched (AC-29). */
  railFolder: {
    margin: "6px 0 0",
    fontSize: 12,
    fontFamily: "var(--font-mono, ui-monospace, monospace)",
    color: "var(--text-muted)",
    overflowWrap: "anywhere",
    minWidth: 0,
  } satisfies CSSProperties,

  toolbar: {
    display: "flex",
    alignItems: "center",
    gap: 4,
    padding: "8px 14px 10px",
  } satisfies CSSProperties,

  toolbarError: {
    margin: "0 14px 8px",
    fontSize: 11,
    color: "var(--crit)",
  } satisfies CSSProperties,

  list: {
    flexGrow: 1,
    overflowY: "auto",
    padding: "0 8px 8px",
    display: "flex",
    flexDirection: "column",
    gap: 1,
    minWidth: 0,
  } satisfies CSSProperties,

  row: (selected: boolean): CSSProperties => ({
    display: "flex",
    alignItems: "center",
    gap: 8,
    width: "100%",
    padding: "7px 10px",
    borderRadius: 6,
    border: "none",
    cursor: "pointer",
    textAlign: "left",
    background: selected ? "var(--bg-hover)" : "transparent",
    color: selected ? "var(--text-primary)" : "var(--text-secondary)",
    minWidth: 0,
  }),

  rowIcon: (selected: boolean): CSSProperties => ({
    flexShrink: 0,
    display: "flex",
    color: selected ? "var(--accent-text, #6ea8fe)" : "var(--text-muted)",
  }),

  /* One line, like the mockup: the name truncates rather than wrapping — a
     wrapped file name turns a tidy list into a ragged block. */
  rowName: {
    fontSize: 13,
    fontFamily: "var(--font-mono, ui-monospace, monospace)",
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
    flexGrow: 1,
    flexShrink: 1,
    minWidth: 0,
  } satisfies CSSProperties,

  /* Two roots can hold the same file name (`specs/api.md` vs `docs/api.md`),
     so the folder rides along as a muted suffix (AC-3). */
  rowFolder: {
    fontSize: 11,
    color: "var(--text-muted)",
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
    flexShrink: 1,
    maxWidth: "45%",
  } satisfies CSSProperties,

  footer: {
    borderTopWidth: 1,
    borderTopStyle: "solid",
    borderTopColor: "var(--border)",
    padding: "10px 18px 12px",
    display: "flex",
    flexDirection: "column",
    gap: 2,
    minWidth: 0,
  } satisfies CSSProperties,

  footerLine: {
    display: "flex",
    alignItems: "center",
    gap: 7,
    fontSize: 11,
    color: "var(--text-secondary)",
  } satisfies CSSProperties,

  dot: {
    width: 6,
    height: 6,
    borderRadius: "50%",
    background: "var(--ok-text, #4ade80)",
    flexShrink: 0,
  } satisfies CSSProperties,

  footerCaption: {
    fontSize: 10,
    color: "var(--text-muted)",
  } satisfies CSSProperties,

  /* -------------------------------------------------------------- detail */
  detail: {
    flexGrow: 1,
    display: "flex",
    flexDirection: "column",
    minWidth: 0,
  } satisfies CSSProperties,

  detailHead: {
    display: "flex",
    alignItems: "center",
    gap: 14,
    padding: "14px 22px",
    borderBottomWidth: 1,
    borderBottomStyle: "solid",
    borderBottomColor: "var(--border)",
    minWidth: 0,
  } satisfies CSSProperties,

  detailName: {
    fontSize: 15,
    fontWeight: 650,
    fontFamily: "var(--font-mono, ui-monospace, monospace)",
    overflowWrap: "anywhere",
    flexShrink: 1,
    minWidth: 0,
  } satisfies CSSProperties,

  /* The track must be DARKER than the active pill, or the pill disappears into
     it — `tertiary`'s active state is `--bg-hover`, so the track cannot be. */
  modeToggle: {
    display: "flex",
    gap: 2,
    padding: 3,
    borderRadius: 9,
    background: "var(--bg-primary)",
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: "var(--border)",
    flexShrink: 0,
  } satisfies CSSProperties,

  coverage: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 2,
    flexShrink: 0,
  } satisfies CSSProperties,

  coverageLabel: {
    fontSize: 9,
    letterSpacing: "0.08em",
    color: "var(--text-muted)",
  } satisfies CSSProperties,

  usedBy: {
    marginLeft: "auto",
    display: "flex",
    flexDirection: "column",
    alignItems: "flex-end",
    gap: 2,
    flexShrink: 0,
    maxWidth: 320,
    minWidth: 0,
  } satisfies CSSProperties,

  usedByHeading: {
    fontSize: 12,
    color: "var(--text-secondary)",
  } satisfies CSSProperties,

  usedByList: {
    display: "flex",
    flexWrap: "wrap",
    justifyContent: "flex-end",
    gap: 8,
    fontSize: 11,
    minWidth: 0,
  } satisfies CSSProperties,

  usedByLink: {
    color: "var(--accent-text, #6ea8fe)",
    textDecoration: "none",
  } satisfies CSSProperties,

  usedByVia: {
    color: "var(--text-muted)",
  } satisfies CSSProperties,

  usedByNone: {
    fontSize: 11,
    color: "var(--text-muted)",
  } satisfies CSSProperties,

  body: {
    flexGrow: 1,
    overflowY: "auto",
    padding: "24px 28px 40px",
    minWidth: 0,
  } satisfies CSSProperties,

  editWrap: {
    flexGrow: 1,
    display: "flex",
    flexDirection: "column",
    gap: 10,
    padding: "16px 22px 24px",
    minWidth: 0,
  } satisfies CSSProperties,

  notice: {
    fontSize: 12,
    color: "var(--text-secondary)",
    background: "var(--bg-hover)",
    borderRadius: 8,
    padding: "9px 12px",
  } satisfies CSSProperties,

  saveRow: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    flexWrap: "wrap",
  } satisfies CSSProperties,

  saveError: {
    fontSize: 12,
    color: "var(--danger-text, #f87171)",
  } satisfies CSSProperties,

  saveOk: {
    fontSize: 12,
    color: "var(--ok-text, #4ade80)",
  } satisfies CSSProperties,

  stateWrap: {
    padding: "40px 28px",
  } satisfies CSSProperties,
};
