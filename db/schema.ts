import { sql } from "drizzle-orm";
import { check, index, integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const transactions = sqliteTable(
  "transactions",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    type: text("type", { enum: ["buy", "sell"] }).notNull(),
    itemName: text("item_name").notNull(),
    quantity: real("quantity").notNull(),
    unitPriceCents: integer("unit_price_cents").notNull(),
    transactionDate: text("transaction_date").notNull(),
    notes: text("notes").notNull().default(""),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    check("transactions_type_check", sql`${table.type} IN ('buy', 'sell')`),
    check("transactions_quantity_check", sql`${table.quantity} > 0`),
    check("transactions_price_check", sql`${table.unitPriceCents} > 0`),
    index("idx_transactions_date").on(table.transactionDate, table.id),
    index("idx_transactions_item").on(table.itemName),
  ],
);
