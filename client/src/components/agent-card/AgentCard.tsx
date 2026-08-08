/* AgentCard — model chip, skills count, enabled toggle, 7d stats footer
   (runs / accept / avg). `stats` comes from `toCardStats(agent)` in the list
   view — EMPTY_STATS below is only the fallback for callers that omit it. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon, Badge, Toggle } from "@devdigest/ui";
import type { Agent } from "@devdigest/shared";
import { useDeleteAgent } from "@/lib/hooks/agents";
import { displayModelName } from "@/lib/model-label";
import { modelChipBg, modelColor } from "./helpers";
import { s } from "./styles";

export type AgentCardStats = {
  runs: number;
  /** 0–1 accept rate */
  accept: number;
  /** Average cost in USD */
  cost: number;
};

const EMPTY_STATS: AgentCardStats = { runs: 0, accept: 0, cost: 0 };

export function AgentCard({
  ag,
  active,
  skillCount,
  stats = EMPTY_STATS,
  onClick,
  onToggle,
}: {
  ag: Agent;
  active?: boolean;
  skillCount?: number;
  stats?: AgentCardStats;
  onClick?: () => void;
  onToggle?: (enabled: boolean) => void;
}) {
  const t = useTranslations("agents");
  const del = useDeleteAgent();
  const acceptPct = Math.round(stats.accept * 100);
  const modelName = displayModelName(ag.model);
  const color = modelColor(ag.model);
  return (
    <div onClick={onClick} style={s.card(!!active, ag.enabled)}>
      <div style={s.headerRow}>
        <div style={s.iconBox}>
          <Icon.Cpu size={15} />
        </div>
        <span style={s.name}>{ag.name}</span>
        {onToggle && (
          <div onClick={(e) => e.stopPropagation()}>
            <Toggle on={ag.enabled} onChange={onToggle} size={14} />
          </div>
        )}
        <button
          onClick={(e) => {
            e.stopPropagation();
            if (window.confirm(t("card.deleteConfirm", { name: ag.name }))) del.mutate(ag.id);
          }}
          disabled={del.isPending}
          title={t("card.deleteTitle")}
          aria-label={t("card.deleteTitle")}
          style={{
            background: "none",
            border: "none",
            cursor: del.isPending ? "not-allowed" : "pointer",
            color: "var(--text-muted)",
            display: "inline-flex",
            padding: 4,
          }}
        >
          <Icon.Trash size={14} style={del.isPending ? { animation: "ddspin 1s linear infinite" } : undefined} />
        </button>
      </div>
      <div style={s.description}>{ag.description || t("card.noDescription")}</div>
      <div style={s.metaRow}>
        <span title={modelName} style={s.modelWrap}>
          <span className="mono" style={s.modelChip(color, modelChipBg(color))}>
            {modelName}
          </span>
        </span>
        {skillCount != null && (
          <Badge color="var(--text-secondary)" bg="var(--bg-surface)" icon="Sparkles" style={s.skillBadge}>
            {t("card.skillCount", { count: skillCount })}
          </Badge>
        )}
      </div>
      <div style={s.statsRow}>
        <span className="tnum">{t("card.runs", { count: stats.runs })}</span>
        <span className="tnum" style={s.accept(stats.accept)}>
          {t("card.accept", { pct: acceptPct })}
        </span>
        <span className="mono tnum">{t("card.avgCost", { cost: stats.cost.toFixed(2) })}</span>
      </div>
    </div>
  );
}
