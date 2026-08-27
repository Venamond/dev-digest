import type { Container } from '../../platform/container.js';
import type { NotifyMessage } from '../../vendor/shared/adapters.js';
import type { FindingRow } from '../../db/rows.js';

/**
 * A12 — notify service. Decides which findings justify interrupting a team and
 * hands the message to the notifier port.
 */
export class NotifyService {
  constructor(private container: Container) {}

  async notify(findings: FindingRow[], prUrl: string | null): Promise<number> {
    const notifier = this.container.notifier;

    let sent = 0;
    for (const finding of findings) {
      const severity = finding.severity as NotifyMessage['severity'];
      if (!notifier.supports(severity)) continue;
      await notifier.send({
        title: finding.title,
        body: finding.rationale,
        severity,
        url: prUrl,
      });
      sent += 1;
    }
    return sent;
  }
}
