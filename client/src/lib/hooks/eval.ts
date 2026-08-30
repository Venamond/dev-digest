/* hooks/eval.ts — React Query hooks for the L06 eval pipeline: an agent's case
   set, single-case trials, set runs and the two dashboards.

   Every list payload is guarded with `Array.isArray`, never `?? []`: component
   tests stub one `fetch` whose URL chain ends in a catch-all `jsonResponse({})`,
   so an unmatched URL yields `{}` — not `undefined` — and a nullish coalesce
   passes it straight through into `.map`/`.filter`. */
"use client";

import { queryKeys } from "./keys";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import type {
  EvalAgentDashboard,
  EvalCase,
  EvalCaseInput,
  EvalCaseSeed,
  EvalCaseWithLastRun,
  EvalOverview,
  EvalRunBatch,
  EvalRunRecord,
  EvalSkillCaseFiles,
  EvalSkillCaseRow,
} from "@devdigest/shared";

/** A batch plus the per-case rows it produced (`GET /eval-runs/:id`). */
export interface EvalRunDetail {
  batch: EvalRunBatch;
  results: EvalRunRecord[];
}

/** What `POST /agents/:id/eval-runs` answers with, before any case has finished. */
export interface EvalRunStarted {
  run_id: string;
  cases_total: number;
}

const asArray = <T,>(x: unknown): T[] => (Array.isArray(x) ? (x as T[]) : []);

// ---- Case set -------------------------------------------------------------

export function useEvalCases(agentId: string | null | undefined) {
  return useQuery({
    queryKey: queryKeys.evalCases(agentId),
    // Each row carries `last_run` — the execution that touched that case most
    // recently, set run OR trial (AC-63). It is the only source that survives a
    // remount, so the component must not rebuild the result from a batch alone.
    queryFn: async () =>
      asArray<EvalCaseWithLastRun>(
        await api.get<EvalCaseWithLastRun[]>(`/agents/${agentId}/eval-cases`),
      ),
    enabled: !!agentId,
  });
}

export interface CreateEvalCaseInput {
  agentId: string;
  input: EvalCaseInput;
}

export function useCreateEvalCase() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ agentId, input }: CreateEvalCaseInput) =>
      api.post<EvalCase>(`/agents/${agentId}/eval-cases`, input),
    onSuccess: (_data, { agentId, input }) => {
      qc.invalidateQueries({ queryKey: queryKeys.evalCases(agentId) });
      qc.invalidateQueries({ queryKey: queryKeys.agentEvalDashboard(agentId) });
      /* `existing_case_id` on the seed is what raises the duplicate warning on
         the finding card. Leaving it cached means the SECOND press of `Turn
         into eval case` sees no existing case and silently makes a twin —
         which is how two `must-find-missing-test-coverage-…` rows reached the
         set on 2026-08-30. */
      const findingId = input.seeded_from?.finding_id;
      if (findingId) qc.invalidateQueries({ queryKey: queryKeys.findingEvalSeed(findingId) });
    },
  });
}

export interface UpdateEvalCaseInput {
  id: string;
  agentId: string;
  patch: Partial<EvalCaseInput>;
}

export function useUpdateEvalCase() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: UpdateEvalCaseInput) =>
      api.put<EvalCase>(`/eval-cases/${id}`, patch),
    onSuccess: (_data, { agentId }) =>
      qc.invalidateQueries({ queryKey: queryKeys.evalCases(agentId) }),
  });
}

export interface DeleteEvalCaseInput {
  id: string;
  /**
   * Omitted for a SKILL case: the route is owner-generic, and this id exists
   * only to invalidate the agent-scoped queries. The skill tab used to pass
   * `""` for it, which invalidated a key belonging to no agent — a no-op
   * dressed as a cache update.
   */
  agentId?: string;
}

export function useDeleteEvalCase() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id }: DeleteEvalCaseInput) => api.del<{ ok: true }>(`/eval-cases/${id}`),
    onSuccess: (_data, { agentId }) => {
      // Deleting a case removes its run rows, so the history moves too. A skill
      // case has no agent-scoped list to refresh; its caller invalidates its own.
      if (!agentId) return;
      qc.invalidateQueries({ queryKey: queryKeys.evalCases(agentId) });
      qc.invalidateQueries({ queryKey: queryKeys.evalRuns(agentId) });
      qc.invalidateQueries({ queryKey: queryKeys.agentEvalDashboard(agentId) });
    },
  });
}

/** A single-case trial. It writes an `eval_runs` row with no batch, so it never
    enters the agent's run history — only the case's own last result. */
export function useRunEvalCase() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id }: { id: string; agentId: string }) =>
      api.post<EvalRunRecord>(`/eval-cases/${id}/run`),
    onSuccess: (_data, { agentId }) =>
      qc.invalidateQueries({ queryKey: queryKeys.evalCases(agentId) }),
  });
}

// ---- Runs -----------------------------------------------------------------

export function useEvalRuns(agentId: string | null | undefined) {
  return useQuery({
    queryKey: queryKeys.evalRuns(agentId),
    queryFn: async () =>
      asArray<EvalRunBatch>(await api.get<EvalRunBatch[]>(`/agents/${agentId}/eval-runs`)),
    enabled: !!agentId,
  });
}

export function useEvalRun(runId: string | null | undefined) {
  return useQuery({
    queryKey: queryKeys.evalRun(runId),
    queryFn: () => api.get<EvalRunDetail>(`/eval-runs/${runId}`),
    enabled: !!runId,
  });
}

export function useStartEvalRun() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ agentId }: { agentId: string }) =>
      api.post<EvalRunStarted>(`/agents/${agentId}/eval-runs`),
    onSuccess: (_data, { agentId }) => {
      qc.invalidateQueries({ queryKey: queryKeys.evalRuns(agentId) });
      qc.invalidateQueries({ queryKey: queryKeys.agentEvalDashboard(agentId) });
      qc.invalidateQueries({ queryKey: queryKeys.evalDashboard });
    },
  });
}

export function useStartAllEvalRuns() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<{ runs: EvalRunStarted[] }>("/eval-runs/all"),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.evalDashboard }),
  });
}

// ---- Dashboards -----------------------------------------------------------

export function useEvalOverview() {
  return useQuery({
    queryKey: queryKeys.evalDashboard,
    queryFn: () => api.get<EvalOverview>("/eval-dashboard"),
  });
}

export function useAgentEvalDashboard(agentId: string | null | undefined) {
  return useQuery({
    queryKey: queryKeys.agentEvalDashboard(agentId),
    queryFn: () => api.get<EvalAgentDashboard>(`/agents/${agentId}/eval-dashboard`),
    enabled: !!agentId,
  });
}

// ---- Seeding a case from a finding ----------------------------------------

/** `enabled` gates the fetch: the seed is only wanted once the author asks for
    it, not on every render of a finding. */
export function useFindingEvalSeed(findingId: string | null | undefined, enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.findingEvalSeed(findingId),
    queryFn: () => api.get<EvalCaseSeed>(`/findings/${findingId}/eval-seed`),
    enabled: enabled && !!findingId,
  });
}

// ---- Skill evals (track F) ------------------------------------------------

/* A skill case is the SAME case run twice against one diff — once with the
   skill's body in the prompt, once without — and both halves land in one
   `eval_runs` row with `batch_id NULL`. There is no batch, no run history and
   no metric strip on that screen, so these hooks read cases and run one case;
   they never read a dashboard.

   Delete and update are NOT duplicated here: `DELETE /eval-cases/:id` and
   `PUT /eval-cases/:id` are already owner-generic, and the service rebuilds a
   skill case's generated diff behind the update. */

/** What `POST /eval-cases/preview-diff` answers — screen B's `Preview generated diff`. */
export interface EvalDiffPreview {
  diff: string;
}

export function useSkillEvalCases(skillId: string | null | undefined) {
  return useQuery({
    queryKey: queryKeys.skillEvalCases(skillId),
    queryFn: async () =>
      asArray<EvalSkillCaseRow>(
        await api.get<EvalSkillCaseRow[]>(`/skills/${skillId}/eval-cases`),
      ),
    enabled: !!skillId,
  });
}

export interface CreateSkillEvalCaseInput {
  skillId: string;
  input: EvalCaseInput;
}

export function useCreateSkillEvalCase() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ skillId, input }: CreateSkillEvalCaseInput) =>
      api.post<EvalCase>(`/skills/${skillId}/eval-cases`, input),
    onSuccess: (_data, { skillId }) =>
      qc.invalidateQueries({ queryKey: queryKeys.skillEvalCases(skillId) }),
  });
}

export interface UpdateSkillEvalCaseInput {
  id: string;
  skillId: string;
  patch: Partial<EvalCaseInput>;
}

/** The route is the shipped owner-generic `PUT /eval-cases/:id`; only the
    invalidation differs, because a skill case hangs off a skill's list. */
export function useUpdateSkillEvalCase() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: UpdateSkillEvalCaseInput) =>
      api.put<EvalCase>(`/eval-cases/${id}`, patch),
    onSuccess: (_data, { skillId }) =>
      qc.invalidateQueries({ queryKey: queryKeys.skillEvalCases(skillId) }),
  });
}

/** One case, two paid model calls — every caller states `2` before firing it. */
export function useRunSkillEvalCase() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id }: { id: string; skillId: string }) =>
      api.post<EvalRunRecord>(`/skill-eval-cases/${id}/run`),
    onSuccess: (_data, { skillId }) =>
      qc.invalidateQueries({ queryKey: queryKeys.skillEvalCases(skillId) }),
  });
}

/** The preview and the stored bytes come from the one server-side builder, so
    what the author reads is what the run reviews. */
export function usePreviewEvalDiff() {
  return useMutation({
    mutationFn: (files: EvalSkillCaseFiles) =>
      api.post<EvalDiffPreview>("/eval-cases/preview-diff", files),
  });
}
