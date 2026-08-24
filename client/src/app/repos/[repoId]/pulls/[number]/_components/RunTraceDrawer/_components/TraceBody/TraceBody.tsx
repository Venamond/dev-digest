/* TraceBody — the Trace tab content: Configuration, Stats, Findings, Prompt
   assembly, Tool calls, and Raw output sections for one persisted RunTrace. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge } from "@devdigest/ui";
import type { RunTrace, FindingRecord } from "@devdigest/shared";
import { CostBadge } from "@/components/cost-badge";
import { displayModelName } from "@/lib/model-label";
import { formatTokens } from "@/lib/format-tokens";
import { PROMPT_COLORS } from "../../constants";
import { formatSeconds, shortRevision } from "../../helpers";
import { s } from "../../styles";
import { TraceSection } from "../TraceSection/TraceSection";
import { ToolCallRow } from "../ToolCallRow/ToolCallRow";
import { PromptBlock } from "../PromptBlock/PromptBlock";
import { FindingsSection } from "../FindingsSection/FindingsSection";
import { Row, Stat } from "../atoms";

/**
 * The search root a traced path sits under. The trace carries paths only, and a
 * run's configured roots are not part of it, so this reads the outermost folder
 * segment — which is what the roots are, and what the reader recognises.
 */
function rootOfPath(path: string): string {
  const cut = path.indexOf("/");
  return cut > 0 ? path.slice(0, cut) : "";
}

export function TraceBody({ trace, findings }: { trace: RunTrace; findings: FindingRecord[] }) {
  const t = useTranslations("runs");
  const stats = trace.stats;

  // `specs_omitted` is `.optional()` on the contract, not `.default([])` — a Zod
  // default would make the key REQUIRED on the inferred type and break every
  // existing RunTrace literal. Absent and `[]` mean the same thing; read it once.
  const specsOmitted = trace.specs_omitted ?? [];
  // Same `.optional()` reason as `specs_omitted`: a trace written before this
  // field existed simply has none, and every path then reads as the agent's own.
  const specsSources = new Map(
    (trace.specs_sources ?? []).map((src) => [src.path, src]),
  );
  // AC-32 — "nothing was attached" and "everything attached was left out" are
  // different answers, and only the first is the none-attached state.
  const nothingAttached = trace.specs_read.length === 0 && specsOmitted.length === 0;

  return (
    <>
      <TraceSection icon="Settings" title={t("trace.configuration")}>
        <div style={s.configList}>
          <Row label={t("trace.config.model")}>
            <span className="mono" style={s.configModel}>
              {displayModelName(trace.config.model)}
            </span>
          </Row>
          <Row label={t("trace.config.provider")}>
            <span className="mono" style={s.configProvider}>
              {trace.config.provider ?? "—"}
            </span>
          </Row>
          <Row label={t("trace.config.memoryPulled")}>
            <span>{t("trace.config.items", { count: trace.memory_pulled.length })}</span>
          </Row>
          <Row label={t("trace.config.specsRead")}>
            <div style={s.specsWrap}>
              {trace.specs_read.length === 0 ? (
                <span style={s.specsNone}>
                  {nothingAttached
                    ? t("trace.config.specsNoneAttached")
                    : t("trace.config.specsAllOmitted")}
                </span>
              ) : (
                trace.specs_read.map((sp, i) => (
                  <span key={i} style={s.specRow}>
                    {/* The KIND of document, not only that one was attached —
                        same colour per root as the Context tabs use. */}
                    <span style={s.specRoot(rootOfPath(sp))}>{rootOfPath(sp)}</span>
                    <span className="mono" style={s.spec}>
                      {sp}
                    </span>
                    {/* A document inherited from a skill reaches the prompt
                        exactly like the agent's own, so the trace names the
                        skill that brought it. */}
                    {specsSources.get(sp)?.via === "skill" && (
                      <span style={s.specVia}>
                        {t("trace.config.specsViaSkill", {
                          skills: specsSources.get(sp)!.skills.join(", "),
                        })}
                      </span>
                    )}
                  </span>
                ))
              )}
            </div>
          </Row>
          {specsOmitted.length > 0 && (
            <Row label={t("trace.config.specsOmitted")}>
              <div style={s.specsWrap}>
                {specsOmitted.map((doc, i) => (
                  <span key={i} className="mono" style={s.specOmitted}>
                    <span style={s.specRoot(rootOfPath(doc.path))}>
                      {rootOfPath(doc.path)}
                    </span>{" "}
                    {/* The two reasons are spelled out, not coded: a reader has
                        to be able to tell "could not be read" from "did not
                        fit" without a legend (AC-25). */}
                    {doc.path} —{" "}
                    {doc.reason === "unreadable"
                      ? t("trace.config.omittedUnreadable")
                      : t("trace.config.omittedOverCeiling")}
                  </span>
                ))}
              </div>
            </Row>
          )}
          {trace.specs_revision != null && (
            <Row label={t("trace.config.specsRevision")}>
              <span className="mono" style={s.configProvider} title={trace.specs_revision}>
                {shortRevision(trace.specs_revision)}
              </span>
            </Row>
          )}
        </div>
      </TraceSection>

      <TraceSection
        icon="Gauge"
        title={t("trace.stats")}
        right={
          <Badge color="var(--ok)" bg="var(--ok-bg)" icon="Check">
            {stats.grounding}
          </Badge>
        }
      >
        <div style={s.statsRow}>
          <Stat label={t("trace.stat.duration")} val={formatSeconds(stats.duration_ms)} />
          <Stat label={t("trace.stat.tokens")} val={formatTokens(stats.tokens_in, stats.tokens_out)} />
          <Stat label={t("trace.stat.cost")} val={<CostBadge usd={stats.cost_usd} />} />
          <Stat label={t("trace.stat.findings")} val={stats.findings} />
        </div>
      </TraceSection>

      <FindingsSection findings={findings} />

      <TraceSection icon="FileText" title={t("trace.promptAssembly")} defaultOpen={false}>
        <PromptBlock label={t("trace.prompt.system")} text={trace.prompt_assembly.system} color={PROMPT_COLORS.system} />
        {trace.prompt_assembly.skills != null && (
          <PromptBlock label={t("trace.prompt.skills")} text={trace.prompt_assembly.skills} color={PROMPT_COLORS.skills} />
        )}
        {trace.prompt_assembly.memory != null && (
          <PromptBlock label={t("trace.prompt.memory")} text={trace.prompt_assembly.memory} color={PROMPT_COLORS.memory} />
        )}
        {trace.prompt_assembly.repo_map != null && (
          <PromptBlock label={t("trace.prompt.repoMap")} text={trace.prompt_assembly.repo_map} color={PROMPT_COLORS.repoMap} />
        )}
        {trace.prompt_assembly.specs != null && (
          <PromptBlock label={t("trace.prompt.specs")} text={trace.prompt_assembly.specs} color={PROMPT_COLORS.specs} />
        )}
        {trace.prompt_assembly.callers != null && (
          <PromptBlock label={t("trace.prompt.callers")} text={trace.prompt_assembly.callers} color={PROMPT_COLORS.callers} />
        )}
        {trace.prompt_assembly.intent != null && (
          <PromptBlock label={t("trace.prompt.intent")} text={trace.prompt_assembly.intent} color={PROMPT_COLORS.intent} />
        )}
        <PromptBlock label={t("trace.prompt.user")} text={trace.prompt_assembly.user} color={PROMPT_COLORS.user} />
      </TraceSection>

      <TraceSection
        icon="Wrench"
        title={t("trace.toolCalls")}
        right={<Badge color="var(--text-muted)">{trace.tool_calls.length}</Badge>}
      >
        {trace.tool_calls.length === 0 ? (
          <span style={s.noToolCalls}>{t("trace.noToolCalls")}</span>
        ) : (
          trace.tool_calls.map((tc, i) => <ToolCallRow key={i} tc={tc} />)
        )}
      </TraceSection>

      <TraceSection icon="Code" title={t("trace.rawOutput")} defaultOpen={false}>
        <pre className="mono" style={s.rawPre}>
          {trace.raw_output || "—"}
        </pre>
      </TraceSection>
    </>
  );
}
