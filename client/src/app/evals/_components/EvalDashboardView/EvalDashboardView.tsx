/* /evals — Eval Dashboard (design ScreenEval): the all-agents overview, or one
   agent's runs when `?agent=` names it. The selection lives in the URL, like
   `?tab=` and `?status=` elsewhere in this app, so the view is linkable and the
   back button works. */
"use client";

import React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useSetCrumb } from "@/components/app-shell";
import { AgentEvalView } from "../AgentEvalView/AgentEvalView";
import { EvalOverview } from "../EvalOverview/EvalOverview";
import { s } from "./styles";

export function EvalDashboardView() {
  const t = useTranslations("eval.page");
  const router = useRouter();
  const searchParams = useSearchParams();
  const agentId = searchParams.get("agent");

  useSetCrumb([{ label: t("crumbSkillsLab") }, { label: t("crumbEvalDashboard"), href: "/evals" }]);

  const open = (id: string) => router.replace(`/evals?agent=${encodeURIComponent(id)}`);

  return (
    <div style={s.root}>
      {agentId ? (
        <AgentEvalView
          agentId={agentId}
          onBack={() => router.replace("/evals")}
          onPickAgent={open}
        />
      ) : (
        <EvalOverview onOpen={open} />
      )}
    </div>
  );
}
