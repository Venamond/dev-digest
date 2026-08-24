import { describe, it, expect } from 'vitest';
import type { BriefRisk, RiskSeverity } from '@devdigest/shared';
import { floorRiskLevel } from '../src/modules/brief/risk-level.js';
import { BRIEF_SYSTEM_PROMPT } from '../src/modules/brief/prompt.js';

/**
 * The deterministic floor under `risk_level`: it may raise the model's headline
 * to the worst entry in `risks`, never lower it.
 */
function risk(severity: RiskSeverity): BriefRisk {
  return { title: 'A risk', explanation: 'Why it matters.', severity, file_refs: ['src/a.ts'] };
}

describe('floorRiskLevel', () => {
  it('raises a medium headline whose own risks say high', () => {
    expect(floorRiskLevel('medium', [risk('low'), risk('high')])).toBe('high');
  });

  it('raises a low headline to medium when a risk says medium', () => {
    expect(floorRiskLevel('low', [risk('low'), risk('medium')])).toBe('medium');
  });

  it('never lowers: a high headline over none but low risks stays high', () => {
    expect(floorRiskLevel('high', [risk('low'), risk('low')])).toBe('high');
  });

  it("leaves the model's level untouched when there are no risks at all", () => {
    expect(floorRiskLevel('low', [])).toBe('low');
  });

  it('leaves a headline that already matches its worst risk alone', () => {
    expect(floorRiskLevel('medium', [risk('medium')])).toBe('medium');
  });
});

describe('the risk-level rubric in BRIEF_SYSTEM_PROMPT', () => {
  // The floor is one half of the fix; the prompt is the other. Assert the
  // criterion, not the wording: each level must be defined, and the agreement
  // rule between `risk_level` and `risks` must be stated.
  it('defines each of the three levels', () => {
    expect(BRIEF_SYSTEM_PROMPT).toMatch(/high: /);
    expect(BRIEF_SYSTEM_PROMPT).toMatch(/medium: /);
    expect(BRIEF_SYSTEM_PROMPT).toMatch(/low: /);
  });

  it('requires the headline to agree with the risks listed beside it', () => {
    expect(BRIEF_SYSTEM_PROMPT).toMatch(/at least as severe as/i);
  });
});
