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
  notes: string;
  createdAt: string;
};

type InventoryRow = {
  name: string;
  bought: number;
  sold: number;
  onHand: number;
  averageCost: number;
  invested: number;
  revenue: number;
  profit: number;
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
  const preferred = text.match(/(?:total|item price|price paid|you paid)[^£\d]{0,30}£\s?(\d{1,6}(?:[,.]\d{2})?)/i);
  const amounts = [...text.matchAll(/£\s?(\d{1,6}(?:[,.]\d{2})?)/g)].map((match) => Number(match[1].replace(",", ".")));
  return preferred ? preferred[1].replace(",", ".") : amounts.length ? String(Math.max(...amounts)) : "";
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

export default function TrackerApp() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
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
  const [notes, setNotes] = useState("");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "buy" | "sell">("all");
  const [readingScreenshot, setReadingScreenshot] = useState(false);
  const [readingProgress, setReadingProgress] = useState(0);
  const screenshotInput = useRef<HTMLInputElement>(null);

  async function loadTransactions() {
    try {
      const response = await fetch("/api/transactions");
      if (!response.ok) throw new Error("Could not load your records.");
      const data = (await response.json()) as { transactions: Transaction[] };
      setTransactions(data.transactions);
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
        name: transaction.itemName,
        bought: 0,
        sold: 0,
        onHand: 0,
        averageCost: 0,
        invested: 0,
        revenue: 0,
        profit: 0,
      };

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
      const { recognize } = await import("tesseract.js");
      const result = await recognize(screenshot, "eng", {
        logger: (message) => {
          if (message.status === "recognizing text") setReadingProgress(Math.max(8, Math.round(message.progress * 100)));
        },
      });
      const text = result.data.text;
      const foundSource = sourceFromText(text);
      const foundItem = itemFromText(text, foundSource);
      const foundPrice = priceFromText(text);
      setSource(foundSource);
      setItemName(foundItem);
      setQuantity(quantityFromText(text));
      setUnitPrice(foundPrice);
      setDate(dateFromText(text));
      setNotes(`${foundSource !== "Other" ? `${foundSource} screenshot` : "Screenshot import"} — please check the details.`);
      setNotice(foundPrice ? "Details read from the screenshot. Please check them, then save." : "Some details were read. Please complete the price before saving.");
    } catch {
      setError("I could not read that screenshot. Try a clear, uncropped image or add the details manually.");
    } finally {
      setReadingScreenshot(false);
      setReadingProgress(0);
      event.target.value = "";
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
        <div className="hero-stamp" aria-hidden="true">
          <span>THIS MONTH</span>
          <strong>{monthlyTransactions}</strong>
          <small>TRANSACTIONS</small>
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
              <div><strong>Import from screenshot</strong><p>eBay or Vinted order screen</p></div>
              <button type="button" onClick={() => screenshotInput.current?.click()} disabled={readingScreenshot}>
                {readingScreenshot ? `Reading ${readingProgress}%` : "Upload"}
              </button>
              {readingScreenshot && <div className="reading-bar"><span style={{ width: `${readingProgress}%` }} /></div>}
            </section>
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
              <span className="item-count">{inventory.length} {inventory.length === 1 ? "item" : "items"}</span>
            </div>

            {loading ? (
              <div className="empty-state compact"><div className="empty-icon">···</div><h3>Loading your inventory</h3></div>
            ) : inventory.length === 0 ? (
              <div className="empty-state">
                <div className="empty-icon">□</div>
                <h3>No stock recorded yet</h3>
                <p>Add your first purchase and it will appear here automatically.</p>
                <a href="#record">Record a purchase →</a>
              </div>
            ) : (
              <div className="inventory-table-wrap">
                <table className="inventory-table">
                  <thead><tr><th>Item</th><th>On hand</th><th>Avg. cost</th><th>Sales</th><th>Est. profit</th></tr></thead>
                  <tbody>
                    {inventory.map((item) => (
                      <tr key={item.name}>
                        <td><span className="item-avatar">{item.name.charAt(0).toUpperCase()}</span><div><strong>{item.name}</strong><small>{item.bought} bought · {item.sold} sold</small></div></td>
                        <td><strong>{item.onHand}</strong></td>
                        <td>{money.format(item.averageCost / 100)}</td>
                        <td>{money.format(item.revenue / 100)}</td>
                        <td className={item.profit < 0 ? "negative" : "profit"}>{money.format(item.profit / 100)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
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
                      <p>{formatDate(entry.transactionDate)} · {entry.source} · {entry.quantity} × {money.format(entry.unitPriceCents / 100)}{entry.notes ? ` · ${entry.notes}` : ""}</p>
                    </div>
                    <div className="transaction-amount">
                      <strong>{entry.type === "buy" ? "−" : "+"}{money.format((entry.quantity * entry.unitPriceCents) / 100)}</strong>
                      <button type="button" onClick={() => void removeTransaction(entry.id)} aria-label={`Remove ${entry.itemName} transaction`}>Remove</button>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
        </div>
      </section>

      <footer><span>LOTLY</span><p>A clearer view of every buy and sell.</p><a href="#top">Back to top ↑</a></footer>
    </main>
  );
}
