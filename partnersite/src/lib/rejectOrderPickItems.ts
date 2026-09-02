import type { NormalizedOrderLineItem } from '@/lib/orderLineItems';
import { resolveLineItemMenuPk } from '@/lib/resolveLineItemMenuPk';

export type RejectPickItem = {
  menuItemId: number | string;
  name: string;
  quantity: number;
};

export function lineItemsForRejectPick(items: NormalizedOrderLineItem[]): RejectPickItem[] {
  const seen = new Set<string>();
  const out: RejectPickItem[] = [];
  for (const it of items) {
    const menuItemId = resolveLineItemMenuPk(it);
    if (menuItemId == null) continue;
    const key = String(menuItemId);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      menuItemId,
      name: String(it.name ?? 'Item').trim() || 'Item',
      quantity: Math.max(1, Number(it.quantity) || 1),
    });
  }
  return out;
}
