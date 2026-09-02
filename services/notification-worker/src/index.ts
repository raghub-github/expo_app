/**
 * notification-worker — consumes q.push.send, fans out to Expo.
 *
 * Lifecycle:
 *   - boots, loads .env, opens Redis (via @gatimitra/redis)
 *   - starts a BullMQ worker on the PUSH_SEND queue with concurrency 4
 *   - on SIGTERM, drains in-flight jobs (up to 30s) then exits
 *
 * Failure modes:
 *   - Network / Expo 5xx → BullMQ retries 3× with exp backoff (defaults in producer)
 *   - Expo 4xx (bad token, expired) → considered terminal; we log and ack
 *
 * Observability:
 *   - Every job logs start / done with id + counts
 *   - Worker errors logged via worker.on("error") in @gatimitra/queue/worker
 *   - Ticket outcomes reported to backend delivery-status for campaign KPIs
 */
import "dotenv/config";
import { QUEUE_NAMES, attachLifecycleHandlers, runWorker } from "@gatimitra/queue";
import { sendPush } from "./expoPush.js";
import { reportDeadTokens } from "./reportDeadTokens.js";
import { reportDeliveryStatus } from "./reportDeliveryStatus.js";

const log = {
  info: (...args: unknown[]) => console.log("[notif]", ...args),
  warn: (...args: unknown[]) => console.warn("[notif]", ...args),
  error: (...args: unknown[]) => console.error("[notif]", ...args),
};

function requireEnv(keys: string[]): void {
  const missing = keys.filter((k) => !process.env[k] || !process.env[k]!.trim());
  if (missing.length > 0) {
    console.error(`[notif] missing required env: ${missing.join(", ")}`);
    console.error("[notif] copy services/notification-worker/.env.example → .env and fill it in");
    process.exit(2);
  }
}
requireEnv(["REDIS_URL"]);

log.info("notification-worker booting");
log.info("connecting Redis…", process.env.REDIS_URL ? "(REDIS_URL set)" : "(REDIS_URL missing — will throw)");

runWorker(
  QUEUE_NAMES.PUSH_SEND,
  async (job, jobLog) => {
    const payload = job.data as {
      to: string | string[];
      title?: string;
      body?: string;
      data?: Record<string, unknown>;
      screen?: string;
      imageUrl?: string;
      sound?: string | null;
      channelId?: string;
      contentAvailable?: boolean;
    };

    const data: Record<string, unknown> = { ...(payload.data ?? {}) };
    const screen =
      (typeof payload.screen === "string" && payload.screen.trim()) ||
      (typeof data.screen === "string" && String(data.screen).trim()) ||
      (typeof data.deepLink === "string" && String(data.deepLink).trim()) ||
      "";
    if (screen) {
      data.screen = screen;
      data.deepLink = screen;
      data.deep_link = screen;
    }

    const result = await sendPush(
      {
        to: payload.to,
        title: payload.title,
        body: payload.body,
        data,
        sound: payload.sound ?? undefined,
        channelId: payload.channelId,
        imageUrl: payload.imageUrl,
        contentAvailable: payload.contentAvailable,
      },
      jobLog,
    );
    jobLog.info(
      `[push] accepted=${result.accepted} failed=${result.failed} chunks=${result.chunks} dead=${result.deadTokens.length}`,
    );
    if (result.deadTokens.length > 0) {
      void reportDeadTokens(result.deadTokens, jobLog);
    }

    const notificationId =
      typeof data.notification_id === "string" ? data.notification_id : null;
    if (notificationId && /^[0-9a-f-]{36}$/i.test(notificationId)) {
      if (result.accepted > 0) {
        void reportDeliveryStatus([{ notificationId, status: "delivered" }], jobLog);
      } else if (result.failed > 0) {
        void reportDeliveryStatus(
          [
            {
              notificationId,
              status: "failed",
              errorCode: "EXPO_TICKETS_FAILED",
              errorMessage: `accepted=0 failed=${result.failed}`,
            },
          ],
          jobLog,
        );
      }
    }

    if (result.failed > 0 && result.accepted === 0) {
      throw new Error(`push job ${job.id}: all ${result.failed} tokens failed`);
    }
    return { accepted: result.accepted, failed: result.failed, dead: result.deadTokens.length };
  },
  { concurrency: 4, log },
);

await attachLifecycleHandlers(log);
log.info("notification-worker stopped");
process.exit(0);
