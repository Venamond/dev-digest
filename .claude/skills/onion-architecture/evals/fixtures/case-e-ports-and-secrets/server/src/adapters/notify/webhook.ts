import type { Notifier, NotifyMessage } from '../../vendor/shared/adapters.js';
import type { Severity } from '@devdigest/shared';
import { ExternalServiceError } from '../../platform/errors.js';

/**
 * Generic webhook delivery — the first Notifier implementation. Posts a JSON
 * body to whatever endpoint the workspace configured.
 */
export class WebhookNotifier implements Notifier {
  readonly id = 'webhook' as const;

  private get endpoint(): string {
    const url = process.env.DIGEST_WEBHOOK_URL;
    if (!url) throw new ExternalServiceError('DIGEST_WEBHOOK_URL is not set');
    return url;
  }

  supports(severity: Severity): boolean {
    return severity !== 'SUGGESTION';
  }

  async send(message: NotifyMessage): Promise<void> {
    const res = await fetch(this.endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(message),
    });
    if (!res.ok) throw new ExternalServiceError(`webhook responded ${res.status}`);
  }
}
