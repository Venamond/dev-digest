/* hooks/skills.ts — React Query hooks for the Skills Lab list + editor. */
"use client";

import { queryKeys } from "./keys";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import type {
  Skill,
  SkillImportDraft,
  SkillListItem,
  SkillStats,
  SkillType,
  SkillVersion,
} from "@devdigest/shared";

/** Diff payload from GET /skills/:id/versions/:version/diff. */
export interface SkillVersionDiff {
  from_version: number;
  to_version: number;
  diff: string;
}

export function useSkills() {
  return useQuery({
    queryKey: queryKeys.skills,
    queryFn: () => api.get<SkillListItem[]>("/skills"),
  });
}

export function useSkill(id: string | null | undefined) {
  return useQuery({
    queryKey: queryKeys.skill(id),
    queryFn: () => api.get<Skill>(`/skills/${id}`),
    enabled: !!id,
  });
}

export interface CreateSkillInput {
  name: string;
  description?: string;
  type: SkillType;
  body: string;
  enabled?: boolean;
}

export function useCreateSkill() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateSkillInput) => api.post<Skill>("/skills", input),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.skills }),
  });
}

export interface UpdateSkillInput {
  id: string;
  patch: Partial<Pick<Skill, "name" | "description" | "type" | "body" | "enabled">>;
}

export function useUpdateSkill() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: UpdateSkillInput) => api.put<Skill>(`/skills/${id}`, patch),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: queryKeys.skills });
      qc.setQueryData(queryKeys.skill(data.id), data);
      qc.invalidateQueries({ queryKey: queryKeys.skillVersions(data.id) });
    },
  });
}

export function useDeleteSkill() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.del<{ ok: boolean }>(`/skills/${id}`),
    onSuccess: (_d, id) => {
      qc.invalidateQueries({ queryKey: queryKeys.skills });
      qc.removeQueries({ queryKey: queryKeys.skill(id) });
      qc.removeQueries({ queryKey: queryKeys.skillVersions(id) });
      qc.removeQueries({ queryKey: queryKeys.skillStats(id) });
    },
  });
}

/** Skill Editor → Stats tab aggregates. */
export function useSkillStats(id: string | null | undefined) {
  return useQuery({
    queryKey: queryKeys.skillStats(id),
    queryFn: () => api.get<SkillStats>(`/skills/${id}/stats`),
    enabled: !!id,
  });
}

export function useSkillVersions(id: string | null | undefined) {
  return useQuery({
    queryKey: queryKeys.skillVersions(id),
    queryFn: () => api.get<SkillVersion[]>(`/skills/${id}/versions`),
    enabled: !!id,
  });
}

export function useRestoreSkillVersion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, version }: { id: string; version: number }) =>
      api.post<Skill>(`/skills/${id}/versions/${version}/restore`),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: queryKeys.skills });
      qc.setQueryData(queryKeys.skill(data.id), data);
      qc.invalidateQueries({ queryKey: queryKeys.skillVersions(data.id) });
    },
  });
}

export function useSkillVersionDiff() {
  return useMutation({
    mutationFn: ({
      id,
      version,
      against,
    }: {
      id: string;
      version: number;
      against?: number;
    }) => {
      const qs = against != null ? `?against=${against}` : "";
      return api.get<SkillVersionDiff>(`/skills/${id}/versions/${version}/diff${qs}`);
    },
  });
}

/** Upload .md / .zip → draft (no persist). Field name `file` matches server multipart. */
export function useImportSkillPreview() {
  return useMutation({
    mutationFn: (file: File) => {
      const form = new FormData();
      form.append("file", file);
      return api.postForm<SkillImportDraft>("/skills/import/preview", form);
    },
  });
}

export function useImportSkillConfirm() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (draft: SkillImportDraft) =>
      api.post<Skill>("/skills/import/confirm", {
        name: draft.name,
        description: draft.description,
        type: draft.type,
        body: draft.body,
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.skills }),
  });
}
