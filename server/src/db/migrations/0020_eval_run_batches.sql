CREATE TABLE "eval_run_batches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"agent_id" uuid NOT NULL,
	"agent_version" integer NOT NULL,
	"system_prompt" text NOT NULL,
	"state" text DEFAULT 'running' NOT NULL,
	"progress_index" integer DEFAULT 0 NOT NULL,
	"progress_total" integer NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ran_at" timestamp with time zone,
	"recall" double precision,
	"precision" double precision,
	"citation_accuracy" double precision,
	"traces_passed" integer,
	"traces_produced" integer,
	"cost_usd" double precision,
	"duration_ms" integer
);
--> statement-breakpoint
ALTER TABLE "eval_cases" ADD COLUMN "expectation" text DEFAULT 'must_find' NOT NULL;--> statement-breakpoint
ALTER TABLE "eval_cases" ADD COLUMN "seeded_from" jsonb;--> statement-breakpoint
ALTER TABLE "eval_runs" ADD COLUMN "batch_id" uuid;--> statement-breakpoint
ALTER TABLE "eval_runs" ADD COLUMN "outcome" text;--> statement-breakpoint
ALTER TABLE "eval_runs" ADD COLUMN "failure_reason" text;--> statement-breakpoint
ALTER TABLE "eval_run_batches" ADD CONSTRAINT "eval_run_batches_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eval_run_batches" ADD CONSTRAINT "eval_run_batches_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "eval_run_batches_agent_started_idx" ON "eval_run_batches" USING btree ("agent_id","started_at" desc);--> statement-breakpoint
ALTER TABLE "eval_runs" ADD CONSTRAINT "eval_runs_batch_id_eval_run_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."eval_run_batches"("id") ON DELETE cascade ON UPDATE no action;