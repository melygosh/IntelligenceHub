CREATE TABLE "email_confirmation_token" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "email_confirmed" SET DEFAULT false;--> statement-breakpoint
ALTER TABLE "email_confirmation_token" ADD CONSTRAINT "email_confirmation_token_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "email_confirmation_token_hash_unique" ON "email_confirmation_token" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "email_confirmation_token_user_active_idx" ON "email_confirmation_token" USING btree ("user_id") WHERE "used_at" IS NULL;