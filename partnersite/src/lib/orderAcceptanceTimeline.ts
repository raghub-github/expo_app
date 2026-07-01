import type { SupabaseClient } from '@supabase/supabase-js';
import {
  buildAcceptedByLabel,
  buildAcceptanceTimelineStatus,
  type MerchantOrderActionMode,
  type MerchantOrderActionSource,
} from '@/lib/merchantOrderFoodActions';

const DEFAULT_ETA_MINUTES = 45;

export type AcceptanceTimelineInput = {
  orderCorePk: number;
  previousStatus?: string | null;
  actionSource?: MerchantOrderActionSource;
  acceptMode?: MerchantOrderActionMode;
  acceptedByLabel?: string | null;
  statusMessage?: string | null;
  expectedByAt?: string | null;
};

/**
 * Append "Accepted" to order_timelines via Supabase (partnersite API routes).
 */
export async function appendAcceptanceTimeline(
  db: SupabaseClient,
  input: AcceptanceTimelineInput
): Promise<void> {
  const actionSource = input.actionSource ?? 'website';
  const acceptMode = input.acceptMode ?? 'manual';
  const timelineStatus = buildAcceptanceTimelineStatus(acceptMode);
  const label =
    input.acceptedByLabel?.trim() ||
    buildAcceptedByLabel(actionSource, acceptMode);
  const message = input.statusMessage?.trim() || label;
  const actorType =
    actionSource === 'admin'
      ? 'admin'
      : actionSource === 'system'
        ? 'system'
        : 'store';

  const { data: existing } = await db
    .from('order_timelines')
    .select('id')
    .eq('order_id', input.orderCorePk)
    .in('status', ['Accepted', 'Auto Accepted'])
    .limit(1)
    .maybeSingle();
  if (existing?.id) return;

  const { data: last } = await db
    .from('order_timelines')
    .select('status')
    .eq('order_id', input.orderCorePk)
    .order('occurred_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(1)
    .maybeSingle();

  const etaAt =
    input.expectedByAt?.trim() ||
    new Date(Date.now() + DEFAULT_ETA_MINUTES * 60 * 1000).toISOString();

  await db.from('order_timelines').insert({
    order_id: input.orderCorePk,
    status: timelineStatus,
    previous_status: last?.status ?? input.previousStatus ?? null,
    actor_type: actorType,
    status_message: message,
    metadata: {
      accept_mode: acceptMode,
      action_source: actionSource,
      accepted_by_label: label,
    },
    occurred_at: new Date().toISOString(),
    expected_by_at: etaAt,
  });

  const { data: core } = await db
    .from('orders_core')
    .select('estimated_delivery_time, first_eta_at')
    .eq('id', input.orderCorePk)
    .maybeSingle();

  await db
    .from('orders_core')
    .update({
      current_status: 'ACCEPTED',
      updated_at: new Date().toISOString(),
      ...(core && !core.estimated_delivery_time
        ? { estimated_delivery_time: etaAt, first_eta_at: core.first_eta_at ?? etaAt }
        : {}),
    })
    .eq('id', input.orderCorePk);
}
