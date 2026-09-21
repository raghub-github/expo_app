/** Fire-and-forget customer + merchant + rider push after a cancel (dashboard path). */
export async function notifyOrderCancelled(args: {
  ordersCoreId: number;
  fromStatus?: string | null;
  storeName?: string | null;
  reason?: string | null;
}): Promise<void> {
  const backendUrl =
    process.env.BACKEND_INTERNAL_URL ??
    process.env.BACKEND_URL ??
    process.env.NEXT_PUBLIC_BACKEND_URL;
  const token = process.env.INTERNAL_API_TOKEN;
  if (!backendUrl || !token) {
    console.warn("[order-cancel] BACKEND_URL or INTERNAL_API_TOKEN missing — skip cancel notify");
    return;
  }
  try {
    await fetch(`${backendUrl.replace(/\/$/, "")}/v1/internal/orders/cancel-notify`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-internal-token": token,
      },
      body: JSON.stringify({
        orders_core_id: args.ordersCoreId,
        from_status: args.fromStatus ?? undefined,
        store_name: args.storeName ?? undefined,
        reason: args.reason ?? undefined,
      }),
    });
  } catch (err) {
    console.warn("[order-cancel] notify failed:", err);
  }
}
