import type { IconName } from "@devdigest/ui";

/** Editor tab descriptor. `labelKey` resolves under the `skills` namespace. */
export interface EditorTab {
  key: string;
  labelKey: string;
  icon: IconName;
}

export const VALID_TABS = ["config", "preview", "context", "stats", "versions", "evals"] as const;
export type SkillEditorTab = (typeof VALID_TABS)[number];

export const TABS: readonly EditorTab[] = [
  { key: "config", labelKey: "detail.tabs.config", icon: "Settings" },
  { key: "preview", labelKey: "detail.tabs.preview", icon: "Eye" },
  { key: "context", labelKey: "detail.tabs.context", icon: "Folder" },
  { key: "stats", labelKey: "detail.tabs.stats", icon: "BarChart" },
  { key: "versions", labelKey: "detail.tabs.versions", icon: "History" },
  // Appended last, keeping the five shipped tabs in their order — the
  // reference adds `Evals` to the bar without reordering what was there.
  { key: "evals", labelKey: "detail.tabs.evals", icon: "FlaskConical" },
];

/** Rough token estimate — chars / 4 (optional UI affordance). */
export function estimateTokens(text: string): number {
  return Math.max(0, Math.ceil(text.length / 4));
}
