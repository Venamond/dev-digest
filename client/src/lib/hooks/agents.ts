/* hooks/agents.ts — React Query hooks for the A2 Agents tab + Agent Editor. */
"use client";

import { queryKeys } from "./keys";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import type {
  Agent,
  AgentSkillEditorRow,
  AgentStats,
  ModelInfo,
  Provider,
  ReviewStrategy,
} from "@devdigest/shared";

export function useAgents() {
  return useQuery({
    queryKey: queryKeys.agents,
    queryFn: () => api.get<Agent[]>("/agents"),
  });
}

export function useAgent(id: string | null | undefined) {
  return useQuery({
    queryKey: queryKeys.agent(id),
    queryFn: () => api.get<Agent>(`/agents/${id}`),
    enabled: !!id,
  });
}

export interface CreateAgentInput {
  name: string;
  description?: string;
  provider: Provider;
  model: string;
  system_prompt: string;
  output_schema?: unknown;
  strategy?: ReviewStrategy;
  enabled?: boolean;
}

export function useCreateAgent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateAgentInput) => api.post<Agent>("/agents", input),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.agents }),
  });
}

export interface UpdateAgentInput {
  id: string;
  patch: Partial<
    Pick<
      Agent,
      | "name"
      | "description"
      | "provider"
      | "model"
      | "system_prompt"
      | "output_schema"
      | "strategy"
      | "ci_fail_on"
      | "repo_intel"
      | "enabled"
    >
  >;
}

export function useUpdateAgent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: UpdateAgentInput) => api.put<Agent>(`/agents/${id}`, patch),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: queryKeys.agents });
      qc.setQueryData(queryKeys.agent(data.id), data);
    },
  });
}

export function useDeleteAgent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.del<{ ok: boolean }>(`/agents/${id}`),
    onSuccess: (_d, id) => {
      qc.invalidateQueries({ queryKey: queryKeys.agents });
      qc.removeQueries({ queryKey: queryKeys.agent(id) });
    },
  });
}

/** Dynamic model list for a provider (editor model picker). */
export function useProviderModels(provider: Provider | null | undefined) {
  return useQuery({
    queryKey: queryKeys.providerModels(provider),
    queryFn: () => api.get<ModelInfo[]>(`/providers/${provider}/models`),
    enabled: !!provider,
    staleTime: 5 * 60_000,
  });
}

/** Agent → Skills editor rows (full workspace pool + link state). */
export function useAgentSkills(agentId: string | null | undefined) {
  return useQuery({
    queryKey: queryKeys.agentSkills(agentId),
    queryFn: () => api.get<AgentSkillEditorRow[]>(`/agents/${agentId}/skills`),
    enabled: !!agentId,
  });
}

/** Agent Editor → Stats tab aggregates. */
export function useAgentStats(agentId: string | null | undefined) {
  return useQuery({
    queryKey: queryKeys.agentStats(agentId),
    queryFn: () => api.get<AgentStats>(`/agents/${agentId}/stats`),
    enabled: !!agentId,
  });
}

export interface SetAgentSkillLink {
  skill_id: string;
  order: number;
  enabled: boolean;
}

/** Full-replace bind/reorder/enable for an agent's skills. */
export function useSetAgentSkills(agentId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (links: SetAgentSkillLink[]) =>
      api.post<AgentSkillEditorRow[]>(`/agents/${agentId}/skills`, { links }),
    onSuccess: (rows) => {
      qc.setQueryData(queryKeys.agentSkills(agentId), rows);
      qc.invalidateQueries({ queryKey: queryKeys.agents });
    },
  });
}
