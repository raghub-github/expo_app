import type { OrdersFoodRow } from '@/lib/types/food-orders';

export function normHistoryStatus(s: string | null | undefined) {
  return s === 'NEW' ? 'CREATED' : s || 'CREATED';
}

export function formatItemsSummary(order: OrdersFoodRow): string {
  const raw = order.items;
  if (Array.isArray(raw) && raw.length > 0) {
    const it = raw[0] as Record<string, unknown>;
    const name = String(it.name ?? it.item_name ?? 'Item').trim();
    const qty = Number(it.quantity ?? 1) || 1;
    const more = raw.length > 1 ? ` +${raw.length - 1} more` : '';
    return `${qty} × ${name}${more}`;
  }
  const n = order.food_items_count ?? 0;
  return n ? `${n} item${n === 1 ? '' : 's'}` : '—';
}

export function formatListTime(iso: string) {
  const d = new Date(iso);
  const time = d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true });
  const date = d.toLocaleDateString('en-IN', { day: 'numeric', month: 'long' });
  return { time, date };
}

export function historyStatusLabel(status: string) {
  const s = normHistoryStatus(status);
  const map: Record<string, string> = {
    CREATED: 'CREATED',
    ACCEPTED: 'ACCEPTED',
    PREPARING: 'PREPARING',
    READY_FOR_PICKUP: 'READY',
    OUT_FOR_DELIVERY: 'PICKED UP',
    DELIVERED: 'DELIVERED',
    RTO: 'RTO',
    CANCELLED: 'CANCELLED',
  };
  return map[s] || s.replace(/_/g, ' ');
}

export function historyBadgeClass(status: string) {
  const s = normHistoryStatus(status);
  if (s === 'PREPARING' || s === 'ACCEPTED' || s === 'CREATED') return 'bg-violet-600 text-white';
  if (s === 'READY_FOR_PICKUP') return 'bg-emerald-600 text-white';
  if (s === 'OUT_FOR_DELIVERY') return 'bg-orange-500 text-white';
  if (s === 'DELIVERED') return 'bg-green-600 text-white';
  if (s === 'RTO') return 'bg-amber-600 text-white';
  if (s === 'CANCELLED') return 'bg-red-600 text-white';
  return 'bg-slate-600 text-white';
}

export type HistoryLineItem = {
  name: string;
  quantity: number;
  total: number;
};

export function normalizeHistoryLineItems(order: OrdersFoodRow): HistoryLineItem[] {
  const raw = order.items;
  if (!Array.isArray(raw) || raw.length === 0) return [];
  return raw.map((it, idx) => {
    const row = (it && typeof it === 'object' ? it : {}) as Record<string, unknown>;
    const qty = Number(row.quantity) || 1;
    const unitPrice = Number(row.price ?? row.unit_price ?? 0);
    const total = Number(row.total ?? row.total_price ?? unitPrice * qty);
    const name = String(row.name ?? row.item_name ?? `Item ${idx + 1}`).trim();
    return { name, quantity: qty, total };
  });
}

export function historyOrderTotal(order: OrdersFoodRow, lineItems: HistoryLineItem[]): number {
  const lineSum = lineItems.reduce((acc, it) => acc + it.total, 0);
  const fromField = Number(order.food_items_total_value ?? 0);
  return fromField > 0 ? fromField : lineSum;
}
