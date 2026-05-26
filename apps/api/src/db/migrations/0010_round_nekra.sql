ALTER TABLE "articles" ADD COLUMN "duplicate_of" uuid;--> statement-breakpoint
ALTER TABLE "articles" ADD CONSTRAINT "articles_duplicate_of_articles_id_fk" FOREIGN KEY ("duplicate_of") REFERENCES "public"."articles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "articles_user_contenthash_idx" ON "articles" USING btree ("user_id","content_hash");--> statement-breakpoint
CREATE INDEX "articles_user_url_idx" ON "articles" USING btree ("user_id","url");