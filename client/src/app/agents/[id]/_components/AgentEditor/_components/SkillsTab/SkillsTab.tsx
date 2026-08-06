"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Checkbox, ErrorState, Skeleton, Icon } from "@devdigest/ui";
import type { Agent } from "@devdigest/shared";
import { useAgentSkills, useSetAgentSkills } from "../../../../../../../lib/hooks/agents";
import { useToast } from "../../../../../../../lib/toast";
import {
  enabledCount,
  filterDraftRows,
  moveLinked,
  toggleEnabled,
  toDraftRows,
  toLinksPayload,
  type SkillDraftRow,
} from "./helpers";
import { TYPE_COLORS, s } from "./styles";

/** Agent → Skills bind tab (design SkillsTab): badge + filter, drag handle, type pill. */
export function SkillsTab({ agent }: { agent: Agent }) {
  const t = useTranslations("agents");
  const toast = useToast();
  const { data, isLoading, isError, refetch } = useAgentSkills(agent.id);
  const save = useSetAgentSkills(agent.id);
  const [draft, setDraft] = React.useState<SkillDraftRow[] | null>(null);
  const [filter, setFilter] = React.useState("");
  const [dragId, setDragId] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (data) setDraft(toDraftRows(data));
  }, [data, agent.id]);

  const rows = draft ?? [];
  const shown = filterDraftRows(rows, filter);
  const ordered = [
    ...shown.filter((r) => r.linked).sort((a, b) => a.order - b.order),
    ...shown.filter((r) => !r.linked).sort((a, b) => a.name.localeCompare(b.name)),
  ];

  const persist = (next: SkillDraftRow[]) => {
    setDraft(next);
    save.mutate(toLinksPayload(next), {
      onSuccess: () => toast.success(t("skills.savedToast")),
    });
  };

  if (isLoading && !draft) {
    return (
      <div style={s.wrap}>
        <Skeleton height={24} width={200} />
        <Skeleton height={48} />
        <Skeleton height={48} />
      </div>
    );
  }

  if (isError) {
    return <ErrorState body={t("skills.loadError")} onRetry={() => refetch()} />;
  }

  return (
    <div style={s.wrap}>
      <div style={s.header}>
        <h2 style={s.title}>{t("skills.title")}</h2>
        <Badge color="var(--accent-text)" bg="var(--accent-bg)">
          {t("skills.enabledCount", { linked: enabledCount(rows), total: rows.length })}
        </Badge>
        <div style={s.filterBox}>
          <Icon.Search size={13} />
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder={t("skills.filterPlaceholder")}
            style={s.filterInput}
            aria-label={t("skills.filterPlaceholder")}
          />
        </div>
      </div>
      <p style={s.hint}>{t("skills.orderHint")}</p>

      {ordered.length === 0 ? (
        <div style={s.empty}>{t("skills.empty")}</div>
      ) : (
        <div style={s.list}>
          {ordered.map((r) => {
            const on = r.linked && r.enabled;
            const typeColor = TYPE_COLORS[r.type] ?? "#999999";
            return (
              <div
                key={r.skill_id}
                draggable={r.linked}
                onDragStart={() => setDragId(r.skill_id)}
                onDragEnd={() => setDragId(null)}
                onDragOver={(e) => {
                  if (!dragId || !r.linked) return;
                  e.preventDefault();
                }}
                onDrop={() => {
                  if (!dragId || dragId === r.skill_id || !r.linked) return;
                  const linked = rows.filter((x) => x.linked).sort((a, b) => a.order - b.order);
                  const from = linked.findIndex((x) => x.skill_id === dragId);
                  const to = linked.findIndex((x) => x.skill_id === r.skill_id);
                  if (from < 0 || to < 0) return;
                  let next = rows;
                  const dir = to > from ? 1 : -1;
                  let i = from;
                  while (i !== to) {
                    next = moveLinked(next, linked[i]!.skill_id, dir);
                    i += dir;
                  }
                  persist(next);
                  setDragId(null);
                }}
                style={s.row(on, dragId === r.skill_id)}
              >
                <span style={s.dragHandle} title={t("skills.dragHint")} aria-hidden>
                  <Icon.Menu size={14} />
                </span>
                <Checkbox
                  checked={on}
                  onChange={(v) => persist(toggleEnabled(rows, r.skill_id, v))}
                  label={undefined}
                />
                <span className="mono" style={s.name}>
                  {r.name}
                </span>
                {!r.skillEnabled && (
                  <Badge color="var(--text-muted)">{t("skills.globallyOff")}</Badge>
                )}
                <span style={s.typePill(typeColor)}>{r.type}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
