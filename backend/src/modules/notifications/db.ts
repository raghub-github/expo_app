/**
 * Thin DB helpers for the notification module — kept separate so the
 * NotificationService stays focused on orchestration logic, and the
 * routes can call these directly for the super-admin pages without
 * going through the service.
 */
import { getSql } from "../../db/client.js";
import type {
  NotificationTemplate,
  NotificationStatus,
  Recipient,
} from "./types.js";

const TEMPLATE_COLUMNS = `
  id, code, category, role, channel,
  title_template, body_template,
  image_url, icon_url, deep_link, click_action,
  priority, sound, vibration, buttons,
  variables_schema, locale, version, enabled,
  retry_count, expiry_seconds, silent, collapse_key
`;

export async function loadTemplate(
  code: string,
  locale: string = "en",
): Promise<NotificationTemplate | null> {
  const sql = getSql();
  // Try exact (code+locale) first, fall back to 'en', fall back to first
  // row with that code (defensive: locale may be misconfigured).
  const rows = (await sql.unsafe(`
    SELECT ${TEMPLATE_COLUMNS}
    FROM public.notification_templates
    WHERE code = $1 AND enabled = TRUE
    ORDER BY CASE WHEN locale = $2 THEN 0 WHEN locale = 'en' THEN 1 ELSE 2 END
    LIMIT 1
  `, [code, locale])) as unknown as NotificationTemplate[];
  return rows[0] ?? null;
}

export async function listTemplates(filter: { category?: string; role?: string; enabled?: boolean } = {}): Promise<NotificationTemplate[]> {
  const sql = getSql();
  const rows = (await sql`
    SELECT ${sql.unsafe(TEMPLATE_COLUMNS)}
    FROM public.notification_templates
    WHERE 1=1
      ${filter.category ? sql`AND category = ${filter.category}` : sql``}
      ${filter.role ? sql`AND role = ${filter.role}` : sql``}
      ${filter.enabled !== undefined ? sql`AND enabled = ${filter.enabled}` : sql``}
    ORDER BY category, code, locale
  `) as unknown as NotificationTemplate[];
  return rows;
}

export type CreateLogRow = {
  notificationId: string;
  campaignId?: number | null;
  templateCode: string;
  recipient: Recipient;
  channel: string;
  title: string;
  body: string;
  imageUrl: string | null;
  deepLink: string | null;
  priority: string;
  metadata?: Record<string, unknown>;
};

/**
 * Insert a queued notification_dispatch_logs row BEFORE the carrier send. Audit-first:
 * even if the carrier never sees the message (e.g. the worker crashes), we
 * have a record that the send was attempted.
 */
export async function insertQueuedLog(row: CreateLogRow): Promise<void> {
  const sql = getSql();
  await sql`
    INSERT INTO public.notification_dispatch_logs (
      notification_id, campaign_id, template_code,
      recipient_user_id, recipient_role, device_token, device_id, platform,
      channel, title, body, image_url, deep_link, priority, status, metadata
    )
    VALUES (
      ${row.notificationId}::uuid, ${row.campaignId ?? null}, ${row.templateCode},
      ${row.recipient.userId}, ${row.recipient.role}, ${row.recipient.deviceToken}, ${row.recipient.deviceId}, ${row.recipient.platform},
      ${row.channel}, ${row.title}, ${row.body}, ${row.imageUrl}, ${row.deepLink}, ${row.priority}, 'queued',
      ${row.metadata ? sql.json(row.metadata as never) : null}
    )
  `;
}

export async function bulkInsertQueuedLogs(rows: CreateLogRow[]): Promise<void> {
  if (rows.length === 0) return;
  const sql = getSql();
  await sql.begin(async (tx) => {
    for (const r of rows) {
      await tx`
        INSERT INTO public.notification_dispatch_logs (
          notification_id, campaign_id, template_code,
          recipient_user_id, recipient_role, device_token, device_id, platform,
          channel, title, body, image_url, deep_link, priority, status, metadata
        )
        VALUES (
          ${r.notificationId}::uuid, ${r.campaignId ?? null}, ${r.templateCode},
          ${r.recipient.userId}, ${r.recipient.role}, ${r.recipient.deviceToken}, ${r.recipient.deviceId}, ${r.recipient.platform},
          ${r.channel}, ${r.title}, ${r.body}, ${r.imageUrl}, ${r.deepLink}, ${r.priority}, 'queued',
          ${r.metadata ? tx.json(r.metadata as never) : null}
        )
      `;
    }
  });
}

export async function updateLogStatus(
  notificationId: string,
  status: NotificationStatus,
  patch: { errorCode?: string; errorMessage?: string } = {},
): Promise<void> {
  const sql = getSql();
  await sql`
    UPDATE public.notification_dispatch_logs
    SET
      status = ${status},
      sent_at      = CASE WHEN ${status} = 'sent'      AND sent_at      IS NULL THEN now() ELSE sent_at      END,
      delivered_at = CASE WHEN ${status} = 'delivered' AND delivered_at IS NULL THEN now() ELSE delivered_at END,
      clicked_at   = CASE WHEN ${status} = 'clicked'   AND clicked_at   IS NULL THEN now() ELSE clicked_at   END,
      failed_at    = CASE WHEN ${status} = 'failed'    AND failed_at    IS NULL THEN now() ELSE failed_at    END,
      expired_at   = CASE WHEN ${status} = 'expired'   AND expired_at   IS NULL THEN now() ELSE expired_at   END,
      error_code    = COALESCE(${patch.errorCode ?? null}, error_code),
      error_message = COALESCE(${patch.errorMessage ?? null}, error_message)
    WHERE notification_id = ${notificationId}::uuid
  `;
}

/**
 * Mark a click — flips status to 'clicked' and increments
 * the campaign's clicked_count if applicable.
 */
export async function markClicked(notificationId: string): Promise<void> {
  const sql = getSql();
  await sql.begin(async (tx) => {
    const updated = (await tx`
      UPDATE public.notification_dispatch_logs
      SET status = 'clicked', clicked_at = COALESCE(clicked_at, now())
      WHERE notification_id = ${notificationId}::uuid
        AND status NOT IN ('clicked','expired')
      RETURNING campaign_id
    `) as unknown as Array<{ campaign_id: number | null }>;
    const campaignId = updated[0]?.campaign_id;
    if (campaignId) {
      await tx`UPDATE public.notification_campaigns SET clicked_count = clicked_count + 1 WHERE id = ${campaignId}`;
    }
  });
}

export type CampaignInsert = {
  name: string;
  description?: string | null;
  templateCode: string | null;
  overrideTitle?: string | null;
  overrideBody?: string | null;
  overrideImage?: string | null;
  overrideDeepLink?: string | null;
  targetFilter: Record<string, unknown>;
  variables?: Record<string, unknown>;
  scheduledAt?: string | null;
  status?: "draft" | "scheduled" | "running";
  createdBy?: string | null;
};

export async function createCampaign(c: CampaignInsert): Promise<{ id: number }> {
  const sql = getSql();
  const rows = (await sql`
    INSERT INTO public.notification_campaigns (
      name, description, template_code,
      override_title, override_body, override_image, override_deep_link,
      target_filter, variables, scheduled_at, status, created_by
    )
    VALUES (
      ${c.name}, ${c.description ?? null}, ${c.templateCode},
      ${c.overrideTitle ?? null}, ${c.overrideBody ?? null}, ${c.overrideImage ?? null}, ${c.overrideDeepLink ?? null},
      ${sql.json(c.targetFilter as never)},
      ${sql.json((c.variables ?? {}) as never)},
      ${c.scheduledAt ?? null},
      ${c.status ?? "draft"},
      ${c.createdBy ?? null}
    )
    RETURNING id
  `) as unknown as Array<{ id: number }>;
  return rows[0]!;
}

export async function updateCampaignCounts(
  campaignId: number,
  patch: { sent?: number; delivered?: number; clicked?: number; failed?: number; status?: string; finishedAt?: string },
): Promise<void> {
  const sql = getSql();
  await sql`
    UPDATE public.notification_campaigns
    SET
      sent_count      = sent_count      + COALESCE(${patch.sent ?? 0}, 0),
      delivered_count = delivered_count + COALESCE(${patch.delivered ?? 0}, 0),
      clicked_count   = clicked_count   + COALESCE(${patch.clicked ?? 0}, 0),
      failed_count    = failed_count    + COALESCE(${patch.failed ?? 0}, 0),
      status          = COALESCE(${patch.status ?? null}, status),
      finished_at     = COALESCE(${patch.finishedAt ?? null}, finished_at)
    WHERE id = ${campaignId}
  `;
}

export async function loadDueScheduledCampaigns(limit: number = 50): Promise<Array<{ id: number; target_filter: Record<string, unknown>; variables: Record<string, unknown>; template_code: string | null; override_title: string | null; override_body: string | null; override_image: string | null; override_deep_link: string | null }>> {
  const sql = getSql();
  const rows = (await sql`
    UPDATE public.notification_campaigns
    SET status = 'running', started_at = now()
    WHERE id IN (
      SELECT id FROM public.notification_campaigns
      WHERE status = 'scheduled' AND scheduled_at <= now()
      ORDER BY scheduled_at ASC
      LIMIT ${limit}
      FOR UPDATE SKIP LOCKED
    )
    RETURNING id, target_filter, variables, template_code,
              override_title, override_body, override_image, override_deep_link
  `) as unknown as Array<{
    id: number;
    target_filter: Record<string, unknown>;
    variables: Record<string, unknown>;
    template_code: string | null;
    override_title: string | null;
    override_body: string | null;
    override_image: string | null;
    override_deep_link: string | null;
  }>;
  return rows;
}

export async function readSetting<T = unknown>(key: string): Promise<T | null> {
  const sql = getSql();
  const rows = (await sql`SELECT value FROM public.notification_settings WHERE key = ${key}`) as unknown as Array<{ value: T }>;
  return rows[0]?.value ?? null;
}
