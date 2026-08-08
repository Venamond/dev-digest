"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Markdown } from "@devdigest/ui";
import type { Skill } from "@devdigest/shared";
import { s } from "./styles";

/** Preview tab — rendered markdown body as the reviewing agent would see it. */
export function PreviewTab({ skill }: { skill: Skill }) {
  const t = useTranslations("skills");
  return (
    <div style={s.wrap}>
      <div style={s.header}>
        <h2 style={s.h2}>{t("preview.title")}</h2>
        <p style={s.subtitle}>{t("preview.subtitle")}</p>
      </div>
      <div style={s.panel}>
        {skill.body.trim() ? <Markdown>{skill.body}</Markdown> : <p style={s.empty}>{t("preview.empty")}</p>}
      </div>
    </div>
  );
}
