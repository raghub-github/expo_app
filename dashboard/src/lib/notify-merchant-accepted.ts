/** Fire-and-forget after dashboard/admin accept — triggers global Partner alert stop via backend. */
export async function notifyMerchantAccepted(args: {
  ordersCoreId: number;
  fromStatus?: string | null;
  storeName?: string | null;
}): Promise<void> {
  const backendUrl =
    process.env.BACKEND_INTERNAL_URL ??
    process.env.BACKEND_URL ??
    process.env.NEXT_PUBLIC_BACKEND_URL;
  const token = process.env.INTERNAL_API_TOKEN;
  if (!backendUrl || !token) {
    console.warn("[merchant-accept] BACKEND_URL or INTERNAL_API_TOKEN missing — skip accept notify");
    return;
  }
  try {
    await fetch(`${backendUrl.replace(/\/$/, "")}/v1/internal/orders/merchant-accept-notify`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-internal-token": token,
      },
      body: JSON.stringify({
        orders_core_id: args.ordersCoreId,
        from_status: args.fromStatus ?? undefined,
        store_name: args.storeName ?? undefined,
      }),
    });
  } catch (err) {
    console.warn("[merchant-accept] notify failed:", err);
  }
}
