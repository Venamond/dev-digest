import type {
  ContextDocEditorRow,
  ContextDocsResponse,
  ContextDocUser,
  SpecFile,
} from '@devdigest/shared';
import type { Container } from '../../platform/container.js';
import type { RepoRow } from '../../db/rows.js';
import { AppError, NotFoundError, ValidationError } from '../../platform/errors.js';
import { approxTokens, MARKDOWN_EXTENSION } from './constants.js';
import { ContextRepository } from './repository.js';
import { resolveEffectiveDocs, type EffectiveDoc } from './resolve.js';
import { resolveInsideClone, rootOf, walkMarkdown, type WalkedDoc } from './walk.js';

/**
 * Project Context — application layer.
 *
 * Owns enumeration, the attach/detach/reorder path, and reading and saving one
 * document's text. Everything that touches the clone goes through a port
 * (`container.fs` to enumerate, `container.git` to read and write); everything
 * that touches the database goes through `ContextRepository`.
 *
 * Nothing here throws for a repository that was never cloned: no clone means an
 * empty list, which is the UI's empty state, never an error.
 */

/** 400, not 422: a bad document path is a request the API refuses outright. */
function badRequest(message: string): AppError {
  return new AppError('invalid_context_path', message, 400);
}

export class ContextService {
  private repo: ContextRepository;

  constructor(private container: Container) {
    this.repo = new ContextRepository(container.db);
  }

  // ---- The repository's documents ----------------------------------------

  /** Every markdown document of the repository, with its "used by" set. */
  async listDocs(workspaceId: string, repoId: string): Promise<SpecFile[]> {
    const repo = await this.repo.getRepo(workspaceId, repoId);
    if (!repo) return [];
    const walked = await this.enumerate(workspaceId, repo);
    const users = await this.repo.usedByAgents(
      workspaceId,
      repoId,
      walked.map((d) => d.path),
    );
    // The Map has no entry for a document nobody uses. Default it HERE, before
    // the DTO mapper — `?? null` inside the mapper is what once reported `null`
    // where a list response promised a number.
    return walked.map((d) => toSpecFile(d, users.get(d.path) ?? []));
  }

  /** One document's text. `undefined` → 404; a bad path throws 400. */
  async readDoc(
    workspaceId: string,
    repoId: string,
    path: string,
  ): Promise<{ path: string; content: string } | undefined> {
    const repo = await this.repo.getRepo(workspaceId, repoId);
    if (!repo) return undefined;
    const docs = await this.assertInsideRoots(workspaceId, repo, path);
    if (!docs.some((d) => d.path === path)) return undefined;
    try {
      return { path, content: await this.container.git.readFile(repoRef(repo), path) };
    } catch {
      return undefined;
    }
  }

  /**
   * Save an edited document back into the clone (AC-6).
   *
   * The write is local-only: no commit, no remote, and the next resync
   * overwrites it. Only an existing document of this repository may be written
   * — creating documents from the Studio is a stated non-goal — so an unknown
   * path is a `404` and a path outside the roots a `400`.
   */
  async saveDoc(
    workspaceId: string,
    repoId: string,
    path: string,
    content: string,
  ): Promise<{ path: string; content: string } | undefined> {
    const repo = await this.repo.getRepo(workspaceId, repoId);
    if (!repo) return undefined;
    const docs = await this.assertInsideRoots(workspaceId, repo, path);
    if (!docs.some((d) => d.path === path)) return undefined;
    // The path is repository-relative: the adapter joins it onto the clone and
    // re-validates it itself, so an absolute path is a rejected input there too.
    await this.container.git.writeFile(repoRef(repo), path, content);
    return { path, content };
  }

  /**
   * Create a NEW markdown document under one of the configured roots. Missing
   * folders on the way are created, which is what the mockup's "new folder"
   * affordance amounts to in a git clone — git tracks no empty directory, so a
   * folder only exists once it holds a file.
   *
   * `undefined` → the repo is unknown. Throws for a path that is not markdown,
   * sits outside the roots, or already exists.
   */
  async createDoc(
    workspaceId: string,
    repoId: string,
    path: string,
    content: string,
  ): Promise<{ path: string; content: string } | undefined> {
    const repo = await this.repo.getRepo(workspaceId, repoId);
    if (!repo) return undefined;
    if (!path.endsWith(MARKDOWN_EXTENSION)) {
      throw new ValidationError(`a project-context document must end in ${MARKDOWN_EXTENSION}`);
    }
    const roots = await this.repo.readRoots(workspaceId);
    // The path has to sit under a configured root — at any depth (AC-2) — or the
    // document would be invisible to the very list it was created for.
    if (rootOf(path, roots) == null) {
      throw new ValidationError(`a document must live under one of: ${roots.join(', ')}`);
    }
    await this.container.git.createFile(repoRef(repo), path, content);
    return { path, content };
  }

  // ---- Attachments -------------------------------------------------------

  /** The agent's `Context` tab rows and this workspace's ceiling. `undefined` → 404. */
  async agentRows(
    workspaceId: string,
    agentId: string,
    repoId: string,
  ): Promise<ContextDocsResponse | undefined> {
    const agent = await this.repo.getAgent(workspaceId, agentId);
    const repo = await this.repo.getRepo(workspaceId, repoId);
    if (!agent || !repo) return undefined;
    return this.withCeiling(workspaceId, this.buildAgentRows(workspaceId, agentId, repo));
  }

  /** Replace the agent's ordered attachments. `undefined` → 404. */
  async setAgentDocs(
    workspaceId: string,
    agentId: string,
    repoId: string,
    paths: string[],
  ): Promise<ContextDocsResponse | undefined> {
    const agent = await this.repo.getAgent(workspaceId, agentId);
    const repo = await this.repo.getRepo(workspaceId, repoId);
    if (!agent || !repo) return undefined;
    await this.assertSubmittable(
      workspaceId,
      repo,
      paths,
      await this.repo.agentDocPaths(agentId, repoId),
    );
    await this.repo.replaceAgentDocs(agentId, repoId, paths);
    return this.withCeiling(workspaceId, this.buildAgentRows(workspaceId, agentId, repo));
  }

  /** The skill's `Context` tab rows — no inheritance. `undefined` → 404. */
  async skillRows(
    workspaceId: string,
    skillId: string,
    repoId: string,
  ): Promise<ContextDocsResponse | undefined> {
    const skill = await this.repo.getSkill(workspaceId, skillId);
    const repo = await this.repo.getRepo(workspaceId, repoId);
    if (!skill || !repo) return undefined;
    return this.withCeiling(workspaceId, this.buildSkillRows(workspaceId, skillId, repo));
  }

  /** Replace the skill's ordered attachments. `undefined` → 404. */
  async setSkillDocs(
    workspaceId: string,
    skillId: string,
    repoId: string,
    paths: string[],
  ): Promise<ContextDocsResponse | undefined> {
    const skill = await this.repo.getSkill(workspaceId, skillId);
    const repo = await this.repo.getRepo(workspaceId, repoId);
    if (!skill || !repo) return undefined;
    await this.assertSubmittable(
      workspaceId,
      repo,
      paths,
      await this.repo.skillDocPaths(skillId, repo.id),
    );
    await this.repo.replaceSkillDocs(skillId, repo.id, paths);
    return this.withCeiling(workspaceId, this.buildSkillRows(workspaceId, skillId, repo));
  }

  // ---- The run's view (consumed through facade.ts) ------------------------

  /**
   * The documents a run for this agent would inject, once each, in order
   * (AC-20, AC-34, AC-39, AC-40). Ordering lives in the pure resolver; this
   * method only supplies it with what is stored.
   */
  async effectiveDocsForAgent(agentId: string, repoId: string): Promise<EffectiveDoc[]> {
    const [ownPaths, skills] = await Promise.all([
      this.repo.agentDocPaths(agentId, repoId),
      this.repo.linkedSkillDocs(agentId, repoId),
    ]);
    return resolveEffectiveDocs({ ownPaths, skills });
  }

  /** The workspace's project-context token ceiling (AC-28). */
  /**
   * The configured search roots. A run needs them to say WHICH kind of document
   * it attached (`1 spec, 2 docs`), and they are configurable, so it cannot
   * assume the three defaults.
   */
  async searchRoots(workspaceId: string): Promise<readonly string[]> {
    return this.repo.readRoots(workspaceId);
  }

  async tokenCeiling(workspaceId: string): Promise<number> {
    return this.repo.readCeiling(workspaceId);
  }

  // ---- Internals ---------------------------------------------------------

  /**
   * Ship the rows with the ceiling the run will actually apply.
   *
   * Both editor tabs warn when the attached total exceeds it, and a run skips
   * against `readCeiling(workspaceId)` — the same number, read here — so a
   * workspace that overrides `context.token_ceiling` cannot end up with a tab
   * quoting one figure and a run honouring another.
   */
  private async withCeiling(
    workspaceId: string,
    rows: Promise<ContextDocEditorRow[]>,
  ): Promise<ContextDocsResponse> {
    const [resolved, token_ceiling] = await Promise.all([rows, this.tokenCeiling(workspaceId)]);
    return { rows: resolved, token_ceiling };
  }

  /** Markdown under the workspace's roots, or `[]` when there is no clone. */
  private async enumerate(workspaceId: string, repo: RepoRow): Promise<WalkedDoc[]> {
    if (!repo.clonePath) return [];
    const roots = await this.repo.readRoots(workspaceId);
    try {
      return await walkMarkdown(this.container.fs, repo.clonePath, roots);
    } catch {
      // An unreadable clone is the empty state too — never a 500.
      return [];
    }
  }

  /**
   * Reject a path that is not a legal repository-relative path, or that does
   * not live under one of the configured roots, and return the enumeration so
   * the caller can decide between `400` (bad path) and `404` (no such document).
   */
  private async assertInsideRoots(
    workspaceId: string,
    repo: RepoRow,
    path: string,
  ): Promise<WalkedDoc[]> {
    if (repo.clonePath && !resolveInsideClone(repo.clonePath, path)) {
      throw badRequest(`Path is not inside the repository clone: ${path}`);
    }
    const roots = await this.repo.readRoots(workspaceId);
    // Same rule as the walk: a root counts at ANY depth (AC-2), so
    // `server/docs/adr.md` is as valid a path as `docs/adr.md`. One definition,
    // in `walk.ts` — three copies of it is how the reader and the guard drifted
    // apart and every nested document answered 400.
    if (rootOf(path, roots) == null) {
      throw badRequest(`Path is not inside the configured project-context roots: ${path}`);
    }
    return this.enumerate(workspaceId, repo);
  }

  /**
   * Validate one attach/detach/reorder request (AC-11, AC-13, AC-36, AC-41).
   *
   * Rejects a duplicate path in one request, a path that fails
   * `resolveInsideClone`, and a path this repository does not have and that is
   * not already attached. An already-attached path whose file has since been
   * deleted IS re-submittable, so a broken attachment can be reordered away
   * rather than becoming unsubmittable.
   *
   * AC-41 — "the human may not reposition an inherited entry" — needs no check
   * here: the request carries only the OWNER'S own ordered paths, so an
   * inherited entry has no position in it to set. Submitting a path a skill
   * also contributes is not a reposition, it is a direct attachment, which
   * AC-20/AC-34 explicitly allow (it is then shown once, at the agent's index).
   */
  private async assertSubmittable(
    workspaceId: string,
    repo: RepoRow,
    paths: string[],
    alreadyAttached: string[],
  ): Promise<void> {
    const seen = new Set<string>();
    for (const path of paths) {
      if (seen.has(path)) throw badRequest(`Document listed twice: ${path}`);
      seen.add(path);
      if (repo.clonePath && !resolveInsideClone(repo.clonePath, path)) {
        throw badRequest(`Path is not inside the repository clone: ${path}`);
      }
    }
    const enumerated = new Set((await this.enumerate(workspaceId, repo)).map((d) => d.path));
    const attached = new Set(alreadyAttached);
    for (const path of paths) {
      if (!enumerated.has(path) && !attached.has(path)) {
        throw badRequest(`Not a project-context document of this repository: ${path}`);
      }
    }
  }

  private async buildAgentRows(
    workspaceId: string,
    agentId: string,
    repo: RepoRow,
  ): Promise<ContextDocEditorRow[]> {
    const [effective, docs] = await Promise.all([
      this.effectiveDocsForAgent(agentId, repo.id),
      this.listDocs(workspaceId, repo.id),
    ]);
    // The tab's order and the run's order come from the SAME resolver, so the
    // tab cannot promise a sequence the run does not honour.
    return buildRows({
      docs,
      ordered: effective.map((e) => e.path),
      attachedSet: new Set(effective.filter((e) => e.own).map((e) => e.path)),
      inheritedFrom: new Map(effective.map((e) => [e.path, e.skills])),
    });
  }

  private async buildSkillRows(
    workspaceId: string,
    skillId: string,
    repo: RepoRow,
  ): Promise<ContextDocEditorRow[]> {
    const [own, docs] = await Promise.all([
      this.repo.skillDocPaths(skillId, repo.id),
      this.listDocs(workspaceId, repo.id),
    ]);
    return buildRows({
      docs,
      ordered: own,
      attachedSet: new Set(own),
      inheritedFrom: new Map(),
    });
  }
}

/** `RepoRef` for the git port — the clone is addressed by owner/name. */
function repoRef(repo: RepoRow): { owner: string; name: string } {
  return { owner: repo.owner, name: repo.name };
}

function toSpecFile(doc: WalkedDoc, users: ContextDocUser[]): SpecFile {
  return {
    path: doc.path,
    root: doc.root,
    // `approxTokens` takes a CHARACTER COUNT, and is the ONE estimator this
    // feature uses — the tab's warning and a run's skipping must agree.
    approx_tokens: approxTokens(doc.size),
    used_by_agents: users.length,
    used_by: users,
    content: null,
    size: doc.size,
    updated_at: new Date(doc.mtimeMs).toISOString(),
  };
}

/**
 * A descriptor for an attachment the enumeration did not return — the document
 * was deleted or renamed after it was attached. It still gets a row, marked
 * unreadable, so the human sees it on the tab instead of in a run's trace
 * (AC-36), and can reorder it away.
 */
function missingSpecFile(path: string): SpecFile {
  const slash = path.indexOf('/');
  return {
    path,
    root: slash > 0 ? path.slice(0, slash) : '',
    approx_tokens: 0,
    used_by_agents: 0,
    used_by: [],
    content: null,
    size: 0,
    // An attachment whose file is gone has no modification time to report.
    updated_at: null,
  };
}

/**
 * Rows in a stable, meaningful order: the owner's ordered list first (own, then
 * inherited-only), then every remaining document of the repository in walk
 * order. The client still groups and sorts for display (AC-14); this only makes
 * the payload deterministic and puts `order` on the entries that have one.
 */
function buildRows(input: {
  docs: SpecFile[];
  ordered: string[];
  attachedSet: Set<string>;
  inheritedFrom: Map<string, Array<{ skill_id: string; skill_name: string }>>;
}): ContextDocEditorRow[] {
  const { docs, ordered, attachedSet, inheritedFrom } = input;
  const byPath = new Map(docs.map((d) => [d.path, d]));
  const rows: ContextDocEditorRow[] = [];
  const emitted = new Set<string>();

  ordered.forEach((path, index) => {
    if (emitted.has(path)) return;
    emitted.add(path);
    const doc = byPath.get(path);
    rows.push({
      doc: doc ?? missingSpecFile(path),
      attached: attachedSet.has(path),
      order: attachedSet.has(path) ? index : 0,
      inherited_from: inheritedFrom.get(path) ?? [],
      readable: doc !== undefined,
    });
  });

  for (const doc of docs) {
    if (emitted.has(doc.path)) continue;
    rows.push({
      doc,
      attached: false,
      order: 0,
      inherited_from: inheritedFrom.get(doc.path) ?? [],
      readable: true,
    });
  }
  return rows;
}
