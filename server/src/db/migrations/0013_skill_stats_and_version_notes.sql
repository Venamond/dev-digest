CREATE TABLE IF NOT EXISTS "run_skills" (
  "run_id" uuid NOT NULL REFERENCES "agent_runs"("id") ON DELETE CASCADE,
  "skill_id" uuid NOT NULL REFERENCES "skills"("id") ON DELETE CASCADE,
  "skill_version" integer NOT NULL,
  CONSTRAINT "run_skills_pk" PRIMARY KEY ("run_id", "skill_id")
);
CREATE INDEX IF NOT EXISTS "run_skills_skill_idx" ON "run_skills" ("skill_id");
ALTER TABLE "skill_versions" ADD COLUMN IF NOT EXISTS "note" text;
