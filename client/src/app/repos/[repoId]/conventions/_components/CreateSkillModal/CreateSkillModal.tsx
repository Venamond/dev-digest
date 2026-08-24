"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button, Modal, TextInput, Toggle, Skeleton } from "@devdigest/ui";
import {
  useConventionSkillDraft,
  useCreateConventionSkill,
} from "@/lib/hooks/conventions";
import { useSkills } from "@/lib/hooks/skills";
import { estimateTokens } from "@/app/skills/[id]/_components/SkillEditor/constants";
import { MarkdownEditor } from "@/components/markdown-editor/MarkdownEditor";
import { MODAL_WIDTH, s } from "./styles";

export function CreateSkillModal({
  repoId,
  repoName,
  acceptedCount,
  onClose,
}: {
  repoId: string;
  repoName: string;
  acceptedCount: number;
  onClose: () => void;
}) {
  const t = useTranslations("conventions");
  const router = useRouter();
  const draftQ = useConventionSkillDraft(repoId, true);
  const create = useCreateConventionSkill(repoId);
  const skillsQ = useSkills();

  const [name, setName] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [body, setBody] = React.useState("");
  const [enabled, setEnabled] = React.useState(true);
  const [hydrated, setHydrated] = React.useState(false);
  /** Once the user edits, stop overwriting local fields from draft refetches. */
  const [touched, setTouched] = React.useState(false);
  const appliedDraftAt = React.useRef<number | null>(null);

  // The server names the draft per repo (`<repo>-conventions`) so two repos
  // cannot upsert onto the same skill row — fall back to that, never to a
  // repo-independent literal.
  const defaultName = draftQ.data?.name ?? "";
  const effectiveName = name.trim() || defaultName;

  // Upsert bumps when a skill with this name already exists — show the version
  // that will be written (v1 for a new name, else current + 1).
  const nextVersion = React.useMemo(() => {
    const existing = skillsQ.data?.find((sk) => sk.name === effectiveName);
    return existing ? existing.version + 1 : 1;
  }, [effectiveName, skillsQ.data]);

  // Re-apply draft whenever the server payload changes (e.g. more Accepts),
  // unless the user has already edited the form.
  React.useEffect(() => {
    if (!draftQ.data || !draftQ.isSuccess) return;
    if (touched) return;
    if (appliedDraftAt.current === draftQ.dataUpdatedAt) return;
    appliedDraftAt.current = draftQ.dataUpdatedAt;
    setName(draftQ.data.name);
    setDescription(draftQ.data.description);
    setBody(draftQ.data.body);
    setHydrated(true);
  }, [draftQ.data, draftQ.isSuccess, draftQ.dataUpdatedAt, touched]);

  const dirty =
    hydrated &&
    draftQ.data != null &&
    (name !== draftQ.data.name ||
      description !== draftQ.data.description ||
      body !== draftQ.data.body);

  const setNameTouched = (v: string) => {
    setTouched(true);
    setName(v);
  };
  const setDescriptionTouched = (v: string) => {
    setTouched(true);
    setDescription(v);
  };
  const setBodyTouched = (v: string) => {
    setTouched(true);
    setBody(v);
  };

  const submit = async () => {
    const skill = await create.mutateAsync({
      name: effectiveName,
      description,
      body,
      enabled,
    });
    onClose();
    router.push(`/skills/${skill.id}`);
  };

  return (
    <Modal
      width={MODAL_WIDTH}
      title={t("modal.title")}
      subtitle={name || defaultName}
      onClose={onClose}
      bodyScroll={false}
      footer={
        <div style={s.footer}>
          <span style={s.footerNote}>
            {create.isSuccess
              ? t("modal.footerSaved", { version: nextVersion })
              : t("modal.footerHint", { version: nextVersion })}
          </span>
          <div style={s.footerActions}>
            <Button kind="ghost" onClick={onClose}>
              {t("modal.cancel")}
            </Button>
            <Button
              kind="primary"
              icon="Sparkles"
              onClick={submit}
              disabled={create.isPending || !hydrated || !body.trim()}
            >
              {create.isPending ? t("modal.creating") : t("modal.create")}
            </Button>
          </div>
        </div>
      }
    >
      <div style={s.body}>
        <div style={s.top}>
          <div style={s.banner}>
            {t("modal.banner", { count: acceptedCount, repo: repoName })}
          </div>

          {draftQ.isLoading && <Skeleton height={180} />}
          {draftQ.isError && <div style={s.banner}>{t("page.loadError")}</div>}

          {hydrated && (
            <>
              <div style={s.field}>
                <label style={s.label}>
                  {t("modal.name")}
                  <span style={{ color: "var(--crit)", marginLeft: 4 }}>*</span>
                </label>
                <TextInput value={name} onChange={setNameTouched} mono />
              </div>
              <div style={s.field}>
                <label style={s.label}>{t("modal.description")}</label>
                <TextInput value={description} onChange={setDescriptionTouched} />
              </div>

              <div style={s.typeRow}>
                <div style={s.field}>
                  <label style={s.label}>{t("modal.type")}</label>
                  <span className="mono" style={s.typeBadge}>
                    {t("modal.typeConvention")}
                  </span>
                </div>
                <div style={s.enabledWrap}>
                  <label style={s.enabledLabel}>
                    {t("modal.enabled")}
                    <Toggle on={enabled} onChange={setEnabled} size={16} />
                  </label>
                  <span style={s.enabledHint}>{t("modal.enabledHint")}</span>
                </div>
              </div>
            </>
          )}
        </div>

        {hydrated && (
          <div style={s.bodySection}>
            <div style={s.bodyLabel}>
              {t("modal.body")}
              <span style={{ color: "var(--crit)", marginLeft: 4 }}>*</span>
            </div>
            <MarkdownEditor
              value={body}
              onChange={setBodyTouched}
              fileName={`${effectiveName}.md`}
              tokensLabel={t("modal.tokens", { tokens: estimateTokens(body) })}
              unsavedLabel={t("modal.unsaved")}
              dirty={dirty}
              ariaLabel={t("modal.body")}
              fill
            />
          </div>
        )}
      </div>
    </Modal>
  );
}
