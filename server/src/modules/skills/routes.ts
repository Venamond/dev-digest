import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import multipart from '@fastify/multipart';
import { z } from 'zod';
import { SkillImportDraft, SkillType } from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { NotFoundError, ValidationError } from '../../platform/errors.js';
import { SKILL_IMPORT_FILE_FIELD } from './constants.js';
import { SkillsService } from './service.js';

/** `/skills/:id/versions/:version` — id is a uuid, version a positive integer. */
const VersionParams = z.object({
  id: z.string().uuid(),
  version: z.coerce.number().int().positive(),
});

const DiffQuery = z.object({
  against: z.coerce.number().int().positive().optional(),
});

/**
 * Skills module — Skills Lab CRUD + versions + import + stats.
 *   GET    /skills
 *   POST   /skills
 *   GET    /skills/:id
 *   PUT    /skills/:id
 *   DELETE /skills/:id
 *   GET    /skills/:id/stats
 *   GET    /skills/:id/versions
 *   GET    /skills/:id/versions/:version
 *   POST   /skills/:id/versions/:version/restore
 *   GET    /skills/:id/versions/:version/diff
 *   POST   /skills/import/preview
 *   POST   /skills/import/confirm
 */

const CreateSkillBody = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  type: SkillType,
  body: z.string().min(1),
  enabled: z.boolean().optional(),
});

const UpdateSkillBody = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  type: SkillType.optional(),
  body: z.string().min(1).optional(),
  enabled: z.boolean().optional(),
});

const ConfirmImportBody = SkillImportDraft;

export default async function skillsRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const service = new SkillsService(app.container);

  await app.register(multipart, {
    limits: {
      files: 1,
      fileSize: 1_048_576,
      fields: 0,
    },
  });

  app.get('/skills', async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    return service.list(workspaceId);
  });

  app.post('/skills', { schema: { body: CreateSkillBody } }, async (req, reply) => {
    const { workspaceId } = await getContext(app.container, req);
    const body = req.body;
    const skill = await service.create(workspaceId, {
      name: body.name,
      type: body.type,
      body: body.body,
      ...(body.description !== undefined ? { description: body.description } : {}),
      ...(body.enabled !== undefined ? { enabled: body.enabled } : {}),
    });
    reply.status(201);
    return skill;
  });

  // Static import paths before /skills/:id so "import" is never treated as an id.
  app.post('/skills/import/preview', async (req) => {
    await getContext(app.container, req);
    const file = await req.file();
    if (!file || file.fieldname !== SKILL_IMPORT_FILE_FIELD) {
      throw new ValidationError('Expected multipart field "file" (.md or .zip)');
    }
    const bytes = await file.toBuffer();
    return service.previewImport(file.filename, bytes);
  });

  app.post(
    '/skills/import/confirm',
    { schema: { body: ConfirmImportBody } },
    async (req, reply) => {
      const { workspaceId } = await getContext(app.container, req);
      const skill = await service.confirmImport(workspaceId, req.body);
      reply.status(201);
      return skill;
    },
  );

  app.get('/skills/:id', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    const skill = await service.get(workspaceId, req.params.id);
    if (!skill) throw new NotFoundError('Skill not found');
    return skill;
  });

  app.put(
    '/skills/:id',
    { schema: { params: IdParams, body: UpdateSkillBody } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      const skill = await service.update(workspaceId, req.params.id, req.body);
      if (!skill) throw new NotFoundError('Skill not found');
      return skill;
    },
  );

  app.delete('/skills/:id', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    const ok = await service.delete(workspaceId, req.params.id);
    if (!ok) throw new NotFoundError('Skill not found');
    return { ok: true };
  });

  app.get('/skills/:id/stats', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    const stats = await service.stats(workspaceId, req.params.id);
    if (!stats) throw new NotFoundError('Skill not found');
    return stats;
  });

  app.get('/skills/:id/versions', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    const versions = await service.listVersions(workspaceId, req.params.id);
    if (!versions) throw new NotFoundError('Skill not found');
    return versions;
  });

  app.get(
    '/skills/:id/versions/:version',
    { schema: { params: VersionParams } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      const version = await service.getVersion(
        workspaceId,
        req.params.id,
        req.params.version,
      );
      if (!version) throw new NotFoundError('Skill version not found');
      return version;
    },
  );

  app.post(
    '/skills/:id/versions/:version/restore',
    { schema: { params: VersionParams } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      const skill = await service.restoreVersion(
        workspaceId,
        req.params.id,
        req.params.version,
      );
      if (!skill) throw new NotFoundError('Skill version not found');
      return skill;
    },
  );

  app.get(
    '/skills/:id/versions/:version/diff',
    { schema: { params: VersionParams, querystring: DiffQuery } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      const diff = await service.diffVersion(
        workspaceId,
        req.params.id,
        req.params.version,
        req.query.against,
      );
      if (!diff) throw new NotFoundError('Skill version not found');
      return diff;
    },
  );
}
