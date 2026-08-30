/* SkillEditor — Config / Preview / Context / Stats / Versions / Evals. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Icon, Tabs } from "@devdigest/ui";
import type { Skill } from "@devdigest/shared";
import { ConfigTab } from "./_components/ConfigTab/ConfigTab";
import { ContextTab } from "./_components/ContextTab/ContextTab";
import { PreviewTab } from "./_components/PreviewTab/PreviewTab";
import { VersionsTab } from "./_components/VersionsTab/VersionsTab";
import { StatsTab } from "./_components/StatsTab/StatsTab";
import { EvalsTab } from "./_components/EvalsTab/EvalsTab";
import { TABS } from "./constants";
import { s } from "./styles";

export function SkillEditor({
  skill,
  tab,
  onTab,
}: {
  skill: Skill;
  tab: string;
  onTab: (t: string) => void;
}) {
  const t = useTranslations("skills");
  const tabs = TABS.map((tb) => ({ key: tb.key, label: t(tb.labelKey), icon: tb.icon }));
  return (
    <div style={s.wrap}>
      <div style={s.header}>
        <div style={s.iconBox(skill.type)}>
          <Icon.Sparkles size={14} />
        </div>
        <span style={s.name}>{skill.name}</span>
        <span style={s.typeBadge(skill.type)}>{t(`listItem.type.${skill.type}`)}</span>
        <Badge icon="GitCommit" mono>
          {t("editor.versionChip", { version: skill.version })}
        </Badge>
      </div>
      <div style={s.tabsBar}>
        <Tabs tabs={tabs} value={tab} onChange={onTab} pad="0 24px" />
      </div>
      <div style={s.body}>
        {tab === "config" && <ConfigTab skill={skill} />}
        {tab === "preview" && <PreviewTab skill={skill} />}
        {tab === "context" && <ContextTab skill={skill} />}
        {tab === "stats" && <StatsTab skill={skill} />}
        {tab === "versions" && <VersionsTab skill={skill} />}
        {tab === "evals" && <EvalsTab skill={skill} />}
      </div>
    </div>
  );
}
