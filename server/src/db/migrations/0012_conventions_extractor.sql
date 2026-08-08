ALTER TABLE "conventions" ADD COLUMN "category" text;
ALTER TABLE "conventions" ADD COLUMN "evidence_line_start" integer;
ALTER TABLE "conventions" ADD COLUMN "evidence_line_end" integer;
ALTER TABLE "conventions" ADD COLUMN "status" text DEFAULT 'pending' NOT NULL;
ALTER TABLE "conventions" ADD COLUMN "source_sha" text;
ALTER TABLE "conventions" ADD COLUMN "sample_file_count" integer;
ALTER TABLE "conventions" ADD COLUMN "position" integer;
ALTER TABLE "conventions" ADD COLUMN "created_at" timestamp with time zone DEFAULT now() NOT NULL;
CREATE INDEX IF NOT EXISTS "conventions_repo_idx" ON "conventions" ("repo_id");
