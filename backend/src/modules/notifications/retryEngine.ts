/**
 * Retry helpers for notification_dispatch_logs.
 *
 * PRD schedule: 30s → 2m → 5m → 15m (overridable via notification_settings.retry_delays_sec).
 * Terminal device errors never retry (token purged upstream).
 */
import { getSql } from "../../db/client.js";
import { isTerminalPushDeliveryError } from "../push/purgeInvalidPushTokens.js";
import { readSetting, updateLogStatus } from "./db.js";

export const DEFAULT_RETRY_DELAYS_SEC = [30, 120, 300, 900] as const;

export async function resolveRetryDelaysSec(): Promise<number[]> {
  const raw = await readSetting<number[] | unknown>("retry_delays_sec");
  if (Array.isArray(raw) && raw.every((n) => typeof n === "number" && n > 0)) {
    return raw.map((n) => Math.min(86_400, Math.max(1, Math.floor(n))));
  }
  return [...DEFAULT_RETRY_DELAYS_SEC];
}

export function delaySecForAttempt(delays: number[], attemptIndex: number): number | null {
  if (attemptIndex < 0 || attemptIndex >= delays.length) return null;
  return delays[attemptIndex] ?? null;
}

/**
 * After a failed delivery: either schedule next_retry_at or leave as permanent failed.
 * Increments retry_attempts. Returns whether a retry was scheduled.
 */
export async function markFailedWithRetrySchedule(opts: {
  notificationId: string;
  errorCode?: string;
  errorMessage?: string;
  /** Max attempts from template.retry_count (default 4 = delays length). */
  maxRetries?: number;
}): Promise<{ scheduled: boolean; nextRetryAt: string | null; attempt: number }> {
  const sql = getSql();
  const terminal = isTerminalPushDeliveryError(opts.errorCode, opts.errorMessage);
  const delays = await resolveRetryDelaysSec();
  const maxRetries = Math.max(1, opts.maxRetries ?? delays.length);

  const rows = (await sql`
    SELECT retry_attempts
    FROM public.notification_dispatch_logs
    WHERE notification_id = ${opts.notificationId}::uuid
    LIMIT 1
  `) as unknown as Array<{ retry_attempts: number }>;
  const currentAttempts = Number(rows[0]?.retry_attempts ?? 0);
  const nextAttempt = currentAttempts + 1;

  if (terminal || nextAttempt > maxRetries) {
    await sql`
      UPDATE public.notification_dispatch_logs
      SET
        status = 'failed',
        failed_at = COALESCE(failed_at, now()),
        next_retry_at = NULL,
        retry_attempts = ${nextAttempt},
        error_code = COALESCE(${opts.errorCode ?? null}, error_code),
        error_message = COALESCE(${opts.errorMessage ?? null}, error_message)
      WHERE notification_id = ${opts.notificationId}::uuid
    `;
    return { scheduled: false, nextRetryAt: null, attempt: nextAttempt };
  }

  const delaySec = delaySecForAttempt(delays, currentAttempts) ?? delays[delays.length - 1]!;
  const nextRetryAt = new Date(Date.now() + delaySec * 1000).toISOString();
  await sql`
    UPDATE public.notification_dispatch_logs
    SET
      status = 'failed',
      failed_at = COALESCE(failed_at, now()),
      next_retry_at = ${nextRetryAt}::timestamptz,
      retry_attempts = ${nextAttempt},
      error_code = COALESCE(${opts.errorCode ?? null}, error_code),
      error_message = COALESCE(${opts.errorMessage ?? null}, error_message)
    WHERE notification_id = ${opts.notificationId}::uuid
  `;
  return { scheduled: true, nextRetryAt, attempt: nextAttempt };
}

export type DueRetryRow = {
  notification_id: string;
  device_token: string | null;
  title: string | null;
  body: string | null;
  image_url: string | null;
  deep_link: string | null;
  template_code: string | null;
  priority: string | null;
  recipient_role: string;
  platform: string | null;
  channel: string;
  metadata: Record<string, unknown> | null;
  retry_attempts: number;
  campaign_id: number | null;
};

/** Claim due failed rows for retry (SKIP LOCKED). */
export async function claimDueRetryLogs(limit: number = 50): Promise<DueRetryRow[]> {
  const sql = getSql();
  const rows = (await sql`
    UPDATE public.notification_dispatch_logs
    SET status = 'queued', next_retry_at = NULL, sent_at = NULL, failed_at = NULL
    WHERE id IN (
      SELECT id FROM public.notification_dispatch_logs
      WHERE status = 'failed'
        AND next_retry_at IS NOT NULL
        AND next_retry_at <= now()
        AND channel IN ('push', 'browser')
        AND device_token IS NOT NULL
        AND device_token <> ''
        AND device_token <> '__in_app_only__'
      ORDER BY next_retry_at ASC
      LIMIT ${limit}
      FOR UPDATE SKIP LOCKED
    )
    RETURNING
      notification_id::text,
      device_token,
      title,
      body,
      image_url,
      deep_link,
      template_code,
      priority,
      recipient_role,
      platform,
      channel,
      metadata,
      retry_attempts,
      campaign_id
  `) as unknown as DueRetryRow[];
  return rows;
}

/** Manual admin retry — resets next_retry_at to now and marks failed→queued claim path. */
export async function forceRetryNow(notificationId: string): Promise<boolean> {
  const sql = getSql();
  const rows = (await sql`
    UPDATE public.notification_dispatch_logs
    SET
      status = 'failed',
      next_retry_at = now(),
      error_code = COALESCE(error_code, 'MANUAL_RETRY'),
      error_message = COALESCE(error_message, 'Manual retry requested')
    WHERE notification_id = ${notificationId}::uuid
      AND status IN ('failed', 'queued', 'sent')
      AND channel IN ('push', 'browser')
      AND device_token IS NOT NULL
      AND coalesce(device_token, '') <> ''
    RETURNING id
  `) as unknown as Array<{ id: number }>;
  if (rows.length === 0) {
    await updateLogStatus(notificationId, "failed", {
      errorCode: "MANUAL_RETRY_DENIED",
      errorMessage: "Notification cannot be retried (missing token or wrong status).",
    });
    return false;
  }
  return true;
}
