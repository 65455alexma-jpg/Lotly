import { env } from "cloudflare:workers";
import { NextRequest, NextResponse } from "next/server";

const statuses = ["In stock", "Listed", "On hold", "Sold", "Returned"] as const;
type InventoryStatus = (typeof statuses)[number];

const createTableSql = `
  CREATE TABLE IF NOT EXISTS inventory_statuses (
    item_key TEXT PRIMARY KEY,
    item_name TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'In stock' CHECK(status IN ('In stock', 'Listed', 'On hold', 'Sold', 'Returned')),
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )
`;

function database() {
  if (!env.DB) throw new Error("Database unavailable");
  return env.DB;
}

async function prepareDatabase() {
  const db = database();
  await db.prepare(createTableSql).run();
  return db;
}

export async function GET() {
  try {
    const db = await prepareDatabase();
    const result = await db.prepare("SELECT item_key, status FROM inventory_statuses").all<{ item_key: string; status: InventoryStatus }>();
    const statusesByItem = Object.fromEntries(result.results.map((row) => [row.item_key, row.status]));
    return NextResponse.json({ statuses: statusesByItem });
  } catch {
    return NextResponse.json({ error: "Could not load inventory statuses." }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const input = (await request.json()) as Record<string, unknown>;
    const itemKey = String(input.itemKey ?? "").trim().toLowerCase();
    const itemName = String(input.itemName ?? "").trim();
    const status = input.status as InventoryStatus;
    if (!itemKey || !itemName || !statuses.includes(status) || itemKey.length > 80 || itemName.length > 80) {
      return NextResponse.json({ error: "Please choose a valid item status." }, { status: 400 });
    }

    const db = await prepareDatabase();
    await db
      .prepare("INSERT INTO inventory_statuses (item_key, item_name, status, updated_at) VALUES (?, ?, ?, CURRENT_TIMESTAMP) ON CONFLICT(item_key) DO UPDATE SET item_name = excluded.item_name, status = excluded.status, updated_at = CURRENT_TIMESTAMP")
      .bind(itemKey, itemName, status)
      .run();
    return NextResponse.json({ itemKey, status });
  } catch {
    return NextResponse.json({ error: "Could not update the item status." }, { status: 500 });
  }
}
