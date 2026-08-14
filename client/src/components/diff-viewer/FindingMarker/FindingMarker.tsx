"use client";

import { useTranslations } from "next-intl";
import { Icon, SeverityBadge, type Severity } from "@devdigest/ui";
import type { FindingRecord } from "@devdigest/shared";
import { MARKER_SEVERITY_COLOR, MARKER_SEVERITY_COLOR_FALLBACK } from "../constants";
import { s } from "../styles";

export function FindingMarker({
  finding,
  onOpenFinding,
}: {
  finding: FindingRecord;
  onOpenFinding?: (findingId: string) => void;
}) {
  const t = useTranslations("shell");
  const sevColor = MARKER_SEVERITY_COLOR[finding.severity] ?? MARKER_SEVERITY_COLOR_FALLBACK;

  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onOpenFinding?.(finding.id);
      }}
      aria-label={t("diffViewer.openFinding", { title: finding.title })}
      style={s.findingMarker(sevColor)}
    >
      <SeverityBadge severity={finding.severity as Severity} compact />
      <span style={s.findingMarkerTitle}>{finding.title}</span>
      <Icon.ArrowRight size={12} />
    </button>
  );
}
