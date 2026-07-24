CREATE TABLE "practical_problems" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_id" uuid NOT NULL,
	"problem_no" integer NOT NULL,
	"category" text,
	"answer_kind" text NOT NULL,
	"match_mode" text NOT NULL,
	"question_text" text NOT NULL,
	"examples" text,
	"answer" text NOT NULL,
	"accepted_answers" text[],
	"answer_tokens" text[],
	"answer_blanks" jsonb,
	"answer_format_hint" text,
	"input_type" text,
	"comment" text,
	"hint" text,
	CONSTRAINT "practical_problems_source_id_problem_no_unique" UNIQUE("source_id","problem_no")
);
--> statement-breakpoint
CREATE TABLE "problem_choices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"problem_id" uuid NOT NULL,
	"marker" text NOT NULL,
	"text" text NOT NULL,
	"ordinal" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"title" text NOT NULL,
	"exam_type" text NOT NULL,
	"kind" text NOT NULL,
	CONSTRAINT "sources_key_unique" UNIQUE("key")
);
--> statement-breakpoint
ALTER TABLE "practical_problems" ADD CONSTRAINT "practical_problems_source_id_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."sources"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "problem_choices" ADD CONSTRAINT "problem_choices_problem_id_practical_problems_id_fk" FOREIGN KEY ("problem_id") REFERENCES "public"."practical_problems"("id") ON DELETE no action ON UPDATE no action;