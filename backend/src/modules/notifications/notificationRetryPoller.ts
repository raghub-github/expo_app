/**
 * Re-enqueues failed push notifications on the PRD backoff schedule.
 * Runs inside the backend process alongside the campaign scheduler.
 */
import { withLock } from "@gatimitra/redis";
import { isExpoPushTokenString } from "@gatimitra/contracts";
import { deliverExpoPush } from "../push/deliverExpoPush.js";
import { sendFcmV1 } from "./fcmProvider.js";
import {
  isTerminalPushDeliveryError,
  purgeInvalidPushTokens,
} from "../push/purgeInvalidPushTokens.js";
import { updateLogStatus, syncCampaignCountsFromLogs, readSetting } from "./db.js";
import { claimDueRetryLogs, markFailedWithRetrySchedule } from "./retryEngine.js";

const LOCK_KEY = "tick:notification-retry";
const LOCK_TTL_MS = 25_000;
let timer: NodeJS.Timeout | null = null;

async function redispatchRow(row: Awaited<ReturnType<typeof claimDueRetryLogs>>[number]): Promise<void> {
  const token = (row.device_token ?? "").trim();
  if (!token) {
    await updateLogStatus(row.notification_id, "failed", {
      errorCode: "NO_PUSH_TOKEN",
      errorMessage: "Missing device token on retry.",
    });
    return;
  }

  const deepLink = row.deep_link ?? undefined;
  const data: Record<string, unknown> = {
    notification_id: row.notification_id,
    template_code: row.template_code ?? undefined,
    gmType: row.template_code ?? undefined,
    title: row.title,
    body: row.body,
    gmTitle: row.title,
    gmMessage: row.body,
    gmBanner: true,
    ...(deepLink ? { screen: deepLink, deepLink, deep_link: deepLink } : {}),
    ...(row.metadata ?? {}),
  };

  if (isExpoPushTokenString(token)) {
    const result = await deliverExpoPush({
      to: token,
      title: row.title ?? "",
      body: row.body ?? "",
      data,
      screen: deepLink,
      imageUrl: row.image_url ?? undefined,
      dispatchLogId: row.notification_id,
      templateCode: row.template_code ?? undefined,
      attempt: row.retry_attempts,
      priority: row.priority ?? undefined,
    });
    if (!result.ok) {
      const scheduled = await markFailedWithRetrySchedule({
        notificationId: row.notification_id,
        errorCode: result.mode === "queued" ? "ENQUEUE_FAILED" : "EXPO_SEND_FAILED",
        errorMessage: result.error ?? "expo_retry_failed",
      });
      if (!scheduled.scheduled && isTerminalPushDeliveryError(result.error, result.error)) {
        void purgeInvalidPushTokens([token]);
      }
      return;
    }
    await updateLogStatus(
      row.notification_id,
      result.mode === "inline" ? "delivered" : "sent",
    );
    if (row.campaign_id) await syncCampaignCountsFromLogs(row.campaign_id);
    return;
  }

  const res = await sendFcmV1({
    notificationId: row.notification_id,
    token,
    title: row.title ?? "",
    body: row.body ?? "",
    imageUrl: row.image_url,
    deepLink: row.deep_link ?? null,
    data: {
      ...(row.template_code ? { template_code: row.template_code } : {}),
      ...(row.campaign_id != null ? { campaign_id: String(row.campaign_id) } : {}),
    },
    priority: (row.priority as "low" | "normal" | "high" | "critical" | undefined) ?? "normal",
    silent: false,
  });
  if (res.ok) {
    await updateLogStatus(row.notification_id, "delivered");
    if (row.campaign_id) await syncCampaignCountsFromLogs(row.campaign_id);
    return;
  }
  const scheduled = await markFailedWithRetrySchedule({
    notificationId: row.notification_id,
    errorCode: res.errorCode,
    errorMessage: res.errorMessage,
  });
  if (!scheduled.scheduled && token && isTerminalPushDeliveryError(res.errorCode, res.errorMessage)) {
    void purgeInvalidPushTokens([token]);
  }
}

async function pollOnce(): Promise<void> {
  await withLock(LOCK_KEY, LOCK_TTL_MS, async () => {
    const due = await claimDueRetryLogs(40);
    if (due.length === 0) return;
    for (const row of due) {
      try {
        await redispatchRow(row);
      } catch (e) {
        console.error(
          `[notifications] retry failed nid=${row.notification_id}`,
          (e as Error).message,
        );
        await markFailedWithRetrySchedule({
          notificationId: row.notification_id,
          errorCode: "RETRY_DISPATCH_ERROR",
          errorMessage: (e as Error).message,
        });
      }
    }
  });
}

/** Admin / internal: run one retry pass immediately (no lock wait beyond withLock). */
export async function redispatchDueRetriesOnce(): Promise<void> {
  await pollOnce();
}

export async function startNotificationRetryPoller(): Promise<void> {
  if (timer) return;
  const intervalSec = (await readSetting<number>("scheduled_poll_interval_sec")) ?? 30;
  const ms = Math.max(10, Math.min(120, intervalSec)) * 1000;
  console.info(`[notifications] retry poller started (every ${ms / 1000}s)`);
  void pollOnce().catch((e) => console.error("[notifications] retry poll error", (e as Error).message));
  timer = setInterval(() => {
    void pollOnce().catch((e) => console.error("[notifications] retry poll error", (e as Error).message));
  }, ms);
  timer.unref?.();
}

export function stopNotificationRetryPoller(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}
