/* /agents — empty/loading shell; with agents, redirect into the editor split
   (left list + pane) like Skills Lab / design ScreenAgents. */
"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { EmptyState, ErrorState, Skeleton } from "@devdigest/ui";
import { AppShell } from "@/components/app-shell";
import { useAgents } from "@/lib/hooks/agents";
import { CreateAgentModal } from "./_components/CreateAgentModal/CreateAgentModal";
import { s } from "./styles";

export function AgentsListView() {
  const t = useTranslations("agents");
  const router = useRouter();
  const { data: agents, isLoading, isError, refetch } = useAgents();
  const [creating, setCreating] = React.useState(false);

  // Auto-open first agent so the page always shows the vertical list + editor.
  React.useEffect(() => {
    if (isLoading || isError || !agents?.length) return;
    router.replace(`/agents/${agents[0]!.id}?tab=config`);
  }, [agents, isLoading, isError, router]);

  return (
    <AppShell crumb={[{ label: t("list.breadcrumbLab") }, { label: t("list.breadcrumb") }]}>
      {creating && <CreateAgentModal onClose={() => setCreating(false)} />}
      <div style={s.page}>
        {isLoading && (
          <div style={s.listCol}>
            <Skeleton height={72} />
            <Skeleton height={72} />
            <Skeleton height={72} />
          </div>
        )}
        {isError && <ErrorState body={t("list.loadError")} onRetry={() => refetch()} />}
        {!isLoading && !isError && (agents ?? []).length === 0 && (
          <EmptyState
            icon="Cpu"
            title={t("list.emptyTitle")}
            body={t("list.emptyBody")}
            cta={t("list.emptyCta")}
            onCta={() => setCreating(true)}
          />
        )}
      </div>
    </AppShell>
  );
}
