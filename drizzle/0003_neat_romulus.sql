CREATE TABLE `inventory_statuses` (
	`item_key` text PRIMARY KEY NOT NULL,
	`item_name` text NOT NULL,
	`status` text DEFAULT 'In stock' NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
