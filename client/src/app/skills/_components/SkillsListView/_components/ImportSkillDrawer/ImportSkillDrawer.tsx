"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button, Drawer, Badge } from "@devdigest/ui";
import type { SkillImportDraft } from "@devdigest/shared";
import { useImportSkillConfirm, useImportSkillPreview } from "@/lib/hooks/skills";
import { useToast } from "@/lib/toast";
import { ApiError } from "@/lib/api";
import { ACCEPT, DRAWER_WIDTH } from "./constants";
import { s } from "./styles";

/** Import drawer — upload → preview draft + trust note → confirm. */
export function ImportSkillDrawer({ onClose }: { onClose: () => void }) {
  const t = useTranslations("skills");
  const router = useRouter();
  const toast = useToast();
  const preview = useImportSkillPreview();
  const confirm = useImportSkillConfirm();
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [drag, setDrag] = React.useState(false);
  const [fileName, setFileName] = React.useState<string | null>(null);
  const [draft, setDraft] = React.useState<SkillImportDraft | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const runPreview = async (file: File) => {
    setError(null);
    setFileName(file.name);
    setDraft(null);
    try {
      const result = await preview.mutateAsync(file);
      setDraft(result);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : t("drawer.importFailed"));
    }
  };

  const onFile = (file: File | undefined | null) => {
    if (!file) return;
    void runPreview(file);
  };

  const onConfirm = async () => {
    if (!draft) return;
    setError(null);
    try {
      const skill = await confirm.mutateAsync(draft);
      toast.success(t("drawer.successToast", { name: skill.name }));
      onClose();
      router.push(`/skills/${skill.id}`);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : t("drawer.importFailed"));
    }
  };

  return (
    <Drawer
      width={DRAWER_WIDTH}
      title={t("drawer.title")}
      subtitle={t("drawer.subtitle")}
      onClose={onClose}
      footer={
        <div style={s.footer}>
          {draft ? (
            <Button
              kind="ghost"
              onClick={() => {
                setDraft(null);
                setFileName(null);
                setError(null);
              }}
            >
              {t("drawer.back")}
            </Button>
          ) : (
            <Button kind="ghost" onClick={onClose}>
              {t("drawer.cancel")}
            </Button>
          )}
          <Button
            kind="primary"
            icon="Check"
            onClick={onConfirm}
            disabled={!draft || confirm.isPending}
          >
            {confirm.isPending ? t("drawer.confirming") : t("drawer.confirm")}
          </Button>
        </div>
      }
    >
      {!draft && (
        <>
          <input
            ref={inputRef}
            type="file"
            accept={ACCEPT}
            hidden
            onChange={(e) => onFile(e.target.files?.[0])}
          />
          <div
            role="button"
            tabIndex={0}
            style={s.drop(drag)}
            onClick={() => inputRef.current?.click()}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") inputRef.current?.click();
            }}
            onDragOver={(e) => {
              e.preventDefault();
              setDrag(true);
            }}
            onDragLeave={() => setDrag(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDrag(false);
              onFile(e.dataTransfer.files?.[0]);
            }}
          >
            <Button kind="secondary" size="sm" icon="Upload">
              {preview.isPending ? t("drawer.previewing") : t("drawer.chooseFile")}
            </Button>
            <div style={s.dropHint}>{t("drawer.orDrop")}</div>
          </div>
          {fileName && <div style={s.fileName}>{fileName}</div>}
          <div style={s.trust}>{t("drawer.trustNote")}</div>
        </>
      )}

      {draft && (
        <div style={s.draft}>
          <div style={s.trust}>{draft.trust_note ?? t("drawer.trustNote")}</div>
          <div>
            <div style={s.draftLabel}>{t("drawer.draftName")}</div>
            <div style={s.draftValue}>{draft.name}</div>
          </div>
          <div>
            <div style={s.draftLabel}>{t("drawer.draftDescription")}</div>
            <div style={s.draftValue}>{draft.description || "—"}</div>
          </div>
          <div>
            <div style={s.draftLabel}>{t("drawer.draftType")}</div>
            <Badge color="var(--accent)" mono>
              {t(`listItem.type.${draft.type}`)}
            </Badge>
          </div>
          <div>
            <div style={s.draftLabel}>{t("drawer.draftBody")}</div>
            <pre style={s.bodyPreview}>{draft.body}</pre>
          </div>
        </div>
      )}

      {error && <div style={s.error}>{error}</div>}
    </Drawer>
  );
}
