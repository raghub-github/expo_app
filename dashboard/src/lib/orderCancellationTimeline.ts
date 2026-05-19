import { supabaseAdmin } from "@/lib/supabase/server";

export type CancellationTimelineInput = {
  orderCorePk: number;
  previousStatus?: string | null;
  rejectedReason?: string | null;
  actorType?: "system" | "store" | "customer" | "admin" | "agent";
  cancelMode?: "auto" | "manual";
  statusMessage?: string | null;
};

export async function appendCancellationTimeline(input: CancellationTimelineInput): Promise<void> {
  if (!supabaseAdmin) return;
  const db = supabaseAdmin;
  const reason = (input.rejectedReason ?? "").trim();
  const isAuto = input.cancelMode === "auto" || /^auto cancelled/i.test(reason);
  const message =
    input.statusMessage?.trim() || reason || (isAuto ? "Auto Cancelled" : "Cancelled");
  const actorType = input.actorType ?? (isAuto ? "system" : "store");

  const { data: existing } = await db
    .from("order_timelines")
    .select("id")
    .eq("order_id", input.orderCorePk)
    .eq("status", "Cancelled")
    .limit(1)
    .maybeSingle();
  if (existing?.id) return;

  const { data: last } = await db
    .from("order_timelines")
    .select("status")
    .eq("order_id", input.orderCorePk)
    .order("occurred_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(1)
    .maybeSingle();

  await db.from("order_timelines").insert({
    order_id: input.orderCorePk,
    status: "Cancelled",
    previous_status: last?.status ?? input.previousStatus ?? null,
    actor_type: actorType,
    status_message: message,
    metadata: {
      rejected_reason: reason || (isAuto ? "Auto Cancelled" : null),
      cancel_mode: input.cancelMode ?? (isAuto ? "auto" : "manual"),
    },
    occurred_at: new Date().toISOString(),
  });
}
