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
  softSkipWarningForTarget,
  templateRoleMatchesTarget,
} from "./campaignTarget.js";

const FCM_TOPIC_PREFIX = "topic:";

function isExpoDeviceToken(token: string): boolean {
  return isExpoPushTokenString(token);
}

function isInAppOnlyToken(token: string | null | undefined): boolean {
  return !token || token === IN_APP_ONLY_TOKEN;
}

/** Persist FCM outcome; schedule retries for non-terminal failures; purge dead tokens. */
async function finalizeFcmDelivery(
  notificationId: string,
  token: string | undefined,
  res: { ok: boolean; errorCode?: string; errorMessage?: string },
  opts?: { maxRetries?: number },
): Promise<boolean> {
  if (res.ok) {
    await updateLogStatus(notificationId, "delivered");
    return true;
  }
  const { markFailedWithRetrySchedule } = await import("./retryEngine.js");
  await markFailedWithRetrySchedule({
    notificationId,
    errorCode: res.errorCode,
    errorMessage: res.errorMessage,
    maxRetries: opts?.maxRetries,
  });
  if (
    token &&
    !isInAppOnlyToken(token) &&
    isTerminalPushDeliveryError(res.errorCode, res.errorMessage)
  ) {
    void purgeInvalidPushTokens([token]);
  }
  return false;
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
    // null/empty override must not wipe the template deep link (resend stores null).
    deepLink:
      overrides.deepLink != null && String(overrides.deepLink).trim()
        ? String(overrides.deepLink).trim()
        : rendered.deepLink,
  };
}

/**
 * Partnersite has no /notifications route. Map generic / mobile deep links to a
 * real merchant page so browser FCM clicks open the partner console.
 * FCM webpush.fcmOptions.link requires an absolute https/http URL.
 */
function partnersiteOrigin(): string {
  const fromEnv =
    process.env.PARTNER_SITE_URL?.trim() ||
    process.env.PARTNERSITE_PUBLIC_URL?.trim() ||
    process.env.NEXT_PUBLIC_PARTNER_SITE_URL?.trim();
  if (fromEnv) return fromEnv.replace(/\/+$/, "");
  return process.env.NODE_ENV === "production"
    ? "https://partner.gatimitra.com"
    : "http://localhost:3002";
}

function deepLinkForWebRecipient(
  deepLink: string | null | undefined,
  role: string,
  opts?: { topic?: string | null },
): string | null {
  const isMerchant =
    role === "merchant" ||
    opts?.topic === "app_merchant" ||
    (opts?.topic ?? "").startsWith("merchant_store_");
  if (!isMerchant) {
    const raw = deepLink?.trim() || null;
    if (!raw) return null;
    if (/^https?:\/\//i.test(raw)) return raw;
    return raw;
  }
  const raw = (deepLink ?? "").trim();
  let path = "/mx/food-orders";
  if (
    raw &&
    raw !== "/" &&
    raw !== "/notifications" &&
    !/^\/notifications(\/|$|\?)/.test(raw)
  ) {
    if (raw.startsWith("/mx") || raw.startsWith("/partners") || raw.startsWith("/auth")) {
      path = raw.split("#")[0]!;
    } else if (/^https?:\/\//i.test(raw)) {
      return raw;
    }
  }
  return `${partnersiteOrigin()}${path.startsWith("/") ? path : `/${path}`}`;
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

async function dispatchExpoRow(
  row: CreateLogRow,
  opts?: { maxRetries?: number; attempt?: number; forceInline?: boolean },
): Promise<boolean> {
  console.info(
    `[notifications] expo_dispatch start nid=${row.notificationId} role=${row.recipient.role} platform=${row.recipient.platform} forceInline=${Boolean(opts?.forceInline)}`,
  );
  const result = await deliverExpoPush({
    to: row.recipient.deviceToken,
    title: row.title,
    body: row.body,
    data: pushDataForRow(row),
    screen: row.deepLink ?? undefined,
    imageUrl: row.imageUrl ?? undefined,
    channelId: channelIdForRecipient(row.recipient, row.priority, row),
    sound: soundForRecipient(row.recipient, row),
    dispatchLogId: row.notificationId,
    templateCode: row.templateCode,
    attempt: opts?.attempt ?? 0,
    priority: row.priority,
    forceInline: opts?.forceInline === true,
  });
  if (!result.ok) {
    const errBlob = `${result.error ?? ""}`.toLowerCase();
    const expoCredsMissing =
      errBlob.includes("invalidcredentials") ||
      errBlob.includes("fcm server key") ||
      errBlob.includes("expo_ticket_invalidcredentials");
    if (expoCredsMissing || row.recipient.platform === "android") {
      const nativeToken = await lookupNativeFcmToken(
        row.recipient.userId,
        row.recipient.role,
      );
      if (nativeToken) {
        console.warn(
          `[notifications] expo_dispatch fallback_fcm nid=${row.notificationId} reason=${result.error ?? "expo_failed"} token_fp=${nativeToken.slice(0, 12)}…`,
        );
        const res = await sendFcmV1({
          notificationId: row.notificationId,
          token: nativeToken,
          title: row.title,
          body: row.body,
          imageUrl: row.imageUrl ?? null,
          deepLink: row.deepLink ?? null,
          channelId: channelIdForRecipient(row.recipient, row.priority, row),
          data: {
            template_code: row.templateCode,
            gmType: row.templateCode,
            title: row.title,
            body: row.body,
            gmTitle: row.title,
            gmMessage: row.body,
            gmBanner: "true",
            ...(row.campaignId != null ? { campaign_id: String(row.campaignId) } : {}),
          },
          priority: row.priority as never,
        });
        return finalizeFcmDelivery(row.notificationId, nativeToken, res, {
          maxRetries: opts?.maxRetries,
        });
      }
    }
    console.warn(
      `[notifications] expo_dispatch fail nid=${row.notificationId} mode=${result.mode} err=${result.error ?? "unknown"}`,
    );
    const { markFailedWithRetrySchedule } = await import("./retryEngine.js");
    await markFailedWithRetrySchedule({
      notificationId: row.notificationId,
      errorCode: result.mode === "queued" ? "ENQUEUE_FAILED" : "EXPO_SEND_FAILED",
      errorMessage: result.error ?? "expo_send_failed",
      maxRetries: opts?.maxRetries,
    });
    if (
      isTerminalPushDeliveryError(result.error, result.error) &&
      row.recipient.deviceToken
    ) {
      void purgeInvalidPushTokens([row.recipient.deviceToken]);
    }
    return false;
  }
  console.info(
    `[notifications] expo_dispatch ok nid=${row.notificationId} mode=${result.mode} accepted=${result.accepted}`,
  );
  // Inline Expo acceptance ≈ provider accepted; queue path stays "sent" until worker reports.
  // Admin deliverNow always uses inline — only then we mark delivered.
  await updateLogStatus(
    row.notificationId,
    result.mode === "inline" ? "delivered" : "sent",
  );
  return true;
}

async function lookupNativeFcmToken(
  userId: string,
  role: string,
): Promise<string | null> {
  if (!userId || userId.startsWith("__")) return null;
  try {
    const sql = getSql();
    const rows = (await sql`
      SELECT native_token
      FROM public.native_device_push_tokens
      WHERE user_id = ${userId}
        AND token_type = 'fcm'
        AND lower(coalesce(platform,'')) = 'android'
        AND lower(coalesce(source,'app')) = 'app'
        AND (last_seen_at IS NULL OR last_seen_at >= now() - interval '90 days')
        ${role && role !== "all" ? sql`AND lower(role) = ${role.toLowerCase()}` : sql``}
      ORDER BY updated_at DESC NULLS LAST
      LIMIT 1
    `) as unknown as Array<{ native_token: string }>;
    return rows[0]?.native_token ?? null;
  } catch (e) {
    console.warn(
      "[notifications] native FCM lookup failed:",
      (e as Error).message,
    );
    return null;
  }
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
    // prepared-statement param descriptors). Use a JSON string + ::text::jsonb
    // cast — plain ::jsonb silently double-encodes under prepare: false,
    // which made this containment check never match (confirmed live: this
    // idempotency check has never actually deduped anything).
    const idempotencyMatch = JSON.stringify({ idempotency_key: intent.idempotencyKey });
    const rows = (await sql`
      SELECT 1 FROM public.notification_dispatch_logs
      WHERE metadata @> ${idempotencyMatch}::text::jsonb
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

  // No push tokens: still write in-app inbox rows for explicit user / order /
  // all_customers / all_riders targets when we can resolve user ids.
  let inboxOnlyFallback = false;
  if (recipients.length === 0 && intent.channel !== "push") {
    const inboxOnly = await resolveInboxOnlyRecipients(intent.target, template.role);
    if (inboxOnly.length > 0) {
      recipients = inboxOnly;
      inboxOnlyFallback = true;
      console.warn(
        `[notifications] Push token unavailable. Recording in-app only ` +
          `(template=${template.code}, users=${inboxOnly.length}).`,
        { target: intent.target },
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
        warning: softSkipWarningForTarget(intent.target, "no_recipients"),
      };
    }
  }

  // 3b. Quiet-hours + rate-limit enforcement (skips critical priority).
  // Marketing + announcement categories only deliver inside the allowed
  // window when quiet_hours settings apply. Admin Send now / Resend bypasses.
  const effectivePriority = intent.priority ?? template.priority;
  if (effectivePriority !== "critical" && !intent.bypassQuietHours) {
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
  let realRecipients = recipients.filter((r) => r.userId !== "__topic__" && r.userId !== "__direct__");
  const syntheticRecipients = recipients.filter((r) => r.userId === "__topic__" || r.userId === "__direct__");
  let skipped = 0;

  // Per-user rate limit for marketing / announcement (never blocks critical).
  // Transactional event volume is controlled upstream (idempotency keys).
  if (
    effectivePriority !== "critical" &&
    (template.category === "marketing" || template.category === "announcement") &&
    !intent.bypassQuietHours
  ) {
    const rateLimit = (await readSetting<number>("rate_limit_per_user_per_hour")) ?? 20;
    if (rateLimit > 0 && realRecipients.length > 0) {
      const sql = getSql();
      const filtered: typeof realRecipients = [];
      const seenUsers = new Set<string>();
      for (const r of realRecipients) {
        if (seenUsers.has(r.userId)) {
          filtered.push(r);
          continue;
        }
        seenUsers.add(r.userId);
        const [cnt] = (await sql`
          SELECT COUNT(*)::int AS n
          FROM public.notification_dispatch_logs
          WHERE recipient_user_id = ${r.userId}
            AND queued_at >= now() - interval '1 hour'
            AND status NOT IN ('failed', 'expired')
        `) as unknown as Array<{ n: number }>;
        if ((cnt?.n ?? 0) >= rateLimit) {
          skipped++;
          continue;
        }
        filtered.push(r);
      }
      // Drop other tokens for rate-limited users.
      const allowedUsers = new Set(filtered.map((r) => r.userId));
      realRecipients = realRecipients.filter((r) => {
        if (allowedUsers.has(r.userId)) return true;
        return false;
      });
    }
  }

  const masks = await resolveChannelMasks(
    realRecipients.map((r) => r.userId),
    template.code,
    template.category,
    effectivePriority,
  );

  // 5. Build log rows (audit-first), filtering by channel preference
  const logRows: CreateLogRow[] = [];
  /** One in-app inbox row per user — multi-token fan-out must not multiply the badge. */
  const inAppEmittedForUser = new Set<string>();
  /**
   * Dedup push by device token only (resolver already unique-tokens).
   * Do NOT collapse to one mobile device per user — phone + tablet must both get campaigns.
   * Expo vs native-on-same-phone is already handled in nativeFcmTokens (skip app FCM when Expo exists).
   */
  const pushEmittedForToken = new Set<string>();
  for (const r of realRecipients) {
    const mask = masks.get(r.userId) ?? { push: true, in_app: true, browser: true, email: false };
    // Tokenless / Expo Go fallback: inbox history only — never attempt push.
    const channelSource = intent.channel ?? template.channel;
    const allowed =
      (inboxOnlyFallback || r.deviceToken === IN_APP_ONLY_TOKEN) && channelSource !== "push"
      ? (["in_app"] as const).filter(() => mask.in_app !== false)
      : allowedChannelsFor(channelSource, mask);
    if (allowed.length === 0) {
      skipped++;
      continue;
    }
    // For each allowed channel, one log row.
    for (const channel of allowed) {
      if (channel === "in_app") {
        if (inAppEmittedForUser.has(r.userId)) continue;
        inAppEmittedForUser.add(r.userId);
      }
      if (channel === "push" || channel === "browser") {
        const tok = r.deviceToken;
        if (tok && pushEmittedForToken.has(tok)) continue;
        if (tok) pushEmittedForToken.add(tok);
      }
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
  let accepted = 0;
  let failedProvider = 0;
  let failedSync = 0;
  const forceInline = intent.deliverNow === true;
  const maxRetries = Math.max(1, Number(template.retry_count) || 4);
  console.info(
    `[notifications] dispatch_start campaign=${intent.campaignId ?? "n/a"} template=${template.code} rows=${logRows.length} deliverNow=${forceInline}`,
  );
  for (const row of logRows) {
    try {
      if (row.recipient.userId === "__topic__") {
        // Topic broadcast via FCM v1 — the deviceToken field is `topic:NAME`.
        const topic = row.recipient.deviceToken.startsWith(FCM_TOPIC_PREFIX)
          ? row.recipient.deviceToken.slice(FCM_TOPIC_PREFIX.length)
          : row.recipient.deviceToken;
        const webLink = deepLinkForWebRecipient(row.deepLink, row.recipient.role, { topic });
        console.info(
          `[notifications] fcm_topic nid=${row.notificationId} topic=${topic} role=${row.recipient.role}`,
        );
        const res = await sendFcmV1({
          notificationId: row.notificationId,
          topic,
          title: row.title,
          body: row.body,
          imageUrl: row.imageUrl ?? null,
          // Mobile apps keep template deep link; webpush uses partnersite path.
          deepLink: row.deepLink ?? null,
          webLink,
          channelId: channelIdForRecipient(row.recipient, row.priority, row),
          data: {
            template_code: row.templateCode,
            ...(row.campaignId != null ? { campaign_id: String(row.campaignId) } : {}),
          },
          priority: row.priority as never,
          silent: template.silent,
        });
        if (await finalizeFcmDelivery(row.notificationId, undefined, res, { maxRetries })) {
          queued++;
          accepted++;
        } else {
          failedProvider++;
          failedSync++;
        }
        continue;
      }
      if (row.recipient.userId === "__direct__") {
        const isExpo = isExpoDeviceToken(row.recipient.deviceToken);
        if (isExpo) {
          if (await dispatchExpoRow(row, { maxRetries, forceInline })) {
            queued++;
            accepted++;
          } else {
            failedProvider++;
            failedSync++;
          }
          continue;
        }
        console.info(
          `[notifications] fcm_direct nid=${row.notificationId} token_fp=${row.recipient.deviceToken.slice(0, 12)}…`,
        );
        const res = await sendFcmV1({
          notificationId: row.notificationId,
          token: row.recipient.deviceToken,
          title: row.title,
          body: row.body,
          imageUrl: row.imageUrl ?? null,
          deepLink: row.deepLink ?? null,
          channelId: channelIdForRecipient(row.recipient, row.priority, row),
          data: {
            template_code: row.templateCode,
            ...(row.campaignId != null ? { campaign_id: String(row.campaignId) } : {}),
          },
          priority: row.priority as never,
          silent: template.silent,
        });
        if (await finalizeFcmDelivery(row.notificationId, row.recipient.deviceToken, res, { maxRetries })) {
          queued++;
          accepted++;
        } else {
          failedProvider++;
          failedSync++;
        }
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
          failedSync++;
          continue;
        }
        if (isExpoDeviceToken(token)) {
          if (await dispatchExpoRow(row, { maxRetries, forceInline })) {
            queued++;
            accepted++;
          } else {
            failedProvider++;
            failedSync++;
          }
          continue;
        }

        // Native FCM (Android app without Expo, or partnersite/dashboard web)
        const isWeb = row.recipient.platform === "web";
        const deepLink = isWeb
          ? deepLinkForWebRecipient(row.deepLink, row.recipient.role)
          : row.deepLink ?? null;
        console.info(
          `[notifications] fcm_token nid=${row.notificationId} role=${row.recipient.role} platform=${row.recipient.platform} token_fp=${token.slice(0, 12)}…`,
        );
        const res = await sendFcmV1({
          notificationId: row.notificationId,
          token,
          title: row.title,
          body: row.body,
          imageUrl: row.imageUrl ?? null,
          deepLink,
          webLink: isWeb ? deepLink : undefined,
          channelId: isWeb
            ? undefined
            : channelIdForRecipient(row.recipient, row.priority, row),
          data: {
            template_code: row.templateCode,
            gmType: row.templateCode,
            title: row.title,
            body: row.body,
            gmTitle: row.title,
            gmMessage: row.body,
            gmBanner: "true",
            ...(row.campaignId != null ? { campaign_id: String(row.campaignId) } : {}),
          },
          priority: row.priority as never,
          silent: template.silent,
        });
        if (await finalizeFcmDelivery(row.notificationId, token, res, { maxRetries })) {
          queued++;
          accepted++;
        } else {
          failedProvider++;
          failedSync++;
        }
        continue;
      }
      // Legacy "browser" log rows (if any) — only deliver for true web tokens, never Expo.
      if (row.channel === "browser") {
        const token = row.recipient.deviceToken;
        if (isExpoDeviceToken(token) || row.recipient.platform !== "web") {
          await updateLogStatus(row.notificationId, "failed", {
            errorCode: "WRONG_CHANNEL_PLATFORM",
            errorMessage: "Browser channel requires a web FCM token.",
          });
          failedSync++;
          continue;
        }
        const deepLink = deepLinkForWebRecipient(row.deepLink, row.recipient.role);
        const res = await sendFcmV1({
          notificationId: row.notificationId,
          token,
          title: row.title,
          body: row.body,
          imageUrl: row.imageUrl ?? null,
          deepLink,
          webLink: deepLink,
          data: {
            template_code: row.templateCode,
            ...(row.campaignId != null ? { campaign_id: String(row.campaignId) } : {}),
          },
          priority: row.priority as never,
          silent: template.silent,
        });
        if (await finalizeFcmDelivery(row.notificationId, token, res, { maxRetries })) {
          queued++;
          accepted++;
        } else {
          failedProvider++;
          failedSync++;
        }
        continue;
      }
      if (row.channel === "in_app") {
        // In-app inbox = the log row IS the inbox entry. No dispatch needed.
        await updateLogStatus(row.notificationId, "delivered");
        queued++;
        accepted++;
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
      failedSync++;
    }
  }

  // 8. Roll up to campaign from dispatch logs (absolute sync, not incremental)
  if (intent.campaignId) {
    await syncCampaignCountsFromLogs(intent.campaignId);
  }

  const took = Date.now() - startedAt;
  console.info(
    `[notifications] dispatch_done campaign=${intent.campaignId ?? "n/a"} template=${template.code} queued=${queued} accepted=${accepted} failedProvider=${failedProvider} failedSync=${failedSync} skipped=${skipped} ms=${took}`,
  );
  if (took > 3000) {
    console.warn(`[notifications] send took ${took}ms (template=${template.code}, recipients=${logRows.length})`);
  }

  return {
    campaignId: intent.campaignId,
    queued,
    skipped,
    failedSync,
    accepted,
    failedProvider,
    notificationIds: logRows.map((r) => r.notificationId),
    ...(inboxOnlyFallback
      ? {
          skipReason: "no_push_tokens",
          warning: softSkipWarningForTarget(
            intent.target as unknown as Record<string, unknown>,
            "no_recipients",
            { inboxOnlyCount: inAppEmittedForUser.size || recipients.length },
          ),
        }
      : {}),
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
    const roleDefaultDeepLink = "/notifications";
    const storedVars = (campaign.variables ?? {}) as TemplateVariables;
    const result = await send({
      templateCode: campaign.template_code,
      variables: {
        deepLink: roleDefaultDeepLink,
        ...storedVars,
      },
      target: campaign.target_filter as TargetFilter,
      campaignId,
      // Operator-triggered resend should deliver even during quiet hours.
      bypassQuietHours: true,
      deliverNow: true,
      overrides: {
        title: campaign.override_title,
        body: campaign.override_body,
        imageUrl: campaign.override_image,
        deepLink: campaign.override_deep_link?.trim() || roleDefaultDeepLink,
      },
    });
    // Missing tokens / quiet hours are soft complete — never mark failed for Expo Go / empty audience.
    const softSkip =
      result.skipReason === "no_recipients" || result.skipReason === "quiet_hours";
    if (result.skipReason && !softSkip) {
      await finalizeCampaignSend(campaignId, "failed");
      return { ...result, campaignId, status: "failed" };
    }
    const accepted = result.accepted ?? result.queued;
    const providerFailed = result.failedProvider ?? 0;
    if (!softSkip && (result.failedSync > 0 || providerFailed > 0) && accepted === 0) {
      await finalizeCampaignSend(campaignId, "failed");
      return { ...result, campaignId, status: "failed" };
    }
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
