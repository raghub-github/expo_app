import type { SupabaseClient } from '@supabase/supabase-js';
import type { MerchantOrderActionSource } from '@/lib/merchantOrderFoodActions';

export const TIMELINE_STATUS_READY = 'Ready';
export const TIMELINE_STATUS_DISPATCHED = 'Dispatched';
export const TIMELINE_STATUS_HANDOVER = 'Handed Over to Rider';
export const TIMELINE_STATUS_PICKED_UP = 'Picked Up';

export type FoodStatusTimelineInput = {
  orderCorePk: number;
  status: string;
  previousStatus?: string | null;
  actorType: 'store' | 'rider' | 'system' | 'admin' | 'customer' | 'agent';
  statusMessage?: string | null;
  occurredAt?: string | null;
  metadata?: Record<string, unknown>;
  actorId?: number | null;
  actorName?: string | null;
};

async function fetchLastTimelineStatus(
  db: SupabaseClient,
  orderCorePk: number
): Promise<string | null> {
  const { data } = await db
    .from('order_timelines')
    .select('status')
    .eq('order_id', orderCorePk)
    .order('occurred_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(1)
    .maybeSingle();
  return data?.status ?? null;
}

/** Idempotent append: skips if this exact status already exists for the order. */
export async function appendOrderFoodStatusTimeline(
  db: SupabaseClient,
  input: FoodStatusTimelineInput
): Promise<boolean> {
  const { data: existing } = await db
    .from('order_timelines')
    .select('id')
    .eq('order_id', input.orderCorePk)
    .eq('status', input.status)
    .limit(1)
    .maybeSingle();
  if (existing?.id) return false;

  const lastStatus = await fetchLastTimelineStatus(db, input.orderCorePk);
  const occurredAt = input.occurredAt?.trim() || new Date().toISOString();
  const message = input.statusMessage?.trim() || input.status;

  const { error } = await db.from('order_timelines').insert({
    order_id: input.orderCorePk,
    status: input.status,
    previous_status: lastStatus ?? input.previousStatus ?? null,
    actor_type: input.actorType,
    actor_id: input.actorId ?? null,
    actor_name: input.actorName ?? null,
    status_message: message,
    metadata: input.metadata ?? {},
    occurred_at: occurredAt,
  });

  if (error) throw error;
  return true;
}

export async function appendReadyTimeline(
  db: SupabaseClient,
  input: {
    orderCorePk: number;
    previousStatus?: string | null;
    actionSource?: MerchantOrderActionSource;
    preparedAt?: string | null;
    prepReadyByAt?: string | null;
  }
): Promise<void> {
  await appendOrderFoodStatusTimeline(db, {
    orderCorePk: input.orderCorePk,
    status: TIMELINE_STATUS_READY,
    previousStatus: input.previousStatus,
    actorType: 'store',
    statusMessage: 'Order marked ready for pickup',
    occurredAt: input.preparedAt ?? undefined,
    metadata: {
      action_source: input.actionSource ?? 'website',
      prep_ready_by_at: input.prepReadyByAt ?? null,
    },
  });
}

export async function appendDispatchedTimeline(
  db: SupabaseClient,
  input: {
    orderCorePk: number;
    previousStatus?: string | null;
    actionSource?: MerchantOrderActionSource;
    dispatchedAt?: string | null;
    actorName?: string | null;
  }
): Promise<void> {
  await appendOrderFoodStatusTimeline(db, {
    orderCorePk: input.orderCorePk,
    status: TIMELINE_STATUS_DISPATCHED,
    previousStatus: input.previousStatus,
    actorType: input.actionSource === 'admin' ? 'agent' : 'store',
    actorName: input.actorName ?? null,
    statusMessage: 'Order dispatched',
    occurredAt: input.dispatchedAt ?? undefined,
    metadata: {
      action_source: input.actionSource ?? 'website',
    },
  });
}

export async function appendHandoverTimeline(
  db: SupabaseClient,
  input: {
    orderCorePk: number;
    handedOverAt: string;
    verifiedBy?: string;
  }
): Promise<void> {
  await appendOrderFoodStatusTimeline(db, {
    orderCorePk: input.orderCorePk,
    status: TIMELINE_STATUS_HANDOVER,
    actorType: 'store',
    statusMessage: 'Food handed over to delivery partner (pickup OTP verified)',
    occurredAt: input.handedOverAt,
    metadata: { verified_by: input.verifiedBy ?? 'merchant' },
  });
}

export async function appendRiderPickedUpTimeline(
  db: SupabaseClient,
  input: {
    orderCorePk: number;
    pickedUpAt: string;
    riderId?: number | null;
    riderName?: string | null;
  }
): Promise<void> {
  await appendOrderFoodStatusTimeline(db, {
    orderCorePk: input.orderCorePk,
    status: TIMELINE_STATUS_PICKED_UP,
    actorType: 'rider',
    actorId: input.riderId ?? null,
    actorName: input.riderName ?? null,
    statusMessage: input.riderName
      ? `Picked up by ${input.riderName}`
      : 'Order picked up by delivery partner',
    occurredAt: input.pickedUpAt,
    metadata: {
      rider_id: input.riderId ?? null,
      rider_name: input.riderName ?? null,
    },
  });
}
