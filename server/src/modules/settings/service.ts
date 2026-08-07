import type {
  ConnTestProvider,
  ConnTestResult,
  SecretsStatus,
  Settings,
  SettingsUpdate,
} from '@devdigest/shared';
import type { Container } from '../../platform/container.js';
import { GITHUB_PROVIDER, SECRET_KEY_BY_PROVIDER } from './constants.js';
import { rowsToSettings } from './helpers.js';
import { SettingsRepository } from './repository.js';

/**
 * F1 — settings service. Non-secret prefs + connection tests. Secrets go
 * through SecretsProvider; persistence through SettingsRepository.
 */
export class SettingsService {
  private repo: SettingsRepository;

  constructor(private container: Container) {
    this.repo = new SettingsRepository(container.db);
  }

  async get(workspaceId: string): Promise<Settings> {
    return rowsToSettings(await this.repo.listRows(workspaceId));
  }

  async update(
    workspaceId: string,
    userId: string,
    body: SettingsUpdate,
  ): Promise<Settings> {
    for (const [key, value] of Object.entries(body)) {
      await this.repo.upsert(workspaceId, userId, key, value);
    }
    return this.get(workspaceId);
  }

  /** Booleans only — never secret values. */
  async secretsStatus(): Promise<SecretsStatus> {
    const entries = await Promise.all(
      Object.entries(SECRET_KEY_BY_PROVIDER).map(
        async ([provider, key]) =>
          // Renamed `github` -> `githubPat` for clarity (PAT, not an OAuth token).
          [provider === GITHUB_PROVIDER ? 'githubPat' : provider, Boolean(await this.container.secrets.get(key))] as const,
      ),
    );
    return Object.fromEntries(entries) as SecretsStatus;
  }

  async testConnection(input: {
    provider: ConnTestProvider;
    key?: string;
  }): Promise<ConnTestResult> {
    const { provider, key } = input;
    try {
      if (key) {
        if (!this.container.secrets.set) {
          return { provider, ok: false, message: 'Secrets backend is read-only' };
        }
        await this.container.secrets.set(SECRET_KEY_BY_PROVIDER[provider], key);
        this.container.invalidateSecretCaches();
      }
      if (provider === GITHUB_PROVIDER) {
        const gh = await this.container.github();
        const login = await gh.currentLogin();
        return { provider, ok: true, message: `Connected as @${login}` };
      }
      const llm = await this.container.llm(provider);
      const models = await llm.listModels();
      return { provider, ok: true, message: `OK — ${models.length} models available` };
    } catch (err) {
      return { provider, ok: false, message: (err as Error).message };
    }
  }
}
