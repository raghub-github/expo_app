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
import { getSql } from "../../db/client.js";
import { enqueuePush } from "../push/enqueuePush.js";
import { renderTemplate, findMissingVariables } from "./templateRenderer.js";
import { resolveChannelMasks, allowedChannelsFor } from "./preferences.js";
import { resolveTarget } from "./targetResolver.js";
import { sendFcmV1 } from "./fcmProvider.js";
import {
  loadTemplate,
  bulkInsertQueuedLogs,
  createCampaign,
  updateCampaignCounts,
  updateLogStatus,
  readSetting,
  type CreateLogRow,
} from "./db.js";
import type {
  NotificationTemplate,
  Recipient,
  SendIntent,
  SendResult,
  TargetFilter,
  TemplateVariables,
} from "./types.js";

const FCM_TOPIC_PREFIX = "topic:";

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
 * Safe to call from inside an HTTP handler. Failures in any sub-step are
 * logged + counted; we never throw out of this function unless the
 * template is completely missing or the intent is malformed.
 */
export async function send(intent: SendIntent): Promise<SendResult> {
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
  const rendered = renderTemplate(template, vars);

  // 3. Resolve recipients
  const recipients = await resolveTarget(intent.target);
  if (recipients.length === 0) {
    return { campaignId: intent.campaignId, queued: 0, skipped: 0, failedSync: 0, notificationIds: [] };
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
        return { campaignId: intent.campaignId, queued: 0, skipped: recipients.length, failedSync: 0, notificationIds: [] };
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
    const allowed = allowedChannelsFor(template.channel, mask);
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
          priority: row.priority as never,
          silent: template.silent,
        });
        await updateLogStatus(row.notificationId, res.ok ? "sent" : "failed", {
          errorCode: res.errorCode,
          errorMessage: res.errorMessage,
        });
        if (res.ok) queued++;
        continue;
      }
      if (row.recipient.userId === "__direct__") {
        // Pick the right carrier from the token format:
        //   • Expo tokens look like "ExponentPushToken[xxx]" — go via Expo queue
        //   • Anything else is treated as a native FCM token
        const isExpo = row.recipient.deviceToken.startsWith("ExponentPushToken[")
          || row.recipient.deviceToken.startsWith("ExpoPushToken[");
        if (isExpo) {
          await enqueuePush({
            to: row.recipient.deviceToken,
            title: row.title,
            body: row.body,
            data: {
              notification_id: row.notificationId,
              template_code: row.templateCode,
              ...(row.metadata ?? {}),
            },
            screen: row.deepLink ?? undefined,
            imageUrl: row.imageUrl ?? undefined,
            channelId: "default",
          });
          await updateLogStatus(row.notificationId, "sent");
          queued++;
          continue;
        }
        const res = await sendFcmV1({
          notificationId: row.notificationId,
          token: row.recipient.deviceToken,
          title: row.title,
          body: row.body,
          imageUrl: row.imageUrl ?? null,
          deepLink: row.deepLink ?? null,
          priority: row.priority as never,
          silent: template.silent,
        });
        await updateLogStatus(row.notificationId, res.ok ? "sent" : "failed", {
          errorCode: res.errorCode,
          errorMessage: res.errorMessage,
        });
        if (res.ok) queued++;
        continue;
      }

      // Standard mobile path — Expo Push via the existing BullMQ queue.
      // The notification-worker consumes the queue and calls Expo's API.
      // notification_id is passed in `data` so the mobile SDK can echo it
      // back on click for delivery confirmation.
      if (row.channel === "push") {
        await enqueuePush({
          to: row.recipient.deviceToken,
          title: row.title,
          body: row.body,
          data: {
            notification_id: row.notificationId,
            campaign_id: row.campaignId ?? undefined,
            template_code: row.templateCode,
            ...(row.metadata ?? {}),
          },
          screen: row.deepLink ?? undefined,
          imageUrl: row.imageUrl ?? undefined,
          channelId: "default",
          sound: row.priority === "critical" ? "default" : "default",
        });
        // Mark as sent — the worker will overwrite to delivered/failed via
        // a future webhook. For now "sent to queue" is the best signal we have.
        await updateLogStatus(row.notificationId, "sent");
        queued++;
        continue;
      }
      if (row.channel === "in_app") {
        // In-app inbox = the log row IS the inbox entry. No dispatch needed.
        await updateLogStatus(row.notificationId, "delivered");
        queued++;
        continue;
      }
      // browser / socket channels — implemented in Phase 6 / Phase 4 respectively.
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

  // 8. Roll up to campaign if any
  if (intent.campaignId) {
    await updateCampaignCounts(intent.campaignId, {
      sent: queued,
      failed: logRows.length - queued - skipped,
    });
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
}): Promise<{ campaignId: number }> {
  const c = await createCampaign({
    name: opts.name,
    templateCode: opts.templateCode,
    overrideTitle: opts.overrideTitle ?? null,
    overrideBody: opts.overrideBody ?? null,
    targetFilter: opts.target as unknown as Record<string, unknown>,
    variables: (opts.variables ?? {}) as Record<string, unknown>,
    scheduledAt: opts.scheduledAt.toISOString(),
    status: "scheduled",
    createdBy: opts.createdBy ?? null,
  });
  return { campaignId: c.id };
}

/** Cancel a scheduled or running campaign. */
export async function cancel(campaignId: number, cancelledBy?: string): Promise<void> {
  const { getSql } = await import("../../db/client.js");
  const sql = getSql();
  await sql`
    UPDATE public.notification_campaigns
    SET status = 'cancelled', cancelled_at = now(), cancelled_by = ${cancelledBy ?? null}
    WHERE id = ${campaignId} AND status IN ('scheduled','running')
  `;
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
