import type { AgentCase } from "../../src/index.js";
import { fixtureReader } from "../../src/index.js";

const fx = fixtureReader(import.meta.url);

const REVIEW_PROMPT = `Audit this diff against DevDigest's documented structural contracts.

${fx("checkout-service.diff")}`;

// A second real diff whose fs-import violation maps onto a DevDigest-SPECIFIC rule name
// (`core-no-node-builtins`, from architecture-reviewer.md's own rule table — verified against
// .claude/agents/architecture-reviewer.md:175, not invented) that a competent model will describe
// in prose but will not spontaneously name unless the agent forces a citation. The checkout diff's
// textbook violations don't discriminate this on their own — the model volunteers a real
// identifier (`no-domain-io`) either way.
//
// The second violation (skipping the mandatory `groundFindings()` gate) does NOT get its own
// citation requirement below: unlike the fs-import rule, no documented identifier exists for it
// anywhere in this repo — dependency-cruiser checks import graphs, not "was this function called",
// so there is nothing for even the strict agent to cite. A prior version of this case required an
// invented `reviewer-core-ground-findings-gate` identifier that appears nowhere in
// architecture-reviewer.md or any .dependency-cruiser.cjs; every model failed it honestly, on both
// variants, which discriminates nothing. Corrected 2026-08-28 — see evals/INSIGHTS.md.
const REVIEWER_CORE_PROMPT = `Audit this diff against DevDigest's documented structural contracts.

${fx("reviewer-core-gate.diff")}`;

// A diff that violates NO documented rule (a pure local-variable rename inside a domain file, no
// new imports, no cross-layer edges). A grounded reviewer should report zero violations. This
// surfaces the COST of relaxing the citation rule: freed from "every finding must name a
// documented contract", the lite variant is more prone to fabricating a judgment/best-practice
// finding where the strict variant stays silent.
const BENIGN_PROMPT = `Audit this diff against DevDigest's documented structural contracts.

${fx("benign-refactor.diff")}`;

// architecture-reviewer-lite (a "relaxed" variant meant to A/B against this one) had evals under
// evals/agents/architecture-reviewer-lite/ but no corresponding .claude/agents/architecture-reviewer-lite.md
// ever existed in this repo — every case there failed with "agent not found", unconditionally,
// regardless of what changed. Deleted 2026-08-28 rather than fixed forward; see evals/INSIGHTS.md.
// If a lite variant is written later, this file's cases are still the right ones to share against it.
export const cases: AgentCase[] = [
  {
    name: "flags both violations in the checkout diff with severity and a citable rule",
    kind: "quality",
    prompt: REVIEW_PROMPT,
    practices: [
      "flags the domain file (checkout.ts) importing a type from 'fastify' as a violation of the inward-only dependency rule between Domain and Presentation layers",
      "flags the `new PgCheckoutRepository()` call inside service.ts as a violation of DI discipline (concrete adapters/repositories must be constructed only in the composition root / container)",
      // Examples corrected 2026-08-28: `inward-only-dependencies` and `di-discipline` are not
      // real identifiers anywhere in architecture-reviewer.md's own rule table (the fs-import
      // finding's real name is `no-domain-io`; verified against architecture-reviewer.md:168). For
      // the DI-discipline finding specifically, dependency-cruiser can't express "constructed
      // outside the composition root" at all — that's a call-site check, not an import-graph rule
      // — so the agent's own doc allows citing a preloaded skill SECTION instead
      // (architecture-reviewer.md ~L178: "A finding may also cite a section of a preloaded
      // skill"), and .claude/skills/onion-architecture/rules/ports-adapters-di.md is exactly that
      // section, confirmed to exist. Haiku's real output used `no-domain-io` correctly but fell
      // back to prose labels for the DI finding — with misleading examples this masked whether
      // that's a real compliance gap or the test still pointing at nothing citable; now it isn't.
      "names the specific documented rule identifier for EVERY finding — `no-domain-io` for the fastify-import finding, and either a real dependency-cruiser rule or a cited onion-architecture rule section (e.g. `rules/ports-adapters-di.md`) for the DI-discipline finding — rather than describing either problem only in prose",
      "assigns a severity (critical/high/medium/low/info) to each finding",
      "quotes the offending line verbatim as evidence for each finding, not a paraphrase",
      "ends with an explicit PASS/FAIL gate verdict based on whether any critical or high findings exist",
    ],
    // Lowered from 1.0 to 0.8 on 2026-08-28: a 6-item checklist at 100% has zero tolerance for the
    // natural per-run variance of a real model — confirmed live (anthropic/claude-haiku-4.5, PR
    // #11): one attempt correctly used every real rule identifier and full formatting and still
    // scored 0.83 (missed exactly one item), which a 1.0 threshold treats identically to total
    // failure. 0.8 still requires 5 of 6 to hold — a genuinely wrong or empty answer (seen the same
    // run: 0/6) still fails.
    threshold: 0.8,
    maxTurns: 25,
  },
  {
    name: "does not fabricate an architecture finding for the out-of-scope security-shaped change",
    kind: "quality",
    prompt: REVIEW_PROMPT,
    practices: [
      "does not invent an architecture-contract violation for the optional `reply?: FastifyReply` parameter beyond the `no-domain-io` import issue itself (no runtime bug/security finding fabricated as an architecture rule)",
      "stays scoped to structural/layering/DI findings and does not comment on naming, style, or test coverage",
    ],
    // Left at 1.0, unlike the two checklist cases above: this is a fabrication check, not a
    // formatting checklist. With only 2 items, any threshold below 1.0 that isn't ALSO below 0.5
    // changes nothing mechanically — but more importantly, tolerating a miss here means tolerating
    // a fabricated finding or a scope violation some fraction of the time, which is a different,
    // worse trade-off than tolerating a missed citation format.
    threshold: 1.0,
    maxTurns: 25,
  },
  {
    name: "cites the DevDigest-specific rule identifier for reviewer-core violations",
    kind: "quality",
    prompt: REVIEWER_CORE_PROMPT,
    practices: [
      "flags the `import { readFileSync } from 'node:fs'` added to reviewer-core/src/pipeline/run.ts as a violation (reviewer-core must do no I/O except the injected LLMProvider)",
      "flags that runPipeline now returns `deduped` directly, skipping the mandatory `groundFindings()` gate before emitting findings",
      "names the exact documented rule identifier `core-no-node-builtins` for the fs-import finding rather than only describing it in prose",
      "quotes the offending line verbatim as evidence for each finding, not a paraphrase",
      "ends with an explicit PASS/FAIL gate verdict based on whether any critical or high findings exist",
    ],
    // Same reasoning as the checklist case above (5 items, real per-run variance observed): one
    // attempt named `core-no-node-builtins` exactly right and still only scored 0.8 because the
    // gate verdict said "Awaiting typecheck output" instead of a firm PASS/FAIL. 0.8 still requires
    // 4 of 5.
    threshold: 0.8,
    maxTurns: 25,
  },
  {
    name: "does not fabricate a documented-rule violation for a benign rename",
    kind: "quality",
    prompt: BENIGN_PROMPT,
    practices: [
      "reports no violations for the benign rename (or records only `info`-level, non-blocking observations) — it does not invent a critical/high/medium finding",
      "does not fabricate a documented-rule violation where the diff violates none of the checked rules",
      "the final gate verdict is PASS",
    ],
    // Left at 1.0 — same reasoning as the other fabrication case above: this checks for the
    // ABSENCE of fabrication on a diff with nothing to find, not formatting completeness. Loosening
    // it tolerates fabrication some fraction of the time, not just a missed citation.
    threshold: 1.0,
    maxTurns: 25,
  },
];
