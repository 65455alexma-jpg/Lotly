"use client";

import { ChangeEvent, FormEvent, useEffect, useMemo, useRef, useState } from "react";

type Transaction = {
  id: number;
  type: "buy" | "sell";
  itemName: string;
  quantity: number;
  unitPriceCents: number;
  transactionDate: string;
  source: "eBay" | "Vinted" | "Other";
  category: ProductCategory;
  notes: string;
  createdAt: string;
};

type DraftSell = {
  itemKey: string;
  priorStatus: InventoryStatus;
  itemName: string;
  quantity: string;
  unitPrice: string;
  transactionDate: string;
  source: "eBay" | "Vinted" | "Other";
  category: ProductCategory;
};

type DraftPriceEdit = {
  id: number;
  unitPrice: string;
};

type SelectedItem = {
  key: string;
  name: string;
};

type InventoryRow = {
  key: string;
  name: string;
  category: ProductCategory;
  bought: number;
  sold: number;
  onHand: number;
  averageCost: number;
  invested: number;
  revenue: number;
  profit: number;
  firstDate: string;
  lastDate: string;
};

type InventoryStatus = "In stock" | "Listed" | "On hold" | "Sold" | "Returned";
const inventoryStatuses: InventoryStatus[] = ["In stock", "Listed", "On hold", "Sold", "Returned"];

type ProductCategory = "Clothing" | "Electronics" | "Home & garden" | "Collectibles" | "Beauty" | "Other";

type CategoryRow = {
  name: ProductCategory;
  bought: number;
  sold: number;
  onHand: number;
  cost: number;
  revenue: number;
  profit: number;
};

type ImportedItem = {
  id: string;
  selected: boolean;
  itemName: string;
  quantity: string;
  unitPrice: string;
  transactionDate: string;
  source: "eBay" | "Vinted" | "Other";
  category: ProductCategory;
};

const categories: ProductCategory[] = ["Clothing", "Electronics", "Home & garden", "Collectibles", "Beauty", "Other"];
const categoryMarks: Record<ProductCategory, string> = {
  Clothing: "◒", Electronics: "▣", "Home & garden": "⌂", Collectibles: "◇", Beauty: "✦", Other: "○",
};

const money = new Intl.NumberFormat("en-GB", {
  style: "currency",
  currency: "GBP",
  minimumFractionDigits: 2,
});

function localDate() {
  const now = new Date();
  const offset = now.getTimezoneOffset() * 60_000;
  return new Date(now.getTime() - offset).toISOString().slice(0, 10);
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(`${value}T12:00:00`));
}

function sourceFromText(text: string): "eBay" | "Vinted" | "Other" {
  if (/\bvinted\b/i.test(text)) return "Vinted";
  if (/\be\s*bay\b/i.test(text)) return "eBay";
  return "Other";
}

function priceFromText(text: string) {
  const matches = [...text.matchAll(/(?:£\s?|GBP\s?)(\d{1,6}(?:[,.]\d{2})?)/gi)];
  if (!matches.length) return "";
  const preferred = matches.find((match) => /(?:item|price|sold for|paid|earnings)/i.test(text.slice(Math.max(0, (match.index ?? 0) - 28), (match.index ?? 0) + 8)));
  return (preferred ?? matches[0])[1].replace(",", ".");
}

function quantityFromText(text: string) {
  const match = text.match(/(?:quantity|qty)\s*[:x]?\s*(\d+(?:\.\d+)?)/i);
  return match?.[1] ?? "1";
}

function dateFromText(text: string) {
  const match = text.match(/\b(?:\d{1,2}\s+(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+\d{4}|(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+\d{1,2},?\s+\d{4}|\d{1,2}[/-]\d{1,2}[/-]\d{2,4})\b/i);
  if (!match) return localDate();
  const parsed = new Date(match[0]);
  return Number.isNaN(parsed.getTime()) ? localDate() : parsed.toISOString().slice(0, 10);
}

function itemFromText(text: string, source: string) {
  const lines = text.split(/\r?\n/).map((line) => line.replace(/\s+/g, " ").trim()).filter(Boolean);
  const ignored = /^(ebay|vinted|order|purchase|payment|total|delivery|tracking|quantity|qty|buy again|view order|thank you|sold|item|price|£)/i;
  const likely = lines.find((line) => line.length > 4 && line.length < 82 && !ignored.test(line) && !/^\d/.test(line));
  return likely || `${source} item`;
}

function isItemName(line: string) {
  return line.length > 3 && line.length < 100 && !/^(ebay|vinted|order|purchase|payment|total|delivery|tracking|quantity|qty|buy again|view order|thank you|sold|item|price|£)/i.test(line) && !/^\d/.test(line) && !/(?:subtotal|postage|discount|fees?|tax|vat|amount paid|you paid)/i.test(line);
}

function categoryFromText(text: string): ProductCategory {
  if (/dress|jacket|shirt|shoe|trainer|jeans|bag|clothing|hoodie|coat/i.test(text)) return "Clothing";
  if (/phone|ipad|iphone|laptop|camera|console|headphone|charger|electronic/i.test(text)) return "Electronics";
  if (/vase|lamp|chair|table|plant|kitchen|garden|cushion|home/i.test(text)) return "Home & garden";
  if (/vintage|rare|figure|card|comic|collectible|stamp|trading card/i.test(text)) return "Collectibles";
  if (/makeup|skincare|perfume|beauty|lipstick|foundation/i.test(text)) return "Beauty";
  return "Other";
}

function itemsFromText(text: string): ImportedItem[] {
  const lines = text.split(/\r?\n/).map((line) => line.replace(/\s+/g, " ").trim()).filter(Boolean);
  const source = sourceFromText(text);
  const date = dateFromText(text);
  const ignored = /(?:order total|subtotal|delivery|postage|discount|fees?|tax|vat|payment|amount paid|you paid|total)/i;
  const items: ImportedItem[] = [];

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (!/(?:£\s?|GBP\s?)\d/i.test(line) || ignored.test(line)) continue;
    const unitPrice = priceFromText(line);
    if (!unitPrice) continue;
    const candidates = [lines[index - 1], lines[index - 2], lines[index + 1]].filter(Boolean);
    const itemName = candidates.find(isItemName) ?? `${source} item ${items.length + 1}`;
    const fingerprint = `${itemName.toLowerCase()}-${unitPrice}`;
    if (items.some((item) => `${item.itemName.toLowerCase()}-${item.unitPrice}` === fingerprint)) continue;
    items.push({
      id: `${index}-${fingerprint}`,
      selected: true,
      itemName,
      quantity: quantityFromText(`${candidates.join(" ")} ${line}`),
      unitPrice,
      transactionDate: date,
      source,
      category: categoryFromText(itemName),
    });
  }
  return items;
}

export default function TrackerApp() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [itemStatuses, setItemStatuses] = useState<Record<string, InventoryStatus>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [type, setType] = useState<"buy" | "sell">("buy");
  const [itemName, setItemName] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [unitPrice, setUnitPrice] = useState("");
  const [date, setDate] = useState(localDate());
  const [source, setSource] = useState<"eBay" | "Vinted" | "Other">("eBay");
  const [category, setCategory] = useState<ProductCategory>("Clothing");
  const [notes, setNotes] = useState("");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "buy" | "sell">("all");
  const [inventoryCategoryFilter, setInventoryCategoryFilter] = useState<"all" | ProductCategory>("all");
  const [inventoryMinPrice, setInventoryMinPrice] = useState("");
  const [inventoryMaxPrice, setInventoryMaxPrice] = useState("");
  const [inventoryDateFrom, setInventoryDateFrom] = useState("");
  const [inventoryDateTo, setInventoryDateTo] = useState("");
  const [readingScreenshot, setReadingScreenshot] = useState(false);
  const [readingProgress, setReadingProgress] = useState(0);
  const [importedItems, setImportedItems] = useState<ImportedItem[]>([]);
  const [ocrText, setOcrText] = useState("");
  const [savingImport, setSavingImport] = useState(false);
  const [draftSell, setDraftSell] = useState<DraftSell | null>(null);
  const [savingSell, setSavingSell] = useState(false);
  const [priceEdit, setPriceEdit] = useState<DraftPriceEdit | null>(null);
  const [savingPriceEdit, setSavingPriceEdit] = useState(false);
  const [selectedItem, setSelectedItem] = useState<SelectedItem | null>(null);
  const screenshotInput = useRef<HTMLInputElement>(null);

  async function loadTransactions() {
    try {
      const [transactionResponse, statusResponse] = await Promise.all([
        fetch("/api/transactions"),
        fetch("/api/inventory-status"),
      ]);
      if (!transactionResponse.ok || !statusResponse.ok) throw new Error("Could not load your records.");
      const data = (await transactionResponse.json()) as { transactions: Transaction[] };
      const statuses = (await statusResponse.json()) as { statuses: Record<string, InventoryStatus> };
      setTransactions(data.transactions);
      setItemStatuses(statuses.statuses);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Could not load your records.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadTransactions();
  }, []);

  const inventory = useMemo<InventoryRow[]>(() => {
    const rows = new Map<string, InventoryRow>();

    for (const transaction of transactions) {
      const key = transaction.itemName.trim().toLowerCase();
      const row = rows.get(key) ?? {
        key,
        name: transaction.itemName,
        category: transaction.category ?? "Other",
        bought: 0,
        sold: 0,
        onHand: 0,
        averageCost: 0,
        invested: 0,
        revenue: 0,
        profit: 0,
        firstDate: transaction.transactionDate,
        lastDate: transaction.transactionDate,
      };
      row.category = row.category ?? transaction.category ?? "Other";
      row.firstDate = row.firstDate < transaction.transactionDate ? row.firstDate : transaction.transactionDate;
      row.lastDate = row.lastDate > transaction.transactionDate ? row.lastDate : transaction.transactionDate;

      if (transaction.type === "buy") {
        row.bought += transaction.quantity;
        row.invested += transaction.quantity * transaction.unitPriceCents;
        row.averageCost = row.bought ? row.invested / row.bought : 0;
      } else {
        row.sold += transaction.quantity;
        row.revenue += transaction.quantity * transaction.unitPriceCents;
      }

      row.onHand = row.bought - row.sold;
      row.profit = row.revenue - row.sold * row.averageCost;
      rows.set(key, row);
    }

    return Array.from(rows.values()).sort((a, b) => b.onHand - a.onHand);
  }, [transactions]);

  const filteredInventory = useMemo(() => {
    const minPrice = Number(inventoryMinPrice);
    const maxPrice = Number(inventoryMaxPrice);
    return inventory.filter((item) => {
      const categoryMatches = inventoryCategoryFilter === "all" || item.category === inventoryCategoryFilter;
      const minMatches = !inventoryMinPrice || Number.isNaN(minPrice) || item.averageCost / 100 >= minPrice;
      const maxMatches = !inventoryMaxPrice || Number.isNaN(maxPrice) || item.averageCost / 100 <= maxPrice;
      const fromMatches = !inventoryDateFrom || item.lastDate >= inventoryDateFrom;
      const toMatches = !inventoryDateTo || item.firstDate <= inventoryDateTo;
      return categoryMatches && minMatches && maxMatches && fromMatches && toMatches;
    });
  }, [inventory, inventoryCategoryFilter, inventoryDateFrom, inventoryDateTo, inventoryMaxPrice, inventoryMinPrice]);

  const totals = useMemo(() => {
    const purchaseSpend = transactions
      .filter((entry) => entry.type === "buy")
      .reduce((sum, entry) => sum + entry.quantity * entry.unitPriceCents, 0);
    const revenue = transactions
      .filter((entry) => entry.type === "sell")
      .reduce((sum, entry) => sum + entry.quantity * entry.unitPriceCents, 0);
    const inventoryValue = inventory.reduce(
      (sum, item) => sum + Math.max(0, item.onHand) * item.averageCost,
      0,
    );
    const profit = inventory.reduce((sum, item) => sum + item.profit, 0);
    const units = inventory.reduce((sum, item) => sum + Math.max(0, item.onHand), 0);
    return { purchaseSpend, revenue, inventoryValue, profit, units };
  }, [inventory, transactions]);

  const categoryAnalytics = useMemo<CategoryRow[]>(() => {
    const rows = new Map<ProductCategory, CategoryRow>();
    for (const transaction of transactions) {
      const key = transaction.category ?? "Other";
      const row = rows.get(key) ?? { name: key, bought: 0, sold: 0, onHand: 0, cost: 0, revenue: 0, profit: 0 };
      if (transaction.type === "buy") {
        row.bought += transaction.quantity;
        row.cost += transaction.quantity * transaction.unitPriceCents;
      } else {
        row.sold += transaction.quantity;
        row.revenue += transaction.quantity * transaction.unitPriceCents;
      }
      row.onHand = row.bought - row.sold;
      row.profit = row.revenue - (row.bought ? (row.sold * row.cost) / row.bought : 0);
      rows.set(key, row);
    }
    return Array.from(rows.values()).sort((a, b) => b.revenue - a.revenue || b.profit - a.profit);
  }, [transactions]);

  const highestCategoryRevenue = Math.max(1, ...categoryAnalytics.map((row) => row.revenue));

  const visibleTransactions = useMemo(() => {
    const query = search.trim().toLowerCase();
    return transactions.filter(
      (entry) =>
        (filter === "all" || entry.type === filter) &&
        (!query ||
          entry.itemName.toLowerCase().includes(query) ||
          entry.notes.toLowerCase().includes(query)),
    );
  }, [filter, search, transactions]);

  const selectedItemTransactions = useMemo(() => {
    if (!selectedItem) return [];
    return transactions
      .filter((entry) => entry.itemName.trim().toLowerCase() === selectedItem.key)
      .sort((a, b) => b.transactionDate.localeCompare(a.transactionDate) || b.id - a.id);
  }, [selectedItem, transactions]);

  const totalEntry = (Number(quantity) || 0) * (Number(unitPrice) || 0);
  const thisMonth = localDate().slice(0, 7);
  const monthlyTransactions = transactions.filter((entry) => entry.transactionDate.startsWith(thisMonth)).length;

  async function readScreenshot(event: ChangeEvent<HTMLInputElement>) {
    const screenshot = event.target.files?.[0];
    if (!screenshot) return;
    if (!screenshot.type.startsWith("image/")) {
      setError("Please choose an image or screenshot.");
      return;
    }
    if (screenshot.size > 12 * 1024 * 1024) {
      setError("Please use a screenshot smaller than 12 MB.");
      return;
    }

    setError("");
    setNotice("");
    setReadingScreenshot(true);
    setReadingProgress(4);
    try {
      const { createWorker } = await import("tesseract.js");
      const worker = await createWorker("eng", 1, {
        workerPath: "/ocr/worker.min.js",
        corePath: "/ocr",
        langPath: "/ocr",
        logger: (message) => {
          if (message.status === "recognizing text") setReadingProgress(Math.max(8, Math.round(message.progress * 100)));
        },
      });
      const result = await worker.recognize(screenshot);
      await worker.terminate();
      const text = result.data.text;
      const foundSource = sourceFromText(text);
      const foundItem = itemFromText(text, foundSource);
      const foundPrice = priceFromText(text);
      const foundItems = itemsFromText(text);
      const reviewItems = foundItems.length ? foundItems : [{
        id: "single-import",
        selected: true,
        itemName: foundItem,
        quantity: quantityFromText(text),
        unitPrice: foundPrice,
        transactionDate: dateFromText(text),
        source: foundSource,
        category: categoryFromText(`${foundItem}\n${text}`),
      }];
      setImportedItems(reviewItems);
      setOcrText(text.trim());
      setNotice(`${reviewItems.length} ${reviewItems.length === 1 ? "item is" : "items are"} ready for your review. Check the name and price before adding.`);
    } catch {
      setError("The picture could not be read. Try a clear, full order screen with the item names and prices visible.");
    } finally {
      setReadingScreenshot(false);
      setReadingProgress(0);
      event.target.value = "";
    }
  }

  function changeImportedItem(id: string, field: keyof ImportedItem, value: string | boolean) {
    setImportedItems((current) => current.map((item) => item.id === id ? { ...item, [field]: value } : item));
  }

  async function saveImportedItems() {
    const selectedItems = importedItems.filter((item) => item.selected);
    if (!selectedItems.length) {
      setError("Choose at least one item to add.");
      return;
    }
    if (selectedItems.some((item) => !item.itemName.trim() || Number(item.quantity) <= 0 || Number(item.unitPrice) <= 0)) {
      setError("Please give every selected item a name, quantity, and price.");
      return;
    }
    setSavingImport(true);
    setError("");
    try {
      const results: Transaction[] = [];
      for (const item of selectedItems) {
        const response = await fetch("/api/transactions", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ type, itemName: item.itemName, quantity: Number(item.quantity), unitPrice: Number(item.unitPrice), transactionDate: item.transactionDate, source: item.source, category: item.category, notes: "Imported from multi-item screenshot" }),
        });
        const data = (await response.json()) as { transaction?: Transaction; error?: string };
        if (!response.ok || !data.transaction) throw new Error(data.error || `Could not add ${item.itemName}.`);
        results.push(data.transaction);
      }
      setTransactions((current) => [...results, ...current]);
      setImportedItems([]);
      setNotice(`${results.length} separate ${type} records added.`);
    } catch (importError) {
      setError(importError instanceof Error ? importError.message : "Could not add all imported items.");
    } finally {
      setSavingImport(false);
    }
  }

  async function submitTransaction(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setNotice("");
    setSaving(true);

    try {
      const response = await fetch("/api/transactions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          type,
          itemName,
          quantity: Number(quantity),
          unitPrice: Number(unitPrice),
          transactionDate: date,
          source,
          category,
          notes,
        }),
      });
      const data = (await response.json()) as { transaction?: Transaction; error?: string };
      if (!response.ok || !data.transaction) {
        throw new Error(data.error || "Could not save this transaction.");
      }

      setTransactions((current) => [data.transaction!, ...current]);
      setItemName("");
      setQuantity("1");
      setUnitPrice("");
      setSource("eBay");
      setCategory("Clothing");
      setNotes("");
      setNotice(type === "buy" ? "Purchase recorded." : "Sale recorded.");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Could not save this transaction.");
    } finally {
      setSaving(false);
    }
  }

  async function removeTransaction(id: number) {
    setError("");
    const response = await fetch(`/api/transactions?id=${id}`, { method: "DELETE" });
    if (response.ok) {
      setTransactions((current) => current.filter((entry) => entry.id !== id));
      setNotice("Transaction removed.");
      return;
    }
    const data = (await response.json()) as { error?: string };
    setError(data.error || "Could not remove that transaction.");
  }

  async function updateInventoryStatus(item: InventoryRow, status: InventoryStatus) {
    const priorStatus = itemStatuses[item.key] ?? "In stock";
    setError("");
    if (status === "Sold") {
      setItemStatuses((current) => ({ ...current, [item.key]: "Sold" }));
      setDraftSell({
        itemKey: item.key,
        priorStatus,
        itemName: item.name,
        quantity: String(Math.max(1, item.onHand || item.sold || 1)),
        unitPrice: String(Math.max(0, Math.round(item.averageCost) / 100 || 0)),
        transactionDate: localDate(),
        source: "eBay",
        category: "Other",
      });
      return;
    }

    setItemStatuses((current) => ({ ...current, [item.key]: status }));
    try {
      const response = await fetch("/api/inventory-status", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ itemKey: item.key, itemName: item.name, status }),
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(data.error || "Could not update the item status.");
      setNotice(`${item.name} is now marked as ${status.toLowerCase()}.`);
    } catch (statusError) {
      setItemStatuses((current) => ({ ...current, [item.key]: priorStatus }));
      setError(statusError instanceof Error ? statusError.message : "Could not update the item status.");
    }
  }

  async function saveSoldRecord() {
    if (!draftSell) return;
    const quantity = Number(draftSell.quantity);
    const unitPrice = Number(draftSell.unitPrice);
    if (!draftSell.itemName.trim() || !Number.isFinite(quantity) || quantity <= 0 || !Number.isFinite(unitPrice) || unitPrice <= 0) {
      setError("Please give the sale a name, quantity, and price.");
      return;
    }

    setSavingSell(true);
    setError("");
    try {
      const response = await fetch("/api/transactions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          type: "sell",
          itemName: draftSell.itemName,
          quantity,
          unitPrice,
          transactionDate: draftSell.transactionDate,
          source: draftSell.source,
          category: draftSell.category,
          notes: "Added from inventory status update",
        }),
      });
      const data = (await response.json()) as { transaction?: Transaction; error?: string };
      if (!response.ok || !data.transaction) throw new Error(data.error || "Could not save the sale.");

      const soldStatusResponse = await fetch("/api/inventory-status", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ itemKey: draftSell.itemKey, itemName: draftSell.itemName, status: "Sold" }),
      });
      const statusData = (await soldStatusResponse.json()) as { error?: string };
      if (!soldStatusResponse.ok) throw new Error(statusData.error || "Could not update the item status.");

      setTransactions((current) => [data.transaction!, ...current]);
      setItemStatuses((current) => ({ ...current, [draftSell.itemKey]: "Sold" }));
      setNotice(`${draftSell.itemName} marked as sold and added to the ledger.`);
      setDraftSell(null);
    } catch (sellError) {
      setError(sellError instanceof Error ? sellError.message : "Could not save the sale.");
    } finally {
      setSavingSell(false);
    }
  }

  async function savePriceEdit() {
    if (!priceEdit) return;
    const unitPrice = Number(priceEdit.unitPrice);
    if (!Number.isFinite(unitPrice) || unitPrice <= 0) {
      setError("Please enter a valid price.");
      return;
    }

    setSavingPriceEdit(true);
    setError("");
    try {
      const response = await fetch("/api/transactions", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: priceEdit.id, unitPrice }),
      });
      const data = (await response.json()) as { transaction?: Transaction; error?: string };
      if (!response.ok || !data.transaction) throw new Error(data.error || "Could not update the price.");
      setTransactions((current) => current.map((entry) => (entry.id === data.transaction!.id ? data.transaction! : entry)));
      setNotice("Price updated.");
      setPriceEdit(null);
    } catch (priceError) {
      setError(priceError instanceof Error ? priceError.message : "Could not update the price.");
    } finally {
      setSavingPriceEdit(false);
    }
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <a className="brand" href="#top" aria-label="Lotly home">
          <span className="brand-mark">L</span>
          <span>lotly</span>
        </a>
        <div className="header-actions">
          <span className="currency-pill">GBP · £</span>
          <a href="#record" className="header-button">+ Add transaction</a>
        </div>
      </header>

      <section className="hero" id="top">
        <div>
          <p className="eyebrow">YOUR TRADING LEDGER</p>
          <h1>Know what you bought.<br /><span>Know what you earned.</span></h1>
          <p className="hero-copy">
            A simple record of every purchase and sale, with your stock and estimated profit worked out for you.
          </p>
        </div>
      </section>

      <section className="summary-grid" aria-label="Financial summary">
        <article className="summary-card accent-card">
          <p>Estimated profit</p>
          <strong className={totals.profit < 0 ? "negative" : ""}>{money.format(totals.profit / 100)}</strong>
          <span>From completed sales</span>
        </article>
        <article className="summary-card">
          <p>Sales revenue</p>
          <strong>{money.format(totals.revenue / 100)}</strong>
          <span>{transactions.filter((entry) => entry.type === "sell").length} sale records</span>
        </article>
        <article className="summary-card">
          <p>Stock at cost</p>
          <strong>{money.format(totals.inventoryValue / 100)}</strong>
          <span>{totals.units} units on hand</span>
        </article>
        <article className="summary-card">
          <p>Total purchased</p>
          <strong>{money.format(totals.purchaseSpend / 100)}</strong>
          <span>Across {inventory.length} items</span>
        </article>
      </section>

      {(error || notice) && (
        <div className={`status-message ${error ? "status-error" : "status-success"}`} role="status">
          {error || notice}
          <button type="button" onClick={() => { setError(""); setNotice(""); }} aria-label="Dismiss message">×</button>
        </div>
      )}

      <section className="workspace">
        <aside className="entry-panel" id="record">
          <div className="section-heading">
            <div>
              <p className="eyebrow">NEW ENTRY</p>
              <h2>Record a transaction</h2>
            </div>
            <span className="step-badge">01</span>
          </div>

          <form onSubmit={submitTransaction}>
            <input ref={screenshotInput} className="screenshot-input" type="file" accept="image/png,image/jpeg,image/webp" onChange={readScreenshot} />
            <section className="screenshot-import" aria-label="Import details from a screenshot">
              <div className="import-symbol">▧</div>
              <div><strong>Import one or many items</strong><p>eBay or Vinted order screen</p></div>
              <button type="button" onClick={() => screenshotInput.current?.click()} disabled={readingScreenshot}>
                {readingScreenshot ? `Reading ${readingProgress}%` : "Upload"}
              </button>
              {readingScreenshot && <div className="reading-bar"><span style={{ width: `${readingProgress}%` }} /></div>}
            </section>
            {importedItems.length > 0 && (
              <section className="batch-review" aria-label="Review imported items">
                <div className="batch-heading"><div><span className="eyebrow">IMPORT REVIEW</span><strong>{importedItems.filter((item) => item.selected).length} items ready to add</strong></div><button type="button" onClick={() => { setImportedItems([]); setOcrText(""); }}>Clear</button></div>
                <p>Each selected row becomes its own {type} record. The fields below are suggestions from the picture—please correct anything that is wrong.</p>
                <div className="batch-items">
                  {importedItems.map((item) => (
                    <article className="batch-item" key={item.id}>
                      <input type="checkbox" checked={item.selected} onChange={(event) => changeImportedItem(item.id, "selected", event.target.checked)} aria-label={`Include ${item.itemName}`} />
                      <div className="batch-fields">
                        <input value={item.itemName} onChange={(event) => changeImportedItem(item.id, "itemName", event.target.value)} aria-label="Item name" />
                        <div><input type="number" min="0.01" step="0.01" value={item.quantity} onChange={(event) => changeImportedItem(item.id, "quantity", event.target.value)} aria-label="Quantity" /><span>×</span><div className="batch-price"><span>£</span><input type="number" min="0.01" step="0.01" value={item.unitPrice} onChange={(event) => changeImportedItem(item.id, "unitPrice", event.target.value)} aria-label="Price per unit" /></div></div>
                        <div className="batch-selects"><select value={item.source} onChange={(event) => changeImportedItem(item.id, "source", event.target.value)} aria-label="Source"><option value="eBay">eBay</option><option value="Vinted">Vinted</option><option value="Other">Other</option></select><select value={item.category} onChange={(event) => changeImportedItem(item.id, "category", event.target.value)} aria-label="Product type">{categories.map((option) => <option value={option} key={option}>{option}</option>)}</select></div>
                      </div>
                    </article>
                  ))}
                </div>
                <button type="button" className={`batch-save ${type}`} onClick={() => void saveImportedItems()} disabled={savingImport}>{savingImport ? "Adding records…" : `Add selected as ${type}s`}</button>
                {ocrText && <details className="ocr-details"><summary>See the text read from the picture</summary><p>{ocrText}</p></details>}
              </section>
            )}
            {draftSell && (
              <section className="sell-drawer" aria-label="Sale details">
                <div className="sell-drawer-head">
                  <div>
                    <span className="eyebrow">MARK AS SOLD</span>
                    <strong>{draftSell.itemName}</strong>
                  </div>
                  <button type="button" onClick={() => {
                    setItemStatuses((current) => ({ ...current, [draftSell.itemKey]: draftSell.priorStatus }));
                    setDraftSell(null);
                  }}>Cancel</button>
                </div>
                <div className="form-row">
                  <label>
                    <span>Sold quantity</span>
                    <input type="number" min="0.01" step="0.01" value={draftSell.quantity} onChange={(event) => setDraftSell((current) => current ? { ...current, quantity: event.target.value } : current)} />
                  </label>
                  <label>
                    <span>Sold price</span>
                    <div className="money-input"><span>£</span><input type="number" min="0.01" step="0.01" value={draftSell.unitPrice} onChange={(event) => setDraftSell((current) => current ? { ...current, unitPrice: event.target.value } : current)} /></div>
                  </label>
                </div>
                <div className="form-row">
                  <label>
                    <span>Source</span>
                    <select value={draftSell.source} onChange={(event) => setDraftSell((current) => current ? { ...current, source: event.target.value as DraftSell["source"] } : current)}>
                      <option value="eBay">eBay</option>
                      <option value="Vinted">Vinted</option>
                      <option value="Other">Other</option>
                    </select>
                  </label>
                  <label>
                    <span>Sold date</span>
                    <input type="date" value={draftSell.transactionDate} onChange={(event) => setDraftSell((current) => current ? { ...current, transactionDate: event.target.value } : current)} />
                  </label>
                </div>
                <button type="button" className="batch-save sell" onClick={() => void saveSoldRecord()} disabled={savingSell}>
                  {savingSell ? "Saving sale…" : "Confirm sold"}
                </button>
              </section>
            )}

            <div className="type-switch" role="group" aria-label="Transaction type">
              <button type="button" className={type === "buy" ? "active buy-active" : ""} onClick={() => setType("buy")}>
                <span>↓</span> Buy
              </button>
              <button type="button" className={type === "sell" ? "active sell-active" : ""} onClick={() => setType("sell")}>
                <span>↑</span> Sell
              </button>
            </div>

            <label>
              <span>Item name</span>
              <input value={itemName} onChange={(event) => setItemName(event.target.value)} placeholder="e.g. Vintage camera" required maxLength={80} />
            </label>

            <label>
              <span>Source</span>
              <select value={source} onChange={(event) => setSource(event.target.value as typeof source)}>
                <option value="eBay">eBay</option>
                <option value="Vinted">Vinted</option>
                <option value="Other">Other</option>
              </select>
            </label>

            <label>
              <span>Product type</span>
              <select value={category} onChange={(event) => setCategory(event.target.value as ProductCategory)}>
                {categories.map((option) => <option value={option} key={option}>{option}</option>)}
              </select>
            </label>

            <div className="form-row">
              <label>
                <span>Quantity</span>
                <input type="number" inputMode="decimal" value={quantity} onChange={(event) => setQuantity(event.target.value)} min="0.01" step="0.01" required />
              </label>
              <label>
                <span>Price per unit</span>
                <div className="money-input"><span>£</span><input type="number" inputMode="decimal" value={unitPrice} onChange={(event) => setUnitPrice(event.target.value)} min="0.01" step="0.01" placeholder="0.00" required /></div>
              </label>
            </div>

            <label>
              <span>Date</span>
              <input type="date" value={date} onChange={(event) => setDate(event.target.value)} required />
            </label>

            <label>
              <span>Note <em>optional</em></span>
              <input value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Where, buyer, condition…" maxLength={160} />
            </label>

            <div className="entry-total">
              <span>Transaction total</span>
              <strong>{money.format(totalEntry)}</strong>
            </div>

            <button className={`submit-button ${type}`} disabled={saving}>
              {saving ? "Saving…" : type === "buy" ? "Record purchase" : "Record sale"}
              <span>→</span>
            </button>
          </form>
        </aside>

        <div className="content-column">
          <section className="inventory-panel">
            <div className="section-heading inline-heading">
              <div>
                <p className="eyebrow">CURRENT POSITION</p>
                <h2>Your inventory</h2>
              </div>
              <span className="item-count">{filteredInventory.length} {filteredInventory.length === 1 ? "item" : "items"}</span>
            </div>

            <div className="inventory-filters">
              <div className="inventory-filters-head">
                <div>
                  <p className="eyebrow">FILTERS</p>
                  <strong>Category, price, and date</strong>
                </div>
                <button type="button" className="inventory-filter-clear" onClick={() => {
                  setInventoryCategoryFilter("all");
                  setInventoryMinPrice("");
                  setInventoryMaxPrice("");
                  setInventoryDateFrom("");
                  setInventoryDateTo("");
                }}>
                  Clear
                </button>
              </div>
              <div className="inventory-filters-grid" aria-label="Inventory filters">
                <label>
                  <span>Category</span>
                  <select value={inventoryCategoryFilter} onChange={(event) => setInventoryCategoryFilter(event.target.value as "all" | ProductCategory)}>
                    <option value="all">All categories</option>
                    {categories.map((option) => <option value={option} key={option}>{option}</option>)}
                  </select>
                </label>
                <label>
                  <span>Min cost</span>
                  <div className="money-input"><span>£</span><input type="number" min="0" step="0.01" value={inventoryMinPrice} onChange={(event) => setInventoryMinPrice(event.target.value)} placeholder="0.00" /></div>
                </label>
                <label>
                  <span>Max cost</span>
                  <div className="money-input"><span>£</span><input type="number" min="0" step="0.01" value={inventoryMaxPrice} onChange={(event) => setInventoryMaxPrice(event.target.value)} placeholder="0.00" /></div>
                </label>
                <label>
                  <span>Date from</span>
                  <input type="date" value={inventoryDateFrom} onChange={(event) => setInventoryDateFrom(event.target.value)} />
                </label>
                <label>
                  <span>Date to</span>
                  <input type="date" value={inventoryDateTo} onChange={(event) => setInventoryDateTo(event.target.value)} />
                </label>
              </div>
            </div>

            {loading ? (
              <div className="empty-state compact"><div className="empty-icon">···</div><h3>Loading your inventory</h3></div>
            ) : filteredInventory.length === 0 ? (
              <div className="empty-state">
                <div className="empty-icon">□</div>
                <h3>No items match your filters</h3>
                <p>Try widening the category, price, or date range.</p>
                <a href="#record">Record a purchase →</a>
              </div>
            ) : (<>
              <div className="inventory-table-wrap">
                <table className="inventory-table">
                  <thead><tr><th>Item</th><th>Status</th><th>Number</th><th>Cost</th><th>Sold</th><th>Profit</th></tr></thead>
                  <tbody>
                    {filteredInventory.map((item) => (
                      <tr key={item.name}>
                        <td><button type="button" className="inventory-link" onClick={() => setSelectedItem({ key: item.key, name: item.name })}>{item.name}</button></td>
                        <td><select className={`status-select status-${(itemStatuses[item.key] ?? "In stock").replaceAll(" ", "-").toLowerCase()}`} value={itemStatuses[item.key] ?? "In stock"} onChange={(event) => void updateInventoryStatus(item, event.target.value as InventoryStatus)} aria-label={`Status for ${item.name}`}>{inventoryStatuses.map((status) => <option key={status} value={status}>{status}</option>)}</select></td>
                        <td><button type="button" className="item-number item-button" onClick={() => setSelectedItem({ key: item.key, name: item.name })}>{item.onHand}</button></td>
                        <td><button type="button" className="detail-value" onClick={() => setSelectedItem({ key: item.key, name: item.name })}>{money.format(item.averageCost / 100)}</button></td>
                        <td><button type="button" className="detail-value" onClick={() => setSelectedItem({ key: item.key, name: item.name })}>{money.format(item.revenue / 100)}</button></td>
                        <td><button type="button" className={`detail-value ${item.profit < 0 ? "negative" : "profit"}`} onClick={() => setSelectedItem({ key: item.key, name: item.name })}>{money.format(item.profit / 100)}</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="inventory-mobile-list">
                {filteredInventory.map((item) => (
                  <article className="inventory-mobile-card" key={item.key}>
                    <div className="mobile-item-head"><button type="button" className="inventory-link" onClick={() => setSelectedItem({ key: item.key, name: item.name })}>{item.name}</button><select className={`status-select status-${(itemStatuses[item.key] ?? "In stock").replaceAll(" ", "-").toLowerCase()}`} value={itemStatuses[item.key] ?? "In stock"} onChange={(event) => void updateInventoryStatus(item, event.target.value as InventoryStatus)} aria-label={`Status for ${item.name}`}>{inventoryStatuses.map((status) => <option key={status} value={status}>{status}</option>)}</select></div>
                    <div className="mobile-item-stats"><button type="button" onClick={() => setSelectedItem({ key: item.key, name: item.name })}><span>Number</span><strong>{item.onHand}</strong></button><button type="button" onClick={() => setSelectedItem({ key: item.key, name: item.name })}><span>Cost</span><strong>{money.format(item.averageCost / 100)}</strong></button><button type="button" onClick={() => setSelectedItem({ key: item.key, name: item.name })}><span>Sold</span><strong>{money.format(item.revenue / 100)}</strong></button><button type="button" onClick={() => setSelectedItem({ key: item.key, name: item.name })}><span>Profit</span><strong className={item.profit < 0 ? "negative" : "profit"}>{money.format(item.profit / 100)}</strong></button></div>
                  </article>
                ))}
              </div>
            </>)}
          </section>

          <section className="analysis-panel">
            <div className="section-heading inline-heading">
              <div>
                <p className="eyebrow">CATEGORY PERFORMANCE</p>
                <h2>What&apos;s working</h2>
              </div>
              <span className="item-count">{categoryAnalytics.length} {categoryAnalytics.length === 1 ? "type" : "types"}</span>
            </div>

            {categoryAnalytics.length === 0 ? (
              <div className="analysis-empty"><span>◌</span><p>Choose a product type when you add an item to see category insights here.</p></div>
            ) : (
              <div className="analysis-list">
                {categoryAnalytics.map((row) => {
                  const margin = row.revenue ? (row.profit / row.revenue) * 100 : 0;
                  return (
                    <article className="category-row" key={row.name}>
                      <div className="category-name"><span>{categoryMarks[row.name]}</span><div><strong>{row.name}</strong><small>{row.onHand} on hand · {row.sold} sold</small></div></div>
                      <div className="category-metrics"><div><span>Sales</span><strong>{money.format(row.revenue / 100)}</strong></div><div><span>Est. profit</span><strong className={row.profit < 0 ? "negative" : "profit"}>{money.format(row.profit / 100)}</strong></div><div><span>Margin</span><strong className={margin < 0 ? "negative" : ""}>{row.revenue ? `${margin.toFixed(0)}%` : "—"}</strong></div></div>
                      <div className="category-bar" aria-hidden="true"><span style={{ width: `${(row.revenue / highestCategoryRevenue) * 100}%` }} /></div>
                    </article>
                  );
                })}
              </div>
            )}
          </section>

          <section className="history-panel">
            <div className="section-heading inline-heading history-heading">
              <div>
                <p className="eyebrow">THE LEDGER</p>
                <h2>Transaction history</h2>
              </div>
              <div className="history-controls">
                <label className="search-box">
                  <span aria-hidden="true">⌕</span>
                  <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search items" aria-label="Search transactions" />
                </label>
                <select value={filter} onChange={(event) => setFilter(event.target.value as typeof filter)} aria-label="Filter transactions">
                  <option value="all">All activity</option>
                  <option value="buy">Purchases</option>
                  <option value="sell">Sales</option>
                </select>
              </div>
            </div>

            {visibleTransactions.length === 0 ? (
              <div className="history-empty">
                <span>—</span>
                <p>{transactions.length ? "No transactions match your search." : "Your transaction history will appear here."}</p>
              </div>
            ) : (
              <div className="transaction-list">
                {visibleTransactions.map((entry) => (
                  <article className="transaction-row" key={entry.id}>
                    <div className={`transaction-icon ${entry.type}`}>{entry.type === "buy" ? "↓" : "↑"}</div>
                    <div className="transaction-main">
                      <div><strong>{entry.itemName}</strong><span className={`type-label ${entry.type}`}>{entry.type === "buy" ? "Bought" : "Sold"}</span></div>
                      <p>{formatDate(entry.transactionDate)} · {entry.category ?? "Other"} · {entry.source} · {entry.quantity} × {money.format(entry.unitPriceCents / 100)}{entry.notes ? ` · ${entry.notes}` : ""}</p>
                    </div>
                    <div className="transaction-amount">
                      {priceEdit?.id === entry.id ? (
                        <div className="price-edit">
                          <div className="money-input"><span>£</span><input type="number" min="0.01" step="0.01" value={priceEdit.unitPrice} onChange={(event) => setPriceEdit({ ...priceEdit, unitPrice: event.target.value })} aria-label={`Price for ${entry.itemName}`} /></div>
                          <div className="price-edit-actions">
                            <button type="button" onClick={() => void savePriceEdit()} disabled={savingPriceEdit}>{savingPriceEdit ? "Saving" : "Save"}</button>
                            <button type="button" onClick={() => setPriceEdit(null)}>Cancel</button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <strong>{entry.type === "buy" ? "−" : "+"}{money.format((entry.quantity * entry.unitPriceCents) / 100)}</strong>
                          <button type="button" onClick={() => setPriceEdit({ id: entry.id, unitPrice: String(entry.unitPriceCents / 100) })}>Edit price</button>
                          <button type="button" onClick={() => void removeTransaction(entry.id)} aria-label={`Remove ${entry.itemName} transaction`}>Remove</button>
                        </>
                      )}
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
        </div>
      </section>

      {selectedItem && (
        <div className="item-modal-backdrop" role="presentation" onClick={() => setSelectedItem(null)}>
          <section
            className="item-modal"
            role="dialog"
            aria-modal="true"
            aria-label={`${selectedItem.name} details`}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="item-drawer-head">
              <div>
                <span className="eyebrow">ITEM DETAILS</span>
                <h3>{selectedItem.name}</h3>
              </div>
              <button type="button" onClick={() => setSelectedItem(null)}>Close</button>
            </div>
            {selectedItemTransactions.length === 0 ? (
              <div className="item-drawer-empty">No transactions found for this item.</div>
            ) : (
              <div className="item-drawer-list">
                {selectedItemTransactions.map((entry) => (
                  <article className="item-drawer-row" key={entry.id}>
                    <div className={`transaction-icon ${entry.type}`}>{entry.type === "buy" ? "↓" : "↑"}</div>
                    <div className="item-drawer-main">
                      <div>
                        <strong>{entry.type === "buy" ? "Purchase" : "Sale"}</strong>
                        <span className={`type-label ${entry.type}`}>{formatDate(entry.transactionDate)}</span>
                      </div>
                      <p>{entry.quantity} × {money.format(entry.unitPriceCents / 100)} · {entry.source} · {entry.category}</p>
                      {entry.notes && <p>{entry.notes}</p>}
                    </div>
                    <div className="item-drawer-amount">
                      <strong>{entry.type === "buy" ? "−" : "+"}{money.format((entry.quantity * entry.unitPriceCents) / 100)}</strong>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
        </div>
      )}

      <footer><span>LOTLY</span><p>A clearer view of every buy and sell.</p><a href="#top">Back to top ↑</a></footer>
    </main>
  );
}
