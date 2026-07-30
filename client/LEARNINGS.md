# `client` — learnings

Append-only. Written by the `engineering-insights` skill (and by hand) after
sessions that touch this module. Every entry must pass the cold test: an
agent with zero session context reads it and knows exactly what to do —
no "be careful with X", only "X breaks under Y, do Z instead", with a
file/command when relevant. Treat this file as a **draft to spot-check**, not
ground truth — wrap-ups can mischaracterize a session.

## What Works

## What Doesn't Work

## Codebase Patterns

- `FindingsPanel` (`_components/FindingsPanel/FindingsPanel.tsx`) binds a
  `keydown` listener to `window` for `j`/`k` (move focus) and `a`/`d`
  (accept/dismiss the currently-focused finding) — it only skips firing when
  `document.activeElement` is an `<input>`/`<textarea>`, not when the user
  simply isn't intending to act on a finding. Any keypress of `a` or `d`
  anywhere else on a PR page with this tab open silently accepts/dismisses
  `shown[focusIdx]` (default index 0 = the first visible finding) with no
  confirmation and no visible feedback beyond the badge changing color. This
  already caused real confusion in a session (2026-07-31): a finding showed
  `accepted_at` set with nobody having clicked Accept — traced to this
  listener. There's no "un-accept" action in the UI, only Accept ↔ Dismiss
  (each clears the other's timestamp) — resetting to neutral requires a
  direct DB update (`findings.accepted_at = null, dismissed_at = null`).

## Tool & Library Notes

- Adding a `.nullable()` (not `.nullish()`) field to a shared Zod contract in
  `src/vendor/shared/contracts` makes that field REQUIRED at the TS level —
  every existing test fixture that types itself as that contract (e.g.
  `RunSummary`/`RunTrace` fixtures in `RunHistory.test.tsx`,
  `RunTraceDrawer.test.tsx`) fails `tsc --noEmit` until updated, even though
  the fixture's actual runtime value can legitimately be `null`. When a
  server-side task extends such a contract, expect to also patch every
  client fixture of that type in the same change, not just the server side.
  (2026-07-31, run-cost-ui feature; full explanation in `server/LEARNINGS.md`
  under the same date.)

## Recurring Errors & Fixes

- React DOM console warning "Updating a style property during rerender
  (borderColor) when a conflicting property is set (borderLeftColor)":
  `borderColor` in a React style object is itself CSS shorthand for all 4
  sides' color, so pairing it with `borderLeftColor` triggers the same
  "shorthand + non-shorthand" warning as pairing the `border` shorthand with
  `borderLeft` — going all-longhand for `border*` isn't enough by itself,
  the per-side `*Color`/`*Width`/`*Style` props must ALSO avoid mixing the
  4-side form with a 1-side form. Fix: expand to
  `borderTopColor`/`borderRightColor`/`borderBottomColor` individually
  instead of `borderColor`, keep `borderLeftColor` as the 4th (see
  `_components/FindingCard/styles.ts` `card()` for the fixed pattern,
  2026-07-31). Only surfaces on a rerender where the value actually changes
  (e.g. a `focused` prop toggling) — easy to miss if you only smoke-test the
  initial render.

## Session Notes

## Open Questions
