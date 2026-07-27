/**
 * NotificationService — the ONE entry point every controller uses.
 *
 * Controllers must never call enqueuePush, the FCM provider, or Socket.io
 * directly. They build a SendIntent and hand it to this service.
 *
 * Flow:
 *   1. Load template (code + locale → row)
 *   2. Render title/body/deep-link with variables
 *   3. Resolve target → recipients (user_id + token + platform)
 *   4. Resolve per-user channel preferences (critical priority bypasses)
 *   5. Audit-first: INSERT one notification_logs row per recipient (status=queued)
 *   6. Enqueue Expo Push for mobile recipients
 *   7. FCM v1 direct send for browser / topic / "device_token" recipients
 *   8. Return SendResult with counts + notification IDs (for click tracking)
 */
import { randomUUID } from "node:crypto";
import { isExpoPushTokenString } from "@gatimitra/contracts";
import { getSql } from "../../db/client.js";
import { deliverExpoPush } from "../push/deliverExpoPush.js";
import {
  isTerminalPushDeliveryError,
  purgeInvalidPushTokens,
} from "../push/purgeInvalidPushTokens.js";
import { renderTemplate, findMissingVariables } from "./templateRenderer.js";
import { resolveChannelMasks, allowedChannelsFor } from "./preferences.js";
import {
  IN_APP_ONLY_TOKEN,
  resolveInboxOnlyRecipients,
  resolveTarget,
} from "./targetResolver.js";
import { sendFcmV1 } from "./fcmProvider.js";
import {
  loadTemplate,
  bulkInsertQueuedLogs,
  createCampaign,
  updateCampaignCounts,
  updateLogStatus,
  readSetting,
  getCampaignById,
  prepareCampaignResend,
  markCampaignStarted,
  finalizeCampaignSend,
  syncCampaignCountsFromLogs,
  type CreateLogRow,
} from "./db.js";
import type {
  NotificationPriority,
  NotificationTemplate,
  Recipient,
  SendIntent,
  SendResult,
  TargetFilter,
  TemplateVariables,
} from "./types.js";
import {
  expectedRoleFromTarget,
  templateRoleMatchesTarget,
} from "./campaignTarget.js";

const FCM_TOPIC_PREFIX = "topic:";

function isExpoDeviceToken(token: string): boolean {
  return isExpoPushTokenString(token);
}

function isInAppOnlyToken(token: string | null | undefined): boolean {
  return !token || token === IN_APP_ONLY_TOKEN;
}

/** Persist FCM outcome; purge terminal/invalid tokens once (no endless retry). */
async function finalizeFcmDelivery(
  notificationId: string,
  token: string | undefined,
  res: { ok: boolean; errorCode?: string; errorMessage?: string },
): Promise<boolean> {
  await updateLogStatus(notificationId, res.ok ? "delivered" : "failed", {
    errorCode: res.errorCode,
    errorMessage: res.errorMessage,
  });
  if (
    !res.ok &&
    token &&
    !isInAppOnlyToken(token) &&
    isTerminalPushDeliveryError(res.errorCode, res.errorMessage)
  ) {
    void purgeInvalidPushTokens([token]);
  }
  return res.ok;
}

function isRideCustomerPush(row: {
  templateCode: string;
  metadata?: Record<string, unknown> | null;
}): boolean {
  const meta = row.metadata ?? {};
  if (String(meta.liveService ?? "").toLowerCase() === "ride") return true;
  const code = String(row.templateCode ?? "").toUpperCase();
  return code.startsWith("RIDE_");
}

function channelIdForRecipient(
  recipient: Recipient,
  priority?: NotificationPriority | string | null,
  row?: { templateCode: string; metadata?: Record<string, unknown> | null },
): string {
  if (recipient.role === "merchant") {
    // Critical / high new-order alerts use MAX heads-up channel (auto-wake path).
    if (priority === "critical" || priority === "high") return "merchant_new_orders";
    return "merchant_default";
  }
  if (recipient.role === "rider") return "default";
  // Ride lifecycle → CX custom chime channel (immutable after first Android create).
  if (row && isRideCustomerPush(row)) return "customer_ride_cx";
  return "customer_default";
}

function soundForRecipient(
  recipient: Recipient,
  row?: { templateCode: string; metadata?: Record<string, unknown> | null },
): string {
  if (recipient.role === "customer" && row && isRideCustomerPush(row)) {
    return "cx_notification.mp3";
  }
  return "default";
}

function applyOverrides(
  rendered: ReturnType<typeof renderTemplate>,
  overrides?: SendIntent["overrides"],
): ReturnType<typeof renderTemplate> {
  if (!overrides) return rendered;
  return {
    ...rendered,
    title: overrides.title?.trim() || rendered.title,
    body: overrides.body?.trim() || rendered.body,
    imageUrl: overrides.imageUrl !== undefined ? overrides.imageUrl : rendered.imageUrl,
    deepLink: overrides.deepLink !== undefined ? overrides.deepLink : rendered.deepLink,
  };
}

function pushDataForRow(row: CreateLogRow): Record<string, unknown> {
  const deepLink = row.deepLink ?? undefined;
  return {
    notification_id: row.notificationId,
    campaign_id: row.campaignId ?? undefined,
    template_code: row.templateCode,
    gmType: row.templateCode,
    // Rendered template copy — powers floating in-app banners without hardcoded strings.
    title: row.title,
    body: row.body,
    gmTitle: row.title,
    gmMessage: row.body,
    gmBanner: true,
    ...(deepLink
      ? {
          screen: deepLink,
          deepLink,
          deep_link: deepLink,
        }
      : {}),
    ...(row.metadata ?? {}),
  };
}

async function dispatchExpoRow(row: CreateLogRow): Promise<boolean> {
  const result = await deliverExpoPush({
    to: row.recipient.deviceToken,
    title: row.title,
    body: row.body,
    data: pushDataForRow(row),
    screen: row.deepLink ?? undefined,
    imageUrl: row.imageUrl ?? undefined,
    channelId: channelIdForRecipient(row.recipient, row.priority, row),
    sound: soundForRecipient(row.recipient, row),
  });
  if (!result.ok) {
    await updateLogStatus(row.notificationId, "failed", {
      errorCode: result.mode === "queued" ? "ENQUEUE_FAILED" : "EXPO_SEND_FAILED",
      errorMessage: result.error ?? "expo_send_failed",
    });
    return false;
  }
  // Inline Expo acceptance ≈ provider accepted; queue path stays "sent" until worker reports.
  await updateLogStatus(
    row.notificationId,
    result.mode === "inline" ? "delivered" : "sent",
  );
  return true;
}

/**
 * Check whether a HH:MM value falls inside a wrap-capable time window.
 * Examples:
 *   isInsideWindow("22:30", "22:00", "07:00") → true  (wraps midnight)
 *   isInsideWindow("14:00", "22:00", "07:00") → false
 *   isInsideWindow("10:30", "10:00", "21:00") → true
 */
function isInsideWindow(hhmm: string, start: string, end: string): boolean {
  const t = toMinutes(hhmm);
  const s = toMinutes(start);
  const e = toMinutes(end);
  if (t < 0 || s < 0 || e < 0) return false;
  if (s <= e) return t >= s && t < e;
  return t >= s || t < e; // wraps midnight
}
function toMinutes(hhmm: string): number {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm);
  if (!m) return -1;
  const h = Number(m[1]);
  const mm = Number(m[2]);
  if (!Number.isFinite(h) || !Number.isFinite(mm)) return -1;
  return h * 60 + mm;
}

/**
 * Single send — looks up template, resolves recipients, queues delivery.
 *
 * Safe to call from inside an HTTP handler or order/payment flow.
 * Missing tokens, carrier failures, and most DB blips are logged and
 * returned as soft counts — we never throw into business logic.
 */
export async function send(intent: SendIntent): Promise<SendResult> {
  try {
    return await sendImpl(intent);
  } catch (e) {
    console.warn(
      `[notifications] Push send failed (tolerated) template=${intent.templateCode}:`,
      (e as Error).message,
      { target: intent.target },
    );
    return {
      campaignId: intent.campaignId,
      queued: 0,
      skipped: 0,
      failedSync: 1,
      notificationIds: [],
    };
  }
}

async function sendImpl(intent: SendIntent): Promise<SendResult> {
  const startedAt = Date.now();

  // 1. Load template
  const template = await loadTemplate(intent.templateCode, intent.locale ?? "en");
  if (!template) {
    return {
      campaignId: intent.campaignId,
      queued: 0,
      skipped: 0,
      failedSync: 1,
      notificationIds: [],
      skipReason: "template_missing",
    };
  }

  // 1a. Enforce template.role ↔ target audience (campaigns / broadcasts).
  const expectedRole = expectedRoleFromTarget(intent.target as unknown as Record<string, unknown>);
  if (!templateRoleMatchesTarget(String(template.role), expectedRole)) {
    return {
      campaignId: intent.campaignId,
      queued: 0,
      skipped: 0,
      failedSync: 1,
      notificationIds: [],
      skipReason: `role_mismatch:template_${template.role}_target_${expectedRole}`,
    };
  }

  // 1b. Idempotency check — if this key was already used within the last
  // 24 hours, skip the send. Stored in notification_dispatch_logs.metadata
  // with the shape { idempotency_key: <key> }. Cheap partial-index lookup.
  if (intent.idempotencyKey) {
    const sql = getSql();
    // `sql.json(...)` crashes over the Supabase pooler (pgbouncer strips
    // prepared-statement param descriptors). Use a JSON string + ::jsonb cast.
    const idempotencyMatch = JSON.stringify({ idempotency_key: intent.idempotencyKey });
    const rows = (await sql`
      SELECT 1 FROM public.notification_dispatch_logs
      WHERE metadata @> ${idempotencyMatch}::jsonb
        AND queued_at >= now() - interval '24 hours'
      LIMIT 1
    `) as unknown as Array<unknown>;
    if (rows.length > 0) {
      return { campaignId: intent.campaignId, queued: 0, skipped: 0, failedSync: 0, notificationIds: [] };
    }
  }

  // 2. Render
  const vars = intent.variables ?? {};
  const missing = findMissingVariables(template, vars);
  if (missing.length > 0) {
    // Log + continue — empty substitutions render as "". The send is
    // still attempted because we'd rather get *something* out than
    // silently drop a status update.
    console.warn(`[notifications] template ${template.code} missing vars:`, missing.join(","));
  }
  const rendered = applyOverrides(renderTemplate(template, vars), intent.overrides);

  // 3. Resolve recipients
  let recipients = await resolveTarget(intent.target);
  // When targeting a single / many users, keep only tokens matching template role
  // so a merchant id cannot receive a customer-only announcement deep link.
  const templateRole = String(template.role).toLowerCase();
  if (
    (templateRole === "customer" || templateRole === "merchant" || templateRole === "rider") &&
    ("user_id" in intent.target || "user_ids" in intent.target)
  ) {
    recipients = recipients.filter((r) => r.role === templateRole || r.role === "all");
  }

  // No push tokens: still write in-app inbox rows for explicit user / order targets
  // (Expo Go / denied permission). Never throw — business APIs must keep working.
  let inboxOnlyFallback = false;
  if (recipients.length === 0) {
    const inboxOnly = await resolveInboxOnlyRecipients(intent.target, template.role);
    if (inboxOnly.length > 0) {
      recipients = inboxOnly;
      inboxOnlyFallback = true;
      console.warn(
        `[notifications] Push token unavailable. Recording in-app only ` +
          `(template=${template.code}, users=${inboxOnly.length}).`,
        { target: intent.target, title: rendered.title, body: rendered.body },
      );
    } else {
      console.warn(
        `[notifications] Push token unavailable. Skipping notification ` +
          `(template=${template.code}, campaign=${intent.campaignId ?? "n/a"}).`,
        { target: intent.target, title: rendered.title, body: rendered.body },
      );
      if (intent.campaignId) {
        await syncCampaignCountsFromLogs(intent.campaignId);
      }
      return {
        campaignId: intent.campaignId,
        queued: 0,
        skipped: 0,
        failedSync: 0,
        notificationIds: [],
        skipReason: "no_recipients",
      };
    }
  }

  // 3b. Quiet-hours + rate-limit enforcement (skips critical priority).
  // Marketing + announcement categories only deliver inside the allowed
  // window when quiet_hours settings apply.
  const effectivePriority = intent.priority ?? template.priority;
  if (effectivePriority !== "critical") {
    const quiet = await readSetting<{
      start: string;
      end: string;
      timezone: string;
      applies_to?: string[];
    }>("quiet_hours");
    if (quiet && (quiet.applies_to ?? []).includes(template.category)) {
      const now = new Date();
      const hh = new Intl.DateTimeFormat("en-GB", {
        timeZone: quiet.timezone || "Asia/Kolkata",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      }).format(now);
      const inQuiet = isInsideWindow(hh, quiet.start, quiet.end);
      if (inQuiet) {
        if (intent.campaignId) {
          await syncCampaignCountsFromLogs(intent.campaignId);
        }
        return {
          campaignId: intent.campaignId,
          queued: 0,
          skipped: recipients.length,
          failedSync: 0,
          notificationIds: [],
          skipReason: "quiet_hours",
        };
      }
    }
  }

  // 4. Channel preferences (skip topic/direct-token synthetic recipients)
  const realRecipients = recipients.filter((r) => r.userId !== "__topic__" && r.userId !== "__direct__");
  const syntheticRecipients = recipients.filter((r) => r.userId === "__topic__" || r.userId === "__direct__");

  // 4b. Per-user rate limit — skip real recipients over hourly cap.
  // (Synthetic device-token / topic sends bypass; they are one-off.)
  const rateSkipped = new Set<string>();
  if (effectivePriority !== "critical" && realRecipients.length > 0) {
    const cap = (await readSetting<number>("rate_limit_per_user_per_hour")) ?? 20;
    if (cap > 0) {
      const sql = getSql();
      const userIds = realRecipients.map((r) => r.userId);
      const rows = (await sql`
        SELECT recipient_user_id, COUNT(*)::int AS n
        FROM public.notification_dispatch_logs
        WHERE recipient_user_id = ANY(${userIds}::text[])
          AND queued_at >= now() - interval '1 hour'
        GROUP BY recipient_user_id
      `) as unknown as Array<{ recipient_user_id: string; n: number }>;
      for (const row of rows) {
        if (row.n >= cap) rateSkipped.add(row.recipient_user_id);
      }
    }
  }

  const masks = await resolveChannelMasks(
    realRecipients.map((r) => r.userId),
    template.code,
    template.category,
    effectivePriority,
  );

  // 5. Build log rows (audit-first), filtering by channel preference + rate cap
  const logRows: CreateLogRow[] = [];
  let skipped = 0;
  for (const r of realRecipients) {
    if (rateSkipped.has(r.userId)) {
      skipped++;
      continue;
    }
    const mask = masks.get(r.userId) ?? { push: true, in_app: true, browser: true, email: false };
    // Tokenless / Expo Go fallback: inbox history only — never attempt push.
    const allowed = inboxOnlyFallback || r.deviceToken === IN_APP_ONLY_TOKEN
      ? (["in_app"] as const).filter(() => mask.in_app !== false)
      : allowedChannelsFor(template.channel, mask);
    if (allowed.length === 0) {
      skipped++;
      continue;
    }
    // For each allowed channel, one log row.
    for (const channel of allowed) {
      logRows.push({
        notificationId: randomUUID(),
        campaignId: intent.campaignId ?? null,
        templateCode: template.code,
        recipient: r,
        channel,
        title: rendered.title,
        body: rendered.body,
        imageUrl: rendered.imageUrl,
        deepLink: rendered.deepLink,
        priority: intent.priority ?? template.priority,
        metadata: intent.idempotencyKey
          ? { ...(intent.metadata ?? {}), idempotency_key: intent.idempotencyKey }
          : intent.metadata,
      });
    }
  }
  for (const r of syntheticRecipients) {
    logRows.push({
      notificationId: randomUUID(),
      campaignId: intent.campaignId ?? null,
      templateCode: template.code,
      recipient: r,
      channel: "push",
      title: rendered.title,
      body: rendered.body,
      imageUrl: rendered.imageUrl,
      deepLink: rendered.deepLink,
      priority: intent.priority ?? template.priority,
      metadata: intent.idempotencyKey
        ? { ...(intent.metadata ?? {}), idempotency_key: intent.idempotencyKey }
        : intent.metadata,
    });
  }

  // 6. Audit-first persist (one transaction, all-or-nothing)
  try {
    await bulkInsertQueuedLogs(logRows);
  } catch (e) {
    console.error("[notifications] failed to insert logs", (e as Error).message);
    return {
      campaignId: intent.campaignId,
      queued: 0,
      skipped: 0,
      failedSync: logRows.length,
      notificationIds: [],
    };
  }

  // 7. Dispatch — Expo Push for mobile push rows, FCM v1 for topic/direct/browser
  let queued = 0;
  for (const row of logRows) {
    try {
      if (row.recipient.userId === "__topic__") {
        // Topic broadcast via FCM v1 — the deviceToken field is `topic:NAME`.
        const topic = row.recipient.deviceToken.startsWith(FCM_TOPIC_PREFIX)
          ? row.recipient.deviceToken.slice(FCM_TOPIC_PREFIX.length)
          : row.recipient.deviceToken;
        const res = await sendFcmV1({
          notificationId: row.notificationId,
          topic,
          title: row.title,
          body: row.body,
          imageUrl: row.imageUrl ?? null,
          deepLink: row.deepLink ?? null,
          data: {
            template_code: row.templateCode,
            ...(row.campaignId != null ? { campaign_id: String(row.campaignId) } : {}),
          },
          priority: row.priority as never,
          silent: template.silent,
        });
        if (await finalizeFcmDelivery(row.notificationId, undefined, res)) queued++;
        continue;
      }
      if (row.recipient.userId === "__direct__") {
        const isExpo = isExpoDeviceToken(row.recipient.deviceToken);
        if (isExpo) {
          if (await dispatchExpoRow(row)) queued++;
          continue;
        }
        const res = await sendFcmV1({
          notificationId: row.notificationId,
          token: row.recipient.deviceToken,
          title: row.title,
          body: row.body,
          imageUrl: row.imageUrl ?? null,
          deepLink: row.deepLink ?? null,
          data: {
            template_code: row.templateCode,
            ...(row.campaignId != null ? { campaign_id: String(row.campaignId) } : {}),
          },
          priority: row.priority as never,
          silent: template.silent,
        });
        if (await finalizeFcmDelivery(row.notificationId, row.recipient.deviceToken, res)) queued++;
        continue;
      }

      // Standard mobile / web path
      if (row.channel === "push") {
        const token = row.recipient.deviceToken;
        if (isInAppOnlyToken(token)) {
          // No device token (Expo Go / denied) — skip push, never fail the API.
          console.warn(
            `[notifications] Push token unavailable. Skipping push for nid=${row.notificationId}`,
          );
          await updateLogStatus(row.notificationId, "failed", {
            errorCode: "NO_PUSH_TOKEN",
            errorMessage: "Push token unavailable. Skipping notification.",
          });
          continue;
        }
        if (isExpoDeviceToken(token)) {
          if (await dispatchExpoRow(row)) queued++;
          continue;
        }

        // Native FCM (Android app without Expo, or partnersite/dashboard web)
        const res = await sendFcmV1({
          notificationId: row.notificationId,
          token,
          title: row.title,
          body: row.body,
          imageUrl: row.imageUrl ?? null,
          deepLink: row.deepLink ?? null,
          data: {
            template_code: row.templateCode,
            gmType: row.templateCode,
            ...(row.campaignId != null ? { campaign_id: String(row.campaignId) } : {}),
          },
          priority: row.priority as never,
          silent: template.silent,
        });
        if (await finalizeFcmDelivery(row.notificationId, token, res)) queued++;
        continue;
      }
      // Legacy "browser" log rows (if any) — only deliver for true web tokens, never Expo.
      if (row.channel === "browser") {
        const token = row.recipient.deviceToken;
        if (isExpoDeviceToken(token) || row.recipient.platform !== "web") {
          await updateLogStatus(row.notificationId, "delivered");
          queued++;
          continue;
        }
        const res = await sendFcmV1({
          notificationId: row.notificationId,
          token,
          title: row.title,
          body: row.body,
          imageUrl: row.imageUrl ?? null,
          deepLink: row.deepLink ?? null,
          data: {
            template_code: row.templateCode,
            ...(row.campaignId != null ? { campaign_id: String(row.campaignId) } : {}),
          },
          priority: row.priority as never,
          silent: template.silent,
        });
        if (await finalizeFcmDelivery(row.notificationId, token, res)) queued++;
        continue;
      }
      if (row.channel === "in_app") {
        // In-app inbox = the log row IS the inbox entry. No dispatch needed.
        await updateLogStatus(row.notificationId, "delivered");
        queued++;
        continue;
      }
      // socket / unknown — leave queued
      await updateLogStatus(row.notificationId, "queued");
      queued++;
    } catch (e) {
      console.error(`[notifications] dispatch failed nid=${row.notificationId}`, (e as Error).message);
      await updateLogStatus(row.notificationId, "failed", {
        errorCode: "DISPATCH_ERROR",
        errorMessage: (e as Error).message,
      });
    }
  }

  // 8. Roll up to campaign from dispatch logs (absolute sync, not incremental)
  if (intent.campaignId) {
    await syncCampaignCountsFromLogs(intent.campaignId);
  }

  const took = Date.now() - startedAt;
  if (took > 3000) {
    console.warn(`[notifications] send took ${took}ms (template=${template.code}, recipients=${logRows.length})`);
  }

  return {
    campaignId: intent.campaignId,
    queued,
    skipped,
    failedSync: 0,
    notificationIds: logRows.map((r) => r.notificationId),
  };
}

// ---------------------------------------------------------------------------
// Convenience facade matching the spec's required method names
// ---------------------------------------------------------------------------

export function sendToUser(userId: string, templateCode: string, variables?: TemplateVariables, opts: { priority?: "low" | "normal" | "high" | "critical"; metadata?: Record<string, unknown> } = {}): Promise<SendResult> {
  return send({
    templateCode,
    variables,
    target: { user_id: userId },
    priority: opts.priority,
    metadata: opts.metadata,
  });
}

export function sendToUsers(userIds: string[], templateCode: string, variables?: TemplateVariables): Promise<SendResult> {
  return send({ templateCode, variables, target: { user_ids: userIds } });
}

export function sendToRole(role: "customer" | "merchant" | "rider" | "admin", templateCode: string, variables?: TemplateVariables): Promise<SendResult> {
  return send({ templateCode, variables, target: { role } });
}

export function sendToTopic(topic: string, templateCode: string, variables?: TemplateVariables): Promise<SendResult> {
  return send({ templateCode, variables, target: { topic } });
}

export function sendBroadcast(scope: "customers" | "merchants" | "riders", templateCode: string, variables?: TemplateVariables): Promise<SendResult> {
  const target: TargetFilter =
    scope === "customers" ? { all_customers: true }
    : scope === "merchants" ? { all_merchants: true }
    : { all_riders: true };
  return send({ templateCode, variables, target });
}

/** Schedule a future broadcast — creates a campaign in 'scheduled' status; the poller picks it up. */
export async function schedule(opts: {
  name: string;
  templateCode: string;
  target: TargetFilter;
  variables?: TemplateVariables;
  scheduledAt: Date;
  createdBy?: string | null;
  overrideTitle?: string | null;
  overrideBody?: string | null;
  overrideImage?: string | null;
  overrideDeepLink?: string | null;
}): Promise<{ campaignId: number }> {
  const c = await createCampaign({
    name: opts.name,
    templateCode: opts.templateCode,
    overrideTitle: opts.overrideTitle ?? null,
    overrideBody: opts.overrideBody ?? null,
    overrideImage: opts.overrideImage ?? null,
    overrideDeepLink: opts.overrideDeepLink ?? null,
    targetFilter: opts.target as unknown as Record<string, unknown>,
    variables: (opts.variables ?? {}) as Record<string, unknown>,
    scheduledAt: opts.scheduledAt.toISOString(),
    status: "scheduled",
    createdBy: opts.createdBy ?? null,
  });
  return { campaignId: c.id };
}

/** Re-send an existing campaign using its stored template, target, and variables. */
export async function resendCampaign(
  campaignId: number,
): Promise<SendResult & { campaignId: number; status: "completed" | "failed" }> {
  const campaign = await getCampaignById(campaignId);
  if (!campaign) {
    const err = new Error("campaign_not_found");
    (err as Error & { statusCode?: number }).statusCode = 404;
    throw err;
  }
  if (!campaign.template_code) {
    const err = new Error("template_missing");
    (err as Error & { statusCode?: number }).statusCode = 400;
    throw err;
  }
  if (campaign.status === "scheduled" || campaign.status === "running") {
    const err = new Error("campaign_busy");
    (err as Error & { statusCode?: number }).statusCode = 409;
    throw err;
  }

  const tmpl = await loadTemplate(campaign.template_code, "en");
  if (!tmpl) {
    const err = new Error("template_not_found");
    (err as Error & { statusCode?: number }).statusCode = 404;
    throw err;
  }

  await prepareCampaignResend(campaignId);
  await markCampaignStarted(campaignId);
  try {
    const result = await send({
      templateCode: campaign.template_code,
      variables: campaign.variables as TemplateVariables,
      target: campaign.target_filter as TargetFilter,
      campaignId,
      overrides: {
        title: campaign.override_title,
        body: campaign.override_body,
        imageUrl: campaign.override_image,
        deepLink: campaign.override_deep_link,
      },
    });
    // Missing tokens is a soft complete — never mark the campaign failed for Expo Go / empty audience.
    await finalizeCampaignSend(campaignId, "completed");
    return { ...result, campaignId, status: "completed" };
  } catch (e) {
    await finalizeCampaignSend(campaignId, "failed");
    throw e;
  }
}

/** Cancel a scheduled or running campaign. Returns false when no row matched. */
export async function cancel(campaignId: number, cancelledBy?: string): Promise<boolean> {
  const { getSql } = await import("../../db/client.js");
  const sql = getSql();
  const rows = (await sql`
    UPDATE public.notification_campaigns
    SET
      status = 'cancelled',
      cancelled_at = now(),
      cancelled_by = ${cancelledBy ?? null},
      finished_at = COALESCE(finished_at, now())
    WHERE id = ${campaignId} AND status IN ('scheduled','running')
    RETURNING id
  `) as unknown as Array<{ id: number }>;
  return rows.length > 0;
}

/** Mark click — exposed as a separate function so the routes layer can call it. */
export { markClicked } from "./db.js";

/** Re-export template helpers for routes/admin code. */
export { loadTemplate, listTemplates } from "./db.js";

/** Re-export the rendering helper for previews. */
export { renderTemplate } from "./templateRenderer.js";

/**
 * Replace template variables and return the rendered output WITHOUT sending.
 * Used by the super-admin preview pane.
 */
export async function previewTemplate(code: string, variables: TemplateVariables, locale?: string): Promise<{ template: NotificationTemplate; rendered: ReturnType<typeof renderTemplate>; missing: string[] } | null> {
  const template = await loadTemplate(code, locale ?? "en");
  if (!template) return null;
  return {
    template,
    rendered: renderTemplate(template, variables),
    missing: findMissingVariables(template, variables),
  };
}
