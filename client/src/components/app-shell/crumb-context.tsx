"use client";

import React from "react";
import type { Crumb } from "@devdigest/ui";

const CrumbStateContext = React.createContext<Crumb[] | undefined>(undefined);
const SetCrumbContext = React.createContext<
  React.Dispatch<React.SetStateAction<Crumb[] | undefined>> | null
>(null);

/** Owns the topbar breadcrumb for the persistent AppShell. */
export function CrumbProvider({ children }: { children: React.ReactNode }) {
  const [crumb, setCrumb] = React.useState<Crumb[] | undefined>(undefined);
  return (
    <SetCrumbContext.Provider value={setCrumb}>
      <CrumbStateContext.Provider value={crumb}>{children}</CrumbStateContext.Provider>
    </SetCrumbContext.Provider>
  );
}

export function useCrumb(): Crumb[] | undefined {
  return React.useContext(CrumbStateContext);
}

/**
 * Publish breadcrumbs for the persistent shell. No-ops outside CrumbProvider
 * (unit tests that render a view in isolation).
 *
 * Depends only on the stable `setCrumb` dispatcher — never on the crumb value
 * itself — so publishing a crumb cannot retrigger this effect.
 */
export function useSetCrumb(crumb: Crumb[] | undefined): void {
  const setCrumb = React.useContext(SetCrumbContext);
  const key = crumb === undefined ? "" : JSON.stringify(crumb);

  React.useLayoutEffect(() => {
    if (!setCrumb) return;
    setCrumb(key ? (JSON.parse(key) as Crumb[]) : undefined);
    return () => setCrumb(undefined);
  }, [setCrumb, key]);
}
