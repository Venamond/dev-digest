/* hooks/conventions.ts — React Query hooks for Conventions Extractor. */
"use client";

import { queryKeys } from "./keys";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import type {
  ConventionCandidate,
  ConventionSkillCreate,
  ConventionSkillDraft,
  ConventionsExtractResult,
  ConventionsList,
  ConventionUpdate,
  Skill,
} from "@devdigest/shared";

export function useConventions(repoId: string | null | undefined) {
  return useQuery({
    queryKey: queryKeys.conventions(repoId),
    queryFn: () => api.get<ConventionsList>(`/repos/${repoId}/conventions`),
    enabled: !!repoId,
  });
}

export function useExtractConventions(repoId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<ConventionsExtractResult>(`/repos/${repoId}/conventions/extract`),
    onSuccess: (data) => {
      qc.setQueryData(queryKeys.conventions(repoId), {
        candidates: data.candidates,
        scan: data.scan,
      } satisfies ConventionsList);
    },
  });
}

export function useUpdateConvention(repoId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: ConventionUpdate }) =>
      api.patch<ConventionCandidate>(`/conventions/${id}`, patch),
    onSuccess: (updated) => {
      qc.setQueryData<ConventionsList>(queryKeys.conventions(repoId), (prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          candidates: prev.candidates.map((c) => (c.id === updated.id ? updated : c)),
        };
      });
      // Accept/reject changes what skill-draft must merge — drop the stale cache.
      qc.invalidateQueries({ queryKey: queryKeys.conventionSkillDraft(repoId) });
    },
  });
}

export function useConventionSkillDraft(repoId: string | null | undefined, enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.conventionSkillDraft(repoId),
    queryFn: () => api.get<ConventionSkillDraft>(`/repos/${repoId}/conventions/skill-draft`),
    enabled: !!repoId && enabled,
    staleTime: 0,
    refetchOnMount: "always",
  });
}

export function useCreateConventionSkill(repoId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: ConventionSkillCreate) =>
      api.post<Skill>(`/repos/${repoId}/conventions/skill`, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.skills });
    },
  });
}
