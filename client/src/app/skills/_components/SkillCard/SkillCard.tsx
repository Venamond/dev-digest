/* SkillCard — compact list row matching design SkillListItem. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon, Toggle } from "@devdigest/ui";
import type { SkillListItem, SkillSource } from "@devdigest/shared";
import { useDeleteSkill } from "@/lib/hooks/skills";
import { s } from "./styles";

const SOURCE_ICON: Record<SkillSource, "Edit" | "Wrench" | "Globe" | "Link"> = {
  manual: "Edit",
  extracted: "Wrench",
  community: "Globe",
  imported_url: "Link",
};

function rateLabel(
  rate: number | null,
  unknown: string,
  format: (pct: number) => string,
): string {
  if (rate == null) return unknown;
  return format(Math.round(rate * 100));
}

export function SkillCard({
  skill,
  active,
  onClick,
  onToggle,
}: {
  skill: SkillListItem;
  active?: boolean;
  onClick?: () => void;
  onToggle?: (enabled: boolean) => void;
}) {
  const t = useTranslations("skills");
  const del = useDeleteSkill();
  const SrcIcon = Icon[SOURCE_ICON[skill.source]];
  return (
    <div onClick={onClick} style={s.card(!!active, skill.enabled)}>
      <div style={s.headerRow}>
        <div style={s.iconBox(skill.type)}>
          <Icon.Sparkles size={14} />
        </div>
        <span style={s.name}>{skill.name}</span>
        {onToggle && (
          <div onClick={(e) => e.stopPropagation()}>
            <Toggle on={skill.enabled} onChange={onToggle} size={13} />
          </div>
        )}
        <button
          onClick={(e) => {
            e.stopPropagation();
            if (window.confirm(t("card.deleteConfirm", { name: skill.name }))) {
              del.mutate(skill.id);
            }
          }}
          disabled={del.isPending}
          title={t("card.deleteTitle")}
          aria-label={t("card.deleteTitle")}
          style={s.trashBtn(del.isPending)}
        >
          <Icon.Trash
            size={14}
            style={del.isPending ? { animation: "ddspin 1s linear infinite" } : undefined}
          />
        </button>
      </div>
      <div style={s.description}>{skill.description || t("card.noDescription")}</div>
      <div style={s.metaRow}>
        <span style={s.typeTag(skill.type)}>{t(`listItem.type.${skill.type}`)}</span>
        <span style={s.sourceTag}>
          <SrcIcon size={11} />
          {t(`listItem.source.${skill.source}`)}
        </span>
      </div>
      {skill.agent_count > 0 && (
        <div style={s.statsRow}>
          <span className="tnum">{t("card.agentCount", { count: skill.agent_count })}</span>
          <span aria-hidden>·</span>
          <span className="tnum">
            {rateLabel(skill.pull_rate, t("card.statUnknown"), (pct) => t("card.pull", { pct }))}
          </span>
          <span aria-hidden>·</span>
          <span className="tnum" style={s.accept(skill.accept_rate)}>
            {rateLabel(skill.accept_rate, t("card.statUnknown"), (pct) =>
              t("card.accept", { pct }),
            )}
          </span>
        </div>
      )}
    </div>
  );
}
