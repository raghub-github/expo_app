/**
 * Customer announcement campaign payload helpers.
 * Countdown uses remaining_ms / (ends_at - server_now) so a changed device
 * clock cannot extend displayed remaining time.
 */

export const OFFER_EXPIRED_MESSAGE = "Sorry, this offer has expired.";

export function asTrimmedString(v: unknown): string {
  return typeof v === "string" ? v.trim() : v != null ? String(v).trim() : "";
}

export function normalizeCtaLabel(v: unknown): string | null {
  const s = asTrimmedString(v).replace(/\s+/g, " ");
  return s.length > 0 ? s.slice(0, 32) : null;
}

export function formatRemainingHms(remainingMs: number): string {
  const totalSec = Math.max(0, Math.floor(remainingMs / 1000));
  const days = Math.floor(totalSec / 86400);
  const hours = Math.floor((totalSec % 86400) / 3600);
  const minutes = Math.floor((totalSec % 3600) / 60);
  const seconds = totalSec % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  if (days > 0) return `${pad(days)}:${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
}

export type AnnouncementCampaignPayload = {
  notificationId: string | null;
  campaignId: string | null;
  title: string;
  body: string;
  imageUrl: string | null;
  ctaLabel: string | null;
  countdownEnabled: boolean;
  endsAtMs: number | null;
  remainingAtSyncMs: number;
  syncedAtPerf: number;
  targetType: string;
};

export function isCustomerAnnouncementData(data: Record<string, unknown> | null | undefined): boolean {
  if (!data) return false;
  const gm = asTrimmedString(data.gmType || data.template_code || data.notification_type).toUpperCase();
  return gm === "CUSTOMER_ANNOUNCEMENT" || gm === "RICH";
}

export function parseAnnouncementCampaign(
  data: Record<string, unknown> | null | undefined,
  titleFallback = "",
  bodyFallback = "",
): AnnouncementCampaignPayload {
  const d = data ?? {};
  const endsAtRaw = asTrimmedString(d.ends_at || d.endsAt);
  const serverNowRaw = asTrimmedString(d.server_now || d.serverNow);
  const remainingRaw = Number(d.remaining_ms ?? d.remainingMs);
  const endsAtMs = endsAtRaw ? Date.parse(endsAtRaw) : NaN;
  const serverNowMs = serverNowRaw ? Date.parse(serverNowRaw) : NaN;
  let remainingAtSyncMs = 0;
  if (Number.isFinite(remainingRaw) && remainingRaw >= 0) {
    remainingAtSyncMs = remainingRaw;
  } else if (Number.isFinite(endsAtMs) && Number.isFinite(serverNowMs)) {
    remainingAtSyncMs = Math.max(0, endsAtMs - serverNowMs);
  }
  const countdownEnabled =
    d.countdown_enabled === true ||
    d.countdown_enabled === "true" ||
    d.countdownEnabled === true;
  const imageUrl =
    asTrimmedString(d.imageUrl) || asTrimmedString(d.image_url) || null;
  return {
    notificationId:
      asTrimmedString(d.notification_id || d.notificationId || d.message_id) || null,
    campaignId: asTrimmedString(d.campaign_id || d.campaignId) || null,
    title: asTrimmedString(d.title || d.gmTitle) || titleFallback,
    body: asTrimmedString(d.body || d.gmMessage) || bodyFallback,
    imageUrl: imageUrl && imageUrl.length > 0 ? imageUrl : null,
    ctaLabel: normalizeCtaLabel(d.cta_label || d.ctaLabel),
    countdownEnabled,
    endsAtMs: Number.isFinite(endsAtMs) ? endsAtMs : null,
    remainingAtSyncMs,
    syncedAtPerf: globalThis.performance?.now?.() ?? Date.now(),
    targetType: asTrimmedString(d.target_type || d.targetType).toUpperCase(),
  };
}

export function announcementDedupeKey(data: Record<string, unknown>): string {
  const campaignId = asTrimmedString(data.campaign_id || data.campaignId);
  const messageId = asTrimmedString(
    data.message_id || data.notification_id || data.notificationId,
  );
  if (campaignId && messageId) return `${campaignId}:${messageId}`;
  if (messageId) return messageId;
  return JSON.stringify({
    t: data.title,
    b: data.body,
    c: data.campaign_id,
  });
}

export function shouldShowRichCampaignCard(parsed: AnnouncementCampaignPayload): boolean {
  return Boolean(parsed.ctaLabel || parsed.imageUrl || parsed.countdownEnabled);
}
