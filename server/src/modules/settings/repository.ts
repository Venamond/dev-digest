import { eq } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import type { SettingsRow } from './helpers.js';

/**
 * Settings data-access layer. The ONLY place that touches the `settings`
 * table for this module. Feature-model readers go through `listRows` too.
 */
export class SettingsRepository {
  constructor(private db: Db) {}

  async listRows(workspaceId: string): Promise<SettingsRow[]> {
    const rows = await this.db
      .select({ key: t.settings.key, value: t.settings.value })
      .from(t.settings)
      .where(eq(t.settings.workspaceId, workspaceId));
    return rows;
  }

  async upsert(
    workspaceId: string,
    userId: string,
    key: string,
    value: unknown,
  ): Promise<void> {
    await this.db
      .insert(t.settings)
      .values({ workspaceId, userId, key, value })
      .onConflictDoUpdate({
        target: [t.settings.workspaceId, t.settings.userId, t.settings.key],
        set: { value },
      });
  }
}
