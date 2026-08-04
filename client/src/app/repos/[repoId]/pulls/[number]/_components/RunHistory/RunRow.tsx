"use client";

import { useTranslations } from "next-intl";
import { Badge, Icon, SEV, CircularScore } from "@devdigest/ui";
import type { FindingRecord, RunSummary } from "@devdigest/shared";
import { CostBadge } from "@/components/cost-badge";
import { HoverPreviewAnchor } from "@/components/findings-preview/HoverPreviewAnchor";
import { FindingsPreviewPanel } from "@/components/findings-preview/FindingsPreviewPanel";
import { outcomeOf, SEVERITY_LEVELS } from "./helpers";
import { iconBtnStyle, rowStyle } from "./styles";

export function RunRow({
  run: r,
  findings: runFindings,
  onOpenTrace,
  onGoToReview,
  onDelete,
}: {
  run: RunSummary;
  findings?: FindingRecord[];
  onOpenTrace: (runId: string) => void;
  onGoToReview?: (runId: string) => void;
  onDelete?: (runId: string) => void;
}) {
  const t = useTranslations("prReview");
  const o = outcomeOf(r);
  const settled = r.status === "done";
  const severityCounts = runFindings
    ? SEVERITY_LEVELS.map(
        (level) => [level, runFindings.filter((f) => f.severity === level).length] as const,
      )
    : [];
  const severityTotal = severityCounts.reduce((n, [, count]) => n + count, 0);

  return (
    <div style={rowStyle}>
      <Badge color={o.color} bg={o.bg} icon={o.icon}>
        {t(`runStatus.${o.key}`)}
      </Badge>
      {settled && r.score != null && <CircularScore score={r.score} size={30} stroke={3} />}
      <div style={{ display: "flex", flexDirection: "column", gap: 2, flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
          <button
            type="button"
            onClick={() => onGoToReview?.(r.run_id)}
            title={t("timeline.goToReview")}
            style={{
              background: "none",
              border: "none",
              padding: 0,
              font: "inherit",
              fontWeight: 600,
              color: "var(--text-primary)",
              cursor: onGoToReview ? "pointer" : "default",
              textDecoration: onGoToReview ? "underline" : "none",
              textDecorationStyle: "dotted",
              textUnderlineOffset: 3,
            }}
          >
            {r.agent_name ?? t("reviewRun.agentTitle")}
          </button>{" "}
          <span className="mono" style={{ fontSize: 12, fontWeight: 400, color: "var(--text-muted)" }}>
            {r.provider}/{r.model}
          </span>
        </div>
        {r.status === "failed" && r.error && (
          <div
            style={{
              fontSize: 12,
              color: "var(--crit)",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
            title={r.error}
          >
            {r.error}
          </div>
        )}
        {settled && runFindings && severityTotal > 0 ? (
          <HoverPreviewAnchor content={<FindingsPreviewPanel findings={runFindings} count={severityTotal} />}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12 }}>
              {severityCounts
                .filter(([, count]) => count > 0)
                .map(([level, count]) => {
                  const SevIcon = Icon[SEV[level].icon];
                  return (
                    <span
                      key={level}
                      style={{ display: "inline-flex", alignItems: "center", gap: 2, color: SEV[level].c }}
                    >
                      <SevIcon size={12} />
                      <span
                        style={{
                          textDecoration: "underline",
                          textDecorationStyle: "dotted",
                          textUnderlineOffset: 2,
                        }}
                      >
                        {count}
                      </span>
                    </span>
                  );
                })}
              {(r.blockers ?? 0) > 0 && (
                <span style={{ color: "var(--text-muted)" }}>
                  {t("runStatus.blockers", { count: r.blockers ?? 0 })}
                </span>
              )}
            </div>
          </HoverPreviewAnchor>
        ) : (
          settled && (
            <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
              {t("runStatus.findings", { count: r.findings_count ?? 0 })}
              {(r.blockers ?? 0) > 0 ? t("runStatus.blockers", { count: r.blockers ?? 0 }) : ""}
            </div>
          )
        )}
      </div>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "flex-end",
          gap: 2,
          fontSize: 11,
          color: "var(--text-muted)",
          flexShrink: 0,
        }}
      >
        {r.ran_at && <span>{new Date(r.ran_at).toLocaleTimeString()}</span>}
        <CostBadge usd={r.cost_usd} />
      </div>
      <button
        type="button"
        title={t("timeline.openTrace")}
        aria-label={t("timeline.openTrace")}
        onClick={() => onOpenTrace(r.run_id)}
        style={iconBtnStyle}
      >
        <Icon.FileText size={13} />
      </button>
      {onDelete && r.status !== "running" && (
        <span
          role="button"
          aria-label={t("timeline.deleteRun")}
          title={t("timeline.deleteRun")}
          onClick={() => onDelete(r.run_id)}
          style={{
            display: "inline-flex",
            padding: 3,
            borderRadius: 5,
            color: "var(--text-muted)",
            flexShrink: 0,
            cursor: "pointer",
          }}
        >
          <Icon.Trash size={13} />
        </span>
      )}
    </div>
  );
}
