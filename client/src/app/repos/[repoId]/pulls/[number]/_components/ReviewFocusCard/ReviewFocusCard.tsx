/* ReviewFocusCard — "REVIEW FOCUS — READ THESE FIRST": where to read first,
   in the model's priority order. The order is the server's and is never
   re-sorted here (AC-11). */
"use client";

import React from "react";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Badge, Icon } from "@devdigest/ui";
import { usePrBrief } from "@/lib/hooks/brief";
import { FileRefLink } from "../FileRefLink/FileRefLink";
import { s } from "./styles";

export function ReviewFocusCard({ prId }: { prId: string | null }) {
  const t = useTranslations("prReview.brief");
  const params = useParams<{ repoId: string; number: string }>();
  const { data } = usePrBrief(prId);

  if (data == null) return null;

  // The rendered collection, computed once. The badge below counts THIS array
  // and never re-asks the payload — a count from a second source drifts from
  // the body it claims to describe (client/INSIGHTS.md:169-188).
  const items = Array.isArray(data.brief.review_focus) ? data.brief.review_focus : [];

  return (
    <section>
      <div style={s.card}>
        <div style={s.header}>
          {/* Accent, not muted: on M1 the list glyph and the count are the only
              blue in this header, and the title beside them stays grey. */}
          <Icon.ListChecks size={14} style={{ color: "var(--accent-text)" }} />
          <span style={s.title}>{t("focus.title")}</span>
          <Badge color="var(--accent-text)" bg="var(--accent-bg)">
            {items.length}
          </Badge>
        </div>
        {items.length > 0 && (
          <div style={s.rows}>
            {items.map((item, i) => (
              <div key={`${item.file_ref}:${i}`} className="dd-focus-row" style={s.row}>
                <span style={s.marker} aria-hidden="true">
                  ▸
                </span>
                <span style={s.refWrap}>
                  <FileRefLink
                    fileRef={item.file_ref}
                    line={item.line}
                    repoId={params.repoId}
                    prNumber={Number(params.number)}
                  />
                </span>
                <span style={s.separator}>—</span>
                <span style={s.reason} title={item.reason}>
                  {item.reason}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
