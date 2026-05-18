/** Merchant food order status action logging and display labels. */

export type MerchantOrderActionSource = 'app' | 'website' | 'admin' | 'api' | 'system';

export type MerchantOrderActionMode = 'auto' | 'manual';

const SOURCE_LABEL: Record<MerchantOrderActionSource, string> = {
  app: 'Merchant App',
  website: 'Partner Site',
  admin: 'Admin Dashboard',
  api: 'API',
  system: 'System',
};

export function normalizeActionSource(raw: unknown): MerchantOrderActionSource {
  const s = String(raw ?? 'website').trim().toLowerCase();
  if (s === 'app' || s === 'mobile' || s === 'merchant_app') return 'app';
  if (s === 'admin' || s === 'dashboard') return 'admin';
  if (s === 'api') return 'api';
  if (s === 'system' || s === 'auto' || s === 'schedule') return 'system';
  return 'website';
}

export function normalizeActionMode(raw: unknown): MerchantOrderActionMode {
  return String(raw ?? 'manual').trim().toLowerCase() === 'auto' ? 'auto' : 'manual';
}

export function buildAcceptedByLabel(
  source: MerchantOrderActionSource,
  mode: MerchantOrderActionMode
): string {
  if (source === 'admin') return 'Accepted by GatiMitra Team';
  if (source === 'app') {
    return mode === 'auto' ? 'Accepted - Merchant App (Auto)' : 'Accepted - Merchant App (Manual)';
  }
  if (source === 'system') return 'Accepted - System (Auto)';
  return mode === 'auto'
    ? 'Accepted - Merchant portal (Auto)'
    : 'Accepted - Merchant portal (Manual)';
}

export function buildCancelledByLabel(
  source: MerchantOrderActionSource,
  mode: MerchantOrderActionMode,
  rejectedReason?: string | null
): string {
  const r = (rejectedReason ?? '').trim();
  if (/^auto cancelled/i.test(r) || (source === 'system' && mode === 'auto')) {
    return 'Auto Cancelled';
  }
  if (source === 'admin') return 'Cancelled by GatiMitra Team';
  if (source === 'app') {
    return mode === 'auto' ? 'Cancelled - Merchant App (Auto)' : 'Cancelled - Merchant App (Manual)';
  }
  if (source === 'system') return 'Auto Cancelled';
  return mode === 'auto'
    ? 'Cancelled - Merchant portal (Auto)'
    : 'Cancelled - Merchant portal (Manual)';
}

export function labelsForStatusUpdate(args: {
  newStatus: string;
  actionSource: MerchantOrderActionSource;
  actionMode: MerchantOrderActionMode;
  rejectedReason?: string | null;
}): {
  accepted_by_label?: string;
  cancelled_by_label?: string;
  actor_label: string | null;
} {
  const st = String(args.newStatus || '').toUpperCase();
  if (st === 'ACCEPTED') {
    const actor_label = buildAcceptedByLabel(args.actionSource, args.actionMode);
    return { accepted_by_label: actor_label, actor_label };
  }
  if (st === 'CANCELLED') {
    const actor_label = buildCancelledByLabel(args.actionSource, args.actionMode, args.rejectedReason);
    return { cancelled_by_label: actor_label, actor_label };
  }
  return { actor_label: null };
}

export function actionSourceLabel(source: string | null | undefined): string {
  return SOURCE_LABEL[normalizeActionSource(source)] ?? 'Partner Site';
}

export function formatStatusActionMessage(
  toStatus: string,
  source: string | null | undefined
): string {
  const src = actionSourceLabel(source);
  const st = String(toStatus || '').replace(/_/g, ' ').toLowerCase();
  return `${st.charAt(0).toUpperCase() + st.slice(1)} from ${src}`;
}

export type MerchantOrderActionRow = {
  id: number;
  from_status: string | null;
  to_status: string;
  action_source: string;
  actor_label: string | null;
  created_at: string;
};

export function computeOrderItemQuantityCount(order: {
  items?: Array<{ quantity?: number }> | null;
  food_items_count?: number | string | null;
  display_item_count?: number | null;
}): number {
  if (order.display_item_count != null && Number(order.display_item_count) > 0) {
    return Number(order.display_item_count);
  }
  if (Array.isArray(order.items) && order.items.length > 0) {
    const sum = order.items.reduce((acc, it) => acc + (Number(it.quantity) || 1), 0);
    if (sum > 0) return sum;
  }
  const db = order.food_items_count != null ? Number(order.food_items_count) : 0;
  return Number.isFinite(db) && db > 0 ? db : 0;
}
