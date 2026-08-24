"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, Icon } from "@devdigest/ui";
import type { ConventionCandidate } from "@devdigest/shared";
import { confidenceColor, formatEvidenceLabel } from "../ConventionsView/helpers";
import { s } from "./styles";

export function ConventionCard({
  candidate,
  busy,
  onAccept,
  onReject,
  onSaveRule,
}: {
  candidate: ConventionCandidate;
  busy?: boolean;
  onAccept: () => void;
  onReject: () => void;
  onSaveRule: (rule: string) => void;
}) {
  const t = useTranslations("conventions");
  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState(candidate.rule);
  const [copied, setCopied] = React.useState(false);

  React.useEffect(() => {
    setDraft(candidate.rule);
    setEditing(false);
  }, [candidate.id, candidate.rule]);

  const label = formatEvidenceLabel(
    candidate.evidence_path,
    candidate.evidence_line_start,
    candidate.evidence_line_end,
  );
  const color = confidenceColor(candidate.confidence);
  const pct = Math.round(candidate.confidence * 100);
  const accepted = candidate.status === "accepted";

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(label);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    } catch {
      /* ignore */
    }
  };

  return (
    <div style={s.card}>
      <div style={s.body}>
        {editing ? (
          <div style={s.editRow}>
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              style={s.ruleInput}
              aria-label={t("card.editRule")}
            />
            <Button
              kind="primary"
              onClick={() => {
                onSaveRule(draft.trim() || candidate.rule);
                setEditing(false);
              }}
              disabled={busy}
            >
              {t("card.saveRule")}
            </Button>
            <Button kind="ghost" onClick={() => setEditing(false)} disabled={busy}>
              {t("card.cancelEdit")}
            </Button>
          </div>
        ) : (
          <p style={s.rule} onDoubleClick={() => setEditing(true)} title={t("card.editRule")}>
            {candidate.rule}
          </p>
        )}

        <div style={s.evidenceBlock}>
          <div style={s.evidenceRow}>
            {candidate.evidence_url ? (
              <a
                className="mono"
                href={candidate.evidence_url}
                target="_blank"
                rel="noreferrer"
                style={s.evidenceLink}
                title={label}
              >
                {label}
              </a>
            ) : (
              <span className="mono" style={s.evidenceLink} title={label}>
                {label}
              </span>
            )}
            <button
              type="button"
              style={s.copyBtn}
              onClick={copy}
              title={copied ? t("card.copied") : t("card.copyPath")}
              aria-label={t("card.copyPath")}
            >
              <Icon.Copy size={12} />
            </button>
          </div>
          <pre className="mono" style={s.snippet}>
            {candidate.evidence_snippet}
          </pre>
        </div>

        <div style={s.confRow}>
          <span>{t("card.confidence")}</span>
          <div style={s.barTrack}>
            <div style={s.barFill(color, pct)} />
          </div>
          <span className="tnum" style={{ color }}>
            {pct}%
          </span>
        </div>
      </div>

      <div style={s.actions}>
        <Button
          kind={accepted ? "primary" : "ghost"}
          icon="Check"
          onClick={onAccept}
          disabled={busy || accepted}
          style={s.actionBtn}
        >
          {accepted ? t("card.accepted") : t("card.accept")}
        </Button>
        <Button
          kind="ghost"
          icon="X"
          onClick={onReject}
          disabled={busy || candidate.status === "rejected"}
          style={s.actionBtn}
        >
          {t("card.reject")}
        </Button>
      </div>
    </div>
  );
}
