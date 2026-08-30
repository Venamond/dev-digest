/* FindingCard — ported from findings.jsx (createElement → TSX).
   Severity icon+label, category, file:line, confidence, markdown rationale +
   suggestion, accept/dismiss actions. Accept/dismiss reflect persisted
   timestamps. */
"use client";

import React from "react";
import { createPortal } from "react-dom";
import { useTranslations } from "next-intl";
import {
  Icon,
  SeverityBadge,
  CategoryTag,
  MonoLink,
  ConfidenceNum,
  Button,
  Markdown,
  type Severity,
  type Category,
} from "@devdigest/ui";
import type { FindingRecord, FindingActionKind } from "@devdigest/shared";
import { SEV_COLOR, SEV_COLOR_FALLBACK } from "./constants";
import { lineLabel } from "./helpers";
import { githubBlobUrl } from "../../../../../../../lib/github-urls";
import { useFindingEvalSeed } from "../../../../../../../lib/hooks/eval";
import { EvalCaseEditor } from "../../../../../../../components/eval-case-editor/EvalCaseEditor";
import { s } from "./styles";
import { usePreservedToggle } from "../PrDetailView/preserved-toggle";

/* The reference puts an undo arrow beside a chosen Accept. `vendor/ui`'s icon
   set has no undo glyph and is treated as read-only third-party code, so the
   shape lives here — lucide's `corner-up-left`, drawn to the same 1.8 stroke
   and 24-box the vendored icons use so it sits level with them. */
function UndoArrow() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <polyline points="9 14 4 9 9 4" />
      <path d="M20 20v-7a4 4 0 0 0-4-4H4" />
    </svg>
  );
}

export function FindingCard({
  f,
  focused,
  defaultExpanded,
  onAction,
  pending,
  repoFullName,
  headSha,
  targeted,
}: {
  f: FindingRecord;
  focused?: boolean;
  defaultExpanded?: boolean;
  onAction?: (action: FindingActionKind, reply?: string) => void;
  pending?: boolean;
  repoFullName?: string | null;
  headSha?: string | null;
  targeted?: boolean;
}) {
  const t = useTranslations("prReview");
  // Keyed by finding id, not list index: survives the tab switch, so expanding
  // the last card and coming back does not silently re-expand the first one
  // via `defaultExpanded={i === 0}`.
  const [expanded, setExpanded] = usePreservedToggle(`finding:${f.id}`, defaultExpanded ?? false);
  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const sevColor = SEV_COLOR[f.severity] ?? SEV_COLOR_FALLBACK;
  const fileHref =
    repoFullName && headSha
      ? githubBlobUrl(repoFullName, headSha, f.file, f.start_line, f.end_line)
      : undefined;
  const accepted = !!f.accepted_at;
  const dismissed = !!f.dismissed_at;
  const muted = accepted || dismissed;

  // The seed is built server-side; it is fetched once the card is expanded,
  // which is where the action lives and where the "a case already exists"
  // marker has to be readable (AC-65).
  const seed = useFindingEvalSeed(f.id, expanded);
  const existingCaseId = seed.data?.existing_case_id ?? null;
  const [editorOpen, setEditorOpen] = React.useState(false);
  const [duplicateNotice, setDuplicateNotice] = React.useState(false);

  React.useEffect(() => {
    if (!targeted) return;
    setExpanded(true);
    rootRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [targeted]);

  return (
    <div ref={rootRef} data-finding-id={f.id} style={s.card(!!focused, sevColor, muted)}>
      <div onClick={() => setExpanded((e) => !e)} style={s.header}>
        <div style={s.badgeWrap}>
          <SeverityBadge severity={f.severity as Severity} compact />
        </div>
        <div style={s.headerMain}>
          <div style={s.titleRow}>
            <span style={s.title(muted, dismissed)}>{f.title}</span>
            <CategoryTag category={f.category as Category} />
            {accepted && <span style={s.acceptedTag}>{t("finding.accepted")}</span>}
            {dismissed && <span style={s.dismissedTag}>{t("finding.dismissed")}</span>}
            {existingCaseId && (
              <span style={s.evalCaseTag} title={t("finding.evalCaseExistsTitle")}>
                <Icon.FlaskConical size={12} />
                {t("finding.evalCaseExists")}
              </span>
            )}
          </div>
          <div style={s.metaRow}>
            <MonoLink href={fileHref}>
              {f.file}:{lineLabel(f)}
            </MonoLink>
            <ConfidenceNum value={f.confidence} />
          </div>
        </div>
        <Icon.ChevronDown size={16} style={s.chevron(expanded)} />
      </div>

      {expanded && (
        <div style={s.body}>
          <div style={s.prose}>
            <Markdown>{f.rationale}</Markdown>
          </div>
          {f.suggestion && (
            <div style={s.suggestionWrap}>
              <div style={s.suggestionLabel}>{t("finding.suggestedFix")}</div>
              <div style={s.prose}>
                <Markdown>{f.suggestion}</Markdown>
              </div>
            </div>
          )}

          <div style={s.actions} data-testid="finding-actions">
            {/* Kinds are the mockup's (img/mockup-src/findings.jsx:20-21):
                Accept `secondary`, Dismiss `ghost`. Both are `ghost` here
                instead, on the human's instruction of 2026-08-29: `secondary`
                paints its label `--text-primary`, and a permanently bright
                Accept reads as already-chosen before anything is pressed.
                With both muted, brightness carries no meaning and the ONLY
                signal of a disposition is the green mark below.
                The disposition is carried by `s.chosenAction` instead, because
                the vendored Button's `active` prop is read only by `tertiary`
                (vendor/ui/primitives/Button.tsx:52-55) and is inert for both
                kinds used here — the incoming `style` is applied last, so it
                wins. */}
            <Button
              kind="ghost"
              size="sm"
              icon="Check"
              disabled={pending}
              style={accepted ? s.chosenAction : undefined}
              onClick={() => onAction?.("accept")}
            >
              {t("finding.accept")}
            </Button>
            {/* Only once a decision exists — the reference draws it beside a
                chosen Accept, and with nothing to undo it would be a dead
                control. It matters more here than it looks: the eval-case seed
                is DERIVED from the disposition, so without an undo a misclick
                permanently fixes whether this finding can become a `must_find`
                or a `must_not_flag` case. */}
            {muted && (
              <Button
                kind="ghost"
                size="sm"
                disabled={pending}
                title={t("finding.undoTitle")}
                /* Icon-only, so the label has to come from `aria-label` — the
                   `title` is a tooltip, not an accessible name. */
                aria-label={t("finding.undo")}
                onClick={() => onAction?.("undo")}
              >
                <UndoArrow />
              </Button>
            )}
            <Button
              kind="ghost"
              size="sm"
              icon="X"
              disabled={pending}
              style={dismissed ? s.chosenAction : undefined}
              onClick={() => onAction?.("dismiss")}
            >
              {t("finding.dismiss")}
            </Button>
            {/* Drawn in the mockup, no mechanism behind it here (AC-52, AC-60). */}
            <Button kind="ghost" size="sm" icon="Brain" disabled title={t("finding.learnDisabled")}>
              {t("finding.learn")}
            </Button>
            {/* Gated on a disposition on purpose: a case seeded from a finding
                nobody has judged would turn unverified model output into the
                harness's own ground truth. The reference implementation gates
                it the same way — the control is inert until Accept or Dismiss
                is pressed. */}
            <Button
              kind="ghost"
              size="sm"
              icon="FlaskConical"
              disabled={!muted}
              title={
                !muted
                  ? t("finding.evalTitleUndecided")
                  : dismissed
                    ? t("finding.evalTitleDismissed")
                    : t("finding.evalTitleDefault")
              }
              onClick={() => (existingCaseId ? setDuplicateNotice(true) : setEditorOpen(true))}
            >
              {t("finding.turnIntoEvalCase")}
            </Button>
            <Button
              kind="ghost"
              size="sm"
              icon="MessageSquare"
              disabled
              title={t("finding.replyDisabled")}
            >
              {t("finding.replyToAuthor")}
            </Button>
          </div>

          {duplicateNotice && (
            <div style={s.evalNotice}>
              <Icon.AlertTriangle size={14} style={{ color: "var(--warn)", flexShrink: 0 }} />
              <span style={s.evalNoticeText}>{t("finding.evalCaseExistsNotice")}</span>
              <Button
                kind="ghost"
                size="sm"
                onClick={() => {
                  setDuplicateNotice(false);
                  setEditorOpen(true);
                }}
              >
                {t("finding.evalCreateAnyway")}
              </Button>
              <Button kind="ghost" size="sm" onClick={() => setDuplicateNotice(false)}>
                {t("finding.evalNoticeCancel")}
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Portalled to <body> on purpose. `Modal` is `position: fixed` but does
          NOT portal (vendor/ui/kit/Modal.tsx:23), so rendered here it stays a
          DOM child of the card — and this card sets `opacity: 0.6` while the
          finding is accepted or dismissed (styles.ts:21) plus
          `overflow: hidden` (:19). Inherited opacity would paint the whole
          dialog translucent, and an opacity below 1 creates a stacking context
          that makes `fixed` resolve against the card instead of the viewport.
          A dismissed finding is exactly the one seeding a `must not flag`
          case, so this is the common path, not the corner. */}
      {editorOpen &&
        seed.data &&
        typeof document !== "undefined" &&
        createPortal(
          <EvalCaseEditor
            agentId={seed.data.owner_id}
            seed={seed.data}
            onClose={() => setEditorOpen(false)}
          />,
          document.body,
        )}
    </div>
  );
}
