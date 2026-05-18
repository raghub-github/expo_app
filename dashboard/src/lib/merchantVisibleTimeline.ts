import type { OrdersFoodRow } from '@/lib/types/food-orders';
import {
  normalizeActionMode,
  normalizeActionSource,
  type MerchantOrderActionSource,
} from '@/lib/merchantOrderFoodActions';

export type TimelineActorDetail =
  | {
      variant: 'admin';
      acceptedBy: string;
      source: string;
    }
  | {
      variant: 'merchant';
      name?: string;
      phone?: string;
      email?: string;
      role: string;
      source: string;
      acceptedThrough: string;
    };

export type MerchantVisibleTimelineStep = {
  key: string;
  label: string;
  at: string | null;
  completed: boolean;
  showView: boolean;
  actorAction: 'accepted' | 'ready' | null;
};

export type MerchantOrderActionForTimeline = {
  to_status: string;
  action_source?: string | null;
  actor_label?: string | null;
  metadata?: Record<string, unknown> | null;
  created_at?: string;
};

const SOURCE_DISPLAY: Record<MerchantOrderActionSource, string> = {
  app: 'Merchant App',
  website: 'Partner Site',
  admin: 'Dashboard',
  api: 'API',
  system: 'System',
};

function looksLikeAcceptSystemLabel(value: string): boolean {
  return /^accepted\b/i.test(value.trim()) || /^cancelled\b/i.test(value.trim());
}

export function parseAcceptedThroughLabel(label: string | null | undefined): string {
  const t = (label || '').trim();
  if (!t) return '';
  if (/^accepted by gatimitra team/i.test(t)) return 'Accepted by GatiMitra Team';
  const m = t.match(/^Accepted\s*-\s*(.+)$/i);
  return m ? m[1].trim() : t;
}

function defaultAcceptedThrough(source: MerchantOrderActionSource, mode: 'auto' | 'manual'): string {
  if (source === 'app') {
    return mode === 'auto' ? 'Merchant App (Auto)' : 'Merchant App (Manual)';
  }
  if (source === 'admin') return 'Accepted by GatiMitra Team';
  if (source === 'system') return 'System (Auto)';
  return mode === 'auto' ? 'Merchant portal (Auto)' : 'Merchant portal (Manual)';
}

function normStatus(s: string | null | undefined): string {
  return String(s || '')
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, '_');
}

function pickMetaString(meta: Record<string, unknown>, keys: string[]): string {
  for (const k of keys) {
    const v = meta[k];
    if (v != null && String(v).trim()) return String(v).trim();
  }
  return '';
}

export function parseActorDetailFromAction(
  action: MerchantOrderActionForTimeline | null | undefined,
  fallbackLabel?: string | null
): TimelineActorDetail {
  const meta = (action?.metadata && typeof action.metadata === 'object' ? action.metadata : {}) as Record<
    string,
    unknown
  >;
  const source = normalizeActionSource(action?.action_source ?? meta.action_source);
  const mode = normalizeActionMode(meta.accept_mode ?? meta.cancel_mode);
  const labelText = (fallbackLabel || action?.actor_label || '').trim();
  const acceptedThrough =
    parseAcceptedThroughLabel(labelText) || defaultAcceptedThrough(source, mode);

  if (source === 'admin') {
    return {
      variant: 'admin',
      acceptedBy: 'GatiMitra Team',
      source: 'Dashboard',
    };
  }

  let name = pickMetaString(meta, ['name', 'actor_name', 'user_name', 'full_name', 'accepted_by_name']);
  if (name && looksLikeAcceptSystemLabel(name)) name = '';

  const phone = pickMetaString(meta, ['phone', 'mobile', 'phone_number', 'user_phone', 'actor_phone']);
  const email = pickMetaString(meta, ['email', 'user_email', 'actor_email']);
  const role = pickMetaString(meta, ['role', 'actor_role', 'user_role']) || 'Owner';

  return {
    variant: 'merchant',
    ...(name ? { name } : {}),
    ...(phone ? { phone } : {}),
    ...(email ? { email } : {}),
    role,
    source: SOURCE_DISPLAY[source],
    acceptedThrough,
  };
}

export function findActionForStep(
  actions: MerchantOrderActionForTimeline[],
  statuses: string[]
): MerchantOrderActionForTimeline | undefined {
  const want = new Set(statuses.map(normStatus));
  return actions.find((a) => want.has(normStatus(a.to_status)));
}

export function buildMerchantVisibleTimeline(
  order: OrdersFoodRow,
  opts?: { riderReachedAt?: string | null }
): MerchantVisibleTimelineStep[] {
  const status = normStatus(order.order_status);
  const isTerminal = status === 'CANCELLED' || status === 'RTO';

  const defs: Array<Omit<MerchantVisibleTimelineStep, 'completed'> & { atFn: () => string | null }> = [
    {
      key: 'placed',
      label: 'Placed',
      atFn: () => order.created_at ?? null,
      showView: false,
      actorAction: null,
    },
    {
      key: 'accepted',
      label: 'Accepted',
      atFn: () => order.accepted_at ?? null,
      showView: true,
      actorAction: 'accepted',
    },
    {
      key: 'rider_arrived',
      label: 'Delivery partner arrived',
      atFn: () => opts?.riderReachedAt ?? null,
      showView: false,
      actorAction: null,
    },
    {
      key: 'ready',
      label: 'Ready',
      atFn: () => order.prepared_at ?? null,
      showView: true,
      actorAction: 'ready',
    },
    {
      key: 'picked_up',
      label: 'Picked up',
      atFn: () => order.rider_picked_up_at ?? order.dispatched_at ?? null,
      showView: false,
      actorAction: null,
    },
    {
      key: 'delivered',
      label: 'Delivered',
      atFn: () => order.delivered_at ?? null,
      showView: false,
      actorAction: null,
    },
  ];

  const withAt = defs.map((d) => ({ ...d, at: d.atFn() }));

  let lastCompleted = -1;
  withAt.forEach((s, i) => {
    if (s.at) lastCompleted = i;
  });

  const statusOrder = [
    'CREATED',
    'NEW',
    'ACCEPTED',
    'PREPARING',
    'READY_FOR_PICKUP',
    'OUT_FOR_DELIVERY',
    'DELIVERED',
  ];
  const statusIdx = statusOrder.indexOf(status);

  return withAt.map((s, i) => {
    const stepStatusIdx =
      s.key === 'placed'
        ? 0
        : s.key === 'accepted'
          ? 1
          : s.key === 'rider_arrived'
            ? 2
            : s.key === 'ready'
              ? 3
              : s.key === 'picked_up'
                ? 4
                : 5;

    let completed = false;
    if (s.at) completed = true;
    else if (!isTerminal && statusIdx >= 0 && statusIdx >= stepStatusIdx) completed = true;
    else if (isTerminal && i <= lastCompleted) completed = true;

    return {
      key: s.key,
      label: s.label,
      at: s.at,
      completed,
      showView: s.showView,
      actorAction: s.actorAction,
    };
  });
}

export function formatTimelineClock(s: string | null | undefined): string {
  if (!s) return '';
  return new Date(s).toLocaleTimeString('en-IN', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}
