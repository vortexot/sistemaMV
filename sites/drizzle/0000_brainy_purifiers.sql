CREATE TABLE `login_attempts` (
	`key` text PRIMARY KEY NOT NULL,
	`count` integer DEFAULT 0 NOT NULL,
	`expires` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `records` (
	`kind` text NOT NULL,
	`id` text NOT NULL,
	`data` text NOT NULL,
	PRIMARY KEY(`kind`, `id`),
	CONSTRAINT "valid_json" CHECK(json_valid("records"."data")),
	CONSTRAINT "nonnegative_stock" CHECK("records"."kind" != 'products' OR json_extract("records"."data", '$.stock') >= 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `unique_user_email` ON `records` (json_extract("data", '$.email')) WHERE "kind" = 'users';--> statement-breakpoint
CREATE UNIQUE INDEX `unique_product_sku` ON `records` (json_extract("data", '$.sku')) WHERE "kind" = 'products';--> statement-breakpoint
CREATE UNIQUE INDEX `unique_category_slug` ON `records` (json_extract("data", '$.slug')) WHERE "kind" = 'categories';--> statement-breakpoint
CREATE INDEX `order_customer` ON `records` (json_extract("data", '$.user_id')) WHERE "kind" = 'orders';--> statement-breakpoint
CREATE TABLE `sessions` (
	`hash` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`expires` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `session_user` ON `sessions` (`user_id`);--> statement-breakpoint
CREATE INDEX `session_expiry` ON `sessions` (`expires`);
