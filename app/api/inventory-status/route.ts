import { NextRequest, NextResponse } from "next/server";
import { InventoryStatus, listStatuses, safeErrorMessage, setStatus } from "../store";

export const runtime = "nodejs";

const statuses = ["In stock", "Listed", "On hold", "Sold", "Returned"] as const;

export async function GET() {
  try {
    return NextResponse.json({ statuses: await listStatuses() });
  } catch (error) {
    return NextResponse.json({ error: safeErrorMessage(error, "Could not load inventory statuses.") }, { status: 500 });
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

    await setStatus(itemKey, status);
    return NextResponse.json({ itemKey, status });
  } catch (error) {
    return NextResponse.json({ error: safeErrorMessage(error, "Could not update the item status.") }, { status: 500 });
  }
}
