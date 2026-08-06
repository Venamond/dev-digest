/* /agents/:id — Agent Editor view. Left vertical agent list + editor pane
   (design ScreenAgents). Tab state in ?tab=. */
"use client";

import React from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button, Dropdown, ErrorState, Skeleton, Icon, Badge } from "@devdigest/ui";
import { AppShell } from "@/components/app-shell";
import { AgentCard } from "@/components/agent-card/AgentCard";
import { AgentEditor } from "../AgentEditor/AgentEditor";
import { useAgents, useAgent, useUpdateAgent } from "@/lib/hooks/agents";
import { ApiError } from "@/lib/api";
import { TEMPLATES } from "../../../_components/AgentsListView/constants";
import { filterAgents } from "../../../_components/AgentsListView/helpers";
import { CreateAgentModal } from "../../../_components/AgentsListView/_components/CreateAgentModal/CreateAgentModal";
import { VALID_TABS } from "../AgentEditor/constants";

export function AgentEditorPageView() {
  const params = useParams<{ id: string }>();
  const search = useSearchParams();
  const router = useRouter();
  const t = useTranslations("agents");
  const { id } = params;

  const { data: agents } = useAgents();
  const { data: agent, isLoading, isError, error, refetch } = useAgent(id);
  const update = useUpdateAgent();
  const [creating, setCreating] = React.useState(false);
  const [q, setQ] = React.useState("");

  const rawTab = search.get("tab") ?? "";
  const tab = (VALID_TABS as readonly string[]).includes(rawTab) ? rawTab : "config";
  const setTab = (next: string) => {
    const sp = new URLSearchParams(search.toString());
    sp.set("tab", next);
    router.replace(`/agents/${id}?${sp.toString()}`);
  };

  const list = filterAgents(agents ?? [], q);

  const crumb = [
    { label: t("list.breadcrumbLab") },
    { label: t("list.breadcrumb"), href: "/agents" },
    { label: agent?.name ?? t("editor.agentFallback") },
  ];

  if (isError || (!isLoading && !agent)) {
    return (
      <AppShell crumb={crumb}>
        <ErrorState
          fullScreen
          title={t("editor.loadErrorTitle")}
          body={error instanceof ApiError ? error.message : t("editor.loadErrorBody")}
          onRetry={() => refetch()}
        />
      </AppShell>
    );
  }

  return (
    <AppShell crumb={crumb}>
      {creating && <CreateAgentModal onClose={() => setCreating(false)} />}
      <div style={{ display: "flex", height: "calc(100vh - 52px)" }}>
        <div
          style={{
            width: 280,
            flexShrink: 0,
            borderRight: "1px solid var(--border)",
            display: "flex",
            flexDirection: "column",
            background: "var(--bg-surface)",
          }}
        >
          <div style={{ padding: "14px 14px 10px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
              <h1 style={{ fontSize: 16, fontWeight: 700, flex: 1 }}>{t("editor.listTitle")}</h1>
              <Dropdown
                width={210}
                align="right"
                trigger={
                  <Button kind="primary" size="sm" icon="Plus" iconRight="ChevronDown">
                    {t("list.addAgent")}
                  </Button>
                }
                items={[
                  {
                    label: t("editor.createFromScratch"),
                    icon: "Edit",
                    onClick: () => setCreating(true),
                  },
                  { divider: true },
                  ...TEMPLATES.map((tp) => ({
                    label: tp,
                    icon: "Cpu" as const,
                    muted: true,
                    onClick: () => setCreating(true),
                  })),
                ]}
              />
            </div>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "6px 10px",
                borderRadius: 7,
                border: "1px solid var(--border)",
                background: "var(--bg-primary)",
                color: "var(--text-muted)",
                fontSize: 12,
              }}
            >
              <Icon.Search size={13} />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder={t("list.searchPlaceholder")}
                style={{
                  flex: 1,
                  fontSize: 12,
                  background: "transparent",
                  border: "none",
                  outline: "none",
                  color: "var(--text-primary)",
                }}
              />
            </div>
          </div>
          <div style={{ flex: 1, overflow: "auto", padding: "0 10px 10px" }}>
            {list.map((a) => (
              <AgentCard
                key={a.id}
                ag={a}
                active={a.id === id}
                skillCount={a.skill_count ?? 0}
                onClick={() => router.push(`/agents/${a.id}?tab=${tab}`)}
                onToggle={(enabled) => update.mutate({ id: a.id, patch: { enabled } })}
              />
            ))}
          </div>
        </div>

        {isLoading || !agent ? (
          <div style={{ flex: 1, padding: 28, display: "flex", flexDirection: "column", gap: 16 }}>
            <Skeleton height={24} width={240} />
            <Skeleton height={200} />
          </div>
        ) : (
          <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0, minHeight: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 24px 0", flexShrink: 0 }}>
              <Icon.Cpu size={18} style={{ color: "var(--accent)" }} />
              <h1 style={{ fontSize: 17, fontWeight: 700 }}>{agent.name}</h1>
              {!agent.enabled && <Badge color="var(--text-muted)">{t("editor.disabled")}</Badge>}
              <div style={{ marginLeft: "auto" }}>
                <Button kind="secondary" size="sm" icon="GitPullRequest" onClick={() => router.push("/")}>
                  {t("editor.runOnPr")}
                </Button>
              </div>
            </div>
            <div style={{ flex: 1, minHeight: 0, overflow: "auto" }}>
              <AgentEditor agent={agent} tab={tab} onTab={setTab} />
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
