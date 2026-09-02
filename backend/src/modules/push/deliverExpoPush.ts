/**
 * Deliver an Expo push with deep-link data correctly attached.
 *
 * Queue-first (default PUSH_USE_QUEUE=true):
 *   1) Enqueue BullMQ `q.push.send` when queue mode is on
 *   2) On enqueue failure → send via Expo Push API inline (emergency fallback)
 *
 * Always merges `screen` into `data.screen` + `data.deepLink` so client navigators work.
 */
import { enqueue, QUEUE_NAMES, type PushSendJob } from "@gatimitra/queue";
import { incrCounter } from "@gatimitra/logger";
import { sendExpoPushWithRetry, countTicketOutcomes } from "./expoPushSend.js";
import { getEnv } from "../../config/env.js";
import { purgeInvalidPushTokens } from "./purgeInvalidPushTokens.js";

function mergeDeepLinkData(payload: PushSendJob): Record<string, unknown> {
  const data: Record<string, unknown> = { ...(payload.data ?? {}) };
  const screen =
    (typeof payload.screen === "string" && payload.screen.trim()) ||
    (typeof data.screen === "string" && data.screen.trim()) ||
    (typeof data.deepLink === "string" && data.deepLink.trim()) ||
    "";
  if (screen) {
    data.screen = screen;
    data.deepLink = screen;
  }
  if (payload.dispatchLogId && !data.notification_id) {
    data.notification_id = payload.dispatchLogId;
  }
  if (payload.templateCode && !data.template_code) {
    data.template_code = payload.templateCode;
  }
  return data;
}

async function sendInline(
  payload: PushSendJob,
): Promise<{ ok: boolean; accepted: number; failed: number; error?: string; mode: "inline" }> {
  const tokens = (Array.isArray(payload.to) ? payload.to : [payload.to]).filter(
    (t) =>
      typeof t === "string" &&
      (t.startsWith("ExponentPushToken[") || t.startsWith("ExpoPushToken[")),
  );
  if (tokens.length === 0) {
    return { ok: false, accepted: 0, failed: 1, error: "no_valid_expo_tokens", mode: "inline" };
  }

  const data = mergeDeepLinkData(payload);
  const log = {
    warn: (o: object, msg?: string) => console.warn("[push]", msg ?? "", o),
    debug: (o: object, msg?: string) => console.debug("[push]", msg ?? "", o),
  };

  const res = await sendExpoPushWithRetry(
    {
      to: tokens,
      ...(payload.title != null && payload.title !== "" ? { title: payload.title } : {}),
      ...(payload.body != null && payload.body !== "" ? { body: payload.body } : {}),
      data,
      sound: (payload.sound as string | null | undefined) ?? "default",
      priority: "high",
      channelId: payload.channelId,
      ...(payload.contentAvailable ? { _contentAvailable: true } : {}),
      ...(payload.imageUrl
        ? { mutableContent: true, richContent: { image: payload.imageUrl } }
        : {}),
    },
    log,
  );

  if (!res.ok) {
    incrCounter("push_inline_failed_total", "Inline Expo push HTTP failures");
    return {
      ok: false,
      accepted: 0,
      failed: tokens.length,
      error: res.error ?? `expo_http_${res.status}`,
      mode: "inline",
    };
  }

  const outcomes = countTicketOutcomes(res.body);
  const dead: string[] = [];
  const tickets = res.body?.data ?? [];
  tickets.forEach((ticket, i) => {
    const err = ticket.details?.error ?? "";
    // Only purge truly dead device tokens — InvalidCredentials is Expo project
    // FCM config, not a bad token.
    if (ticket.status === "error" && err === "DeviceNotRegistered") {
      const tok = tokens[i];
      if (tok) dead.push(tok);
    }
  });
  if (dead.length > 0) void purgeInvalidPushTokens(dead);

  incrCounter("push_inline_accepted_total", "Inline Expo push accepted", outcomes.ok);
  if (outcomes.err > 0) {
    incrCounter("push_inline_ticket_errors_total", "Inline Expo ticket errors", outcomes.err);
  }

  const firstErr =
    tickets.find((t) => t.status === "error")?.details?.error ??
    tickets.find((t) => t.status === "error")?.message;

  return {
    ok: outcomes.ok > 0,
    accepted: outcomes.ok,
    failed: outcomes.err,
    error:
      outcomes.ok === 0
        ? firstErr
          ? `expo_ticket_${firstErr}`
          : "all_tickets_failed"
        : undefined,
    mode: "inline",
  };
}

export async function deliverExpoPush(
  payload: PushSendJob & { forceInline?: boolean },
): Promise<{
  ok: boolean;
  accepted: number;
  failed: number;
  error?: string;
  mode: "inline" | "queued";
}> {
  const preferQueue = getEnv().PUSH_USE_QUEUE === true && !payload.forceInline;
  const data = mergeDeepLinkData(payload);
  const job: PushSendJob = { ...payload, data, screen: payload.screen };

  if (preferQueue) {
    try {
      const jobId =
        payload.dispatchLogId && /^[0-9a-f-]{36}$/i.test(payload.dispatchLogId)
          ? `push:${payload.dispatchLogId}:${payload.attempt ?? 0}`
          : undefined;
      await enqueue(QUEUE_NAMES.PUSH_SEND, job, jobId ? { jobId } : undefined);
      incrCounter("push_enqueued_total", "Push notifications enqueued", 1);
      console.info(
        `[push] enqueued nid=${payload.dispatchLogId ?? "n/a"} tokens=${
          Array.isArray(payload.to) ? payload.to.length : 1
        }`,
      );
      return { ok: true, accepted: 1, failed: 0, mode: "queued" };
    } catch (err) {
      incrCounter("push_enqueue_failed_total", "Push enqueue failures (tolerated)");
      console.warn(
        "[push] enqueue failed, falling back to inline:",
        (err as Error).message,
      );
    }
  }

  return sendInline(job);
}
