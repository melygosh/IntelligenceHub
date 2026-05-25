CREATE TABLE "entity_alias" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"entity_id" uuid NOT NULL,
	"alias_normalized" text NOT NULL,
	"alias_original" text NOT NULL,
	"source" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "entity_alias" ADD CONSTRAINT "entity_alias_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entity_alias" ADD CONSTRAINT "entity_alias_entity_id_entities_id_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."entities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "entity_alias_user_normalized_unique" ON "entity_alias" USING btree ("user_id","alias_normalized");
--> statement-breakpoint
CREATE INDEX "entities_user_canonical_normalized_idx" ON "entities" USING btree ("user_id", lower("canonical_name"));