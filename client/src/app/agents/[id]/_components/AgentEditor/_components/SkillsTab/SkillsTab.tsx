"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Checkbox, ErrorState, Skeleton, Icon } from "@devdigest/ui";
import type { Agent } from "@devdigest/shared";
import { useAgentSkills, useSetAgentSkills } from "../../../../../../../lib/hooks/agents";
import { useToast } from "../../../../../../../lib/toast";
import {
  applyDisplayOrder,
  displayOrderIds,
  enabledCount,
  filterDraftRows,
  moveLinked,
  reorderLinked,
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
  // Frozen row order — see `displayOrderIds`. Only reseeded on agent switch
  // and after a drag, never on a checkbox toggle or a save round-trip
  // (`useSetAgentSkills` writes fresh rows into the cache on success, which
  // would otherwise re-sort the list a moment after the click).
  const [order, setOrder] = React.useState<string[]>([]);

  React.useEffect(() => {
    setOrder([]);
  }, [agent.id]);

  React.useEffect(() => {
    if (!data) return;
    const next = toDraftRows(data);
    setDraft(next);
    setOrder((prev) => (prev.length > 0 ? prev : displayOrderIds(next)));
  }, [data, agent.id]);

  const rows = draft ?? [];
  const ordered = applyDisplayOrder(filterDraftRows(rows, filter), order);

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

  /* A move IS an explicit reorder, so the frozen display order is reseeded on
     it — exactly as a drag does. Without that the row would snap back. */
  const move = (skillId: string, dir: -1 | 1) => {
    const next = moveLinked(rows, skillId, dir);
    if (next === rows) return;
    persist(next);
    setOrder(displayOrderIds(next));
  };

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
                  const next = reorderLinked(rows, dragId, r.skill_id);
                  if (next === rows) return;
                  // A drag IS an explicit reorder — re-freeze on the new order.
                  persist(next);
                  setOrder(displayOrderIds(next));
                  setDragId(null);
                }}
                style={s.row(on, dragId === r.skill_id)}
              >
                <span
                  style={s.dragHandle(r.linked)}
                  title={r.linked ? t("skills.dragHint") : t("skills.dragDisabledHint")}
                  aria-hidden
                >
                  <Icon.Menu size={14} />
                </span>
                {/* The keyboard path to reordering — the same pair the Context
                    tab uses. Drag alone is pointer-only, so an ordered list
                    that offers only a handle is unreachable without a mouse. */}
                {r.linked && (
                  <span style={s.moveGroup}>
                    <button
                      type="button"
                      style={s.moveBtn}
                      onClick={() => move(r.skill_id, -1)}
                      aria-label={t("skills.moveUp", { name: r.name })}
                    >
                      <Icon.ArrowUp size={11} />
                    </button>
                    <button
                      type="button"
                      style={s.moveBtn}
                      onClick={() => move(r.skill_id, 1)}
                      aria-label={t("skills.moveDown", { name: r.name })}
                    >
                      <Icon.ArrowDown size={11} />
                    </button>
                  </span>
                )}
                <Checkbox
                  checked={on}
                  onChange={(v) => {
                    const next = toggleEnabled(rows, r.skill_id, v);
                    persist(next);
                    // Selected rows rise to the top here too — one behaviour
                    // across every list in the product (2026-08-23).
                    setOrder(displayOrderIds(next));
                  }}
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
