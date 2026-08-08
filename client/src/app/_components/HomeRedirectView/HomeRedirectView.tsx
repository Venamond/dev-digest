/* Root welcome / redirect — first repo's PR list, or onboarding if empty. */
"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useRepos } from "@/lib/hooks";
import { useSetCrumb } from "@/components/app-shell";
import { PageContainer } from "@/components/page-shell";
import { EmptyState, Button, Skeleton } from "@devdigest/ui";

export function HomeRedirectView() {
  const router = useRouter();
  const t = useTranslations("home");
  const { data: repos, isLoading, isError } = useRepos();

  React.useEffect(() => {
    if (repos && repos.length > 0) {
      router.replace(`/repos/${repos[0]!.id}/pulls`);
    }
  }, [repos, router]);

  useSetCrumb([{ label: t("brand") }]);

  return (
    <PageContainer title={t("welcome.title")} subtitle={t("welcome.subtitle")}>
      {isLoading ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 12, maxWidth: 480 }}>
          <Skeleton height={20} width={240} />
          <Skeleton height={48} />
          <Skeleton height={48} />
        </div>
      ) : isError || !repos || repos.length === 0 ? (
        <EmptyState
          icon="GitBranch"
          title={t("welcome.emptyTitle")}
          body={t("welcome.emptyBody")}
          cta={t("welcome.emptyCta")}
          onCta={() => router.push("/onboarding")}
        />
      ) : (
        <div>
          <p style={{ color: "var(--text-secondary)", marginBottom: 14 }}>{t("welcome.redirecting")}</p>
          <Button kind="primary" onClick={() => router.push(`/repos/${repos[0]!.id}/pulls`)}>
            {t("welcome.openRepo", { name: repos[0]!.full_name })}
          </Button>
        </div>
      )}
    </PageContainer>
  );
}
