/**
 * Reports Expo ticket outcomes back to the backend so campaign analytics
 * (sent / delivered / failed) stay accurate when PUSH_USE_QUEUE=1.
 */
const REPORT_TIMEOUT_MS = 5_000;

export type DeliveryStatusUpdate = {
  notificationId: string;
  status: "delivered" | "failed" | "sent";
  errorCode?: string;
  errorMessage?: string;
};

export async function reportDeliveryStatus(
  updates: DeliveryStatusUpdate[],
  log: { warn: (...args: unknown[]) => void },
): Promise<void> {
  if (updates.length === 0) return;
  const base = process.env.BACKEND_URL;
  const secret = process.env.BACKEND_SCHEDULE_TICK_SECRET;
  if (!base || !secret) {
    log.warn(
      `[delivery-status] cannot report ${updates.length} updates: BACKEND_URL or BACKEND_SCHEDULE_TICK_SECRET missing`,
    );
    return;
  }
  const url = base.replace(/\/$/, "") + "/v1/internal/notifications/delivery-status";
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REPORT_TIMEOUT_MS);
  try {
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Internal-Secret": secret },
      body: JSON.stringify({ updates }),
      signal: controller.signal,
    });
  } catch (e) {
    log.warn(`[delivery-status] report failed: ${(e as Error).message}`);
  } finally {
    clearTimeout(timer);
  }
}
