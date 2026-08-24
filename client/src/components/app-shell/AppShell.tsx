/* AppShell.tsx — persistent chrome: AppFrame + command palette + shortcuts.
   Mounted once under Providers so sidebar/nav survive route changes.
   Pages publish breadcrumbs via useSetCrumb — they must NOT wrap AppShell. */
"use client";

import React from "react";
import { AppFrame, CommandPalette, ShortcutsHelp } from "@devdigest/ui";
import { useCrumb } from "./crumb-context";
import { useGlobalShortcuts, useShellCommands, useShellContext } from "./hooks";

export function AppShell({ children }: { children: React.ReactNode }) {
  const crumb = useCrumb();
  const [paletteOpen, setPaletteOpen] = React.useState(false);
  const [helpOpen, setHelpOpen] = React.useState(false);
  const openPalette = React.useCallback(() => setPaletteOpen(true), []);
  const closePalette = React.useCallback(() => setPaletteOpen(false), []);
  const openHelp = React.useCallback(() => setHelpOpen(true), []);
  const closeHelp = React.useCallback(() => setHelpOpen(false), []);

  useGlobalShortcuts({ onOpenPalette: openPalette, onOpenHelp: openHelp });
  const commands = useShellCommands();
  const ctx = useShellContext({ onOpenCommandPalette: openPalette });

  return (
    <>
      <AppFrame ctx={ctx} crumb={crumb}>
        {children}
      </AppFrame>
      <CommandPalette open={paletteOpen} commands={commands} onClose={closePalette} />
      <ShortcutsHelp open={helpOpen} onClose={closeHelp} />
    </>
  );
}
