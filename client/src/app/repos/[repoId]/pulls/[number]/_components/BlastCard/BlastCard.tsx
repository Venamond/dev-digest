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
import {
  buildFlowchart,
  codeTokens,
  countGraphNodes,
  importersBeyondCallers,
  partitionSymbols,
  shortPath,
  splitHighlight,
} from "./helpers";
import { CALLABLE_KINDS, MAX_GRAPH_NODES, REASON_KEY, REASON_KEY_FALLBACK } from "./constants";
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
  dimmed,
}: {
  link: BlastLink;
  file: string;
  line?: number;
  label: string;
  dimmed?: boolean;
}) {
  const linkStyle = dimmed ? s.importerLink : s.link;
  if (!link.indexed_sha) return <span style={s.tag} title={file}>{label}</span>;
  return (
    <a
      href={githubBlobUrl(link.repo_full_name, link.indexed_sha, file, line)}
      target="_blank"
      rel="noreferrer"
      style={linkStyle}
      title={file}
    >
      {label}
    </a>
  );
}

/** Prose with the code it names chipped — see `splitHighlight`. */
function CodeText({ text, tokens }: { text: string; tokens: string[] }) {
  return (
    <>
      {splitHighlight(text, tokens).map((part, i) =>
        part.code ? (
          <code key={i} style={s.inlineCode}>
            {part.text}
          </code>
        ) : (
          <React.Fragment key={i}>{part.text}</React.Fragment>
        ),
      )}
    </>
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
function PriorPulls({
  pulls,
  tokens,
}: {
  pulls: BlastResponse["prior_pulls"];
  tokens: string[];
}) {
  const t = useTranslations("blast");
  const [open, setOpen] = React.useState(false);
  return (
    <div style={s.priorCard}>
      <button
        type="button"
        style={s.priorToggle(open)}
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        <Icon.History size={14} style={{ color: "var(--text-muted)", flexShrink: 0 }} />
        <span>{t("priorPulls")}</span>
        <span style={s.priorCountBadge}>{pulls.length}</span>
        <Icon.ChevronDown size={16} style={s.chevron(open)} />
      </button>
      {open && (
        <div style={s.priorList}>
          {pulls.map((pull, i) => (
            <div key={pull.number} style={s.priorRow(i === 0)}>
              <span style={s.priorBullet} aria-hidden="true">
                •
              </span>
              <div style={s.priorBody}>
                <div style={s.priorTitleLine}>
                  <span style={s.priorNumber}>{`#${pull.number}`}</span>
                  <span style={s.priorTitle}>{pull.title}</span>
                  {/* `merged` is true of almost every prior PR and says
                      nothing. A prior PR that is still OPEN on these files is
                      the case worth flagging. */}
                  {pull.status !== "merged" && (
                    <span style={s.priorStatus}>{pull.status}</span>
                  )}
                </div>
                <div style={s.priorMeta}>
                  <Avatar name={pull.author} size={16} />
                  <span>{pull.author}</span>
                  {pull.updated_at && (
                    <span>{`· ${new Date(pull.updated_at).toLocaleDateString()}`}</span>
                  )}
                </div>
                {pull.description && (
                  <div style={s.priorDescription}>
                    <CodeText text={pull.description} tokens={tokens} />
                  </div>
                )}
                {pull.shared_files.length > 0 && (
                  <div style={s.priorFiles}>
                    {pull.shared_files.map((f) => (
                      <code key={f} style={s.inlineCode}>
                        {f}
                      </code>
                    ))}
                  </div>
                )}
                {pull.unresolved_findings.map((f) => (
                  <div key={f.title} style={s.priorFinding}>
                    <Icon.AlertTriangle size={12} style={{ flexShrink: 0 }} />
                    <span>{t("dismissedFinding", { severity: f.severity, title: f.title })}</span>
                  </div>
                ))}
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
  // Only importers with no resolved call site: the rest repeat the callers.
  const extraImporters = React.useMemo(
    () => importersBeyondCallers(symbol.importers, symbol.callers),
    [symbol.importers, symbol.callers],
  );
  return (
    <div style={s.symbol}>
      <button
        type="button"
        style={s.symbolHeader(open)}
        aria-expanded={open}
        // The reference shows the name and the caller count on this line and
        // nothing else. The declaring file is reachable on hover.
        title={symbol.file}
        onClick={() => setOpen(!open)}
      >
        <Chevron size={14} style={{ color: "var(--text-muted)", flexShrink: 0 }} />
        {/* Blue, as on the reference — it marks the symbol, not chrome. */}
        <Icon.Code size={13} style={{ color: "var(--accent-text)", flexShrink: 0 }} />
        {/* `rateLimit()` reads as the callable it is; the reference carries
            no separate uppercase kind label, and the parens say it better. */}
        <span style={s.symbolName}>{CALLABLE_KINDS.has(symbol.kind) ? `${symbol.name}()` : symbol.name}</span>
        {/* Every symbol carries its kind, functions included. Showing it only
            for non-callables read as an arbitrary gap: the parens do say
            "callable", but from the row it just looked like some entries had a
            label and others did not. The reference has no interfaces in it, so
            it does not decide this either way. */}
        <span style={s.symbolKind}>{symbol.kind}</span>

        {/* The count must describe everything listed below, or the row
            contradicts itself: an interface with no call sites but two
            importers read as "0 callers" with two rows under it. Counts follow
            the rows actually rendered — `callers_total` is a count of distinct
            caller FILES (see the contract JSDoc) and would be another unit. */}
        <span style={s.symbolCount}>
          {[
            symbol.callers.length > 0 || extraImporters.length === 0
              ? t("callerCount", { count: symbol.callers.length })
              : null,
            extraImporters.length > 0
              ? t("importerCount", { count: extraImporters.length })
              : null,
          ]
            .filter(Boolean)
            .join(" · ")}
        </span>
      </button>
      {open && (
      <div style={s.symbolBody}>
      {symbol.callers.length > 0 && (
        <ul style={s.list}>
          {symbol.callers.map((caller) => (
            <li key={`${caller.file}:${caller.symbol}:${caller.line}`} style={s.listItem}>
              <span style={s.listRow}>
                <span style={s.listTick} aria-hidden="true" />
                <Icon.CornerDownRight
                  size={12}
                  style={{ color: "var(--text-muted)", flexShrink: 0 }}
                />
                <span style={{ minWidth: 0 }}>
                  {/* file:line and nothing else. The enclosing function name
                      was my addition, is not in the reference, and degraded to
                      a repeat of the file name whenever it could not be
                      resolved. */}
                  <FileRef
                    link={link}
                    file={caller.file}
                    line={caller.line}
                    label={`${shortPath(caller.file)}:${caller.line}`}
                  />
                </span>
              </span>
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
      {extraImporters.length > 0 && (
        <ul style={s.list}>
          {extraImporters.map((file) => (
            <li key={file} style={s.importerItem}>
              {/* No heading and no line number: these are files that import
                  the symbol's file with NO call site we could resolve, so
                  there is no line to point at. The link icon is what tells
                  them apart from the callers above. */}
              <span style={s.listRow} title={t("importerHint")}>
                <span style={s.listTick} aria-hidden="true" />
                <Icon.Link size={12} style={{ color: "var(--text-muted)", flexShrink: 0 }} />
                <span style={{ minWidth: 0 }}>
                  <FileRef link={link} file={file} label={shortPath(file)} dimmed />
                </span>
              </span>
            </li>
          ))}
        </ul>
      )}
      {(symbol.endpoints.length > 0 || symbol.crons.length > 0) && (
        <div style={s.chipRow}>
          {symbol.endpoints.map((endpoint) => (
            <span key={`endpoint:${endpoint}`} style={s.chip("endpoint")}>
              <Icon.Globe size={12} style={{ flexShrink: 0 }} />
              {endpoint}
            </span>
          ))}
          {symbol.crons.map((cron) => (
            <span key={`cron:${cron}`} style={s.chip("cron")}>
              <Icon.Clock size={12} style={{ flexShrink: 0 }} />
              {cron}
            </span>
          ))}
        </div>
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
  const tokens = React.useMemo(() => (data ? codeTokens(data) : []), [data]);
  // Rows for symbols that reach something; the rest become one line.
  const { withImpact, emptyCount } = React.useMemo(
    () => (data ? partitionSymbols(data.symbols) : { withImpact: [], emptyCount: 0 }),
    [data],
  );

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
            {/* All four always render, zeros included: "reaches no HTTP
                surface" and "schedules nothing" are answers a reviewer wants.
                The room for them comes from the page width (PrDetailView),
                not from dropping counters. */}
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
              {withImpact.map((symbol, i) => (
                <SymbolBlock
                  key={`${symbol.file}:${symbol.name}`}
                  symbol={symbol}
                  link={link}
                  // The first symbol opens so the card shows real content on
                  // arrival; the rest stay collapsed so a wide PR is scannable.
                  defaultOpen={i === 0}
                />
              ))}
              {emptyCount > 0 && (
                <p style={s.note}>{t("noImpactSymbols", { count: emptyCount })}</p>
              )}
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
            <PriorPulls pulls={data.prior_pulls} tokens={tokens} />
          </>
        )}
      </>
    );
  }

  return (
    <section style={{ display: "flex", flexDirection: "column" }}>
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
