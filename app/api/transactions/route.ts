import { env } from "cloudflare:workers";
import { NextRequest, NextResponse } from "next/server";

type TransactionRow = {
  id: number;
  type: "buy" | "sell";
  item_name: string;
  quantity: number;
  unit_price_cents: number;
  transaction_date: string;
  source: "eBay" | "Vinted" | "Other";
  notes: string;
  created_at: string;
};

const createTableSql = `
  CREATE TABLE IF NOT EXISTS transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type TEXT NOT NULL CHECK(type IN ('buy', 'sell')),
    item_name TEXT NOT NULL,
    quantity REAL NOT NULL CHECK(quantity > 0),
    unit_price_cents INTEGER NOT NULL CHECK(unit_price_cents > 0),
    transaction_date TEXT NOT NULL,
    source TEXT NOT NULL DEFAULT 'Other' CHECK(source IN ('eBay', 'Vinted', 'Other')),
    notes TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )
`;

function database() {
  if (!env.DB) throw new Error("Database unavailable");
  return env.DB;
}

async function prepareDatabase() {
  const db = database();
  await db.batch([
    db.prepare(createTableSql),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(transaction_date DESC, id DESC)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_transactions_item ON transactions(item_name)"),
  ]);
  const columns = await db.prepare("PRAGMA table_info(transactions)").all<{ name: string }>();
  if (!columns.results.some((column) => column.name === "source")) {
    await db.prepare("ALTER TABLE transactions ADD COLUMN source TEXT NOT NULL DEFAULT 'Other'").run();
  }
  return db;
}

function serialize(row: TransactionRow) {
  return {
    id: row.id,
    type: row.type,
    itemName: row.item_name,
    quantity: row.quantity,
    unitPriceCents: row.unit_price_cents,
    transactionDate: row.transaction_date,
    source: row.source ?? "Other",
    notes: row.notes,
    createdAt: row.created_at,
  };
}

export async function GET() {
  try {
    const db = await prepareDatabase();
    const result = await db
      .prepare("SELECT id, type, item_name, quantity, unit_price_cents, transaction_date, source, notes, created_at FROM transactions ORDER BY transaction_date DESC, id DESC")
      .all<TransactionRow>();
    return NextResponse.json({ transactions: result.results.map(serialize) });
  } catch {
    return NextResponse.json({ error: "Could not load transactions." }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const input = (await request.json()) as Record<string, unknown>;
    const type = input.type;
    const itemName = String(input.itemName ?? "").trim();
    const quantity = Number(input.quantity);
    const unitPrice = Number(input.unitPrice);
    const transactionDate = String(input.transactionDate ?? "");
    const source = input.source;
    const notes = String(input.notes ?? "").trim();

    if ((type !== "buy" && type !== "sell") || (source !== "eBay" && source !== "Vinted" && source !== "Other") || !itemName || !Number.isFinite(quantity) || quantity <= 0 || !Number.isFinite(unitPrice) || unitPrice <= 0 || !/^\d{4}-\d{2}-\d{2}$/.test(transactionDate)) {
      return NextResponse.json({ error: "Please complete all required fields with valid values." }, { status: 400 });
    }
    if (itemName.length > 80 || notes.length > 160) {
      return NextResponse.json({ error: "The item name or note is too long." }, { status: 400 });
    }

    const db = await prepareDatabase();
    if (type === "sell") {
      const stock = await db
        .prepare("SELECT COALESCE(SUM(CASE WHEN type = 'buy' THEN quantity ELSE -quantity END), 0) AS available FROM transactions WHERE LOWER(item_name) = LOWER(?)")
        .bind(itemName)
        .first<{ available: number }>();
      if (Number(stock?.available ?? 0) < quantity) {
        return NextResponse.json({ error: `Only ${Number(stock?.available ?? 0)} units of ${itemName} are available to sell.` }, { status: 400 });
      }
    }

    const result = await db
      .prepare("INSERT INTO transactions (type, item_name, quantity, unit_price_cents, transaction_date, source, notes) VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING id, type, item_name, quantity, unit_price_cents, transaction_date, source, notes, created_at")
      .bind(type, itemName, quantity, Math.round(unitPrice * 100), transactionDate, source, notes)
      .first<TransactionRow>();

    if (!result) throw new Error("Insert failed");
    return NextResponse.json({ transaction: serialize(result) }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Could not save this transaction." }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const id = Number(request.nextUrl.searchParams.get("id"));
    if (!Number.isInteger(id) || id <= 0) {
      return NextResponse.json({ error: "Invalid transaction." }, { status: 400 });
    }
    const db = await prepareDatabase();
    const transaction = await db
      .prepare("SELECT id, type, item_name, quantity, unit_price_cents, transaction_date, source, notes, created_at FROM transactions WHERE id = ?")
      .bind(id)
      .first<TransactionRow>();
    if (!transaction) {
      return NextResponse.json({ error: "Transaction not found." }, { status: 404 });
    }
    if (transaction.type === "buy") {
      const stock = await db
        .prepare("SELECT COALESCE(SUM(CASE WHEN type = 'buy' THEN quantity ELSE -quantity END), 0) AS available FROM transactions WHERE LOWER(item_name) = LOWER(?)")
        .bind(transaction.item_name)
        .first<{ available: number }>();
      if (Number(stock?.available ?? 0) < transaction.quantity) {
        return NextResponse.json({ error: "Remove the related sales before removing this purchase." }, { status: 400 });
      }
    }
    const result = await db.prepare("DELETE FROM transactions WHERE id = ?").bind(id).run();
    if (!result.meta.changes) throw new Error("Delete failed");
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Could not remove this transaction." }, { status: 500 });
  }
}
