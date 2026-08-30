import type { SmartDiff } from '@devdigest/shared';
import type { Container } from '../../platform/container.js';
import { NotFoundError } from '../../platform/errors.js';
import { SmartDiffRepository } from './repository.js';
import { buildSmartDiff } from './pure/assemble.js';

export class SmartDiffService {
  private repo: SmartDiffRepository;

  constructor(private container: Container) {
    this.repo = new SmartDiffRepository(container.db);
  }

  async getSmartDiff(workspaceId: string, prId: string): Promise<SmartDiff> {
    const pull = await this.repo.getPull(workspaceId, prId);
    if (!pull) throw new NotFoundError('Pull request not found');

    const [files, findingLinesByFile] = await Promise.all([
      this.repo.prFiles(prId),
      this.repo.findingLinesByFile(prId),
    ]);

    return buildSmartDiff({ files, findingLinesByFile });
  }
}
