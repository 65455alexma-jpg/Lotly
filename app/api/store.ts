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

const starterData: DataStore = {
  nextTransactionId: 1,
  transactions: [],
  statuses: {},
};

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
  const store = await readStore();
  return [...store.transactions].sort((a, b) => b.transactionDate.localeCompare(a.transactionDate) || b.id - a.id);
}

export async function addTransaction(input: Omit<TransactionRecord, "id" | "createdAt">) {
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
  const store = await readStore();
  const transaction = store.transactions.find((entry) => entry.id === id);
  if (!transaction) return null;
  transaction.unitPriceCents = unitPriceCents;
  await writeStore(store);
  return transaction;
}

export async function deleteTransaction(id: number) {
  const store = await readStore();
  const index = store.transactions.findIndex((entry) => entry.id === id);
  if (index < 0) return null;
  const [transaction] = store.transactions.splice(index, 1);
  await writeStore(store);
  return transaction;
}

export async function availableStock(itemName: string) {
  const store = await readStore();
  return store.transactions
    .filter((entry) => entry.itemName.trim().toLowerCase() === itemName.trim().toLowerCase())
    .reduce((sum, entry) => sum + (entry.type === "buy" ? entry.quantity : -entry.quantity), 0);
}

export async function listStatuses() {
  const store = await readStore();
  return store.statuses;
}

export async function setStatus(itemKey: string, status: InventoryStatus) {
  const store = await readStore();
  store.statuses[itemKey] = status;
  await writeStore(store);
  return status;
}
