/* BriefBanner — the PR Brief banner at the top of the Overview tab.
   Distinct from VerdictBanner (the Findings tab's per-run surface, untouched):
   every element here renders whether or not the data behind another one is
   present (AC-24), which is exactly what VerdictBanner gates away. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Button, CircularScore, Icon, IconBtn, SectionLabel, Skeleton } from "@devdigest/ui";
import type { BriefInputId, PrBriefRecord } from "@devdigest/shared";
import { HoverPreviewAnchor } from "@/components/findings-preview/HoverPreviewAnchor";
import { CostBadge } from "@/components/cost-badge";
import { formatTokens } from "@/lib/format-tokens";
import { useBuildBrief, usePrBrief } from "@/lib/hooks/brief";
import { usePrReviews } from "@/lib/hooks/reviews";
import { VERDICT_META } from "../VerdictBanner/constants";
import { RISK_BG, RISK_COLOR, RISK_COLOR_FALLBACK } from "../IntentCard/constants";
import { joinWhatWhy, runFacts } from "./helpers";
import { s } from "./styles";

/** The status tile with no finished run: the same square, saying nothing.
 *  A verdict colour here would assert a verdict that no run produced. */
const NO_RUN_TILE = { c: "var(--text-muted)", bg: "var(--bg-hover)", icon: "Slash" } as const;

/** The `ⓘ` panel: which inputs reached the model call, what the budget cut,
 *  and what was missing (AC-36 — and where AC-16 and AC-7's statement land). */
function InputsPanel({ record }: { record: PrBriefRecord }) {
  const t = useTranslations("prReview.brief");
  const name = (id: BriefInputId) => t(`input.${id}`);
  return (
    <div style={s.panel}>
      <div style={s.panelHeading}>{t("inputs.title")}</div>
      <div style={s.panelGroup}>
        <div style={s.panelHeading}>{t("inputs.included")}</div>
        <ul style={s.panelList}>
          {record.inputs_included.length === 0 ? (
            <li style={s.panelItem}>{t("inputs.none")}</li>
          ) : (
            record.inputs_included.map((id) => (
              <li key={id} style={s.panelItem}>
                {name(id)}
              </li>
            ))
          )}
        </ul>
      </div>
      {record.inputs_cut.length > 0 && (
        <div style={s.panelGroup}>
          <div style={s.panelHeading}>{t("inputs.cut")}</div>
          <ul style={s.panelList}>
            {record.inputs_cut.map((cut, i) => (
              <li key={`${cut.input}:${i}`} style={s.panelItem}>
                {name(cut.input)} — {cut.detail}
              </li>
            ))}
          </ul>
        </div>
      )}
      {/* AC-16, the case where the cuts were not enough. It sits beside the cut
          list because it is the same statement carried one step further: this
          is what went, and it still did not fit. Never a silent omission —
          `null` here means the request was genuinely inside the budget. */}
      {record.inputs_over_budget != null && (
        <div style={s.panelItem}>
          {t("inputs.overBudget", {
            measured: record.inputs_over_budget.measured,
            budget: record.inputs_over_budget.budget,
          })}
        </div>
      )}
      {record.inputs_missing.length > 0 && (
        <div style={s.panelGroup}>
          <div style={s.panelHeading}>{t("inputs.missing")}</div>
          <ul style={s.panelList}>
            {record.inputs_missing.map((id) => (
              <li key={id} style={s.panelItem}>
                {name(id)}
              </li>
            ))}
          </ul>
        </div>
      )}
      {record.blast_state !== "ok" && (
        <div style={s.panelItem}>{t(`blast.${record.blast_state ?? "none"}`)}</div>
      )}
    </div>
  );
}

export function BriefBanner({ prId }: { prId: string | null }) {
  const t = useTranslations("prReview");
  const tb = useTranslations("prReview.brief");
  const { data, isLoading } = usePrBrief(prId);
  const { data: reviews } = usePrReviews(prId);
  const build = useBuildBrief(prId);

  const onBuild = (force: boolean) => {
    if (!prId) return;
    build.mutate({ force });
  };

  if (isLoading) {
    return (
      <section>
        <SectionLabel icon="FileText">{tb("label")}</SectionLabel>
        <Skeleton height={116} />
      </section>
    );
  }

  // The error branch is checked BEFORE the data branch on purpose: a failed
  // rebuild replaces the brief that was on screen and never renders beside it
  // (AC-39).
  if (build.isError) {
    return (
      <section>
        <SectionLabel icon="FileText">{tb("label")}</SectionLabel>
        <div style={s.stateBox}>
          <p style={s.errorText}>{tb("error")}</p>
          <Button kind="secondary" size="sm" icon="RefreshCw" onClick={() => onBuild(true)}>
            {tb("retry")}
          </Button>
        </div>
      </section>
    );
  }

  if (build.isPending) {
    return (
      <section>
        <SectionLabel icon="FileText">{tb("label")}</SectionLabel>
        <div style={s.stateBox}>
          <p style={s.stateText}>{tb("building")}</p>
        </div>
      </section>
    );
  }

  if (data == null) {
    return (
      <section>
        <SectionLabel icon="FileText">{tb("label")}</SectionLabel>
        <div style={s.stateBox}>
          <p style={s.stateText}>{tb("empty")}</p>
          <Button kind="secondary" size="sm" disabled={!prId} onClick={() => onBuild(false)}>
            {tb("build")}
          </Button>
        </div>
      </section>
    );
  }

  const facts = runFacts(reviews);
  const meta = facts.verdict != null ? VERDICT_META[facts.verdict] : null;
  const tile = meta ?? NO_RUN_TILE;
  const TileIcon = Icon[tile.icon];
  const riskColor = RISK_COLOR[data.brief.risk_level] ?? RISK_COLOR_FALLBACK;
  /* Tinted to the level, not left on the grey default: a `high` chip beside a
     calm verdict icon (the run said "Comment") otherwise reads as decoration.
     The icon belongs to the review verdict and stays as it is — the chip is
     the only thing on this row that speaks for the brief. */
  const riskBg = RISK_BG[data.brief.risk_level];

  return (
    <section>
      <SectionLabel icon="FileText">{tb("label")}</SectionLabel>
      <div style={s.wrap}>
        <div style={s.statusTile(tile.bg, tile.c)}>
          <TileIcon size={22} />
        </div>

        <div style={s.main}>
          <div style={s.titleRow}>
            <span style={s.verdictLabel(tile.c)}>
              {meta ? t(`verdict.${meta.labelKey}`) : tb("notReviewed")}
            </span>
            <Badge color={riskColor} bg={riskBg}>
              {tb(`risk.${data.brief.risk_level}`)}
            </Badge>
            <Badge color="var(--text-secondary)">
              {facts.reviewed
                ? `${t("verdict.findingsCount", { count: facts.findings })}${
                    facts.blockers > 0 ? t("verdict.blockers", { count: facts.blockers }) : ""
                  }`
                : tb("noReviewRun")}
            </Badge>
            <HoverPreviewAnchor content={<InputsPanel record={data} />}>
              <span style={s.infoGlyph} aria-label={tb("inputs.title")} role="img">
                <Icon.Info size={15} />
              </span>
            </HoverPreviewAnchor>
          </div>
          <p style={s.paragraph}>
            {joinWhatWhy(data.brief.what, data.brief.why)}
          </p>
          {data.stale && <p style={s.staleNote}>{tb("stale")}</p>}
        </div>

        <div style={s.side}>
          <div style={s.sideTop}>
            <IconBtn icon="RefreshCw" label={tb("regenerate")} onClick={() => onBuild(true)} />
            <div style={s.scoreCol}>
              {facts.score != null ? (
                <CircularScore score={facts.score} size={52} stroke={5} />
              ) : (
                <div style={s.emptyRing}>{tb("scoreEmpty")}</div>
              )}
              <span style={s.scoreLabel}>{t("verdict.prScore")}</span>
            </div>
          </div>
          <div style={s.costLine}>
            <span style={s.costGlyph}>$</span>
            <CostBadge usd={data.cost_usd} />
            <span className="mono tnum" style={s.tokens}>
              {formatTokens(data.tokens_in, data.tokens_out)}
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}
