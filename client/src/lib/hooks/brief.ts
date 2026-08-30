/* hooks/brief.ts — the PR brief (what / why / risk level / risks /
   review focus). One cached record per PR; POST rebuilds it. Shapes follow
   `usePrIntent` / `useDeriveIntent` in ./reviews.ts. */
"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { PrBriefRecord } from "@devdigest/shared";
import { api } from "../api";
import { queryKeys } from "./keys";

/** The cached brief for a PR, or `null` when none has been built yet.
 *  GET never calls a model, so it is safe on every page open. */
export function usePrBrief(prId: string | null | undefined) {
  return useQuery({
    queryKey: queryKeys.brief(prId),
    queryFn: () => api.get<PrBriefRecord | null>(`/pulls/${prId}/brief`),
    enabled: !!prId,
  });
}

/** Build (or rebuild, with `force`) the brief. The response IS the new record,
 *  so it is written straight into the cache rather than invalidated — a
 *  refetch here would cost a second request for a body already in hand. */
export function useBuildBrief(prId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (opts?: { force?: boolean }) =>
      api.post<PrBriefRecord>(`/pulls/${prId}/brief`, { force: opts?.force ?? false }),
    onSuccess: (data) => {
      qc.setQueryData(queryKeys.brief(prId), data);
    },
  });
}
