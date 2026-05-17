/**
 * Triggers backend schedule engine for one store (same as operating-hours PATCH).
 * Keeps merchant portal / dashboard in sync with Partner Site + mobile app DB state.
 */
export async function triggerStoreScheduleTick(storeId: number): Promise<void> {
  const backendUrl = process.env.BACKEND_URL ?? process.env.NEXT_PUBLIC_BACKEND_URL;
  const scheduleTickSecret = process.env.BACKEND_SCHEDULE_TICK_SECRET;
  if (
    !backendUrl ||
    !scheduleTickSecret ||
    typeof backendUrl !== "string" ||
    typeof scheduleTickSecret !== "string"
  ) {
    return;
  }
  const base = backendUrl.replace(/\/+$/, "");
  try {
    await fetch(`${base}/v1/internal/stores/${storeId}/schedule-tick`, {
      method: "POST",
      headers: { "X-Internal-Secret": scheduleTickSecret },
    });
  } catch (err) {
    console.warn("[triggerStoreScheduleTick] request failed:", err);
  }
}
