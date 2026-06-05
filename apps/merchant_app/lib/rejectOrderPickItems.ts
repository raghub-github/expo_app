import type { LineItem } from "@/hooks/useOrders";

export type RejectPickItem = {
  menuItemId: number;
  name: string;
  quantity: number;
};

export function lineItemsForRejectPick(items: LineItem[]): RejectPickItem[] {
  const seen = new Set<number>();
  const out: RejectPickItem[] = [];
  for (const it of items) {
    const id = it.menuItemId;
    if (id == null || !Number.isFinite(Number(id))) continue;
    const menuItemId = Number(id);
    if (seen.has(menuItemId)) continue;
    seen.add(menuItemId);
    out.push({
      menuItemId,
      name: String(it.name ?? "Item").trim() || "Item",
      quantity: Math.max(1, Number(it.qty) || 1),
    });
  }
  return out;
}
