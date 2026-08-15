"use client";

import React from "react";

/**
 * Keyed open/closed state that survives a tab switch.
 *
 * The PR detail tabs unmount their whole subtree when you switch away, so any
 * `useState` inside them dies: an expanded run accordion or finding card comes
 * back collapsed, the content height changes, and the scroll offset
 * `use-tab-scroll` restored gets clamped. Both had a positional default
 * (`i === 0`) that then re-applied itself, so leaving with the *last* item open
 * and returning showed the *first* one open instead.
 *
 * The store lives in PrDetailView, which outlives the swap. Consumers keep
 * their own local state and just seed/report through here, so nothing becomes
 * controlled and existing auto-open effects keep working.
 */
type Store = {
  get: (key: string) => boolean | undefined;
  set: (key: string, open: boolean) => void;
};

const PreservedToggleContext = React.createContext<Store | null>(null);

export function PreservedToggleProvider({ children }: { children: React.ReactNode }) {
  // A ref, not state: writing must not re-render the whole detail view, and
  // every consumer already holds the value it needs in its own useState.
  const map = React.useRef<Record<string, boolean>>({});
  const store = React.useMemo<Store>(
    () => ({
      get: (key) => map.current[key],
      set: (key, open) => {
        map.current[key] = open;
      },
    }),
    [],
  );
  return (
    <PreservedToggleContext.Provider value={store}>{children}</PreservedToggleContext.Provider>
  );
}

/**
 * Drop-in replacement for `useState(fallback)` that remembers across tab
 * switches. `key` must be stable and identify the row (a review or finding id),
 * never its index — an index re-applies the positional default after a reorder.
 */
export function usePreservedToggle(
  key: string,
  fallback: boolean,
): [boolean, (next: boolean | ((o: boolean) => boolean)) => void] {
  const store = React.useContext(PreservedToggleContext);
  const [open, setOpenState] = React.useState(() => store?.get(key) ?? fallback);

  // Seed the store on mount too, not only on change: otherwise it holds just
  // the rows the user actually clicked, and an untouched row falls through to
  // its positional default and re-opens itself on the next mount.
  React.useEffect(() => {
    store?.set(key, open);
  }, [store, key, open]);

  const setOpen = React.useCallback(
    (next: boolean | ((o: boolean) => boolean)) => setOpenState(next),
    [],
  );

  return [open, setOpen];
}
