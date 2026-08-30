# Frontend Architecture — Examples

Real before/after pairs from `client/`. See
[SKILL.md](SKILL.md) for the rules these illustrate.

## Query keys: implicit coupling vs. a factory

**Before** (current state — `src/lib/hooks/agents.ts` and
`src/lib/hooks/core.ts`):

```ts
// agents.ts:84-91
export function useProviderModels(provider: Provider | null | undefined) {
  return useQuery({
    queryKey: ["provider-models", provider],
    queryFn: () => api.get<ModelInfo[]>(`/providers/${provider}/models`),
    enabled: !!provider,
    staleTime: 5 * 60_000,
  });
}

// core.ts:38-54 (useTestConnection)
onSuccess: (res) => {
  if (res.ok) {
    qc.invalidateQueries({ queryKey: ["provider-models"] });
    qc.invalidateQueries({ queryKey: ["secrets-status"] });
  }
},
```

This works — TanStack Query matches `["provider-models"]` as a prefix of
`["provider-models", provider]` — but nothing in `core.ts` points at
`agents.ts`, or vice versa. Rename the key in one file and the
invalidation in the other silently stops working; nothing catches it at
compile time.

**After** (factory pattern, per
[references.md §3.3](references.md#33-tkdodo-dominik-dorfmeister)):

```ts
// agents.ts — near the top, exported so other modules can reference it
export const agentKeys = {
  all: ["agents"] as const,
  providerModels: (provider: Provider | null | undefined) =>
    ["provider-models", provider] as const,
  providerModelsAll: () => ["provider-models"] as const,
};

export function useProviderModels(provider: Provider | null | undefined) {
  return useQuery({
    queryKey: agentKeys.providerModels(provider),
    queryFn: () => api.get<ModelInfo[]>(`/providers/${provider}/models`),
    enabled: !!provider,
    staleTime: 5 * 60_000,
  });
}

// core.ts
import { agentKeys } from "./agents";

onSuccess: (res) => {
  if (res.ok) {
    qc.invalidateQueries({ queryKey: agentKeys.providerModelsAll() });
    qc.invalidateQueries({ queryKey: ["secrets-status"] });
  }
},
```

Now a rename is a TypeScript error in every consumer, not a silent gap.
Not yet applied in this repo — see [deviations.md](deviations.md).

## Server/client boundary: thick route entry vs. thin route entry

**Before** (current state — `src/app/agents/[id]/page.tsx`, first 12 lines):

```tsx
"use client";

import React from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Button, Dropdown, ErrorState, Skeleton, Icon, Badge } from "@devdigest/ui";
import { AppShell } from "../../../components/app-shell";
import { AgentCard } from "../_components/AgentCard";
import { AgentEditor } from "./_components/AgentEditor";
import { useAgents, useAgent, useUpdateAgent } from "../../../lib/hooks/agents";
```

The route entry itself is a Client Component with the full page assembled
inline below this excerpt.

**After** (the pattern already used correctly elsewhere in this repo —
`src/app/agents/page.tsx`, in full):

```tsx
import { AgentsListView } from "./_components/AgentsListView";

/* Route: /agents (Agents list). Thin route entry — the view, its create modal,
   styles, constants, helpers and i18n are colocated under _components/AgentsListView. */
export default function AgentsPage() {
  return <AgentsListView />;
}
```

`AgentsPage` stays a Server Component; `'use client'` lives one level down
in `AgentsListView`. `agents/[id]/page.tsx` doesn't yet follow this — see
[deviations.md](deviations.md).

## Constants & styles: colocated `styles.ts`, not Tailwind classes

`react-best-practices` says "no inline `style={}` objects." `client/` does
the opposite on purpose — e.g.
`src/app/agents/_components/AgentsListView/styles.ts` defines style objects
consumed by the component next to it, rather than Tailwind utility classes
in the JSX. Follow the `styles.ts` pattern for new components in this
package; see [deviations.md](deviations.md) for why the generic rule is
overridden here.
