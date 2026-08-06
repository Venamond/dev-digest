/* /skills — Skills Lab: list + tabbed SkillEditor (design ScreenSkillsLab). */
"use client";

import React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button, Dropdown, EmptyState, ErrorState, Skeleton, Icon } from "@devdigest/ui";
import { useSetCrumb } from "@/components/app-shell";
import { useSkills, useSkill, useUpdateSkill } from "@/lib/hooks/skills";
import { SkillCard } from "../SkillCard/SkillCard";
import { SkillEditor } from "../../[id]/_components/SkillEditor/SkillEditor";
import { VALID_TABS } from "../../[id]/_components/SkillEditor/constants";
import { CreateSkillModal } from "./_components/CreateSkillModal/CreateSkillModal";
import { ImportSkillDrawer } from "./_components/ImportSkillDrawer/ImportSkillDrawer";
import { filterSkills } from "./helpers";
import { s } from "./styles";

function buildQs(search: string, tab: string): string {
  const sp = new URLSearchParams();
  if (search) sp.set("q", search);
  if (tab && tab !== "config") sp.set("tab", tab);
  const qs = sp.toString();
  return qs ? `?${qs}` : "";
}

export function SkillsListView({ selectedId }: { selectedId?: string }) {
  const t = useTranslations("skills");
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data: skills, isLoading, isError, refetch } = useSkills();
  const update = useUpdateSkill();
  const [creating, setCreating] = React.useState(false);
  const [importing, setImporting] = React.useState(false);

  const search = searchParams.get("q") ?? "";
  const rawTab = searchParams.get("tab") ?? "";
  const tab = (VALID_TABS as readonly string[]).includes(rawTab) ? rawTab : "config";
  const activeId = selectedId ?? skills?.[0]?.id;

  const setSearch = (q: string) => {
    const sp = new URLSearchParams(searchParams.toString());
    if (q) sp.set("q", q);
    else sp.delete("q");
    const qs = sp.toString();
    const base = selectedId ? `/skills/${selectedId}` : "/skills";
    router.replace(`${base}${qs ? `?${qs}` : ""}`);
  };

  const setTab = (next: string) => {
    const sp = new URLSearchParams(searchParams.toString());
    if (next === "config") sp.delete("tab");
    else sp.set("tab", next);
    const qs = sp.toString();
    const base = activeId ? `/skills/${activeId}` : "/skills";
    router.replace(`${base}${qs ? `?${qs}` : ""}`);
  };

  const list = filterSkills(skills ?? [], search);

  // Auto-open first skill on /skills when nothing selected (matches design always-selected list).
  React.useEffect(() => {
    if (selectedId || isLoading || !skills?.length) return;
    router.replace(`/skills/${skills[0]!.id}${buildQs(search, tab)}`);
  }, [selectedId, isLoading, skills, router, search, tab]);

  // After deleting the active skill, route to the first remaining skill or /skills.
  React.useEffect(() => {
    if (!selectedId || isLoading || !skills) return;
    if (skills.some((sk) => sk.id === selectedId)) return;
    const next = skills[0];
    router.replace(next ? `/skills/${next.id}${buildQs(search, tab)}` : "/skills");
  }, [selectedId, skills, isLoading, router, search, tab]);

  const { data: skill, isLoading: skillLoading } = useSkill(activeId);

  const select = (id: string) => {
    router.push(`/skills/${id}${buildQs(search, tab)}`);
  };

  useSetCrumb([{ label: t("page.crumbLab") }, { label: t("page.crumbSkills") }]);

  return (
    <>
      {creating && <CreateSkillModal onClose={() => setCreating(false)} />}
      {importing && <ImportSkillDrawer onClose={() => setImporting(false)} />}
      <div style={s.page}>
        <div style={s.listCol}>
          <div style={s.listHeader}>
            <div style={s.listTitleRow}>
              <h1 style={s.h1}>{t("page.heading")}</h1>
              <Dropdown
                width={240}
                align="right"
                trigger={
                  <Button kind="primary" size="sm" icon="Plus" iconRight="ChevronDown">
                    {t("page.addSkill")}
                  </Button>
                }
                items={[
                  { label: t("page.menu.fromFile"), icon: "Upload", onClick: () => setImporting(true) },
                  { label: t("page.menu.fromUrl"), icon: "Link", muted: true },
                  { label: t("page.menu.community"), icon: "Globe", muted: true },
                  { divider: true },
                  { label: t("page.createSkill"), icon: "Edit", onClick: () => setCreating(true) },
                ]}
              />
            </div>
            <div style={s.search}>
              <Icon.Search size={13} />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t("page.searchPlaceholder")}
                style={s.searchInput}
              />
            </div>
          </div>

          <div style={s.listBody}>
            {isLoading && (
              <>
                <Skeleton height={64} />
                <Skeleton height={64} />
                <Skeleton height={64} />
              </>
            )}
            {isError && <ErrorState body={t("page.loadError")} onRetry={() => refetch()} />}
            {!isLoading && !isError && list.length === 0 && (
              <EmptyState
                icon="Sparkles"
                title={t("page.empty.title")}
                body={t("page.empty.body")}
                cta={t("page.empty.cta")}
                onCta={() => setCreating(true)}
              />
            )}
            {list.map((sk) => (
              <SkillCard
                key={sk.id}
                skill={sk}
                active={sk.id === activeId}
                onClick={() => select(sk.id)}
                onToggle={(enabled) => update.mutate({ id: sk.id, patch: { enabled } })}
              />
            ))}
          </div>
        </div>

        {skillLoading && activeId ? (
          <div style={{ flex: 1, padding: 28 }}>
            <Skeleton height={24} width={240} />
            <Skeleton height={320} />
          </div>
        ) : skill ? (
          <SkillEditor skill={skill} tab={tab} onTab={setTab} />
        ) : (
          <div style={s.selectPrompt}>
            <div style={s.selectInner}>
              <h2 style={s.selectTitle}>{t("page.selectPrompt.title")}</h2>
              <p style={s.selectBody}>{t("page.selectPrompt.body")}</p>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
