"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Badge, FormField, TextInput, SelectInput, Toggle, Button } from "@devdigest/ui";
import type { Skill, SkillType } from "@devdigest/shared";
import { MarkdownEditor } from "@/components/markdown-editor/MarkdownEditor";
import { useDeleteSkill, useSkills, useUpdateSkill } from "@/lib/hooks/skills";
import { useToast } from "@/lib/toast";
import { estimateTokens } from "../../constants";
import { SKILL_TYPE_VALUES } from "./constants";
import { s } from "./styles";

/** Config tab — name/description/type/body + global enabled toggle + danger zone. */
export function ConfigTab({ skill }: { skill: Skill }) {
  const t = useTranslations("skills");
  const toast = useToast();
  const router = useRouter();
  const update = useUpdateSkill();
  const del = useDeleteSkill();
  const { data: skills } = useSkills();
  const [name, setName] = React.useState(skill.name);
  const [description, setDescription] = React.useState(skill.description);
  const [type, setType] = React.useState<SkillType>(skill.type);
  const [body, setBody] = React.useState(skill.body);
  const [enabled, setEnabled] = React.useState(skill.enabled);

  React.useEffect(() => {
    setName(skill.name);
    setDescription(skill.description);
    setType(skill.type);
    setBody(skill.body);
    setEnabled(skill.enabled);
  }, [skill.id, skill.version]); // eslint-disable-line react-hooks/exhaustive-deps

  const dirty =
    name !== skill.name ||
    description !== skill.description ||
    type !== skill.type ||
    body !== skill.body ||
    enabled !== skill.enabled;

  const typeOptions = SKILL_TYPE_VALUES.map((v) => ({
    value: v,
    label: t(`listItem.type.${v}`),
  }));

  const reset = () => {
    setName(skill.name);
    setDescription(skill.description);
    setType(skill.type);
    setBody(skill.body);
    setEnabled(skill.enabled);
  };

  const save = () =>
    update.mutate(
      {
        id: skill.id,
        patch: { name, description, type, body, enabled },
      },
      {
        onSuccess: (data) => toast.success(t("config.savedToast", { version: data.version })),
      },
    );

  const onDelete = () => {
    if (!window.confirm(t("card.deleteConfirm", { name: skill.name }))) return;
    del.mutate(skill.id, {
      onSuccess: () => {
        const remaining = (skills ?? []).filter((sk) => sk.id !== skill.id);
        const next = remaining[0];
        router.replace(next ? `/skills/${next.id}` : "/skills");
      },
    });
  };

  const fileName = t("config.filename", { name: name.trim() || skill.name || "skill" });
  const tokens = estimateTokens(body);

  return (
    <div style={s.wrap}>
      <div style={s.header}>
        <h2 style={s.h2}>{t("config.title")}</h2>
        <Badge icon="GitCommit" mono>
          {t("editor.versionChip", { version: skill.version })}
        </Badge>
        <label style={s.enabledLabel}>
          {t("config.enabled")}
          <Toggle on={enabled} onChange={setEnabled} size={16} />
        </label>
      </div>
      <FormField label={t("config.name")} required>
        <TextInput value={name} onChange={setName} />
      </FormField>
      <FormField label={t("config.description")}>
        <TextInput value={description} onChange={setDescription} />
      </FormField>
      <FormField label={t("config.type")}>
        <SelectInput value={type} onChange={(v) => setType(v as SkillType)} options={typeOptions} />
      </FormField>
      <FormField label={t("config.body")} hint={t("config.bodyHint")} required>
        <MarkdownEditor
          value={body}
          onChange={setBody}
          fileName={fileName}
          tokensLabel={t("config.tokenEstimate", { tokens: tokens.toLocaleString() })}
          unsavedLabel={t("config.unsaved")}
          dirty={dirty}
          ariaLabel={t("config.body")}
          minLines={14}
        />
      </FormField>
      <div style={s.actions}>
        <Button kind="primary" icon="Check" onClick={save} disabled={update.isPending || !dirty}>
          {update.isPending ? t("config.saving") : t("config.save")}
        </Button>
        <Button kind="ghost" onClick={reset} disabled={!dirty || update.isPending}>
          {t("config.cancel")}
        </Button>
        {update.isSuccess && !dirty && (
          <span style={s.savedNote}>{t("config.saved", { version: update.data?.version })}</span>
        )}
        <span style={s.snapshotHint}>
          {t("config.snapshotHint", { version: skill.version + 1 })}
        </span>
      </div>
      <div style={s.danger}>
        <div style={s.dangerCopy}>
          <div style={s.dangerTitle}>{t("config.dangerTitle")}</div>
          <div style={s.dangerBody}>{t("config.dangerBody")}</div>
        </div>
        <Button
          kind="danger"
          size="sm"
          icon="Trash"
          onClick={onDelete}
          disabled={del.isPending}
        >
          {t("config.delete")}
        </Button>
      </div>
    </div>
  );
}
