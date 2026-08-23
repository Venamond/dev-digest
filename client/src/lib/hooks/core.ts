/* hooks/core.ts — typed React Query hooks over the F1 API (contracts):
   settings, secrets, repos, pulls, and project context. Scaffolding screens use
   these; feature-domain hooks live in the sibling files (agents/reviews/trace/…)
   and are re-exported alongside these from hooks/index.ts. */
"use client";

import { queryKeys } from "./keys";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import type {
  Settings,
  SettingsUpdate,
  ConnTestProvider,
  ConnTestResult,
  SecretsStatus,
  Repo,
  PrMeta,
  PrDetail,
  SpecFile,
  IndexStatus,
} from "../types";
import type { ContextDocsResponse, SaveContextDocBody } from "@devdigest/shared";

// ---- Settings (F1: GET/PUT /settings, POST /settings/test-connection) ----
export function useSettings() {
  return useQuery({
    queryKey: queryKeys.settings,
    queryFn: () => api.get<Settings>("/settings"),
  });
}

export function useUpdateSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (patch: SettingsUpdate) => api.put<Settings>("/settings", patch),
    onSuccess: (data) => qc.setQueryData(queryKeys.settings, data),
  });
}

export function useTestConnection() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: ConnTestProvider | { provider: ConnTestProvider; key?: string }) => {
      const body = typeof input === "string" ? { provider: input } : input;
      return api.post<ConnTestResult>("/settings/test-connection", body);
    },
    // Saving/validating a provider key can change which models resolve — drop the
    // cached (possibly empty) model lists so the agent picker refetches, and
    // refresh the "Configured / Not set" key-status badges.
    onSuccess: (res) => {
      if (res.ok) {
        qc.invalidateQueries({ queryKey: queryKeys.providerModelsAll });
        qc.invalidateQueries({ queryKey: queryKeys.secretsStatus });
      }
    },
  });
}

/** Which provider keys are configured (booleans only — never the values). */
export function useSecretsStatus() {
  return useQuery({
    queryKey: queryKeys.secretsStatus,
    queryFn: () => api.get<SecretsStatus>("/settings/secrets-status"),
    staleTime: 30_000,
  });
}

// ---- Repos (F1: GET/POST /repos, refresh, delete) ----
export function useRepos() {
  return useQuery({
    queryKey: queryKeys.repos,
    queryFn: () => api.get<Repo[]>("/repos"),
  });
}

export function useAddRepo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (url: string) => api.post<Repo>("/repos", { url }),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.repos }),
  });
}

export function useRefreshRepo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (repoId: string) => api.post<Repo>(`/repos/${repoId}/refresh`),
    onSuccess: (_d, repoId) => {
      qc.invalidateQueries({ queryKey: queryKeys.repos });
      qc.invalidateQueries({ queryKey: queryKeys.pulls(repoId) });
    },
  });
}

export function useDeleteRepo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (repoId: string) => api.del<{ deleted: string }>(`/repos/${repoId}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.repos }),
  });
}

// ---- Pull requests (F1: GET /repos/:id/pulls, GET /pulls/:id) ----
export function usePulls(repoId: string | null | undefined) {
  return useQuery({
    queryKey: queryKeys.pulls(repoId),
    queryFn: () => api.get<PrMeta[]>(`/repos/${repoId}/pulls`),
    enabled: !!repoId,
    // Auto-refresh PR statuses: re-sync from GitHub every 60s while the page is
    // open, and whenever the window regains focus.
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
  });
}

export function usePullDetail(prId: string | number | null | undefined) {
  return useQuery({
    queryKey: queryKeys.pull(prId),
    queryFn: () => api.get<PrDetail>(`/pulls/${prId}`),
    enabled: prId != null,
  });
}

// ---- Project Context (A3 contract; safe to call once API exposes it) ----
export function useContextFiles(repoId: string | null | undefined) {
  return useQuery({
    queryKey: queryKeys.context(repoId),
    queryFn: () => api.get<SpecFile[]>(`/repos/${repoId}/context`),
    enabled: !!repoId,
  });
}

export function useReindexContext() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (repoId: string) => api.post<IndexStatus>(`/repos/${repoId}/context/reindex`),
    onSuccess: (_d, repoId) => qc.invalidateQueries({ queryKey: queryKeys.context(repoId) }),
  });
}

/** One document's text, read from the repository's local clone. */
export function useContextDoc(
  repoId: string | null | undefined,
  path: string | null | undefined,
) {
  return useQuery({
    queryKey: queryKeys.contextDoc(repoId, path),
    queryFn: () =>
      api.get<{ path: string; content: string }>(
        `/repos/${repoId}/context/doc?path=${encodeURIComponent(path!)}`,
      ),
    enabled: !!repoId && !!path,
  });
}

/**
 * Save an edited document back into the local clone. The write never reaches
 * GitHub and is lost on the next resync — the editor says so while it is open.
 */
/**
 * Create a NEW document in the repository's clone. Used by the rail's `+` and by
 * its upload control — an uploaded markdown file is read as text in the browser,
 * so both take exactly the same body.
 */
export function useCreateContextDoc(repoId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: SaveContextDocBody) =>
      api.post<{ path: string; content: string }>(`/repos/${repoId}/context/doc`, body),
    onSuccess: (data) => {
      qc.setQueryData(queryKeys.contextDoc(repoId, data.path), data);
      // A new document changes both the list and its totals.
      qc.invalidateQueries({ queryKey: queryKeys.context(repoId) });
    },
  });
}

export function useSaveContextDoc(repoId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: SaveContextDocBody) =>
      api.put<{ path: string; content: string }>(`/repos/${repoId}/context/doc`, body),
    onSuccess: (data) => {
      qc.setQueryData(queryKeys.contextDoc(repoId, data.path), data);
      // The size (and therefore the token estimate) of the document changed.
      qc.invalidateQueries({ queryKey: queryKeys.context(repoId) });
    },
  });
}

// ---- Context attachments (agent / skill editor `Context` tabs) ----

/**
 * Agent → Context editor rows for one repository (every document + attach
 * state), together with `token_ceiling` — the ceiling THIS workspace's runs cap
 * against, so the tab's warning cannot quote a number the run does not honour.
 */
export function useAgentContextDocs(
  agentId: string | null | undefined,
  repoId: string | null | undefined,
) {
  return useQuery({
    queryKey: queryKeys.agentContext(agentId, repoId),
    queryFn: () =>
      api.get<ContextDocsResponse>(`/agents/${agentId}/context?repo_id=${repoId}`),
    enabled: !!agentId && !!repoId,
  });
}

/** Skill → Context editor rows for one repository. */
export function useSkillContextDocs(
  skillId: string | null | undefined,
  repoId: string | null | undefined,
) {
  return useQuery({
    queryKey: queryKeys.skillContext(skillId, repoId),
    queryFn: () =>
      api.get<ContextDocsResponse>(`/skills/${skillId}/context?repo_id=${repoId}`),
    enabled: !!skillId && !!repoId,
  });
}

/**
 * Full-replace attach/detach/reorder for an agent's documents. Also invalidates
 * the repository's document list, because attaching changes every document's
 * `used_by_agents`.
 */
export function useSetAgentContextDocs(
  agentId: string | null | undefined,
  repoId: string | null | undefined,
) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (paths: string[]) =>
      api.post<ContextDocsResponse>(`/agents/${agentId}/context`, {
        repo_id: repoId,
        paths,
      }),
    onSuccess: (docs) => {
      qc.setQueryData(queryKeys.agentContext(agentId, repoId), docs);
      qc.invalidateQueries({ queryKey: queryKeys.context(repoId) });
    },
  });
}

/**
 * Full-replace attach/detach/reorder for a skill's documents. Every agent using
 * the skill inherits the result, so the repository's list is invalidated too.
 */
export function useSetSkillContextDocs(
  skillId: string | null | undefined,
  repoId: string | null | undefined,
) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (paths: string[]) =>
      api.post<ContextDocsResponse>(`/skills/${skillId}/context`, {
        repo_id: repoId,
        paths,
      }),
    onSuccess: (docs) => {
      qc.setQueryData(queryKeys.skillContext(skillId, repoId), docs);
      qc.invalidateQueries({ queryKey: queryKeys.context(repoId) });
    },
  });
}
