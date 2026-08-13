import { client as pg } from "@/lib/drizzle";
import { mapMerchantAppDeepLinkToPartnersite } from "@/lib/mapMerchantAppDeepLink";

export type PartnerCampaignNotification = {
  id: string;
  type: "campaign";
  title: string;
  body: string;
  read: boolean;
  action_url?: string;
  created_at: string;
  source: "campaign";
};

let revokeSupported: boolean | null = null;

async function supportsRevokeColumn(): Promise<boolean> {
  if (revokeSupported != null) return revokeSupported;
  try {
    const rows = await pg`
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'notification_dispatch_logs'
        AND column_name = 'revoked_at'
      LIMIT 1
    `;
    revokeSupported = rows.length > 0;
  } catch {
    revokeSupported = false;
  }
  return revokeSupported;
}

/** Resolve parent_merchant_id (e.g. GMMP1010) for a numeric store PK. */
export async function parentMerchantPublicIdForStore(
  storeIdNum: number
): Promise<string | null> {
  try {
    const rows = await pg`
      SELECT mp.parent_merchant_id
      FROM public.merchant_stores ms
      INNER JOIN public.merchant_parents mp ON mp.id = ms.parent_id
      WHERE ms.id = ${storeIdNum}
        AND ms.deleted_at IS NULL
      LIMIT 1
    `;
    const id = String((rows[0] as { parent_merchant_id?: string } | undefined)?.parent_merchant_id ?? "").trim();
    return id || null;
  } catch (e) {
    console.warn("[partner-campaign-inbox] parent lookup failed:", (e as Error).message);
    return null;
  }
}

function partnersiteDeepLink(raw: string | null | undefined): string {
  return mapMerchantAppDeepLinkToPartnersite(raw);
}

/**
 * Super-admin campaign announcements for this merchant (in_app rows).
 * Phone push lands via Expo/FCM; partnersite drawer historically only read
 * merchant_store_notifications — without this merge the panel stays empty.
 */
export async function listPartnerCampaignNotifications(
  storeIdNum: number,
  limit = 40
): Promise<PartnerCampaignNotification[]> {
  const parentId = await parentMerchantPublicIdForStore(storeIdNum);
  if (!parentId) return [];

  const notRevoked = (await supportsRevokeColumn())
    ? pg`AND d.revoked_at IS NULL`
    : pg``;

  try {
    const rows = await pg`
      SELECT d.notification_id, d.title, d.body, d.deep_link, d.queued_at, d.clicked_at
      FROM public.notification_dispatch_logs d
      WHERE d.recipient_user_id = ${parentId}
        AND d.recipient_role = 'merchant'
        AND d.channel = 'in_app'
        AND d.status IN ('queued', 'sent', 'delivered', 'clicked')
        ${notRevoked}
      ORDER BY d.queued_at DESC
      LIMIT ${limit}
    `;
    return (rows as unknown as Array<{
      notification_id: string;
      title: string | null;
      body: string | null;
      deep_link: string | null;
      queued_at: string | Date;
      clicked_at: string | Date | null;
    }>).map((r) => ({
      id: String(r.notification_id),
      type: "campaign" as const,
      title: String(r.title ?? "Announcement"),
      body: String(r.body ?? ""),
      read: r.clicked_at != null,
      action_url: partnersiteDeepLink(r.deep_link),
      created_at:
        r.queued_at instanceof Date ? r.queued_at.toISOString() : String(r.queued_at),
      source: "campaign" as const,
    }));
  } catch (e) {
    console.warn("[partner-campaign-inbox] list failed:", (e as Error).message);
    return [];
  }
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isCampaignNotificationId(id: string): boolean {
  return UUID_RE.test(id.trim());
}

export async function markPartnerCampaignRead(
  storeIdNum: number,
  notificationId: string
): Promise<boolean> {
  const parentId = await parentMerchantPublicIdForStore(storeIdNum);
  if (!parentId || !isCampaignNotificationId(notificationId)) return false;
  try {
    const rows = await pg`
      UPDATE public.notification_dispatch_logs
      SET
        clicked_at = COALESCE(clicked_at, now()),
        status = CASE
          WHEN status IN ('queued', 'sent', 'delivered') THEN 'clicked'
          ELSE status
        END
      WHERE notification_id = ${notificationId}::uuid
        AND recipient_user_id = ${parentId}
        AND channel = 'in_app'
      RETURNING notification_id
    `;
    return rows.length > 0;
  } catch (e) {
    console.warn("[partner-campaign-inbox] mark_read failed:", (e as Error).message);
    return false;
  }
}

export async function markAllPartnerCampaignsRead(storeIdNum: number): Promise<void> {
  const parentId = await parentMerchantPublicIdForStore(storeIdNum);
  if (!parentId) return;
  try {
    await pg`
      UPDATE public.notification_dispatch_logs
      SET
        clicked_at = COALESCE(clicked_at, now()),
        status = CASE
          WHEN status IN ('queued', 'sent', 'delivered') THEN 'clicked'
          ELSE status
        END
      WHERE recipient_user_id = ${parentId}
        AND recipient_role = 'merchant'
        AND channel = 'in_app'
        AND clicked_at IS NULL
    `;
  } catch (e) {
    console.warn("[partner-campaign-inbox] mark_all_read failed:", (e as Error).message);
  }
}

export async function clearPartnerCampaignNotifications(storeIdNum: number): Promise<void> {
  const parentId = await parentMerchantPublicIdForStore(storeIdNum);
  if (!parentId) return;
  const canRevoke = await supportsRevokeColumn();
  try {
    if (canRevoke) {
      await pg`
        UPDATE public.notification_dispatch_logs
        SET revoked_at = COALESCE(revoked_at, now())
        WHERE recipient_user_id = ${parentId}
          AND recipient_role = 'merchant'
          AND channel = 'in_app'
          AND revoked_at IS NULL
      `;
    } else {
      await pg`
        UPDATE public.notification_dispatch_logs
        SET
          clicked_at = COALESCE(clicked_at, now()),
          status = 'clicked'
        WHERE recipient_user_id = ${parentId}
          AND recipient_role = 'merchant'
          AND channel = 'in_app'
      `;
    }
  } catch (e) {
    console.warn("[partner-campaign-inbox] clear failed:", (e as Error).message);
  }
}

export async function deletePartnerCampaignNotification(
  storeIdNum: number,
  notificationId: string
): Promise<boolean> {
  const parentId = await parentMerchantPublicIdForStore(storeIdNum);
  if (!parentId || !isCampaignNotificationId(notificationId)) return false;
  const canRevoke = await supportsRevokeColumn();
  try {
    if (canRevoke) {
      const rows = await pg`
        UPDATE public.notification_dispatch_logs
        SET revoked_at = COALESCE(revoked_at, now())
        WHERE notification_id = ${notificationId}::uuid
          AND recipient_user_id = ${parentId}
          AND channel = 'in_app'
        RETURNING notification_id
      `;
      return rows.length > 0;
    }
    const rows = await pg`
      UPDATE public.notification_dispatch_logs
      SET clicked_at = COALESCE(clicked_at, now()), status = 'clicked'
      WHERE notification_id = ${notificationId}::uuid
        AND recipient_user_id = ${parentId}
        AND channel = 'in_app'
      RETURNING notification_id
    `;
    return rows.length > 0;
  } catch (e) {
    console.warn("[partner-campaign-inbox] delete failed:", (e as Error).message);
    return false;
  }
}
