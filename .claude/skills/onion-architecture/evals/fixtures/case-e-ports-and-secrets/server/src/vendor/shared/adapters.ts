// ---------- Notifier (new) ----------
// Appended to the existing adapter interfaces alongside LLMProvider,
// GitHubClient, GitClient, CodeIndex, Embedder, SecretsProvider, AuthProvider.

import type { Severity } from './contracts/findings.js';

export interface NotifyMessage {
  title: string;
  body: string;
  severity: Severity;
  url: string | null;
}

export interface Notifier {
  readonly id: 'webhook';
  send(message: NotifyMessage): Promise<void>;
  supports(severity: Severity): boolean;
}
