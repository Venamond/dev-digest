/* SmartDiffViewer — header chrome only: eyebrow + file stats, the
   Smart/Original order toggle, the 0-new-tokens hint, and the
   too_big/proposed_splits banner. Lists NO files — the real FileCards
   live inside DiffViewer's group sections (see
   docs/plans/2026-08-14-smart-diff.md §2b: one list, never a second). */
"use client";

import { useTranslations } from "next-intl";
import { Icon } from "@devdigest/ui";
import type { ReactNode } from "react";
import type { SmartDiff } from "@devdigest/shared";
import { DIFF_ORDERS, type DiffOrder } from "./constants";
import { s } from "./styles";

export function SmartDiffViewer({
  smartDiff,
  order,
  onOrderChange,
  filesCount = 0,
  additions = 0,
  deletions = 0,
  reviewTokensIn = null,
  extraRight,
}: {
  smartDiff: SmartDiff | null | undefined;
  order: DiffOrder;
  onOrderChange: (next: DiffOrder) => void;
  filesCount?: number;
  additions?: number;
  deletions?: number;
  /** Prompt tokens of the newest completed review wave; null hides "built on". */
  reviewTokensIn?: number | null;
  extraRight?: ReactNode;
}) {
  const t = useTranslations("prReview.smartDiff");
  const hasGroups = !!smartDiff && smartDiff.groups.length > 0;
  const smartChrome = hasGroups && order === "smart";

  return (
    <div style={s.header}>
      <div style={s.topRow}>
        <div style={s.eyebrow}>
          <Icon.Code size={14} style={{ color: "var(--text-muted)" }} />
          <span style={s.eyebrowText}>{smartChrome ? t("eyebrowSmart") : t("eyebrowOriginal")}</span>
        </div>
        <div style={s.right}>
          {extraRight}
          {hasGroups && (
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
          )}
        </div>
      </div>
      <div style={s.stats}>
        <span>{t("fileCount", { count: filesCount })}</span>
        <span style={s.statsSep}>·</span>
        <span className="tnum" style={s.add}>
          +{additions}
        </span>
        <span className="tnum" style={s.del}>
          −{deletions}
        </span>
      </div>
      <div style={s.tokenHint}>
        <Icon.Zap size={12} style={s.tokenHintIcon} />
        <span>{t("zeroNewTokens")}</span>
        {reviewTokensIn != null && (
          <>
            <span style={s.statsSep}>·</span>
            <span>{t("builtOnLastReview", { count: reviewTokensIn })}</span>
          </>
        )}
      </div>
      {!hasGroups && <div style={s.empty}>{t("empty")}</div>}
      {hasGroups && smartDiff.split_suggestion.too_big && (
        <div style={s.banner}>
          <span>{t("tooBig", { lines: smartDiff.split_suggestion.total_lines })}</span>
          {smartDiff.split_suggestion.proposed_splits.map((p) => (
            <span key={p.name} style={s.splitLine}>
              {t("proposedSplit", { name: p.name, count: p.files.length })}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
