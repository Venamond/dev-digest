/* /agents — Agents Lab: list + tabbed AgentEditor (design ScreenAgents).
   Same shape as SkillsListView: optional selectedId, URL sync, no blank redirect hop. */
"use client";

import React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button, Dropdown, EmptyState, ErrorState, Skeleton, Icon, Badge } from "@devdigest/ui";
import { useSetCrumb } from "@/components/app-shell";
import { AgentCard } from "@/components/agent-card/AgentCard";
import { AgentEditor } from "../../[id]/_components/AgentEditor/AgentEditor";
import { VALID_TABS } from "../../[id]/_components/AgentEditor/constants";
import { useAgents, useAgent, useUpdateAgent } from "@/lib/hooks/agents";
import { CreateAgentModal } from "./_components/CreateAgentModal/CreateAgentModal";
import { TEMPLATES } from "./constants";
import { filterAgents } from "./helpers";
import { s } from "./styles";

function buildQs(tab: string, search: string): string {
  const sp = new URLSearchParams();
  if (tab && tab !== "config") sp.set("tab", tab);
  else sp.set("tab", "config");
  if (search) sp.set("q", search);
  return `?${sp.toString()}`;
}

export function AgentsListView({ selectedId }: { selectedId?: string }) {
  const t = useTranslations("agents");
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data: agents, isLoading, isError, refetch } = useAgents();
  const update = useUpdateAgent();
  const [creating, setCreating] = React.useState(false);

  const listSearch = searchParams.get("q") ?? "";
  const rawTab = searchParams.get("tab") ?? "";
  const tab = (VALID_TABS as readonly string[]).includes(rawTab) ? rawTab : "config";
  const activeId = selectedId ?? agents?.[0]?.id;

  const setListSearch = (q: string) => {
    const base = activeId ? `/agents/${activeId}` : "/agents";
    router.replace(`${base}${buildQs(tab, q)}`);
  };

  const setTab = (next: string) => {
    if (!activeId) return;
    router.replace(`/agents/${activeId}${buildQs(next, listSearch)}`);
  };

  const list = filterAgents(agents ?? [], listSearch);

  // Auto-open first agent on /agents (URL sync — content already renders via activeId).
  React.useEffect(() => {
    if (selectedId || isLoading || !agents?.length) return;
    router.replace(`/agents/${agents[0]!.id}${buildQs(tab, listSearch)}`);
  }, [selectedId, isLoading, agents, router, tab, listSearch]);

  // After deleting the active agent, route to the first remaining or /agents.
  React.useEffect(() => {
    if (!selectedId || isLoading || !agents) return;
    if (agents.some((a) => a.id === selectedId)) return;
    const next = agents[0];
    router.replace(next ? `/agents/${next.id}${buildQs(tab, listSearch)}` : "/agents");
  }, [selectedId, agents, isLoading, router, tab, listSearch]);

  const { data: agent, isLoading: agentLoading } = useAgent(activeId);

  const select = (id: string) => {
    router.push(`/agents/${id}${buildQs(tab, listSearch)}`);
  };

  useSetCrumb([
    { label: t("list.breadcrumbLab") },
    { label: t("list.breadcrumb"), href: "/agents" },
    ...(agent ? [{ label: agent.name }] : selectedId ? [{ label: t("editor.agentFallback") }] : []),
  ]);

  return (
    <>
      {creating && <CreateAgentModal onClose={() => setCreating(false)} />}
      <div style={s.page}>
        <div style={s.listCol}>
          <div style={s.listHeader}>
            <div style={s.listTitleRow}>
              <h1 style={s.h1}>{t("editor.listTitle")}</h1>
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
            <div style={s.search}>
              <Icon.Search size={13} />
              <input
                value={listSearch}
                onChange={(e) => setListSearch(e.target.value)}
                placeholder={t("list.searchPlaceholder")}
                style={s.searchInput}
              />
            </div>
          </div>

          <div style={s.listBody}>
            {isLoading && (
              <>
                <Skeleton height={72} />
                <Skeleton height={72} />
                <Skeleton height={72} />
              </>
            )}
            {isError && <ErrorState body={t("list.loadError")} onRetry={() => refetch()} />}
            {!isLoading && !isError && list.length === 0 && (
              <EmptyState
                icon="Cpu"
                title={t("list.emptyTitle")}
                body={t("list.emptyBody")}
                cta={t("list.emptyCta")}
                onCta={() => setCreating(true)}
              />
            )}
            {list.map((a) => (
              <AgentCard
                key={a.id}
                ag={a}
                active={a.id === activeId}
                skillCount={a.skill_count ?? 0}
                onClick={() => select(a.id)}
                onToggle={(enabled) => update.mutate({ id: a.id, patch: { enabled } })}
              />
            ))}
          </div>
        </div>

        {agentLoading && activeId ? (
          <div style={s.detailLoading}>
            <Skeleton height={24} width={240} />
            <Skeleton height={200} />
          </div>
        ) : agent ? (
          <div style={s.detail}>
            <div style={s.detailHeader}>
              <Icon.Cpu size={18} style={{ color: "var(--accent)" }} />
              <h1 style={s.detailTitle}>{agent.name}</h1>
              {!agent.enabled && <Badge color="var(--text-muted)">{t("editor.disabled")}</Badge>}
              <div style={{ marginLeft: "auto" }}>
                <Button kind="secondary" size="sm" icon="GitPullRequest" onClick={() => router.push("/")}>
                  {t("editor.runOnPr")}
                </Button>
              </div>
            </div>
            <div style={s.detailBody}>
              <AgentEditor agent={agent} tab={tab} onTab={setTab} />
            </div>
          </div>
        ) : (
          <div style={s.selectPrompt}>
            <div style={s.selectInner}>
              <h2 style={s.selectTitle}>{t("list.emptyTitle")}</h2>
              <p style={s.selectBody}>{t("list.emptyBody")}</p>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
