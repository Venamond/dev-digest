import type { IconName } from "@devdigest/ui";

/** Editor tab descriptor. `labelKey` resolves under the `agents` namespace. */
export interface EditorTab {
  key: string;
  labelKey: string;
  icon: IconName;
  /** Drawn, but with no mechanism behind it in this feature — rendered disabled. */
  disabled?: boolean;
}

/** Editor tabs, in the mockup's order (`screen_agents.jsx:205`). `ci` is drawn
    disabled: exporting an agent to CI is a separate feature. */
export const TABS: readonly EditorTab[] = [
  { key: "config", labelKey: "editor.tabs.config", icon: "Settings" },
  { key: "skills", labelKey: "editor.tabs.skills", icon: "Sparkles" },
  { key: "context", labelKey: "editor.tabs.context", icon: "Folder" },
  { key: "evals", labelKey: "editor.tabs.evals", icon: "Gauge" },
  { key: "stats", labelKey: "editor.tabs.stats", icon: "BarChart" },
  { key: "ci", labelKey: "editor.tabs.ci", icon: "Workflow", disabled: true },
];

/** Selectable tabs — `ci` is excluded because it can never become the panel. */
export const VALID_TABS = ["config", "skills", "context", "evals", "stats"] as const;
