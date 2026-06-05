/**
 * After admin verifies rider vehicle, enqueue Expo push via backend internal route.
 */
export async function triggerRiderVehicleVerifiedNotify(riderId: number): Promise<void> {
  const backendUrl = process.env.BACKEND_URL ?? process.env.NEXT_PUBLIC_BACKEND_URL;
  const secret = process.env.BACKEND_SCHEDULE_TICK_SECRET;
  if (!backendUrl || !secret) return;

  const base = backendUrl.replace(/\/+$/, "");
  try {
    await fetch(`${base}/v1/internal/riders/${riderId}/vehicle-verified-notify`, {
      method: "POST",
      headers: { "X-Internal-Secret": secret },
    });
  } catch (err) {
    console.warn("[triggerRiderVehicleVerifiedNotify] request failed:", err);
  }
}
