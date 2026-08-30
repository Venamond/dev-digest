# Good/bad, from this repo

## Route reaching the database directly

**Bad** — `server/src/modules/pulls/routes.ts`, top of the
`GET /repos/:id/pulls` handler:

```ts
import { and, desc, eq, inArray } from 'drizzle-orm';
import * as t from '../../db/schema.js';
// ...
const [repo] = await container.db
  .select()
  .from(t.repos)
  .where(and(eq(t.repos.workspaceId, workspaceId), eq(t.repos.id, req.params.id)));
```

**Good** — `server/src/modules/agents/routes.ts`, any handler:

```ts
import type { AgentsService } from './service.js';
// no drizzle-orm import in this file at all
const agent = await container.agentsService.getAgent(workspaceId, req.params.id);
```

## Application-layer code importing `db/schema` vs. `db/rows.ts`

**Bad** — `server/src/modules/reviews/run-executor.ts`:

```ts
import * as schema from '../../db/schema.js';
```

**Good** — same file could instead do:

```ts
import type { AgentRow } from '../../db/rows.js';
```

(`run-executor.ts` currently does import `db/rows.ts` for `AgentRow` too —
the fix here is dropping the `db/schema` import, not adding the `db/rows.ts`
one.)

## A service taking `Container` vs. explicit ports

**Bad** (the grandfathered pattern — see `rules/ports-adapters-di.md`):

```ts
export class ReviewsService {
  constructor(private container: Container) {}
}
```

**Good** (what a new service should do):

```ts
export class ReviewsService {
  constructor(
    private reviewRepo: ReviewRepository,
    private llm: LLMProvider,
  ) {}
}
```

## Repository composition for a large module

**Good** — `server/src/modules/reviews/repository.ts` doesn't put every
query inline; it composes per-aggregate query modules:

```ts
import * as reviewRepo from './repository/review.repo.js';
import * as runRepo from './repository/run.repo.js';
import * as pullRepo from './repository/pull.repo.js';

export class ReviewRepository {
  constructor(private db: Db) {}
  // delegates to reviewRepo / runRepo / pullRepo
}
```

`drizzle-orm` and `db/schema` stay confined to `repository.ts` and
`repository/*.repo.ts` — nothing outside this file set imports them for the
`reviews` module.
