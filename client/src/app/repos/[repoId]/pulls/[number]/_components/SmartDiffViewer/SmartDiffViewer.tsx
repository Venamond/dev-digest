/* SmartDiffViewer — header chrome only: the Smart/Original order toggle and
   the too_big/proposed_splits banner. Lists NO files — the real FileCards
   live inside DiffViewer's group sections (see
   docs/plans/2026-08-14-smart-diff.md §2b: one list, never a second). */
"use client";

import { useTranslations } from "next-intl";
import type { SmartDiff } from "@devdigest/shared";
import { DIFF_ORDERS, type DiffOrder } from "./constants";
import { s } from "./styles";

export function SmartDiffViewer({
  smartDiff,
  order,
  onOrderChange,
}: {
  smartDiff: SmartDiff | null | undefined;
  order: DiffOrder;
  onOrderChange: (next: DiffOrder) => void;
}) {
  const t = useTranslations("prReview.smartDiff");

  if (!smartDiff || smartDiff.groups.length === 0) {
    // An empty group list is the visible symptom of "PR files never
    // imported" — must never render null (that reads as "feature didn't ship").
    return <div style={s.empty}>{t("empty")}</div>;
  }

  const { too_big, total_lines, proposed_splits } = smartDiff.split_suggestion;

  return (
    <div style={s.row}>
      <div style={s.toggle}>
        {DIFF_ORDERS.map((o) => (
          <button
            key={o}
            type="button"
            aria-pressed={order === o}
            style={s.toggleButton(order === o)}
            onClick={() => onOrderChange(o)}
          >
            {t(`order.${o}`)}
          </button>
        ))}
      </div>
      {too_big && (
        <div style={s.banner}>
          <span>{t("tooBig", { lines: total_lines })}</span>
          {proposed_splits.map((p) => (
            <span key={p.name} style={s.splitLine}>
              {t("proposedSplit", { name: p.name, count: p.files.length })}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
