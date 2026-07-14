/** Fire-and-forget customer ETA + push after prep delay (dashboard/partnersite). */
export async function notifyCustomerPrepDelay(args: {
  ordersCoreId: number;
  additionalMinutes: 5 | 10 | 15;
  storeName?: string | null;
}): Promise<void> {
  const backendUrl =
    process.env.BACKEND_INTERNAL_URL ??
    process.env.BACKEND_URL ??
    process.env.NEXT_PUBLIC_BACKEND_URL;
  const token = process.env.INTERNAL_API_TOKEN;
  if (!backendUrl || !token) {
    console.warn("[prep-delay] BACKEND_URL or INTERNAL_API_TOKEN missing — skip customer notify");
    return;
  }
  try {
    await fetch(`${backendUrl.replace(/\/$/, "")}/v1/internal/orders/prep-delay-notify`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-internal-token": token,
      },
      body: JSON.stringify({
        orders_core_id: args.ordersCoreId,
        additional_minutes: args.additionalMinutes,
        store_name: args.storeName ?? undefined,
      }),
    });
  } catch (err) {
    console.warn("[prep-delay] customer notify failed:", err);
  }
}
