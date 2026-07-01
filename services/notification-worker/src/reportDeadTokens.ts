/**
 * Reports dead Expo tokens back to the backend so it can purge them from
 * expo_push_tokens and merchant_store_push_tokens. Fire-and-forget: if the
 * report fails, the token just lingers in the DB until the next dead-send
 * detects it again.
 *
 * Requires BACKEND_URL + BACKEND_SCHEDULE_TICK_SECRET (same secret used
 * everywhere else for server-to-server auth).
 */

const REPORT_TIMEOUT_MS = 5_000;

export async function reportDeadTokens(
  tokens: string[],
  log: { warn: (...args: unknown[]) => void },
): Promise<void> {
  if (tokens.length === 0) return;
  const base = process.env.BACKEND_URL;
  const secret = process.env.BACKEND_SCHEDULE_TICK_SECRET;
  if (!base || !secret) {
    log.warn(`[dead-tokens] cannot report ${tokens.length} tokens: BACKEND_URL or BACKEND_SCHEDULE_TICK_SECRET missing`);
    return;
  }
  const url = base.replace(/\/$/, "") + "/v1/internal/notifications/report-dead-tokens";
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REPORT_TIMEOUT_MS);
  try {
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Internal-Secret": secret },
      body: JSON.stringify({ tokens }),
      signal: controller.signal,
    });
  } catch (e) {
    log.warn(`[dead-tokens] report failed: ${(e as Error).message}`);
  } finally {
    clearTimeout(timer);
  }
}
