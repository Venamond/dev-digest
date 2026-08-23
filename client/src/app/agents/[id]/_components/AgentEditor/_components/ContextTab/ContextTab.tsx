"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Button, Drawer, ErrorState, Icon, Markdown, Skeleton } from "@devdigest/ui";
import type { Agent } from "@devdigest/shared";
import {
  useAgentContextDocs,
  useContextDoc,
  useSetAgentContextDocs,
} from "../../../../../../../lib/hooks";
import { useActiveRepo } from "../../../../../../../lib/repo-context";
import { useToast } from "../../../../../../../lib/toast";
import {
  applyDisplayOrder,
  attachedCount,
  displayOrderIds,
  fileNameOf,
  filterDraftRows,
  folderOf,
  injectedBreakdown,
  moveAttached,
  overCeiling,
  reorderAttached,
  movableInList,
  reconcileOrder,
  moveInOrder,
  orderFromDisplay,
  rootColor,
  rowKind,
  toDraftRows,
  toggleAttached,
  toPathsPayload,
  type ContextDraftRow,
} from "@/lib/project-context";
import { s } from "./styles";

/** Agent → Project Context tab: attach, order and preview the repository's docs. */
export function ContextTab({ agent }: { agent: Agent }) {
  const t = useTranslations("agents");
  const toast = useToast();
  const { repoId, activeRepo } = useActiveRepo();
  const { data, isLoading, isError, refetch } = useAgentContextDocs(agent.id, repoId);
  const save = useSetAgentContextDocs(agent.id, repoId);

  const [draft, setDraft] = React.useState<ContextDraftRow[] | null>(null);
  const [filter, setFilter] = React.useState("");
  const [dragPath, setDragPath] = React.useState<string | null>(null);
  const [previewPath, setPreviewPath] = React.useState<string | null>(null);
  /* Frozen row order — see `displayOrderIds`. Reseeded on exactly two events:
     switching agent, and a drag (where reordering IS the intent). Never on an
     attach toggle, or the row would jump out from under the pointer. */
  const [order, setOrder] = React.useState<string[]>([]);

  React.useEffect(() => {
    setOrder([]);
    setPreviewPath(null);
  }, [agent.id, repoId]);

  React.useEffect(() => {
    if (!data) return;
    const next = toDraftRows(data.rows);
    setDraft(next);
    // Seed once, then RECONCILE: a document added to the repository after the
    // tab loaded must still get a position, or its row has no arrows while the
    // drag handler still moves it.
    setOrder((prev) => (prev.length === 0 ? displayOrderIds(next) : reconcileOrder(next, prev)));
  }, [data, agent.id]);

  const rows = draft ?? [];
  const ordered = applyDisplayOrder(filterDraftRows(rows, filter), order);
  const preview = previewPath == null ? null : (rows.find((r) => r.path === previewPath) ?? null);

  const persist = (next: ContextDraftRow[]) => {
    setDraft(next);
    save.mutate(toPathsPayload(next), {
      onSuccess: () => toast.success(t("context.savedToast")),
    });
  };

  /* Any row moves, attached or not: the list is the human's arrangement. The
     prompt order is then re-derived from it, so what a run injects matches what
     is on screen, top to bottom. */
  const move = (path: string, dir: -1 | 1) => {
    const nextOrder = moveInOrder(order, path, dir);
    if (nextOrder === order) return;
    setOrder(nextOrder);
    const next = orderFromDisplay(rows, nextOrder);
    // Only an attached row changes what a run sends; moving an unattached one
    // rearranges the list without touching the server.
    if (rows.some((r) => r.attached)) persist(next);
    else setDraft(next);
  };

  if (repoId == null) {
    return <div style={s.empty}>{t("context.noRepo")}</div>;
  }

  if (isLoading && !draft) {
    return (
      <div style={s.wrap}>
        <Skeleton height={24} width={220} />
        <Skeleton height={48} />
        <Skeleton height={48} />
      </div>
    );
  }

  if (isError) {
    return <ErrorState body={t("context.loadError")} onRetry={() => refetch()} />;
  }

  // Every number below is derived from `rows` — the array these controls
  // render — never re-asked of the payload.
  const attached = attachedCount(rows);
  const breakdown = injectedBreakdown(rows);
  // The ceiling a RUN of this agent caps against, served with the rows. Never a
  // constant here: a workspace can override it, and a tab warning against the
  // default would quote a number the run does not honour.
  const ceiling = data?.token_ceiling ?? null;

  return (
    <div style={s.wrap}>
      <div style={s.header}>
        <h2 style={s.title}>{t("context.title")}</h2>
        <Badge color="var(--accent-text)" bg="var(--accent-bg)">
          {t("context.attachedCount", { attached, total: rows.length })}
        </Badge>
        <div style={s.filterBox}>
          <Icon.Search size={13} />
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder={t("context.filterPlaceholder")}
            style={s.filterInput}
            aria-label={t("context.filterPlaceholder")}
          />
        </div>
      </div>
      <p style={s.hint}>
        {t("context.orderHint", { repo: activeRepo?.full_name ?? t("context.repoFallback") })}
      </p>

      {ceiling != null && overCeiling(breakdown.own, ceiling) && (
        <div style={s.ceilingWarning} role="status">
          {t("context.ceilingWarning", { tokens: breakdown.own, ceiling })}
        </div>
      )}

      {ordered.length === 0 ? (
        <div style={s.empty}>{t("context.empty")}</div>
      ) : (
        <div style={s.list}>
          {ordered.map((r) => (
            <ContextRow
              key={r.path}
              row={r}
              dragging={dragPath === r.path}
              onDragStart={() => setDragPath(r.path)}
              onDragEnd={() => setDragPath(null)}
              onDrop={() => {
                if (!dragPath || dragPath === r.path) return;
                setDragPath(null);
                // Drop moves the dragged row into this row's slot in the DISPLAY
                // order; the prompt order is re-derived from the result.
                const from = order.indexOf(dragPath);
                const to = order.indexOf(r.path);
                if (from < 0 || to < 0) return;
                const nextOrder = [...order];
                nextOrder.splice(from, 1);
                nextOrder.splice(to, 0, dragPath);
                setOrder(nextOrder);
                const next = orderFromDisplay(rows, nextOrder);
                if (rows.some((row) => row.attached)) persist(next);
                else setDraft(next);
              }}
              canDropHere={dragPath != null}
              onToggle={() => {
                const next = toggleAttached(rows, r.path, !r.attached);
                persist(next);
                // Ticking hoists the row to the top: the human should never have
                // to hunt for what they just selected in a fifty-row list. This
                // deliberately overrides the old anti-jump freeze, on the
                // human's instruction (2026-08-23).
                setOrder(displayOrderIds(next));
              }}
              onMove={(dir) => move(r.path, dir)}
              canMove={movableInList(order, r.path)}
              onPreview={() => setPreviewPath(previewPath === r.path ? null : r.path)}
            />
          ))}
        </div>
      )}

      {/* Mockups M5/M4 put the token total and the injection sentence in a
          FOOTER under the list, not above it. */}
      <div style={s.totals}>
        {/* The tokens the human SELECTED on this tab, and nothing else. A
            skill's own documents are counted on that skill's tab. */}
        <span style={s.totalsLine}>
          {t("context.injectedTotal", { tokens: breakdown.own })}
        </span>
        <span style={s.totalsCaption}>{t("context.injectedCaption")}</span>
      </div>

      {preview && (
        <ContextPreview
          repoId={repoId}
          row={preview}
          onToggle={() => {
            const next = toggleAttached(rows, preview.path, !preview.attached);
            persist(next);
            setOrder(displayOrderIds(next));
          }}
          onClose={() => setPreviewPath(null)}
        />
      )}
    </div>
  );
}

interface ContextRowProps {
  row: ContextDraftRow;
  dragging: boolean;
  canDropHere: boolean;
  onDragStart: () => void;
  onDragEnd: () => void;
  onDrop: () => void;
  onToggle: () => void;
  onMove: (dir: -1 | 1) => void;
  /** Whether a move in each direction is possible at all — see `movableDirs`. */
  canMove: { up: boolean; down: boolean };
  onPreview: () => void;
}

function ContextRow({
  row,
  dragging,
  canDropHere,
  onDragStart,
  onDragEnd,
  onDrop,
  onToggle,
  onMove,
  canMove,
  onPreview,
}: ContextRowProps) {
  const t = useTranslations("agents");
  const kind = rowKind(row);
  // Only the owner's OWN documents are ordered: an inherited one is positioned
  // by the skill it comes from, so it is neither draggable nor movable (AC-41).
  /* EVERY row moves. The list is the human's arrangement, and two unticked rows
     sitting side by side — one with arrows, one without — reads as random
     (screenshot, 2026-08-23). AC-41 refused a stored position for an inherited
     row because it would go stale when the skill changes; nothing is stored for
     one here, the order is display-only, so the reason does not reach this. What
     a run injects is still the attached documents in their displayed order. */
  const canOrder = true;

  return (
    <div
      /* Draggable only when a move is possible at all: with one attached
         document every drop target is unattached and the drag is a no-op,
         which reads as a broken list. */
      draggable={canOrder && (canMove.up || canMove.down)}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragOver={(e) => {
        if (!canDropHere) return;
        e.preventDefault();
      }}
      onDrop={onDrop}
      style={s.row(kind, dragging)}
    >
      <span
        style={s.dragHandle(canOrder && (canMove.up || canMove.down))}
        title={
          !canOrder
            ? t("context.dragDisabledHint")
            : canMove.up || canMove.down
              ? t("context.dragHint")
              : t("context.dragAloneHint")
        }
        aria-hidden
      >
        <Icon.Menu size={14} />
      </span>

      {/* The keyboard path to reordering. SkillsTab has drag only — an
          aria-hidden handle and no onKeyDown — so this is new work. */}
      {/* Only the directions this row can actually go. A lone attached document
          gets neither button — drawing one that does nothing reads as a bug. */}
      {canOrder && (canMove.up || canMove.down) && (
        <span style={s.moveGroup}>
          {canMove.up && (
            <button
              type="button"
              style={s.moveBtn}
              onClick={() => onMove(-1)}
              aria-label={t("context.moveUp", { path: row.path })}
            >
              <Icon.ArrowUp size={11} />
            </button>
          )}
          {canMove.down && (
            <button
              type="button"
              style={s.moveBtn}
              onClick={() => onMove(1)}
              aria-label={t("context.moveDown", { path: row.path })}
            >
              <Icon.ArrowDown size={11} />
            </button>
          )}
        </span>
      )}

      <button
        type="button"
        role="checkbox"
        aria-checked={row.attached}
        aria-label={t("context.attachAria", { path: row.path })}
        onClick={onToggle}
        style={s.attachBox(row.attached)}
      >
        {row.attached && <Icon.Check size={11} />}
      </button>

      <span style={s.nameCol}>
        <span className="mono" style={s.name}>
          {fileNameOf(row.path)}
        </span>
        <span style={s.meta}>
          {t("context.rowMeta", {
            folder: folderOf(row),
            agents: row.usedBy.length,
          })}
        </span>
      </span>

      {!row.readable && (
        <Badge color="var(--crit)" bg="var(--crit-bg)">
          {t("context.unreadable")}
        </Badge>
      )}

      <span style={s.rootPill(row.root)}>{row.root}</span>
      <span style={s.tokens}>{t("context.rowTokens", { tokens: row.approxTokens })}</span>
      <button type="button" style={s.previewBtn} onClick={onPreview}>
        <Icon.Eye size={11} />
        {t("context.preview")}
      </button>
    </div>
  );
}

/** Preview drawer: path, root, tokens, using agents by NAME, markdown, attach (AC-16, AC-35). */
function ContextPreview({
  repoId,
  row,
  onToggle,
  onClose,
}: {
  repoId: string;
  row: ContextDraftRow;
  onToggle: () => void;
  onClose: () => void;
}) {
  const t = useTranslations("agents");
  const doc = useContextDoc(repoId, row.path);

  /* Mockups M6/M3 draw this as a right-side overlay with a close control, not
     as a card under the list. `Drawer` is the kit primitive for exactly that
     and is already used by ImportSkillDrawer. */
  return (
    <Drawer
      onClose={onClose}
      title={
        <span style={s.drawerTitle}>
          <Icon.FileText size={15} />
          <span style={s.drawerPath}>{row.path}</span>
        </span>
      }
      subtitle={
        <span style={s.drawerMeta}>
          <Badge color={rootColor(row.root).text} bg={rootColor(row.root).bg}>
            {row.root}
          </Badge>
          <span style={s.drawerMetaItem}>
            <Icon.Cpu size={12} />
            {t("context.previewUsedBy", { agents: row.usedBy.length })}
          </span>
          <span style={s.drawerMetaItem}>
            {t("context.previewTokens", { tokens: row.approxTokens })}
          </span>
        </span>
      }
    >
      <div style={s.drawerInner}>
        <Button
          kind={row.attached ? "primary" : "ghost"}
          icon={row.attached ? "Check" : "Plus"}
          onClick={onToggle}
        >
          {row.attached ? t("context.attached") : t("context.attach")}
        </Button>

        {/* AC-35 — the count is in the meta line above; these are the agents
            themselves, each openable. */}
        {row.usedBy.length === 0 ? (
          <span style={s.drawerUsedByNone}>{t("context.previewUsedByNone")}</span>
        ) : (
          <div style={s.drawerUsedBy}>
            {row.usedBy.map((u) => (
              <span key={u.agent_id}>
                <a href={`/agents/${u.agent_id}`} style={s.drawerUsedByLink}>
                  {u.agent_name}
                </a>
                {u.via === "skill" && u.skill_name ? (
                  <span style={s.drawerUsedByVia}>
                    {" "}
                    {t("context.previewUsedByVia", { skill: u.skill_name })}
                  </span>
                ) : null}
              </span>
            ))}
          </div>
        )}

        {doc.isLoading && <Skeleton height={120} />}
        {doc.isError && <ErrorState body={t("context.previewLoadError")} />}
        {doc.data && (
          <div style={s.drawerBody}>
            <Markdown>{doc.data.content}</Markdown>
          </div>
        )}
      </div>
    </Drawer>
  );
}
