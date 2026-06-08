CREATE TABLE "price_history" (
	"id" serial PRIMARY KEY NOT NULL,
	"store_id" text NOT NULL,
	"data_string" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "store" (
	"store_id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"website" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "price_history" ADD CONSTRAINT "price_history_store_id_store_store_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."store"("store_id") ON DELETE no action ON UPDATE no action;