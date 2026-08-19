"use client";

import React from "react";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button, Icon } from "@devdigest/ui";
import type { BlastLink, BlastSymbolImpact } from "@devdigest/shared";
import { useBlast, useBlastSummary, useDeriveBlastSummary } from "@/lib/hooks/reviews";
import { useResyncRepoIntel } from "@/lib/hooks/repo-intel";
import { MermaidDiagram } from "@/components/mermaid-diagram/MermaidDiagram";
import { githubBlobUrl } from "@/lib/github-urls";
import { buildFlowchart, countGraphNodes } from "./helpers";
import { MAX_GRAPH_NODES, REASON_KEY, REASON_KEY_FALLBACK } from "./constants";
import { s } from "./styles";

/**
 * A `file[:line]` deep link, always built from `link.indexed_sha`.
 * The line numbers in this payload come from the index, which is built from
 * the repo's default branch — pointing them at the PR head would open the
 * wrong line (or a 404). With no indexed commit there is no honest link, so
 * the path renders as plain text and the card explains why (`unlinked`).
 */
function FileRef({
  link,
  file,
  line,
  label,
}: {
  link: BlastLink;
  file: string;
  line?: number;
  label: string;
}) {
  if (!link.indexed_sha) return <span style={s.tag}>{label}</span>;
  return (
    <a
      href={githubBlobUrl(link.repo_full_name, link.indexed_sha, file, line)}
      target="_blank"
      rel="noreferrer"
      style={s.link}
    >
      {label}
    </a>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div style={s.stat}>
      <span style={s.statValue}>{value}</span>
      <span style={s.statLabel}>{label}</span>
    </div>
  );
}

/** Callers (from `references`) and importers (reverse-import graph) are two
 *  different relationships and are rendered as two groups — an importer that
 *  never calls the symbol is not a call site. */
function SymbolBlock({ symbol, link }: { symbol: BlastSymbolImpact; link: BlastLink }) {
  const t = useTranslations("blast");
  return (
    <div style={s.symbol}>
      <div style={s.symbolHeader}>
        <span style={s.symbolName}>{symbol.name}</span>
        <span style={s.symbolKind}>{symbol.kind}</span>
        <span style={s.symbolFile}>{symbol.file}</span>
      </div>
      <div style={s.sectionLabel}>{t("callerCount", { count: symbol.callers_total })}</div>
      {symbol.callers.length > 0 && (
        <ul style={s.list}>
          {symbol.callers.map((caller) => (
            <li key={`${caller.file}:${caller.symbol}:${caller.line}`} style={s.listItem}>
              <FileRef
                link={link}
                file={caller.file}
                line={caller.line}
                label={`${caller.file}:${caller.line}`}
              />{" "}
              {caller.symbol}
            </li>
          ))}
        </ul>
      )}
      {symbol.callers_truncated && (
        <p style={s.note}>
          {t("truncated", { shown: symbol.callers.length, total: symbol.callers_total })}
        </p>
      )}
      {symbol.importers.length > 0 && (
        <>
          <div style={s.sectionLabel}>{t("importers")}</div>
          <ul style={s.list}>
            {symbol.importers.map((importer) => (
              <li key={importer.file} style={s.listItem}>
                <FileRef link={link} file={importer.file} label={importer.file} />
              </li>
            ))}
          </ul>
        </>
      )}
      {(symbol.endpoints.length > 0 || symbol.crons.length > 0) && (
        <ul style={s.list}>
          {symbol.endpoints.map((endpoint) => (
            <li key={`endpoint:${endpoint}`} style={s.listItem}>
              {endpoint}
            </li>
          ))}
          {symbol.crons.map((cron) => (
            <li key={`cron:${cron}`} style={s.listItem}>
              {cron}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function BlastCard({ prId }: { prId: string | null }) {
  const t = useTranslations("blast");
  const params = useParams<{ repoId: string }>();
  const repoId = params?.repoId ?? null;
  const { data, isLoading } = useBlast(prId);
  const summary = useBlastSummary(prId);
  const derive = useDeriveBlastSummary(prId);
  const resync = useResyncRepoIntel(repoId);
  const [view, setView] = React.useState<"tree" | "graph">("tree");

  const chart = React.useMemo(() => (data ? buildFlowchart(data) : ""), [data]);
  const graphNodes = React.useMemo(() => (data ? countGraphNodes(data) : 0), [data]);

  const summaryText = summary.data?.summary;
  const hasMap = data != null && (data.state === "ok" || data.state === "partial");
  // The map is worth drawing only when something downstream was actually found.
  const hasImpact = data != null && data.symbols.length > 0 && data.totals.callers > 0;

  let body: React.ReactNode;
  if (isLoading) {
    body = <div style={s.skeleton} />;
  } else if (data == null) {
    body = <p style={s.empty}>{t("error")}</p>;
  } else if (data.state === "degraded") {
    body = (
      <>
        <p style={s.empty}>{t(REASON_KEY[data.reason ?? ""] ?? REASON_KEY_FALLBACK)}</p>
        <div style={s.actions}>
          <Button
            kind="secondary"
            size="sm"
            icon="RefreshCw"
            loading={resync.isPending}
            disabled={!repoId}
            onClick={() => resync.mutate()}
          >
            {t("reindex")}
          </Button>
        </div>
      </>
    );
  } else {
    const { totals, link } = data;
    body = (
      <>
        {data.state === "partial" && <div style={s.banner}>{t("partial")}</div>}
        <div style={s.stats}>
          <Stat value={String(totals.symbols)} label={t("stat.symbols")} />
          <Stat
            value={
              totals.callers === totals.callers_found
                ? String(totals.callers)
                : `${totals.callers} / ${totals.callers_found}`
            }
            label={t("stat.callers")}
          />
          <Stat value={String(totals.endpoints)} label={t("stat.endpoints")} />
          <Stat value={String(totals.crons)} label={t("stat.crons")} />
        </div>
        {summaryText ? (
          <div style={s.summaryBox}>
            <span style={s.sectionLabel}>{t("summaryTitle")}</span>
            <p style={s.summaryText}>{summaryText}</p>
          </div>
        ) : derive.isError ? (
          <div style={s.summaryBox}>
            <p style={s.note}>{t("summaryFailed")}</p>
            <div style={s.actions}>
              <Button kind="ghost" size="sm" onClick={() => derive.mutate()}>
                {t("retry")}
              </Button>
            </div>
          </div>
        ) : null}
        {!link.indexed_sha && <p style={s.note}>{t("unlinked")}</p>}
        {data.downstream_truncated && <p style={s.note}>{t("downstreamTruncated")}</p>}
        {view === "tree" ? (
          hasImpact ? (
            <div style={s.tree}>
              {data.symbols.map((symbol) => (
                <SymbolBlock key={`${symbol.file}:${symbol.name}`} symbol={symbol} link={link} />
              ))}
            </div>
          ) : (
            <p style={s.empty}>{t("noDownstream", { count: totals.symbols })}</p>
          )
        ) : chart ? (
          <>
            <div role="img" aria-label={t("graph.ariaLabel")}>
              <MermaidDiagram chart={chart} />
            </div>
            {graphNodes > MAX_GRAPH_NODES && (
              <p style={s.note}>
                {t("truncated", { shown: MAX_GRAPH_NODES, total: graphNodes })}
              </p>
            )}
          </>
        ) : (
          <p style={s.empty}>{t("graph.empty")}</p>
        )}
        {data.prior_pulls.length > 0 && (
          <details style={s.details}>
            <summary style={s.summaryToggle}>{t("priorPulls")}</summary>
            {data.prior_pulls.map((pull) => (
              <div key={pull.number} style={s.priorRow}>
                {`#${pull.number} · ${pull.title} · ${pull.author} · ${pull.status}`}
                {pull.updated_at
                  ? ` · ${new Date(pull.updated_at).toLocaleDateString()}`
                  : ""}
              </div>
            ))}
          </details>
        )}
      </>
    );
  }

  return (
    <section>
      <div style={s.card}>
        <div style={s.header}>
          <div style={s.headerLabel}>
            <Icon.Zap size={14} style={{ color: "var(--text-muted)" }} />
            <span style={s.headerTitle}>{t("title")}</span>
          </div>
          {hasMap && (
            <div style={s.actions}>
              {!summaryText && !derive.isError && (
                <Button
                  kind="ghost"
                  size="sm"
                  loading={derive.isPending}
                  disabled={!prId || derive.isPending}
                  onClick={() => derive.mutate()}
                >
                  {t("explain")}
                </Button>
              )}
              <div style={s.toggle}>
                <button
                  type="button"
                  aria-pressed={view === "tree"}
                  style={s.toggleButton(view === "tree")}
                  onClick={() => setView("tree")}
                >
                  {t("view.tree")}
                </button>
                <button
                  type="button"
                  aria-pressed={view === "graph"}
                  style={s.toggleButton(view === "graph")}
                  onClick={() => setView("graph")}
                >
                  {t("view.graph")}
                </button>
              </div>
            </div>
          )}
        </div>
        {body}
      </div>
    </section>
  );
}
