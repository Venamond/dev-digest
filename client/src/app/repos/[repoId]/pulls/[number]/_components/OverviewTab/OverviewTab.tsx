"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { SectionLabel } from "@devdigest/ui";
import { usePrBrief } from "@/lib/hooks/brief";
import { BriefBanner } from "../BriefBanner/BriefBanner";
import { IntentCard } from "../IntentCard/IntentCard";
import { BlastCard } from "../BlastCard/BlastCard";
import { ReviewFocusCard } from "../ReviewFocusCard/ReviewFocusCard";
import { s } from "./styles";

interface OverviewTabProps {
  prBody: string | null | undefined;
  prId: string | null;
}

export function OverviewTab({ prBody, prId }: OverviewTabProps) {
  const t = useTranslations("prReview");
  // The brief's risks render inside IntentCard's own RISK AREAS block (AC-34),
  // so the two sources cannot drift into two different-looking lists.
  const { data: brief } = usePrBrief(prId);
  return (
    <>
      <BriefBanner prId={prId} />
      <div style={s.cards}>
        <IntentCard prId={prId} briefRisks={brief?.brief.risks} />
        <BlastCard prId={prId} />
      </div>
      <ReviewFocusCard prId={prId} />
      {prBody && (
        <section>
          <SectionLabel icon="MessageSquare">{t("overview.description")}</SectionLabel>
          <div style={s.descriptionBox}>{prBody}</div>
        </section>
      )}
    </>
  );
}
