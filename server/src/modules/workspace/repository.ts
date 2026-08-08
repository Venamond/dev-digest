import { eq } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';

export type WorkspaceRepoSummaryRow = {
  id: string;
  fullName: string;
  clonePath: string | null;
  lastPolledAt: Date | null;
};

/** Workspace overview data access — repos table reads for the workspace surface. */
export class WorkspaceRepository {
  constructor(private db: Db) {}

  async listRepos(workspaceId: string): Promise<WorkspaceRepoSummaryRow[]> {
    return this.db
      .select({
        id: t.repos.id,
        fullName: t.repos.fullName,
        clonePath: t.repos.clonePath,
        lastPolledAt: t.repos.lastPolledAt,
      })
      .from(t.repos)
      .where(eq(t.repos.workspaceId, workspaceId));
  }
}
