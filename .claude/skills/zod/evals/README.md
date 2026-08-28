# `zod` — eval set

Two authoring cases, five runs per arm, scored against a fixed ground truth.
The runner lives in `skill-evals/`; only the cases live here, so they travel
with the skill.

## Why these cases are authoring tasks, not reviews

`skill-evals/INSIGHTS.md` records four iterations where a review-shaped case
with repo access saturated: both arms read the enforcement config and
re-derived the rules, so the skill changed nothing measurable. These cases
inline the code and the brief in the prompt and forbid **both** arms from
reading any file. The with_skill arm may read `.claude/skills/zod/SKILL.md`
and its `references/*.md`; that is the only asymmetry.

## The cases

| id | shape | what it exercises |
|---|---|---|
| `a-harden-route-handler` | fix existing code | 7 planted defects in a Fastify route file: `parse()` on a request body, a hand-written duplicate interface, `z.any()`, `z.string()` for a three-value enum, missing field validations, `issues[0]` only, and an unvalidated `JSON.parse` cast |
| `b-design-articles-schemas` | greenfield design | 7 design requirements: query-string coercion, an update schema derived with `.partial()`, optional-vs-nullable for a clearable field, a discriminated union, `z.input` vs `z.infer` across a transform, exporting schemas **and** types, and `safeParse` at all three boundaries |

Each case also carries three **legal distractors** — constructs a good answer
must leave alone. Case A's module-load `configSchema.parse(process.env)` is the
sanctioned use of `parse()`; "fixing" it to `safeParse` is a false positive, and
that assertion is what separates a rule-follower from a rule-applier.

Assertion 9 in both cases is **factual accuracy**: every Zod API used must exist
in the version the answer says it targets. Zod v3 and v4 differ here
(`z.string().email()` vs `z.email()`, `.flatten()` vs `z.flattenError`), and the
skill's own reference files mix them, so this is a live failure mode rather than
a formality.

## Running an iteration

See `skill-evals/README.md`. The layout for repeated trials is
`workspace/<iteration>/<case>/<arm>/run-K/`, and `scripts/aggregate.sh` reads
that shape (pass `SKILL_NAME=zod`).

Do not report a token or time delta from fewer than five runs per arm — the
first variance measurement in this repo showed within-arm spread larger than
the between-arm difference.
