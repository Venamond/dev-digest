/* PRRow — one clickable row in the PR list table. Ported from screen_dashboard.jsx. */
"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Icon, Avatar, Badge, CircularScore, SEV } from "@devdigest/ui";
import { CostBadge } from "@/components/cost-badge";
import { FindingsPreviewPopover } from "./FindingsPreviewPopover";
import type { PrMeta } from "@/lib/types";
import { SIZE_COLOR, STATUS_META } from "../../constants";
import { relativeTime, sizeOf } from "../../helpers";
import { s } from "../../styles";

/** (lowercase PrMeta.findings key) → SEV token key, in display order. */
const FINDINGS_LEVELS = [
  ["critical", "CRITICAL"],
  ["warning", "WARNING"],
  ["suggestion", "SUGGESTION"],
] as const;

export function PRRow({ pr, repoId }: { pr: PrMeta; repoId: string }) {
  const t = useTranslations("prReview");
  const router = useRouter();
  const [h, setH] = React.useState(false);
  const st = STATUS_META[pr.status] ?? STATUS_META.needs_review!;
  const { size, lines } = sizeOf(pr);
  const reviewed = pr.score != null; // null score ⇒ PR has never been reviewed
  return (
    <div
      onMouseEnter={() => setH(true)}
      onMouseLeave={() => setH(false)}
      onClick={() => router.push(`/repos/${repoId}/pulls/${pr.number}`)}
      style={s.row(h)}
    >
      <div style={s.rowTitleCell}>
        <Icon.GitPullRequest size={15} style={s.rowIcon(st.c)} />
        <div style={s.rowTitleWrap}>
          <div style={s.rowTitle(h)}>{pr.title}</div>
          <span className="mono" style={s.rowNumber}>
            #{pr.number}
          </span>
        </div>
      </div>
      <div style={s.authorCell}>
        <Avatar name={pr.author} size={18} />
        {pr.author}
      </div>
      <div>
        <Badge
          color={SIZE_COLOR[size]}
          bg="transparent"
          style={s.sizeBadgeBorder(SIZE_COLOR[size]!)}
        >
          {size} · {lines}
        </Badge>
      </div>
      <div style={s.scoreCell}>
        {reviewed ? (
          <CircularScore score={pr.score!} size={34} stroke={3} />
        ) : (
          <span style={s.muted}>—</span>
        )}
      </div>
      <div style={s.findingsCell}>
        {pr.findings && (pr.findings.critical || pr.findings.warning || pr.findings.suggestion) ? (
          <FindingsPreviewPopover
            // pr.id is typed nullish in the shared PrMeta contract, but this branch only
            // renders when pr.findings has a nonzero count, which only happens for a
            // persisted PR row that always has an id — and even if it were ever
            // undefined, usePrReviews's own `enabled: !!prId` guard means the query
            // simply never fires.
            prId={pr.id as string}
            count={pr.findings.critical + pr.findings.warning + pr.findings.suggestion}
          >
            {FINDINGS_LEVELS.filter(([key]) => pr.findings![key] > 0).map(([key, sevKey]) => {
              const SevIcon = Icon[SEV[sevKey].icon];
              return (
                <span
                  key={key}
                  style={{ display: "inline-flex", alignItems: "center", gap: 2, color: SEV[sevKey].c }}
                >
                  <SevIcon size={13} />
                  {pr.findings![key]}
                </span>
              );
            })}
          </FindingsPreviewPopover>
        ) : (
          <span style={s.muted}>—</span>
        )}
      </div>
      <div>
        <Badge dot color={st.c} bg="transparent">
          {t(`list.status.${st.labelKey}`)}
        </Badge>
      </div>
      <div style={s.costCell}>
        <CostBadge usd={pr.cost_usd} />
      </div>
      <div style={s.updatedCell}>{relativeTime(pr.updated_at)}</div>
    </div>
  );
}
