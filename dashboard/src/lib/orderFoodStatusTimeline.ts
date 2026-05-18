import { supabaseAdmin } from "@/lib/supabase/server";
import type { MerchantOrderActionSource } from "@/lib/merchantOrderFoodActions";

export const TIMELINE_STATUS_READY = "Ready";
export const TIMELINE_STATUS_HANDOVER = "Handed Over to Rider";
export const TIMELINE_STATUS_PICKED_UP = "Picked Up";

async function fetchLastTimelineStatus(orderCorePk: number): Promise<string | null> {
  if (!supabaseAdmin) return null;
  const { data } = await supabaseAdmin
    .from("order_timelines")
    .select("status")
    .eq("order_id", orderCorePk)
    .order("occurred_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data?.status ?? null;
}

export async function appendOrderFoodStatusTimeline(input: {
  orderCorePk: number;
  status: string;
  previousStatus?: string | null;
  actorType: string;
  statusMessage?: string | null;
  occurredAt?: string | null;
  metadata?: Record<string, unknown>;
  actorId?: number | null;
  actorName?: string | null;
}): Promise<boolean> {
  if (!supabaseAdmin) return false;
  const db = supabaseAdmin;

  const { data: existing } = await db
    .from("order_timelines")
    .select("id")
    .eq("order_id", input.orderCorePk)
    .eq("status", input.status)
    .limit(1)
    .maybeSingle();
  if (existing?.id) return false;

  const lastStatus = await fetchLastTimelineStatus(input.orderCorePk);
  const occurredAt = input.occurredAt?.trim() || new Date().toISOString();

  const { error } = await db.from("order_timelines").insert({
    order_id: input.orderCorePk,
    status: input.status,
    previous_status: lastStatus ?? input.previousStatus ?? null,
    actor_type: input.actorType,
    actor_id: input.actorId ?? null,
    actor_name: input.actorName ?? null,
    status_message: input.statusMessage?.trim() || input.status,
    metadata: input.metadata ?? {},
    occurred_at: occurredAt,
  });

  if (error) throw error;
  return true;
}

export async function appendReadyTimeline(input: {
  orderCorePk: number;
  previousStatus?: string | null;
  actionSource?: MerchantOrderActionSource;
  preparedAt?: string | null;
}): Promise<void> {
  await appendOrderFoodStatusTimeline({
    orderCorePk: input.orderCorePk,
    status: TIMELINE_STATUS_READY,
    previousStatus: input.previousStatus,
    actorType: "store",
    statusMessage: "Order marked ready for pickup",
    occurredAt: input.preparedAt ?? undefined,
    metadata: { action_source: input.actionSource ?? "admin" },
  });
}
