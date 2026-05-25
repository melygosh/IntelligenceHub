CREATE TABLE "article_axis_value" (
	"article_id" uuid NOT NULL,
	"axis_id" uuid NOT NULL,
	"axis_value_id" uuid NOT NULL,
	CONSTRAINT "article_axis_value_article_id_axis_id_pk" PRIMARY KEY("article_id","axis_id")
);
--> statement-breakpoint
CREATE TABLE "article_category" (
	"article_id" uuid NOT NULL,
	"category_id" uuid NOT NULL,
	CONSTRAINT "article_category_article_id_category_id_pk" PRIMARY KEY("article_id","category_id")
);
--> statement-breakpoint
CREATE TABLE "axis" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "axis_value" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"axis_id" uuid NOT NULL,
	"value" text NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "category" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "articles" ADD COLUMN "config_hash" text;--> statement-breakpoint
ALTER TABLE "article_axis_value" ADD CONSTRAINT "article_axis_value_article_id_articles_id_fk" FOREIGN KEY ("article_id") REFERENCES "public"."articles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "article_axis_value" ADD CONSTRAINT "article_axis_value_axis_id_axis_id_fk" FOREIGN KEY ("axis_id") REFERENCES "public"."axis"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "article_axis_value" ADD CONSTRAINT "article_axis_value_axis_value_id_axis_value_id_fk" FOREIGN KEY ("axis_value_id") REFERENCES "public"."axis_value"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "article_category" ADD CONSTRAINT "article_category_article_id_articles_id_fk" FOREIGN KEY ("article_id") REFERENCES "public"."articles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "article_category" ADD CONSTRAINT "article_category_category_id_category_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."category"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "axis" ADD CONSTRAINT "axis_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "axis_value" ADD CONSTRAINT "axis_value_axis_id_axis_id_fk" FOREIGN KEY ("axis_id") REFERENCES "public"."axis"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "category" ADD CONSTRAINT "category_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "axis_user_name_unique" ON "axis" USING btree ("user_id","name");--> statement-breakpoint
CREATE UNIQUE INDEX "axis_value_axis_value_unique" ON "axis_value" USING btree ("axis_id","value");--> statement-breakpoint
CREATE UNIQUE INDEX "category_user_name_unique" ON "category" USING btree ("user_id","name");