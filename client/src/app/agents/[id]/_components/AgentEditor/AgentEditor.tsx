/* Agent Editor — Config + Skills + Context + Evals + Stats, plus a disabled CI
   tab. Tab state lives in ?tab=. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon, Tabs } from "@devdigest/ui";
import type { Agent } from "@devdigest/shared";
import { ConfigTab } from "./_components/ConfigTab/ConfigTab";
import { ContextTab } from "./_components/ContextTab/ContextTab";
import { EvalsTab } from "./_components/EvalsTab/EvalsTab";
import { SkillsTab } from "./_components/SkillsTab/SkillsTab";
import { StatsTab } from "./_components/StatsTab/StatsTab";
import { TABS } from "./constants";
import { s } from "./styles";

export function AgentEditor({ agent, tab, onTab }: { agent: Agent; tab: string; onTab: (t: string) => void }) {
  const t = useTranslations("agents");
  const enabled = TABS.filter((tb) => !tb.disabled);
  const tabs = enabled.map((tb) => ({ key: tb.key, label: t(tb.labelKey), icon: tb.icon }));
  const disabled = TABS.filter((tb) => tb.disabled);
  return (
    <div style={s.wrap}>
      <div style={s.tabsBar} data-testid="agent-editor-tabs">
        <Tabs tabs={tabs} value={tab} onChange={onTab} pad="0 0 0 24px" />
        {disabled.map((tb) => {
          const I = Icon[tb.icon];
          return (
            <button
              key={tb.key}
              type="button"
              disabled
              title={t("editor.ciDisabledReason")}
              style={s.disabledTab}
            >
              <I size={14} />
              {t(tb.labelKey)}
            </button>
          );
        })}
        <div style={s.tabsFiller} />
      </div>
      <div style={s.body}>
        {tab === "skills" && <SkillsTab agent={agent} />}
        {tab === "context" && <ContextTab agent={agent} />}
        {tab === "evals" && <EvalsTab agent={agent} />}
        {tab === "stats" && <StatsTab agent={agent} />}
        {tab === "config" && <ConfigTab agent={agent} />}
      </div>
    </div>
  );
}
