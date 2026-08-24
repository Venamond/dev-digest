ALTER TABLE "pr_intent" ADD COLUMN IF NOT EXISTS "risk_areas" jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE "pr_intent" ADD COLUMN IF NOT EXISTS "confidence" double precision NOT NULL DEFAULT 0;
ALTER TABLE "pr_intent" ADD COLUMN IF NOT EXISTS "sources" jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE "pr_intent" ADD COLUMN IF NOT EXISTS "missing_context" jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE "pr_intent" ADD COLUMN IF NOT EXISTS "head_sha" text;
ALTER TABLE "pr_intent" ADD COLUMN IF NOT EXISTS "model" text;
ALTER TABLE "pr_intent" ADD COLUMN IF NOT EXISTS "classified_at" timestamptz;
