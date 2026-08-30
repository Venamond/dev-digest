CREATE TABLE IF NOT EXISTS "convention_scans" (
  "repo_id" uuid PRIMARY KEY REFERENCES "repos"("id") ON DELETE CASCADE,
  "workspace_id" uuid NOT NULL REFERENCES "workspaces"("id") ON DELETE CASCADE,
  "source_sha" text,
  "sample_file_count" integer NOT NULL DEFAULT 0,
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);

-- Backfill from existing candidate rows so repos scanned before this table
-- existed keep their scan metadata (one row per repo, newest scan wins).
INSERT INTO "convention_scans" ("repo_id", "workspace_id", "source_sha", "sample_file_count", "created_at")
SELECT DISTINCT ON ("repo_id")
  "repo_id",
  "workspace_id",
  "source_sha",
  COALESCE("sample_file_count", 0),
  "created_at"
FROM "conventions"
WHERE "repo_id" IS NOT NULL
ORDER BY "repo_id", "created_at" DESC
ON CONFLICT ("repo_id") DO NOTHING;
