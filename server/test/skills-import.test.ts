import { describe, it, expect } from 'vitest';
import JSZip from 'jszip';
import { AppError } from '../src/platform/errors.js';
import {
  extractRootSkillMd,
  parseSkillImportFile,
  parseSkillMarkdown,
} from '../src/modules/skills/helpers.js';
import { SKILL_IMPORT_TRUST_NOTE } from '../src/modules/skills/constants.js';

const VALID_MD = `---
name: happy-path-coverage-gap
description: Flag tests that only exercise the success path.
type: rubric
---

# Body

Look for happy-path-only tests.
`;

describe('parseSkillMarkdown', () => {
  it('parses frontmatter + body into an import draft', () => {
    const draft = parseSkillMarkdown(VALID_MD);
    expect(draft).toMatchObject({
      name: 'happy-path-coverage-gap',
      description: 'Flag tests that only exercise the success path.',
      type: 'rubric',
      trust_note: SKILL_IMPORT_TRUST_NOTE,
    });
    expect(draft.body).toContain('# Body');
    expect(draft.body).toContain('happy-path-only');
  });

  it('rejects missing frontmatter with field errors (400)', () => {
    try {
      parseSkillMarkdown('# just a body\n');
      expect.fail('expected AppError');
    } catch (err) {
      expect(err).toBeInstanceOf(AppError);
      const e = err as AppError;
      expect(e.statusCode).toBe(400);
      expect(e.details).toMatchObject({
        fields: expect.objectContaining({ frontmatter: expect.any(String) }),
      });
    }
  });

  it('rejects invalid type with a field error on type', () => {
    const bad = `---
name: x
description: y
type: not-a-type
---

body
`;
    try {
      parseSkillMarkdown(bad);
      expect.fail('expected AppError');
    } catch (err) {
      expect(err).toBeInstanceOf(AppError);
      const e = err as AppError;
      expect(e.statusCode).toBe(400);
      expect((e.details as { fields: Record<string, string> }).fields.type).toBeTruthy();
    }
  });
});

describe('parseSkillImportFile (zip)', () => {
  it('reads root SKILL.md and ignores other zip entries', async () => {
    const zip = new JSZip();
    zip.file('SKILL.md', VALID_MD);
    zip.file('README.md', '# ignore me');
    zip.file('nested/SKILL.md', '---\nname: nested\ndescription: x\ntype: custom\n---\nnested\n');
    zip.file('evil.sh', '#!/bin/sh\necho should never run\n');
    const bytes = await zip.generateAsync({ type: 'uint8array' });

    const draft = await parseSkillImportFile('skill-pack.zip', bytes);
    expect(draft.name).toBe('happy-path-coverage-gap');
    expect(draft.type).toBe('rubric');
    expect(draft.body).toContain('happy-path-only');
  });

  it('rejects a zip without root SKILL.md', async () => {
    const zip = new JSZip();
    zip.file('nested/SKILL.md', VALID_MD);
    zip.file('other.md', VALID_MD);
    const bytes = await zip.generateAsync({ type: 'uint8array' });

    await expect(extractRootSkillMd(bytes)).rejects.toMatchObject({
      statusCode: 400,
      code: 'validation_error',
    });
  });

  it('parses a plain .md upload by filename', async () => {
    const draft = await parseSkillImportFile('happy-path.md', Buffer.from(VALID_MD));
    expect(draft.name).toBe('happy-path-coverage-gap');
  });
});
