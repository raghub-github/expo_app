import type { OrdersFoodRow } from '@/hooks/useFoodOrders';
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
  actorAction: 'accepted' | 'ready' | 'cancelled' | null;
  /** Visual tone for terminal / special steps */
  tone?: 'success' | 'cancel' | 'rto';
  /** Short detail under the time (e.g. cancel reason) */
  detail?: string | null;
};

export type MerchantOrderActionForTimeline = {
  to_status: string;
  action_source?: string | null;
  actor_label?: string | null;
  metadata?: Record<string, unknown> | null;
  created_at?: string;
};

export type TimelineEntryLike = {
  status: string;
  occurred_at: string;
  status_message?: string | null;
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

function pickTimestamp(...candidates: (string | null | undefined)[]): string | null {
  let best: string | null = null;
  let bestMs = Infinity;
  for (const c of candidates) {
    if (!c) continue;
    const ms = new Date(c).getTime();
    if (!Number.isFinite(ms)) continue;
    if (ms < bestMs) {
      bestMs = ms;
      best = c;
    }
  }
  return best;
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

function actionAt(actions: MerchantOrderActionForTimeline[], statuses: string[]): string | null {
  const act = findActionForStep(actions, statuses);
  return act?.created_at ?? null;
}

function mapTimelineStatusToKey(status: string): string | null {
  const u = String(status || '')
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_');

  if (!u) return null;
  if (u.includes('placed') || u.includes('created') || u === 'new' || u === 'order_placed') return 'placed';
  if (u.includes('accept')) return 'accepted';
  if (u.includes('prepar')) return 'preparing';
  if (u.includes('ready') || u === 'dispatch_ready') return 'ready';
  if (u.includes('rider') && (u.includes('arriv') || u.includes('reach'))) return 'rider_arrived';
  if (u.includes('handover') || u.includes('handed')) return 'picked_up';
  if (u.includes('picked') || u.includes('pick_up') || u.includes('out_for') || u.includes('dispatch')) {
    return 'picked_up';
  }
  if (u.includes('deliver')) return 'delivered';
  if (u.includes('cancel')) return 'cancelled';
  if (u === 'rto' || u.includes('return')) return 'rto';
  return null;
}

function absorbTimelineEntries(
  entries: TimelineEntryLike[],
  atByKey: Record<string, string | null>
): void {
  for (const e of entries) {
    const key = mapTimelineStatusToKey(e.status);
    if (!key) continue;
    atByKey[key] = pickTimestamp(atByKey[key], e.occurred_at);
  }
}

type StepDef = {
  key: string;
  label: string;
  showView: boolean;
  actorAction: MerchantVisibleTimelineStep['actorAction'];
  tone?: MerchantVisibleTimelineStep['tone'];
  resolveAt: (ctx: {
    order: OrdersFoodRow;
    actions: MerchantOrderActionForTimeline[];
    riderReachedAt: string | null;
    atByKey: Record<string, string | null>;
  }) => string | null;
  resolveDetail?: (order: OrdersFoodRow) => string | null;
};

const FLOW_STEP_DEFS: StepDef[] = [
  {
    key: 'placed',
    label: 'Placed',
    showView: false,
    actorAction: null,
    resolveAt: ({ order, atByKey }) => pickTimestamp(order.created_at, atByKey.placed),
  },
  {
    key: 'accepted',
    label: 'Accepted',
    showView: true,
    actorAction: 'accepted',
    resolveAt: ({ order, actions, atByKey }) =>
      pickTimestamp(order.accepted_at, actionAt(actions, ['ACCEPTED']), atByKey.accepted),
  },
  {
    key: 'preparing',
    label: 'Preparing',
    showView: false,
    actorAction: null,
    resolveAt: ({ order, actions, atByKey }) =>
      pickTimestamp(order.preparing_at, actionAt(actions, ['PREPARING']), atByKey.preparing),
  },
  {
    key: 'rider_arrived',
    label: 'Delivery partner arrived',
    showView: false,
    actorAction: null,
    resolveAt: ({ riderReachedAt, atByKey }) => pickTimestamp(riderReachedAt, atByKey.rider_arrived),
  },
  {
    key: 'ready',
    label: 'Ready',
    showView: true,
    actorAction: 'ready',
    resolveAt: ({ order, actions, atByKey }) =>
      pickTimestamp(
        order.prepared_at,
        actionAt(actions, ['READY_FOR_PICKUP', 'READY', 'PREPARED']),
        atByKey.ready
      ),
  },
  {
    key: 'picked_up',
    label: 'Picked up',
    showView: false,
    actorAction: null,
    resolveAt: ({ order, actions, atByKey }) =>
      pickTimestamp(
        order.rider_picked_up_at,
        order.dispatched_at,
        order.handed_over_to_rider_at,
        actionAt(actions, ['OUT_FOR_DELIVERY', 'PICKED_UP', 'PICKEDUP']),
        atByKey.picked_up
      ),
  },
  {
    key: 'delivered',
    label: 'Delivered',
    showView: false,
    actorAction: null,
    tone: 'success',
    resolveAt: ({ order, actions, atByKey }) =>
      pickTimestamp(order.delivered_at, actionAt(actions, ['DELIVERED']), atByKey.delivered),
  },
];

const CANCELLED_DEF: StepDef = {
  key: 'cancelled',
  label: 'Cancelled',
  showView: true,
  actorAction: 'cancelled',
  tone: 'cancel',
  resolveAt: ({ order, actions, atByKey }) =>
    pickTimestamp(order.cancelled_at, actionAt(actions, ['CANCELLED']), atByKey.cancelled),
  resolveDetail: (order) =>
    (order.rejected_reason || order.cancelled_by_label || null)?.trim() || null,
};

const RTO_DEF: StepDef = {
  key: 'rto',
  label: 'RTO',
  showView: false,
  actorAction: null,
  tone: 'rto',
  resolveAt: ({ order, actions, atByKey }) =>
    pickTimestamp(order.cancelled_at, actionAt(actions, ['RTO', 'FAILED']), atByKey.rto),
};

/**
 * Merchant order timeline: only steps with a captured timestamp (plus Placed when known).
 * Cancellation / RTO appear when recorded on the order or in timeline/actions.
 */
export function buildMerchantVisibleTimeline(
  order: OrdersFoodRow,
  opts?: {
    riderReachedAt?: string | null;
    actions?: MerchantOrderActionForTimeline[];
    timelineEntries?: TimelineEntryLike[];
  }
): MerchantVisibleTimelineStep[] {
  const status = normStatus(order.order_status);
  const actions = opts?.actions ?? [];
  const atByKey: Record<string, string | null> = {};

  absorbTimelineEntries(opts?.timelineEntries ?? [], atByKey);

  const ctx = {
    order,
    actions,
    riderReachedAt: opts?.riderReachedAt ?? null,
    atByKey,
  };

  const defs: StepDef[] = [...FLOW_STEP_DEFS];

  const showCancelled =
    status === 'CANCELLED' || !!order.cancelled_at || !!atByKey.cancelled || !!actionAt(actions, ['CANCELLED']);
  const showRto =
    status === 'RTO' ||
    order.is_rto === true ||
    !!atByKey.rto ||
    !!actionAt(actions, ['RTO', 'FAILED']);

  if (showCancelled) defs.push(CANCELLED_DEF);
  if (showRto) defs.push(RTO_DEF);

  const steps: MerchantVisibleTimelineStep[] = [];

  for (const def of defs) {
    const at = def.resolveAt(ctx);
    if (!at && def.key !== 'placed') continue;

    steps.push({
      key: def.key,
      label: def.label,
      at,
      completed: !!at,
      showView: def.showView,
      actorAction: def.actorAction,
      tone: def.tone,
      detail: def.resolveDetail?.(order) ?? null,
    });
  }

  return steps
    .filter((s) => s.at)
    .sort((a, b) => new Date(a.at!).getTime() - new Date(b.at!).getTime());
}

export function formatTimelineClock(s: string | null | undefined): string {
  if (!s) return '';
  return new Date(s).toLocaleTimeString('en-IN', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}
