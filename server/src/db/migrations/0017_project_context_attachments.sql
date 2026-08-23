CREATE TABLE IF NOT EXISTS "agent_context_docs" (
	"agent_id" uuid NOT NULL REFERENCES "agents"("id") ON DELETE CASCADE,
	"repo_id" uuid NOT NULL REFERENCES "repos"("id") ON DELETE CASCADE,
	"path" text NOT NULL,
	"order" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "agent_context_docs_agent_id_repo_id_path_pk" PRIMARY KEY("agent_id","repo_id","path")
);
CREATE TABLE IF NOT EXISTS "skill_context_docs" (
	"skill_id" uuid NOT NULL REFERENCES "skills"("id") ON DELETE CASCADE,
	"repo_id" uuid NOT NULL REFERENCES "repos"("id") ON DELETE CASCADE,
	"path" text NOT NULL,
	"order" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "skill_context_docs_skill_id_repo_id_path_pk" PRIMARY KEY("skill_id","repo_id","path")
);
