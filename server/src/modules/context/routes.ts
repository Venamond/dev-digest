import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  ContextDocsResponse,
  SaveContextDocBody,
  SetContextDocsBody,
  SpecFile,
} from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { NotFoundError } from '../../platform/errors.js';
import { ContextService } from './service.js';

/**
 * Project Context folder — transport layer only. No drizzle, no `db/schema`;
 * every decision belongs to `ContextService`.
 *
 *   GET  /repos/:id/context           → the repository's markdown documents
 *   GET  /repos/:id/context/doc?path= → one document's text
 *   PUT  /repos/:id/context/doc       → save it back into the local clone
 *   GET  /agents/:id/context?repo_id= → the agent's Context tab rows + ceiling
 *   POST /agents/:id/context          → replace the agent's ordered attachments
 *   GET  /skills/:id/context?repo_id= → the skill's Context tab rows + ceiling
 *   POST /skills/:id/context          → replace the skill's ordered attachments
 *
 * The four editor endpoints answer `{ rows, token_ceiling }` rather than a bare
 * array: the ceiling is a per-workspace setting a run caps against, so the tab
 * that warns about it must be told the same number instead of assuming the
 * default.
 *
 * `GET /repos/:id/context` answers `200 []` for a repository with no clone, an
 * unreadable clone, or no markdown — the empty state, never an error. Every
 * response carries an explicit Zod `response` schema; none of them can be a
 * bare `null`, so none needs `.nullable()` (a `GET` that would return one
 * answers `404` instead, which is what `/context/doc` does).
 */

/** The document to read is a repository-relative path, given as a query. */
const DocQuery = z.object({ path: z.string().min(1) });

/** Which repository's documents this agent's/skill's tab is showing. */
const RepoQuery = z.object({ repo_id: z.string().uuid() });

const DocResponse = z.object({ path: z.string(), content: z.string() });

export default async function contextRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const service = new ContextService(app.container);

  app.get(
    '/repos/:id/context',
    { schema: { params: IdParams, response: { 200: z.array(SpecFile) } } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      return service.listDocs(workspaceId, req.params.id);
    },
  );

  app.get(
    '/repos/:id/context/doc',
    {
      schema: { params: IdParams, querystring: DocQuery, response: { 200: DocResponse } },
    },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      const doc = await service.readDoc(workspaceId, req.params.id, req.query.path);
      if (!doc) throw new NotFoundError('Document not found');
      return doc;
    },
  );

  /**
   * The one write this feature exposes. The path is untrusted input: the
   * service rejects a traversal, an absolute path and anything outside the
   * configured roots with `400`, and only then does the git adapter — which
   * re-validates and follows symlinks — touch the disk. The write creates no
   * commit and contacts no remote (AC-6).
   */
  app.put(
    '/repos/:id/context/doc',
    {
      schema: {
        params: IdParams,
        body: SaveContextDocBody,
        response: { 200: DocResponse },
      },
    },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      const saved = await service.saveDoc(
        workspaceId,
        req.params.id,
        req.body.path,
        req.body.content,
      );
      if (!saved) throw new NotFoundError('Document not found');
      return saved;
    },
  );

  /**
   * Create a NEW document. Missing folders under a configured root are made on
   * the way — the mockup's "new folder" affordance, and the destination for an
   * uploaded markdown file, which the browser reads as text so no multipart
   * body is involved.
   */
  app.post(
    '/repos/:id/context/doc',
    { schema: { params: IdParams, body: SaveContextDocBody } },
    async (req, reply) => {
      const { workspaceId } = await getContext(app.container, req);
      const created = await service.createDoc(
        workspaceId,
        req.params.id,
        req.body.path,
        req.body.content,
      );
      if (!created) throw new NotFoundError('Repository not found');
      reply.code(201);
      return created;
    },
  );

  app.get(
    '/agents/:id/context',
    {
      schema: {
        params: IdParams,
        querystring: RepoQuery,
        response: { 200: ContextDocsResponse },
      },
    },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      const docs = await service.agentRows(workspaceId, req.params.id, req.query.repo_id);
      if (!docs) throw new NotFoundError('Agent not found');
      return docs;
    },
  );

  app.post(
    '/agents/:id/context',
    {
      schema: {
        params: IdParams,
        body: SetContextDocsBody,
        response: { 200: ContextDocsResponse },
      },
    },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      const docs = await service.setAgentDocs(
        workspaceId,
        req.params.id,
        req.body.repo_id,
        req.body.paths,
      );
      if (!docs) throw new NotFoundError('Agent not found');
      return docs;
    },
  );

  app.get(
    '/skills/:id/context',
    {
      schema: {
        params: IdParams,
        querystring: RepoQuery,
        response: { 200: ContextDocsResponse },
      },
    },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      const docs = await service.skillRows(workspaceId, req.params.id, req.query.repo_id);
      if (!docs) throw new NotFoundError('Skill not found');
      return docs;
    },
  );

  app.post(
    '/skills/:id/context',
    {
      schema: {
        params: IdParams,
        body: SetContextDocsBody,
        response: { 200: ContextDocsResponse },
      },
    },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      const docs = await service.setSkillDocs(
        workspaceId,
        req.params.id,
        req.body.repo_id,
        req.body.paths,
      );
      if (!docs) throw new NotFoundError('Skill not found');
      return docs;
    },
  );
}
