import type { PromptAssembly } from '@devdigest/shared';

/** Rough token estimate — same chars/4 heuristic as the tokenizer fallback. */
export function approxTokens(chars: number): number {
  return Math.ceil(chars / 4);
}

export type PromptSectionStat = {
  name: string;
  source: string;
  chars: number;
  tokensApprox: number;
};

export type PromptAssemblySummary = {
  sections: PromptSectionStat[];
  /** Assembled system + user message size (what the model actually sees). */
  totalChars: number;
  tokensApprox: number;
};

const ASSEMBLY_SLOTS: { name: string; source: string; key: keyof PromptAssembly }[] = [
  { name: 'system', source: 'agent.system_prompt', key: 'system' },
  { name: 'skills', source: 'agent.skills', key: 'skills' },
  { name: 'memory', source: 'memory', key: 'memory' },
  { name: 'specs', source: 'project_specs', key: 'specs' },
  { name: 'repo_map', source: 'repo_intel.repo_map', key: 'repo_map' },
  { name: 'callers', source: 'repo_intel.callers', key: 'callers' },
  { name: 'pr_description', source: 'pr.body', key: 'pr_description' },
  { name: 'intent', source: 'intent.classifier', key: 'intent' },
];

function section(name: string, source: string, chars: number): PromptSectionStat {
  return { name, source, chars, tokensApprox: approxTokens(chars) };
}

/**
 * Metadata-only view of a prompt assembly. Lengths and source labels — never
 * section bodies (diff, specs, secrets, PR description, intent JSON).
 */
export function summarizePromptSections(
  sections: { name: string; source: string; chars: number }[],
): PromptAssemblySummary {
  const present = sections.filter((s) => s.chars > 0).map((s) => section(s.name, s.source, s.chars));
  const totalChars = present.reduce((n, s) => n + s.chars, 0);
  return { sections: present, totalChars, tokensApprox: approxTokens(totalChars) };
}

export function summarizePromptAssembly(
  assembly: PromptAssembly,
  extras?: { diffChars?: number; taskChars?: number },
): PromptAssemblySummary {
  const sections: PromptSectionStat[] = [];
  for (const slot of ASSEMBLY_SLOTS) {
    const text = assembly[slot.key];
    if (typeof text === 'string' && text.length > 0) {
      sections.push(section(slot.name, slot.source, text.length));
    }
  }
  if (extras?.taskChars && extras.taskChars > 0) {
    sections.push(section('task', 'review.task', extras.taskChars));
  }
  if (extras?.diffChars && extras.diffChars > 0) {
    sections.push(section('diff', 'pr.diff', extras.diffChars));
  }
  if (assembly.user.length > 0) {
    sections.push(section('user', 'assembled.user', assembly.user.length));
  }
  return {
    sections,
    totalChars: assembly.system.length + assembly.user.length,
    tokensApprox: approxTokens(assembly.system.length + assembly.user.length),
  };
}
