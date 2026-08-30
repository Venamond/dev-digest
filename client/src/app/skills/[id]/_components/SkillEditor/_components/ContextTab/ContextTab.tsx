"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Button, Drawer, ErrorState, Icon, Markdown, Skeleton } from "@devdigest/ui";
import type { Skill } from "@devdigest/shared";
import {
  useContextDoc,
  useSetSkillContextDocs,
  useSkillContextDocs,
} from "../../../../../../../lib/hooks";
import { useActiveRepo } from "../../../../../../../lib/repo-context";
import { useToast } from "../../../../../../../lib/toast";
/* Shared with the agent editor's Context tab rather than copied — the two tabs
   must agree on order, counts and the ceiling, and a second copy is where they
   would drift apart. It lives in `lib/` because a feature under one route must
   not import a feature under another. */
import {
  applyDisplayOrder,
  attachedCount,
  displayOrderIds,
  fileNameOf,
  filterDraftRows,
  folderOf,
  groupAttachedByRoot,
  injectedBreakdown,
  moveAttached,
  overCeiling,
  reorderAttached,
  movableInList,
  reconcileOrder,
  moveInOrder,
  orderFromDisplay,
  rootColor,
  toDraftRows,
  toggleAttached,
  toPathsPayload,
  type ContextDraftRow,
} from "@/lib/project-context";
import { s } from "./styles";

/** Skill → Project Context tab: the same tab minus inheritance, plus AC-10 and AC-17. */
export function ContextTab({ skill }: { skill: Skill }) {
  const t = useTranslations("skills");
  const toast = useToast();
  const { repoId, activeRepo } = useActiveRepo();
  const { data, isLoading, isError, refetch } = useSkillContextDocs(skill.id, repoId);
  const save = useSetSkillContextDocs(skill.id, repoId);

  const [draft, setDraft] = React.useState<ContextDraftRow[] | null>(null);
  const [filter, setFilter] = React.useState("");
  const [dragPath, setDragPath] = React.useState<string | null>(null);
  const [previewPath, setPreviewPath] = React.useState<string | null>(null);
  /* Frozen row order — reseeded on exactly two events: switching skill (or
     repository) and a reorder. Never on an attach toggle, or the row would
     jump out from under the pointer the moment it is ticked. */
  const [order, setOrder] = React.useState<string[]>([]);

  React.useEffect(() => {
    setOrder([]);
    setPreviewPath(null);
  }, [skill.id, repoId]);

  React.useEffect(() => {
    if (!data) return;
    const next = toDraftRows(data.rows);
    setDraft(next);
    // Seed once, then RECONCILE: a document added to the repository after the
    // tab loaded must still get a position, or its row has no arrows while the
    // drag handler still moves it.
    setOrder((prev) => (prev.length === 0 ? displayOrderIds(next) : reconcileOrder(next, prev)));
  }, [data, skill.id]);

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

  // Both numbers are derived from `rows` — the array these controls render —
  // never re-asked of the payload.
  const attached = attachedCount(rows);
  const breakdown = injectedBreakdown(rows);
  // The ceiling a RUN caps against, served with the rows — a workspace can
  // override it, so warning against a constant would quote the wrong number.
  const ceiling = data?.token_ceiling ?? null;
  // The panel is built from the SAME array the list renders, so it cannot
  // disagree with the rows above it.
  const groups = groupAttachedByRoot(rows);

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
      {/* AC-10 — what attaching here means for every agent using this skill. */}
      <p style={s.hint}>{t("context.inheritSentence")}</p>
      <p style={s.hint}>
        {t("context.orderHint", { repo: activeRepo?.full_name ?? t("context.repoFallback") })}
      </p>

      {ceiling != null && overCeiling(breakdown.own, ceiling) && (
        <div style={s.ceilingWarning}>
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
              canDropHere={dragPath != null}
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

      <AttachedIndex groups={groups} />
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
  const t = useTranslations("skills");
  // A skill's tab has no inheritance: only its own attached documents are
  // ordered, so only they are draggable and only they get move controls.
  /* EVERY row moves — same rule as the agent tab, so the two lists cannot
     behave differently. The order here is display-only; what a run injects is
     the attached documents in the order they are shown. */
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
      style={s.row(row.attached, dragging)}
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

      {/* The keyboard path to reordering — SkillsTab's drag has none. */}
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
          {t("context.rowMeta", { folder: folderOf(row), agents: row.usedBy.length })}
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
  const t = useTranslations("skills");
  const doc = useContextDoc(repoId, row.path);

  /* Mockup M3 draws a right-side overlay with a close control, not a card under
     the list — the same shape the agent tab uses. */
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

/**
 * AC-17: a grouped INDEX of what is attached, by search root. Deliberately NOT
 * captioned as the serialization — the block a run actually sends is a single
 * `## Project context` in the human's order, so grouping by root reorders it.
 * A root with nothing attached produces no heading at all.
 */
function AttachedIndex({ groups }: { groups: ReturnType<typeof groupAttachedByRoot> }) {
  const t = useTranslations("skills");
  const heading = (root: string) => {
    if (root === "specs" || root === "docs" || root === "insights") {
      return t(`context.panel.group.${root}`);
    }
    return t("context.panel.group.other", { root });
  };

  return (
    <div style={s.panel}>
      {/* M4 labels this with a small caption and nothing else. The one-line
          caption keeps the honest bit — this is a grouped index of what is
          attached, not the block a run sends. */}
      <span style={s.panelTitle}>{t("context.panel.title")}</span>
      <span style={s.panelCaption}>{t("context.panel.caption")}</span>
      {groups.length === 0 ? (
        <span style={s.panelEmpty}>{t("context.panel.empty")}</span>
      ) : (
        <div style={s.panelGroups}>
          {groups.map((g) => (
            <div key={g.root} style={s.panelGroup}>
              <span className="mono" style={s.panelHeading}>
                {heading(g.root)}
              </span>
              {g.paths.map((p) => (
                <span key={p} className="mono" style={s.panelPath}>
                  {p}
                </span>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
