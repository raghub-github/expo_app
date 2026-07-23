/**
 * Deliver an Expo push with deep-link data correctly attached.
 *
 * Campaigns must not depend solely on Redis + notification-worker. This helper:
 *   1) Tries BullMQ enqueue when PUSH_USE_QUEUE=1 (optional async path)
 *   2) Otherwise (default) OR on enqueue failure → sends via Expo Push API inline
 *
 * Always merges `screen` into `data.screen` + `data.deepLink` so client navigators work.
 */
import { enqueue, QUEUE_NAMES, type PushSendJob } from "@gatimitra/queue";
import { incrCounter } from "@gatimitra/logger";
import { sendExpoPushWithRetry, countTicketOutcomes } from "./expoPushSend.js";
import { getSql } from "../../db/client.js";
import { getEnv } from "../../config/env.js";

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
  return data;
}

async function purgeDeadTokens(tokens: string[]): Promise<void> {
  if (tokens.length === 0) return;
  try {
    const sql = getSql();
    await sql`DELETE FROM public.expo_push_tokens WHERE expo_push_token = ANY(${tokens}::text[])`;
    await sql`DELETE FROM public.merchant_store_push_tokens WHERE token = ANY(${tokens}::text[])`;
  } catch (e) {
    console.warn("[push] dead token purge failed:", (e as Error).message);
  }
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
      title: payload.title,
      body: payload.body,
      data,
      sound: (payload.sound as "default" | null | undefined) ?? "default",
      priority: "high",
      channelId: payload.channelId,
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
    if (
      ticket.status === "error" &&
      (err === "DeviceNotRegistered" || err === "InvalidCredentials")
    ) {
      const tok = tokens[i];
      if (tok) dead.push(tok);
    }
  });
  if (dead.length > 0) void purgeDeadTokens(dead);

  incrCounter("push_inline_accepted_total", "Inline Expo push accepted", outcomes.ok);
  if (outcomes.err > 0) {
    incrCounter("push_inline_ticket_errors_total", "Inline Expo ticket errors", outcomes.err);
  }

  return {
    ok: outcomes.ok > 0,
    accepted: outcomes.ok,
    failed: outcomes.err,
    error: outcomes.ok === 0 ? "all_tickets_failed" : undefined,
    mode: "inline",
  };
}

export async function deliverExpoPush(
  payload: PushSendJob,
): Promise<{
  ok: boolean;
  accepted: number;
  failed: number;
  error?: string;
  mode: "inline" | "queued";
}> {
  const preferQueue = getEnv().PUSH_USE_QUEUE === true;
  const data = mergeDeepLinkData(payload);
  const job: PushSendJob = { ...payload, data, screen: payload.screen };

  if (preferQueue) {
    try {
      await enqueue(QUEUE_NAMES.PUSH_SEND, job);
      incrCounter("push_enqueued_total", "Push notifications enqueued", 1);
      return { ok: true, accepted: 1, failed: 0, mode: "queued" };
    } catch (err) {
      incrCounter("push_enqueue_failed_total", "Push enqueue failures (tolerated)");
      console.warn("[push] enqueue failed, falling back to inline:", (err as Error).message);
    }
  }

  return sendInline(job);
}
