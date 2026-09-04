import type { OrdersFoodRow } from '@/hooks/useFoodOrders';
import {
  GATIMITRA_TEAM_REJECTION_LABEL,
  humanizeMerchantCancellationReason,
  isCatalogCancellationReason,
  isMerchantAcceptTimeoutReason,
} from '@/lib/merchant-cancellation-display';
import { resolveCancelledByBrandForLedger } from '@/lib/merchant-cancellation-ledger-brand';
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

/** Earliest valid instant (e.g. order placed). */
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

/** Latest valid instant (milestone completion — avoids early stray timeline rows). */
function pickLatestTimestamp(...candidates: (string | null | undefined)[]): string | null {
  let best: string | null = null;
  let bestMs = -Infinity;
  for (const c of candidates) {
    if (!c) continue;
    const ms = new Date(c).getTime();
    if (!Number.isFinite(ms)) continue;
    if (ms > bestMs) {
      bestMs = ms;
      best = c;
    }
  }
  return best;
}

function orderStatusRank(status: string | null | undefined): number {
  const u = normStatus(status);
  if (u === 'CREATED' || u === 'NEW' || u === 'PLACED' || u === 'ORDER_PLACED') return 0;
  if (u === 'ACCEPTED') return 10;
  if (u === 'PREPARING') return 20;
  if (u === 'READY_FOR_PICKUP' || u === 'READY' || u === 'PREPARED') return 30;
  if (u === 'OUT_FOR_DELIVERY' || u === 'PICKED_UP' || u === 'DISPATCHED' || u === 'PICKEDUP') {
    return 40;
  }
  if (u === 'DELIVERED') return 50;
  if (u === 'CANCELLED') return 90;
  if (u === 'RTO' || u === 'FAILED') return 91;
  return -1;
}

/** Minimum order status rank before this milestone may appear. */
function minRankForStepKey(key: string): number {
  switch (key) {
    case 'placed':
      return 0;
    case 'accepted':
      return 10;
    case 'rider_assigned':
      return 10;
    case 'rider_arrived':
      return 10;
    case 'preparing':
      return 20;
    case 'ready':
      return 30;
    case 'picked_up':
      return 40;
    case 'delivered':
      return 50;
    default:
      return 0;
  }
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
  fallbackLabel?: string | null,
  cancelCtx?: {
    cancelledByType?: string | null;
    rejectedReason?: string | null;
  }
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

  // Cancel rows: derive Source from cancelled_by_type / label, not mis-logged action_source.
  if (cancelCtx) {
    const brand = resolveCancelledByBrandForLedger(
      cancelCtx.cancelledByType,
      labelText || cancelCtx.rejectedReason,
      null
    );
    if (brand === '__AUTO__') {
      return { variant: 'admin', acceptedBy: 'System', source: 'System' };
    }
    if (brand === 'GatiMitra') {
      return { variant: 'admin', acceptedBy: 'GatiMitra Team', source: 'GatiMitra Team' };
    }
    if (brand === 'customer') {
      return {
        variant: 'merchant',
        role: 'Customer',
        source: 'Customer App',
        acceptedThrough: labelText || 'Cancelled by customer',
      };
    }
    if (brand === 'store') {
      return {
        variant: 'merchant',
        role: 'Owner',
        source: SOURCE_DISPLAY[source === 'admin' ? 'website' : source],
        acceptedThrough: labelText || 'Cancelled by store',
      };
    }
  }

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
  if (
    u === 'rider_assigned' ||
    u.includes('delivery_partner_assigned') ||
    (u.includes('delivery') && u.includes('partner') && u.includes('assign')) ||
    (u.includes('rider') && u.includes('assign') && !u.includes('unassign'))
  ) {
    return 'rider_assigned';
  }
  if (u.includes('prepar')) return 'preparing';
  if (u.includes('ready_for_pickup') || u === 'dispatch_ready' || (u.includes('ready') && !u.includes('prepar'))) {
    return 'ready';
  }
  if (u.includes('rider') && (u.includes('arriv') || u.includes('reach'))) return 'rider_arrived';
  if (u.includes('handover') || u.includes('handed')) return 'picked_up';
  if (
    u === 'dispatched' ||
    u === 'despatched' ||
    u.includes('picked') ||
    u.includes('pick_up') ||
    u.includes('out_for') ||
    (u.includes('dispatch') && !u.includes('ready'))
  ) {
    return 'picked_up';
  }
  if (u.includes('deliver')) return 'delivered';
  if (u.includes('cancel')) return 'cancelled';
  if (u === 'rto' || u.includes('return')) return 'rto';
  return null;
}

function absorbTimelineEntries(
  entries: TimelineEntryLike[],
  atByKey: Record<string, string | null>,
  orderStatus: string | null | undefined
): void {
  const rank = orderStatusRank(orderStatus);
  for (const e of entries) {
    const key = mapTimelineStatusToKey(e.status);
    if (!key) continue;
    if (key !== 'cancelled' && key !== 'rto' && rank >= 0 && rank < minRankForStepKey(key)) {
      continue;
    }
    atByKey[key] = pickLatestTimestamp(atByKey[key], e.occurred_at);
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
    riderAssignedAt: string | null;
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
      pickLatestTimestamp(order.accepted_at, actionAt(actions, ['ACCEPTED']), atByKey.accepted),
  },
  {
    key: 'rider_assigned',
    label: 'Delivery partner assigned',
    showView: false,
    actorAction: null,
    resolveAt: ({ order, atByKey, riderAssignedAt }) => {
      if (!order.rider_id) return null;
      return pickLatestTimestamp(riderAssignedAt, atByKey.rider_assigned);
    },
  },
  {
    key: 'preparing',
    label: 'Preparing',
    showView: false,
    actorAction: null,
    resolveAt: ({ order, actions, atByKey }) =>
      pickLatestTimestamp(order.preparing_at, actionAt(actions, ['PREPARING']), atByKey.preparing),
  },
  {
    key: 'rider_arrived',
    label: 'Delivery partner arrived',
    showView: false,
    actorAction: null,
    resolveAt: ({ riderReachedAt, atByKey }) =>
      pickLatestTimestamp(riderReachedAt, atByKey.rider_arrived),
  },
  {
    key: 'ready',
    label: 'Ready',
    showView: true,
    actorAction: 'ready',
    resolveAt: ({ order, actions, atByKey }) => {
      const rank = orderStatusRank(order.order_status);
      const hasReadyAction = !!actionAt(actions, ['READY_FOR_PICKUP', 'READY', 'PREPARED']);
      if (rank < 30 && !order.prepared_at && !hasReadyAction) return null;
      return pickLatestTimestamp(
        order.prepared_at,
        actionAt(actions, ['READY_FOR_PICKUP', 'READY', 'PREPARED']),
        atByKey.ready
      );
    },
  },
  {
    key: 'picked_up',
    label: 'Dispatched',
    showView: false,
    actorAction: null,
    resolveAt: ({ order, actions, atByKey }) => {
      const rank = orderStatusRank(order.order_status);
      if (rank < 40 && !actionAt(actions, ['OUT_FOR_DELIVERY', 'PICKED_UP', 'PICKEDUP', 'DISPATCHED'])) {
        return null;
      }
      return pickLatestTimestamp(
        order.dispatched_at,
        order.rider_picked_up_at,
        order.handed_over_to_rider_at,
        actionAt(actions, ['OUT_FOR_DELIVERY', 'PICKED_UP', 'PICKEDUP', 'DISPATCHED']),
        atByKey.picked_up
      );
    },
  },
  {
    key: 'delivered',
    label: 'Delivered',
    showView: false,
    actorAction: null,
    tone: 'success',
    resolveAt: ({ order, actions, atByKey }) => {
      const rank = orderStatusRank(order.order_status);
      if (rank < 50 && !actionAt(actions, ['DELIVERED'])) return null;
      return pickLatestTimestamp(order.delivered_at, actionAt(actions, ['DELIVERED']), atByKey.delivered);
    },
  },
];

const FLOW_STEP_INDEX: Record<string, number> = Object.fromEntries(
  FLOW_STEP_DEFS.map((d, i) => [d.key, i])
);

/** Timeline row label for auto vs manual acceptance. */
export function displayLabelForAcceptedStep(order: OrdersFoodRow): string {
  const label = (order.accepted_by_label ?? '').trim();
  if (/^auto accepted$/i.test(label) || (/\bauto\b/i.test(label) && /accept/i.test(label))) {
    return 'Auto Accepted';
  }
  return 'Accepted';
}

/** Timeline row label for cancelled orders (merchant / partner UIs). */
export function displayLabelForCancelledStep(order: OrdersFoodRow): string {
  const lbl = (order.cancelled_by_label ?? '').trim();
  if (lbl) return lbl;
  const r = (order.rejected_reason ?? '').trim();
  if (/^auto cancelled/i.test(r)) return 'Auto Cancelled';
  if (/customer/i.test(r) && !isCatalogCancellationReason(r)) return 'Cancelled by customer';
  if (isCatalogCancellationReason(r) || r) return GATIMITRA_TEAM_REJECTION_LABEL;
  return GATIMITRA_TEAM_REJECTION_LABEL;
}

const CANCELLED_DEF: StepDef = {
  key: 'cancelled',
  label: 'Cancelled',
  showView: true,
  actorAction: 'cancelled',
  tone: 'cancel',
  resolveAt: ({ order, actions, atByKey }) =>
    pickTimestamp(order.cancelled_at, actionAt(actions, ['CANCELLED']), atByKey.cancelled),
  resolveDetail: (order) => {
    const rawReason = (order.rejected_reason ?? '').trim();
    const reason = humanizeMerchantCancellationReason(rawReason);
    const label = (order.cancelled_by_label ?? '').trim();
    if (isMerchantAcceptTimeoutReason(rawReason)) return null;
    if (reason && label && reason !== label) return reason;
    return reason || label || null;
  },
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
    riderAssignedAt?: string | null;
    actions?: MerchantOrderActionForTimeline[];
    timelineEntries?: TimelineEntryLike[];
  }
): MerchantVisibleTimelineStep[] {
  const status = normStatus(order.order_status);
  const actions = opts?.actions ?? [];
  const atByKey: Record<string, string | null> = {};

  absorbTimelineEntries(opts?.timelineEntries ?? [], atByKey, order.order_status);

  const ctx = {
    order,
    actions,
    riderReachedAt: opts?.riderReachedAt ?? null,
    riderAssignedAt: opts?.riderAssignedAt ?? null,
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

  const currentRank = orderStatusRank(order.order_status);

  for (const def of defs) {
    const at = def.resolveAt(ctx);
    if (!at && def.key !== 'placed') continue;

    if (
      def.key !== 'placed' &&
      def.key !== 'cancelled' &&
      def.key !== 'rto' &&
      currentRank >= 0 &&
      currentRank < minRankForStepKey(def.key)
    ) {
      continue;
    }

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
    .sort((a, b) => (FLOW_STEP_INDEX[a.key] ?? 99) - (FLOW_STEP_INDEX[b.key] ?? 99))
    .map((s) => {
      if (s.key === 'cancelled') return { ...s, label: displayLabelForCancelledStep(order) };
      if (s.key === 'accepted') return { ...s, label: displayLabelForAcceptedStep(order) };
      return s;
    });
}

export function formatTimelineDate(s: string | null | undefined): string {
  if (!s) return '';
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export function formatTimelineClock(s: string | null | undefined): string {
  if (!s) return '';
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString('en-IN', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}
