import type { AppConfig } from './config.js';
import type { Db } from '../db/client.js';
import type {
  AuthProvider,
  GitClient,
  GitHubClient,
  LLMProvider,
  Notifier,
  SecretsProvider,
} from '../vendor/shared/adapters.js';
import { WebhookNotifier } from '../adapters/notify/webhook.js';

/**
 * Composition root. The one place concrete classes are constructed and handed
 * out as their interface type.
 */
export interface ContainerOverrides {
  secrets?: SecretsProvider;
  auth?: AuthProvider;
  github?: GitHubClient;
  git?: GitClient;
  llm?: Partial<Record<'openai' | 'anthropic' | 'openrouter', LLMProvider>>;
}

export class Container {
  private _notifier?: Notifier;

  constructor(
    public config: AppConfig,
    public db: Db,
    private overrides: ContainerOverrides = {},
  ) {}

  get notifier(): Notifier {
    this._notifier ??= new WebhookNotifier();
    return this._notifier;
  }
}
