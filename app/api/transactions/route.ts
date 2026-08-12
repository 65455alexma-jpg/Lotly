import { NextRequest, NextResponse } from "next/server";
import {
  addTransaction,
  availableStock,
  deleteTransaction,
  listTransactions,
  safeErrorMessage,
  updateTransaction,
  updateTransactionPrice,
} from "../store";

export const runtime = "nodejs";

const categories = ["Cloth", "Bag", "Watch"] as const;

function serialize(transaction: Awaited<ReturnType<typeof addTransaction>>) {
  return transaction;
}

export async function GET() {
  try {
    const transactions = await listTransactions();
    return NextResponse.json({ transactions: transactions.map(serialize) });
  } catch (error) {
    return NextResponse.json({ error: safeErrorMessage(error, "Could not load transactions.") }, { status: 500 });
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
    const category = input.category;
    const notes = String(input.notes ?? "").trim();

    if (
      (type !== "buy" && type !== "sell") ||
      (source !== "eBay" && source !== "Vinted" && source !== "Other") ||
      !categories.includes(category as (typeof categories)[number]) ||
      !itemName ||
      !Number.isFinite(quantity) ||
      quantity <= 0 ||
      !Number.isFinite(unitPrice) ||
      unitPrice <= 0 ||
      !/^\d{4}-\d{2}-\d{2}$/.test(transactionDate)
    ) {
      return NextResponse.json({ error: "Please complete all required fields with valid values." }, { status: 400 });
    }
    if (itemName.length > 80 || notes.length > 160) {
      return NextResponse.json({ error: "The item name or note is too long." }, { status: 400 });
    }

    if (type === "sell") {
      const available = await availableStock(itemName);
      if (available < quantity) {
        return NextResponse.json({ error: `Only ${available} units of ${itemName} are available to sell.` }, { status: 400 });
      }
    }

    const transaction = await addTransaction({
      type,
      itemName,
      quantity,
      unitPriceCents: Math.round(unitPrice * 100),
      transactionDate,
      source,
      category: category as (typeof categories)[number],
      notes,
    });

    return NextResponse.json({ transaction: serialize(transaction) }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: safeErrorMessage(error, "Could not save this transaction.") }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const input = (await request.json()) as Record<string, unknown>;
    const id = Number(input.id);
    const hasFullEdit = "itemName" in input || "quantity" in input || "transactionDate" in input || "source" in input || "category" in input || "notes" in input || "type" in input;

    if (!Number.isInteger(id) || id <= 0) {
      return NextResponse.json({ error: "Transaction not found." }, { status: 404 });
    }

    if (!hasFullEdit) {
      const unitPrice = Number(input.unitPrice);
      if (!Number.isFinite(unitPrice) || unitPrice <= 0) {
        return NextResponse.json({ error: "Please choose a valid price." }, { status: 400 });
      }

      const transaction = await updateTransactionPrice(id, Math.round(unitPrice * 100));
      if (!transaction) {
        return NextResponse.json({ error: "Transaction not found." }, { status: 404 });
      }

      return NextResponse.json({ transaction: serialize(transaction) });
    }

    const type = input.type;
    const itemName = String(input.itemName ?? "").trim();
    const quantity = Number(input.quantity);
    const unitPrice = Number(input.unitPrice);
    const transactionDate = String(input.transactionDate ?? "");
    const source = input.source;
    const category = input.category;
    const notes = String(input.notes ?? "").trim();

    if (
      (type !== "buy" && type !== "sell") ||
      (source !== "eBay" && source !== "Vinted" && source !== "Other") ||
      !categories.includes(category as (typeof categories)[number]) ||
      !itemName ||
      !Number.isFinite(quantity) ||
      quantity <= 0 ||
      !Number.isFinite(unitPrice) ||
      unitPrice <= 0 ||
      !/^\d{4}-\d{2}-\d{2}$/.test(transactionDate)
    ) {
      return NextResponse.json({ error: "Please complete all item details with valid values." }, { status: 400 });
    }
    if (itemName.length > 80 || notes.length > 160) {
      return NextResponse.json({ error: "The item name or note is too long." }, { status: 400 });
    }

    const transaction = await updateTransaction(id, {
      type,
      itemName,
      quantity,
      unitPriceCents: Math.round(unitPrice * 100),
      transactionDate,
      source,
      category: category as (typeof categories)[number],
      notes,
    });
    if (!transaction) {
      return NextResponse.json({ error: "Transaction not found." }, { status: 404 });
    }

    return NextResponse.json({ transaction: serialize(transaction) });
  } catch (error) {
    return NextResponse.json({ error: safeErrorMessage(error, "Could not update this price.") }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const id = Number(request.nextUrl.searchParams.get("id"));
    if (!Number.isInteger(id) || id <= 0) {
      return NextResponse.json({ error: "Invalid transaction." }, { status: 400 });
    }

    const transactions = await listTransactions();
    const transaction = transactions.find((entry) => entry.id === id);
    if (!transaction) {
      return NextResponse.json({ error: "Transaction not found." }, { status: 404 });
    }
    if (transaction.type === "buy") {
      const available = await availableStock(transaction.itemName);
      if (available < transaction.quantity) {
        return NextResponse.json({ error: "Remove the related sales before removing this purchase." }, { status: 400 });
      }
    }

    await deleteTransaction(id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: safeErrorMessage(error, "Could not remove this transaction.") }, { status: 500 });
  }
}
