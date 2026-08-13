"use client";

import React, { useState } from "react";
import { useTranslations } from "next-intl";
import { Button, Icon } from "@devdigest/ui";
import type { IntentRiskArea } from "@devdigest/shared";
import { useDeriveIntent, usePrIntent } from "@/lib/hooks/reviews";
import {
  RISK_COLOR,
  RISK_COLOR_FALLBACK,
  RISK_ICON,
  RISK_ICON_FALLBACK,
} from "./constants";
import { s } from "./styles";

function RiskExplanation({ text }: { text: string }) {
  const parts = text.split(/(`[^`]+`)/g);
  return (
    <p style={s.detailText}>
      {parts.map((part, i) =>
        part.startsWith("`") && part.endsWith("`") && part.length >= 2 ? (
          <code key={i} style={s.inlineCode}>
            {part.slice(1, -1)}
          </code>
        ) : (
          <React.Fragment key={i}>{part}</React.Fragment>
        ),
      )}
    </p>
  );
}

function RiskAreas({ areas }: { areas: IntentRiskArea[] }) {
  const t = useTranslations("prReview.intent");
  const [selected, setSelected] = useState<number | null>(null);
  const open = selected != null ? areas[selected] : undefined;

  return (
    <>
      <div style={s.divider} />
      <div>
        <div style={s.scopeHeading}>
          <Icon.AlertTriangle size={14} style={{ color: "var(--text-muted)" }} />
          <span style={s.sectionLabel}>{t("risks")}</span>
        </div>
        <div style={s.tags}>
          {areas.map((r, i) => {
            const color = RISK_COLOR[r.severity] ?? RISK_COLOR_FALLBACK;
            const Glyph = Icon[RISK_ICON[r.severity] ?? RISK_ICON_FALLBACK];
            return (
              <button
                key={`${r.title}:${i}`}
                type="button"
                aria-pressed={selected === i}
                style={s.tag(color, selected === i)}
                onClick={() => setSelected((cur) => (cur === i ? null : i))}
              >
                <Glyph size={13} style={{ color, flexShrink: 0 }} />
                {r.title}
              </button>
            );
          })}
        </div>
        {open && (
          <div style={s.detail}>
            {open.explanation ? <RiskExplanation text={open.explanation} /> : null}
            {open.file_ref ? <div style={s.fileRef}>{open.file_ref}</div> : null}
          </div>
        )}
      </div>
    </>
  );
}

function ScopeList({
  items,
  bulletColor,
  textStyle,
}: {
  items: string[];
  bulletColor: string;
  textStyle: React.CSSProperties;
}) {
  if (items.length === 0) return null;
  return (
    <ul style={s.list}>
      {items.map((item) => (
        <li key={item} style={{ ...s.listItem, ...textStyle }}>
          <span style={s.bullet(bulletColor)} />
          {item}
        </li>
      ))}
    </ul>
  );
}

export function IntentCard({ prId }: { prId: string | null }) {
  const t = useTranslations("prReview.intent");
  const { data, isLoading } = usePrIntent(prId);
  const derive = useDeriveIntent(prId);

  const onRecompute = () => {
    if (!prId) return;
    derive.mutate({ force: true });
  };

  return (
    <section>
      <div style={s.card}>
        <div style={s.header}>
          <div style={s.headerLabel}>
            <Icon.Target size={14} style={{ color: "var(--text-muted)" }} />
            <span style={s.headerTitle}>{t("title")}</span>
          </div>
          <Button
            kind="secondary"
            size="sm"
            icon="RefreshCw"
            loading={derive.isPending}
            disabled={!prId}
            onClick={onRecompute}
          >
            {t("recompute")}
          </Button>
        </div>
        {isLoading ? (
          <p style={s.empty}>{t("empty")}</p>
        ) : data == null ? (
          <p style={s.empty}>{t("empty")}</p>
        ) : (
          <>
            {data.stale && <div style={s.banner}>{t("stale")}</div>}
            <p style={s.summary}>{data.intent}</p>
            <div style={s.scopeGrid}>
              <div>
                <div style={s.scopeHeading}>
                  <Icon.Check size={14} style={{ color: "var(--ok)" }} />
                  <span style={s.inScopeLabel}>{t("inScope")}</span>
                </div>
                <ScopeList
                  items={data.in_scope}
                  bulletColor="var(--ok)"
                  textStyle={s.inScopeText}
                />
              </div>
              <div>
                <div style={s.scopeHeading}>
                  <Icon.X size={14} style={{ color: "var(--text-muted)" }} />
                  <span style={s.outScopeLabel}>{t("outOfScope")}</span>
                </div>
                <ScopeList
                  items={data.out_of_scope}
                  bulletColor="var(--text-muted)"
                  textStyle={s.outScopeText}
                />
              </div>
            </div>
            {data.risk_areas.length > 0 && <RiskAreas areas={data.risk_areas} />}
            <div style={s.meta}>
              <span>
                {t("confidence")}: {Math.round(data.confidence * 100)}%
              </span>
              {data.sources.length > 0 && (
                <span>
                  {t("sources")}: {data.sources.join(", ")}
                </span>
              )}
            </div>
            {data.missing_context.length > 0 && (
              <div>
                <div style={s.scopeHeading}>
                  <span style={s.sectionLabel}>{t("missing")}</span>
                </div>
                {data.missing_context.map((m) => (
                  <p key={`${m.kind}:${m.ref}`} style={s.missing}>
                    {t("unavailable")}: {m.kind} {m.ref} — {m.reason}
                  </p>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </section>
  );
}
