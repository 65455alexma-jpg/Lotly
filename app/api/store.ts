import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

export type TransactionRecord = {
  id: number;
  type: "buy" | "sell";
  itemName: string;
  quantity: number;
  unitPriceCents: number;
  transactionDate: string;
  source: "eBay" | "Vinted" | "Other";
  category: "Cloth" | "Bag" | "Watch";
  notes: string;
  createdAt: string;
};

export type InventoryStatus = "In stock" | "Listed" | "On hold" | "Sold" | "Returned";

type DataStore = {
  nextTransactionId: number;
  transactions: TransactionRecord[];
  statuses: Record<string, InventoryStatus>;
};

const dataFile = process.env.LOTLY_DATA_FILE || join(process.env.VERCEL ? "/tmp" : process.cwd(), "lotly-data.json");
const supabaseUrl = process.env.SUPABASE_URL?.replace(/\/$/, "");
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const useSupabase = Boolean(supabaseUrl && supabaseServiceRoleKey);

const starterData: DataStore = {
  nextTransactionId: 1,
  transactions: [],
  statuses: {},
};

type SupabaseTransactionRow = {
  id: number;
  type: "buy" | "sell";
  item_name: string;
  quantity: number;
  unit_price_cents: number;
  transaction_date: string;
  source: "eBay" | "Vinted" | "Other";
  category: "Cloth" | "Bag" | "Watch";
  notes: string | null;
  created_at: string;
};

type SupabaseStatusRow = {
  item_key: string;
  status: InventoryStatus;
};

function fromSupabaseTransaction(row: SupabaseTransactionRow): TransactionRecord {
  return {
    id: row.id,
    type: row.type,
    itemName: row.item_name,
    quantity: row.quantity,
    unitPriceCents: row.unit_price_cents,
    transactionDate: row.transaction_date,
    source: row.source,
    category: row.category,
    notes: row.notes ?? "",
    createdAt: row.created_at,
  };
}

async function supabaseRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  if (!supabaseUrl || !supabaseServiceRoleKey) {
    throw new Error("Supabase is not configured.");
  }

  const response = await fetch(`${supabaseUrl}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: supabaseServiceRoleKey,
      Authorization: `Bearer ${supabaseServiceRoleKey}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
      ...(init.headers ?? {}),
    },
    cache: "no-store",
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(`Supabase request failed: ${response.status} ${message}`);
  }

  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

async function readStore(): Promise<DataStore> {
  try {
    const raw = await readFile(dataFile, "utf8");
    const parsed = JSON.parse(raw) as Partial<DataStore>;
    return {
      nextTransactionId: parsed.nextTransactionId ?? 1,
      transactions: parsed.transactions ?? [],
      statuses: parsed.statuses ?? {},
    };
  } catch {
    return starterData;
  }
}

async function writeStore(store: DataStore) {
  await mkdir(dirname(dataFile), { recursive: true });
  await writeFile(dataFile, JSON.stringify(store, null, 2));
}

export async function listTransactions() {
  if (useSupabase) {
    const rows = await supabaseRequest<SupabaseTransactionRow[]>(
      "lotly_transactions?select=*&order=transaction_date.desc,id.desc",
    );
    return rows.map(fromSupabaseTransaction);
  }

  const store = await readStore();
  return [...store.transactions].sort((a, b) => b.transactionDate.localeCompare(a.transactionDate) || b.id - a.id);
}

export async function addTransaction(input: Omit<TransactionRecord, "id" | "createdAt">) {
  if (useSupabase) {
    const rows = await supabaseRequest<SupabaseTransactionRow[]>("lotly_transactions", {
      method: "POST",
      body: JSON.stringify({
        type: input.type,
        item_name: input.itemName,
        quantity: input.quantity,
        unit_price_cents: input.unitPriceCents,
        transaction_date: input.transactionDate,
        source: input.source,
        category: input.category,
        notes: input.notes,
      }),
    });
    return fromSupabaseTransaction(rows[0]);
  }

  const store = await readStore();
  const transaction: TransactionRecord = {
    ...input,
    id: store.nextTransactionId,
    createdAt: new Date().toISOString(),
  };
  store.nextTransactionId += 1;
  store.transactions.push(transaction);
  await writeStore(store);
  return transaction;
}

export async function updateTransactionPrice(id: number, unitPriceCents: number) {
  if (useSupabase) {
    const rows = await supabaseRequest<SupabaseTransactionRow[]>(`lotly_transactions?id=eq.${id}`, {
      method: "PATCH",
      body: JSON.stringify({ unit_price_cents: unitPriceCents }),
    });
    return rows[0] ? fromSupabaseTransaction(rows[0]) : null;
  }

  const store = await readStore();
  const transaction = store.transactions.find((entry) => entry.id === id);
  if (!transaction) return null;
  transaction.unitPriceCents = unitPriceCents;
  await writeStore(store);
  return transaction;
}

export async function deleteTransaction(id: number) {
  if (useSupabase) {
    const rows = await supabaseRequest<SupabaseTransactionRow[]>(`lotly_transactions?id=eq.${id}`, {
      method: "DELETE",
    });
    return rows[0] ? fromSupabaseTransaction(rows[0]) : null;
  }

  const store = await readStore();
  const index = store.transactions.findIndex((entry) => entry.id === id);
  if (index < 0) return null;
  const [transaction] = store.transactions.splice(index, 1);
  await writeStore(store);
  return transaction;
}

export async function availableStock(itemName: string) {
  if (useSupabase) {
    const transactions = await listTransactions();
    return transactions
      .filter((entry) => entry.itemName.trim().toLowerCase() === itemName.trim().toLowerCase())
      .reduce((sum, entry) => sum + (entry.type === "buy" ? entry.quantity : -entry.quantity), 0);
  }

  const store = await readStore();
  return store.transactions
    .filter((entry) => entry.itemName.trim().toLowerCase() === itemName.trim().toLowerCase())
    .reduce((sum, entry) => sum + (entry.type === "buy" ? entry.quantity : -entry.quantity), 0);
}

export async function listStatuses() {
  if (useSupabase) {
    const rows = await supabaseRequest<SupabaseStatusRow[]>("lotly_inventory_statuses?select=*");
    return Object.fromEntries(rows.map((row) => [row.item_key, row.status]));
  }

  const store = await readStore();
  return store.statuses;
}

export async function setStatus(itemKey: string, status: InventoryStatus) {
  if (useSupabase) {
    await supabaseRequest<SupabaseStatusRow[]>("lotly_inventory_statuses?on_conflict=item_key", {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates,return=representation" },
      body: JSON.stringify({ item_key: itemKey, status }),
    });
    return status;
  }

  const store = await readStore();
  store.statuses[itemKey] = status;
  await writeStore(store);
  return status;
}
