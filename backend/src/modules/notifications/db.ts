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
  // jsonb sent as text + ::text::jsonb cast — see createCampaign below for why
  // plain ::jsonb silently double-encodes under prepare: false.
  const metadataStr = row.metadata ? JSON.stringify(row.metadata) : null;
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
      ${metadataStr === null ? null : sql`${metadataStr}::text::jsonb`}
    )
  `;
}

export async function bulkInsertQueuedLogs(rows: CreateLogRow[]): Promise<void> {
  if (rows.length === 0) return;
  const sql = getSql();
  await sql.begin(async (tx) => {
    for (const r of rows) {
      const metadataStr = r.metadata ? JSON.stringify(r.metadata) : null;
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
          ${metadataStr === null ? null : tx`${metadataStr}::text::jsonb`}
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

export type CampaignRow = {
  id: number;
  name: string;
  description: string | null;
  template_code: string | null;
  override_title: string | null;
  override_body: string | null;
  override_image: string | null;
  override_deep_link: string | null;
  target_filter: Record<string, unknown>;
  variables: Record<string, unknown>;
  status: string;
  scheduled_at: string | null;
};

export async function getCampaignById(campaignId: number): Promise<CampaignRow | null> {
  const sql = getSql();
  const rows = (await sql`
    SELECT id, name, description, template_code,
           override_title, override_body, override_image, override_deep_link,
           target_filter, variables, status, scheduled_at
    FROM public.notification_campaigns
    WHERE id = ${campaignId}
    LIMIT 1
  `) as unknown as CampaignRow[];
  return rows[0] ?? null;
}

/** Reset a finished campaign so send() can run again on the same row. */
export async function prepareCampaignResend(campaignId: number): Promise<void> {
  const sql = getSql();
  await sql`
    UPDATE public.notification_campaigns
    SET status = 'running',
        started_at = now(),
        finished_at = NULL,
        cancelled_at = NULL,
        cancelled_by = NULL
    WHERE id = ${campaignId}
  `;
}

export async function createCampaign(c: CampaignInsert): Promise<{ id: number }> {
  const sql = getSql();
  // Send jsonb columns as pre-stringified text with an explicit `::jsonb` cast.
  // `sql.json(...)` builds a Parameter with type OID 3802, but on this pooler
  // that path was crashing during Bind with ERR_INVALID_ARG_TYPE — probably
  // because the type descriptor round-trip stripped the OID and postgres.js
  // ended up writing the raw object to the wire. Passing a JSON string + cast
  // is stable across pooler configurations and does not require prepared
  // statement support.
  // IMPORTANT: `::jsonb` alone still isn't enough — with `prepare: false`,
  // postgres.js auto-encodes the already-JSON string a second time, storing
  // a jsonb *string* scalar instead of the intended object/array (proven via
  // jsonb_typeof — silently breaks any `->`/`@>`/`->>'field'` read later).
  // `::text::jsonb` binds as text first, avoiding the re-encode.
  const targetFilterStr = JSON.stringify(c.targetFilter ?? {});
  const variablesStr = JSON.stringify(c.variables ?? {});
  const rows = (await sql`
    INSERT INTO public.notification_campaigns (
      name, description, template_code,
      override_title, override_body, override_image, override_deep_link,
      target_filter, variables, scheduled_at, status, created_by
    )
    VALUES (
      ${c.name}, ${c.description ?? null}, ${c.templateCode},
      ${c.overrideTitle ?? null}, ${c.overrideBody ?? null}, ${c.overrideImage ?? null}, ${c.overrideDeepLink ?? null},
      ${targetFilterStr}::text::jsonb,
      ${variablesStr}::text::jsonb,
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
  patch: {
    sent?: number;
    delivered?: number;
    clicked?: number;
    failed?: number;
    status?: string;
    finishedAt?: string;
    startedAt?: string;
  },
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
      started_at      = COALESCE(${patch.startedAt ?? null}, started_at),
      finished_at     = COALESCE(${patch.finishedAt ?? null}, finished_at)
    WHERE id = ${campaignId}
  `;
}

/** Recompute campaign KPI columns from notification_dispatch_logs (source of truth). */
export async function syncCampaignCountsFromLogs(campaignId: number): Promise<void> {
  const sql = getSql();
  await sql`
    UPDATE public.notification_campaigns c
    SET
      sent_count = COALESCE(stats.sent_count, 0),
      delivered_count = COALESCE(stats.delivered_count, 0),
      clicked_count = COALESCE(stats.clicked_count, 0),
      failed_count = COALESCE(stats.failed_count, 0)
    FROM (
      SELECT
        -- Provider accepted / enqueued (includes later delivered+clicked)
        COUNT(*) FILTER (
          WHERE status IN ('sent', 'delivered', 'clicked')
        )::int AS sent_count,
        -- Confirmed delivery (OS/inbox) or clicked after delivery
        COUNT(*) FILTER (
          WHERE status IN ('delivered', 'clicked')
        )::int AS delivered_count,
        COUNT(*) FILTER (WHERE status = 'clicked')::int AS clicked_count,
        COUNT(*) FILTER (WHERE status = 'failed')::int AS failed_count
      FROM public.notification_dispatch_logs
      WHERE campaign_id = ${campaignId}
    ) stats
    WHERE c.id = ${campaignId}
  `;
}

/** Mark an immediate-send campaign as started (idempotent). */
export async function markCampaignStarted(campaignId: number): Promise<void> {
  await updateCampaignCounts(campaignId, { startedAt: new Date().toISOString() });
}

/** Transition a campaign out of `running` after send() finishes (counts are rolled up separately). */
export async function finalizeCampaignSend(
  campaignId: number,
  status: "completed" | "failed" | "cancelled",
): Promise<void> {
  await syncCampaignCountsFromLogs(campaignId);
  await updateCampaignCounts(campaignId, {
    status,
    finishedAt: new Date().toISOString(),
  });
}

/**
 * Recover immediate-send campaigns left stuck in `running` when an older code path
 * never flipped status after send() returned.
 * Only mark completed when logs show provider-accepted work; otherwise fail so
 * Super Admin does not show a false success.
 */
export async function recoverStaleRunningCampaigns(): Promise<number> {
  const sql = getSql();
  const stuck = (await sql`
    SELECT id FROM public.notification_campaigns
    WHERE status = 'running'
      AND scheduled_at IS NULL
      AND finished_at IS NULL
      AND created_at < now() - interval '2 minutes'
  `) as unknown as Array<{ id: number }>;
  let n = 0;
  for (const row of stuck) {
    await syncCampaignCountsFromLogs(row.id);
    const counts = (await sql`
      SELECT
        COALESCE(SUM(CASE WHEN status IN ('sent','delivered','clicked') THEN 1 ELSE 0 END), 0)::int AS ok_count,
        COALESCE(SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END), 0)::int AS fail_count,
        COALESCE(SUM(CASE WHEN status IN ('queued') THEN 1 ELSE 0 END), 0)::int AS pending_count
      FROM public.notification_dispatch_logs
      WHERE campaign_id = ${row.id}
    `) as unknown as Array<{ ok_count: number; fail_count: number; pending_count: number }>;
    const c = counts[0] ?? { ok_count: 0, fail_count: 0, pending_count: 0 };
    const status =
      c.ok_count > 0 && c.pending_count === 0
        ? "completed"
        : c.fail_count > 0 && c.ok_count === 0
          ? "failed"
          : c.pending_count > 0
            ? "failed"
            : "completed";
    await sql`
      UPDATE public.notification_campaigns
      SET status = ${status}, finished_at = COALESCE(finished_at, now())
      WHERE id = ${row.id} AND status = 'running'
    `;
    n += 1;
  }
  return n;
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

export async function listSettings(): Promise<
  Array<{ key: string; value: unknown; description: string | null; updated_at: string; updated_by: string | null }>
> {
  const sql = getSql();
  return (await sql`
    SELECT key, value, description, updated_at::text, updated_by
    FROM public.notification_settings
    ORDER BY key ASC
  `) as unknown as Array<{
    key: string;
    value: unknown;
    description: string | null;
    updated_at: string;
    updated_by: string | null;
  }>;
}

export async function upsertSetting(
  key: string,
  value: unknown,
  opts?: { description?: string | null; updatedBy?: string | null },
): Promise<void> {
  const sql = getSql();
  const valueStr = JSON.stringify(value ?? null);
  await sql`
    INSERT INTO public.notification_settings (key, value, description, updated_by, updated_at)
    VALUES (
      ${key},
      ${valueStr}::text::jsonb,
      ${opts?.description ?? null},
      ${opts?.updatedBy ?? null},
      now()
    )
    ON CONFLICT (key) DO UPDATE SET
      value = EXCLUDED.value,
      description = COALESCE(EXCLUDED.description, notification_settings.description),
      updated_by = COALESCE(EXCLUDED.updated_by, notification_settings.updated_by),
      updated_at = now()
  `;
}
