CREATE INDEX "article_axis_value_axis_idx" ON "article_axis_value" USING btree ("axis_id");--> statement-breakpoint
CREATE INDEX "article_category_category_idx" ON "article_category" USING btree ("category_id");--> statement-breakpoint
CREATE INDEX "article_entity_entity_idx" ON "article_entity" USING btree ("entity_id");--> statement-breakpoint
CREATE INDEX "articles_user_ts_idx" ON "articles" USING btree ("user_id","ts" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "articles_feed_idx" ON "articles" USING btree ("feed_id");--> statement-breakpoint
CREATE INDEX "axis_value_axis_idx" ON "axis_value" USING btree ("axis_id");--> statement-breakpoint
CREATE INDEX "entities_user_type_idx" ON "entities" USING btree ("user_id","type");--> statement-breakpoint
CREATE INDEX "feeds_user_idx" ON "feeds" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "llm_calls_article_status_idx" ON "llm_calls" USING btree ("article_id","status");