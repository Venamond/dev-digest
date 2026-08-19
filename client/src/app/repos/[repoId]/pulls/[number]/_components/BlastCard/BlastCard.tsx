"use client";

import React from "react";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Avatar, Button, Icon } from "@devdigest/ui";
import type { BlastLink, BlastResponse, BlastSymbolImpact } from "@devdigest/shared";
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

function Stat({
  icon,
  value,
  label,
}: {
  icon: "Code" | "CornerDownRight" | "Globe" | "Clock";
  value: string;
  label: string;
}) {
  const I = Icon[icon];
  return (
    <span style={s.stat}>
      <I size={13} style={{ color: "var(--text-muted)", flexShrink: 0 }} />
      <span style={s.statValue}>{value}</span>
      <span style={s.statLabel}>{label}</span>
    </span>
  );
}

/**
 * The generated paragraph, foldable. It cannot be dismissed outright: it is
 * not persisted, so throwing it away would mean paying for another model call
 * to see it again. Collapsing keeps it in reach.
 */
function SummaryBox({ text }: { text: string }) {
  const t = useTranslations("blast");
  const [open, setOpen] = React.useState(true);
  return (
    <div style={s.summaryBox}>
      <button
        type="button"
        style={s.summaryHeader}
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        <span style={s.sectionLabel}>{t("summaryTitle")}</span>
        <Icon.ChevronDown size={16} style={s.chevron(open)} />
      </button>
      {open && <p style={s.summaryText}>{text}</p>}
    </div>
  );
}

/** Prior PRs that touched the same files — history beside the structural map. */
function PriorPulls({ pulls }: { pulls: BlastResponse["prior_pulls"] }) {
  const t = useTranslations("blast");
  const [open, setOpen] = React.useState(false);
  return (
    <div style={s.priorCard}>
      <button type="button" style={s.priorToggle} aria-expanded={open} onClick={() => setOpen(!open)}>
        <Icon.History size={14} style={{ color: "var(--text-muted)", flexShrink: 0 }} />
        <span>{t("priorPulls")}</span>
        <span style={s.priorCountBadge}>{pulls.length}</span>
        <Icon.ChevronDown size={16} style={s.chevron(open)} />
      </button>
      {open && (
        <div style={s.priorList}>
          {pulls.map((pull) => (
            <div key={pull.number} style={s.priorRow}>
              <div style={s.priorTitleLine}>
                <span style={s.priorNumber}>{`#${pull.number}`}</span>
                <span style={s.priorTitle}>{pull.title}</span>
              </div>
              <div style={s.priorMeta}>
                <Avatar name={pull.author} size={16} />
                <span>{pull.author}</span>
                {pull.updated_at && <span>{`· ${new Date(pull.updated_at).toLocaleDateString()}`}</span>}
                <span>{`· ${pull.status}`}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** Callers (from `references`) and importers (reverse-import graph) are two
 *  different relationships and are rendered as two groups — an importer that
 *  never calls the symbol is not a call site. */
function SymbolBlock({
  symbol,
  link,
  defaultOpen,
}: {
  symbol: BlastSymbolImpact;
  link: BlastLink;
  defaultOpen: boolean;
}) {
  const t = useTranslations("blast");
  const [open, setOpen] = React.useState(defaultOpen);
  const Chevron = open ? Icon.ChevronDown : Icon.ChevronRight;
  return (
    <div style={s.symbol}>
      <button
        type="button"
        style={s.symbolHeader}
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        <Chevron size={14} style={{ color: "var(--text-muted)", flexShrink: 0 }} />
        <Icon.Code size={13} style={{ color: "var(--text-muted)", flexShrink: 0 }} />
        <span style={s.symbolName}>{symbol.name}</span>
        <span style={s.symbolKind}>{symbol.kind}</span>
        {/* The count follows the call sites actually listed below.
            `callers_total` counts distinct caller FILES (see the contract
            JSDoc), so using it here would label N rows with another unit. */}
        <span style={s.symbolCount}>{t("callerCount", { count: symbol.callers.length })}</span>
      </button>
      {open && (
      <div style={s.symbolBody}>
      <div style={s.symbolFile}>{symbol.file}</div>
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
          {t("truncated", {
            shown: new Set(symbol.callers.map((c) => c.file)).size,
            total: symbol.callers_total,
          })}
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
        <div style={s.statBar}>
          <div style={s.stats}>
            <Stat icon="Code" value={String(totals.symbols)} label={t("stat.symbols")} />
            <Stat
              icon="CornerDownRight"
              value={
                totals.callers === totals.callers_found
                  ? String(totals.callers)
                  : `${totals.callers} / ${totals.callers_found}`
              }
              label={t("stat.callers")}
            />
            <Stat icon="Globe" value={String(totals.endpoints)} label={t("stat.endpoints")} />
            <Stat icon="Clock" value={String(totals.crons)} label={t("stat.crons")} />
          </div>
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
        {summaryText ? (
          <SummaryBox text={summaryText} />
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
              {data.symbols.map((symbol, i) => (
                <SymbolBlock
                  key={`${symbol.file}:${symbol.name}`}
                  symbol={symbol}
                  link={link}
                  // The first symbol opens so the card shows real content on
                  // arrival; the rest stay collapsed so a wide PR is scannable.
                  defaultOpen={i === 0}
                />
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
          <>
            <div style={s.divider} />
            <PriorPulls pulls={data.prior_pulls} />
          </>
        )}
      </>
    );
  }

  return (
    <section>
      <div style={s.card}>
        <div style={s.header}>
          <div style={s.headerLabel}>
            {/* Connected nodes, not a lightning bolt: the card is a dependency
                map, and the reference design marks it as one. */}
            <Icon.Workflow size={14} style={{ color: "var(--text-muted)" }} />
            <span style={s.headerTitle}>{t("title")}</span>
          </div>
          {hasMap && !summaryText && !derive.isError && (
            <div style={s.actions}>
              <Button
                kind="ghost"
                size="sm"
                loading={derive.isPending}
                disabled={!prId || derive.isPending}
                onClick={() => derive.mutate()}
              >
                {t("explain")}
              </Button>
            </div>
          )}
        </div>
        {body}
      </div>
    </section>
  );
}
