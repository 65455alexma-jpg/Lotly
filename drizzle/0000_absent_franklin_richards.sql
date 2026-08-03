CREATE TABLE `transactions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`type` text NOT NULL,
	`item_name` text NOT NULL,
	`quantity` real NOT NULL,
	`unit_price_cents` integer NOT NULL,
	`transaction_date` text NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	CONSTRAINT "transactions_type_check" CHECK("transactions"."type" IN ('buy', 'sell')),
	CONSTRAINT "transactions_quantity_check" CHECK("transactions"."quantity" > 0),
	CONSTRAINT "transactions_price_check" CHECK("transactions"."unit_price_cents" > 0)
);
--> statement-breakpoint
CREATE INDEX `idx_transactions_date` ON `transactions` (`transaction_date`,`id`);--> statement-breakpoint
CREATE INDEX `idx_transactions_item` ON `transactions` (`item_name`);