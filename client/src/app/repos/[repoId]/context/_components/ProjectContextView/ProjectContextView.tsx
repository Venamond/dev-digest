"use client";

import React from "react";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  Button,
  EmptyState,
  ErrorState,
  CircularScore,
  Icon,
  IconBtn,
  Markdown,
  Skeleton,
} from "@devdigest/ui";
import type { SpecFile } from "@devdigest/shared";
import { useSetCrumb } from "@/components/app-shell";
import { MarkdownEditor } from "@/components/markdown-editor/MarkdownEditor";
import { RepoNotFound } from "@/components/repo-not-found";
import {
  useAgents,
  useContextFiles,
  useContextDoc,
  useCreateContextDoc,
  useSaveContextDoc,
} from "@/lib/hooks";
import { useRepoNotFound } from "@/lib/repo-context";
import { fileNameOf, folderOf } from "@/lib/project-context";
import { byName, coveragePercent, freshestAgo, totalTokens } from "./helpers";
import { s } from "./styles";

type Mode = "preview" | "edit";

/**
 * Project Context — laid out to mockup M1: a rail carrying its own heading,
 * toolbar, document list and footer, then a detail pane whose header holds the
 * file name, the Preview/Edit toggle and the using agents on one line.
 *
 * The mockup's `+`, folder and upload icons are absent by decision (creating
 * and uploading documents is a spec non-goal), as is the COVERAGE ring.
 */
export function ProjectContextView() {
  const t = useTranslations("context");
  const params = useParams<{ repoId: string }>();
  const repoId = params.repoId;
  const repoNotFound = useRepoNotFound(repoId);

  const files = useContextFiles(repoId);
  // Denominator of the COVERAGE ring (M1): agents that are switched on.
  const agents = useAgents();
  const enabledAgents = Array.isArray(agents.data)
    ? agents.data.filter((a) => a.enabled).length
    : 0;
  const [selectedPath, setSelectedPath] = React.useState<string | null>(null);
  const [mode, setMode] = React.useState<Mode>("preview");
  const save = useSaveContextDoc(repoId);
  const create = useCreateContextDoc(repoId);
  const fileInput = React.useRef<HTMLInputElement>(null);

  /* `+`, new folder and upload all end in the same create call: a folder is a
     path with a README.md inside it (git tracks no empty directory), and an
     uploaded markdown file is read as text here rather than sent as multipart. */
  const createAt = (path: string, content: string) => {
    create.mutate({ path, content }, { onSuccess: (d) => setSelectedPath(d.path) });
  };

  const promptCreate = (folder: boolean) => {
    const answer = window.prompt(t(folder ? "toolbar.folderPrompt" : "toolbar.namePrompt"));
    const raw = answer?.trim();
    if (!raw) return;
    const path = folder ? `${raw.replace(/\/+$/, "")}/README.md` : raw;
    createAt(path, folder ? `# ${raw}\n` : "");
  };

  const onUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const answer = window.prompt(t("toolbar.namePrompt"), `docs/${file.name}`);
    const path = answer?.trim();
    if (!path) return;
    createAt(path, await file.text());
  };

  const [draft, setDraft] = React.useState("");

  useSetCrumb([{ label: t("crumbWorkspace") }, { label: t("crumbContext") }]);

  if (repoNotFound) return <RepoNotFound />;

  // The array actually rendered — every counter below is derived from THIS,
  // never re-asked of the payload.
  // Sorted for display only — the order a run injects is the human's attachment
  // order on the agent, which this list does not touch.
  const docs = React.useMemo(() => [...(files.data ?? [])].sort(byName), [files.data]);
  /* M1 arrives with a document open, not with an empty pane. The first row is
     the one the mockup shows selected; an explicit choice always wins. */
  // Read once per render of the list, not per row — and passed in, so the
  // helper stays pure and testable.
  const ago = freshestAgo(docs, Date.now());
  const selected =
    docs.find((d) => d.path === selectedPath) ?? (selectedPath == null ? (docs[0] ?? null) : null);
  /* Fetch what is actually SHOWN, not what was clicked: on arrival nothing has
     been clicked and the first row is open, so keying this off `selectedPath`
     would leave the pane blank. */
  const doc = useContextDoc(repoId, selected?.path ?? null);

  /* The edited body is local state so a failed save can leave it untouched
     (AC-30). It is reseeded only when the loaded document itself changes —
     never on a save failure, which does not touch the query cache. */
  React.useEffect(() => {
    setDraft(doc.data?.content ?? "");
  }, [doc.data]);

  const selectDoc = (path: string) => {
    setSelectedPath(path);
    setMode("preview");
    save.reset();
  };

  if (files.isLoading) {
    return (
      <div style={s.stateWrap}>
        <Skeleton height={220} />
      </div>
    );
  }

  if (files.isError) {
    return (
      <div style={s.stateWrap}>
        <ErrorState body={t("loadError")} onRetry={() => files.refetch()} />
      </div>
    );
  }

  if (docs.length === 0) {
    return (
      <div style={s.stateWrap}>
        <EmptyState icon="Folder" title={t("empty.title")} body={t("empty.body")} />
      </div>
    );
  }

  return (
    <div style={s.page}>
      <div style={s.rail}>
        <div style={s.railHead}>
          <h1 style={s.railTitle}>{t("title")}</h1>
          {/* The selected document's OWN folder (AC-29) — the mockup's slot. */}
          <p style={s.railFolder}>
            {selected ? `${folderOf(selected)}/` : t("railNoSelection")}
          </p>
        </div>

        <div style={s.toolbar}>
          <IconBtn icon="Plus" label={t("toolbar.newDoc")} onClick={() => promptCreate(false)} />
          <IconBtn icon="Folder" label={t("toolbar.newFolder")} onClick={() => promptCreate(true)} />
          <IconBtn
            icon="Upload"
            label={t("toolbar.upload")}
            onClick={() => fileInput.current?.click()}
          />
          <IconBtn
            icon="RefreshCw"
            label={files.isFetching ? t("refreshing") : t("refresh")}
            onClick={() => files.refetch()}
          />
          <input
            ref={fileInput}
            type="file"
            accept=".md,.markdown,text/markdown"
            onChange={onUpload}
            style={{ display: "none" }}
            aria-hidden
            tabIndex={-1}
          />
        </div>
        {create.isError && (
          <div style={s.toolbarError} role="status">
            {t("toolbar.createFailed", { reason: (create.error as Error).message })}
          </div>
        )}

        <div style={s.list}>
          {docs.map((d) => {
            // The SHOWN document, so the auto-opened first row is highlighted too.
            const on = d.path === selected?.path;
            return (
              <button
                key={d.path}
                type="button"
                style={s.row(on)}
                aria-current={on}
                /* The row shows the file name alone, as the mockup does. Two
                   roots can hold the same name, so the full path is the row's
                   accessible name — AC-3 without a visible second label. */
                aria-label={d.path}
                title={d.path}
                onClick={() => selectDoc(d.path)}
              >
                <span style={s.rowIcon(on)}>
                  <Icon.FileText size={13} />
                </span>
                {/* The mockup's row is the file name alone. The folder that
                    tells two same-named documents apart is on the row's title
                    and in the rail heading above (AC-3), not on this line. */}
                <span style={s.rowName}>{fileNameOf(d.path)}</span>
              </button>
            );
          })}
        </div>

        <div style={s.footer}>
          <span style={s.footerLine}>
            <span style={s.dot} aria-hidden />
            {t("totals.line", { files: docs.length, tokens: totalTokens(docs) })}
          </span>
          {/* M1 puts the freshness of the newest document on this second line. */}
          <span style={s.footerCaption}>
            {ago ? t("totals.updated", { ago }) : t("totals.caption")}
          </span>
        </div>
      </div>

      {selected == null ? (
        <div style={s.stateWrap}>
          <EmptyState icon="FileText" title={t("select.title")} body={t("select.body")} />
        </div>
      ) : (
        <DocumentPanel
          key={selected.path}
          doc={selected}
          enabledAgents={enabledAgents}
          mode={mode}
          onMode={setMode}
          draft={draft}
          onDraft={setDraft}
          loading={doc.isLoading}
          loadError={doc.isError}
          saving={save.isPending}
          saveError={save.isError}
          saved={save.isSuccess}
          onSave={() => save.mutate({ path: selected.path, content: draft })}
        />
      )}
    </div>
  );
}

interface DocumentPanelProps {
  doc: SpecFile;
  enabledAgents: number;
  mode: Mode;
  onMode: (m: Mode) => void;
  draft: string;
  onDraft: (v: string) => void;
  loading: boolean;
  loadError: boolean;
  saving: boolean;
  saveError: boolean;
  saved: boolean;
  onSave: () => void;
}

function DocumentPanel({
  doc,
  enabledAgents,
  mode,
  onMode,
  draft,
  onDraft,
  loading,
  loadError,
  saving,
  saveError,
  saved,
  onSave,
}: DocumentPanelProps) {
  const t = useTranslations("context");

  return (
    <div style={s.detail}>
      <div style={s.detailHead}>
        {/* The mockup shows the file name here; the folder lives in the rail. */}
        <span style={s.detailName}>{fileNameOf(doc.path)}</span>

        <div style={s.modeToggle}>
          <Button kind="tertiary" active={mode === "preview"} onClick={() => onMode("preview")}>
            {t("mode.preview")}
          </Button>
          <Button kind="tertiary" active={mode === "edit"} onClick={() => onMode("edit")}>
            {t("mode.edit")}
          </Button>
        </div>

        {/* The count only. Naming the agents here (AC-35) was dropped by the
            human on 2026-08-23: with many agents the header has nowhere to put
            them. The names still live in each editor's preview drawer. */}
        <div style={s.usedBy}>
          <span
            style={s.usedByHeading}
            title={doc.used_by.map((u) => u.agent_name).join(", ") || t("usedBy.none")}
          >
            {t("usedBy.heading", { count: doc.used_by.length })}
          </span>
        </div>

        {/* M1's ring: the same number as a proportion of the enabled agents. */}
        <div style={s.coverage}>
          <CircularScore score={coveragePercent(doc.used_by.length, enabledAgents)} size={40} />
          <span style={s.coverageLabel}>{t("coverage")}</span>
        </div>
      </div>

      {loading && (
        <div style={s.body}>
          <Skeleton height={160} />
        </div>
      )}
      {loadError && (
        <div style={s.body}>
          <ErrorState body={t("editor.loadError")} />
        </div>
      )}

      {!loading && !loadError && mode === "preview" && (
        <div style={s.body}>
          <Markdown>{draft}</Markdown>
        </div>
      )}

      {!loading && !loadError && mode === "edit" && (
        <div style={s.editWrap}>
          {/* AC-7 — stated while the editor is open, not only after a save. */}
          <div style={s.notice}>{t("editor.localOnly")}</div>
          <MarkdownEditor
            value={draft}
            onChange={onDraft}
            fileName={doc.path}
            tokensLabel={t("detail.tokens", { tokens: doc.approx_tokens })}
            unsavedLabel={t("editor.unsaved")}
            ariaLabel={t("editor.ariaLabel")}
            minLines={12}
          />
          <div style={s.saveRow}>
            <Button kind="primary" onClick={onSave} loading={saving} disabled={saving}>
              {saving ? t("editor.saving") : t("editor.save")}
            </Button>
            {saveError && <span style={s.saveError}>{t("editor.saveError")}</span>}
            {saved && !saveError && (
              // AC-37 — how many agents use this document, stated on save.
              <span style={s.saveOk}>
                {t("editor.saved", { count: doc.used_by.length })}
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
