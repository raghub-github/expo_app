/**
 * CUSTOMER_ANNOUNCEMENT campaign field helpers.
 * CTA, countdown, character limits, server-authoritative remaining time.
 * Presentation only — offer validity is always re-checked on the server.
 */

export const ANNOUNCEMENT_TITLE_MAX = 80;
export const ANNOUNCEMENT_BODY_MAX = 240;
export const ANNOUNCEMENT_CTA_MAX = 32;

export const OFFER_EXPIRED_MESSAGE = "Sorry, this offer has expired.";
export const OFFER_NOT_STARTED_MESSAGE = "This offer is not available yet.";
export const CAMPAIGN_UNAVAILABLE_MESSAGE = "This announcement is no longer available.";
export const FALLBACK_DEEP_LINK = "/home";

export function trimToNull(value: unknown): string | null {
  if (value == null) return null;
  const s = String(value).replace(/\s+/g, " ").trim();
  return s.length > 0 ? s : null;
}

export function sanitizePlainText(value: unknown, max: number): string {
  const raw = String(value ?? "")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (raw.length <= max) return raw;
  return raw.slice(0, max).trim();
}

export function normalizeCtaLabel(value: unknown): string | null {
  const s = sanitizePlainText(value, ANNOUNCEMENT_CTA_MAX);
  return s.length > 0 ? s : null;
}

export function parseIsoUtc(value: unknown): Date | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  const s = String(value ?? "").trim();
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function formatRemainingHms(remainingMs: number): string {
  const ms = Math.max(0, Math.floor(remainingMs));
  const totalSec = Math.floor(ms / 1000);
  const days = Math.floor(totalSec / 86400);
  const hours = Math.floor((totalSec % 86400) / 3600);
  const minutes = Math.floor((totalSec % 3600) / 60);
  const seconds = totalSec % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  if (days > 0) return `${pad(days)}:${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
}

export type CountdownWindow = {
  countdownEnabled: boolean;
  startsAt: Date | null;
  endsAt: Date | null;
};

export function parseCountdownWindow(src: Record<string, unknown> | null | undefined): CountdownWindow {
  const raw = src ?? {};
  const enabledRaw = raw.countdown_enabled ?? raw.countdownEnabled ?? raw.countdown;
  const countdownEnabled =
    enabledRaw === true ||
    enabledRaw === "true" ||
    enabledRaw === 1 ||
    enabledRaw === "1" ||
    String(enabledRaw ?? "").toUpperCase() === "ON";
  return {
    countdownEnabled,
    startsAt: parseIsoUtc(raw.starts_at ?? raw.startsAt ?? raw.valid_from ?? raw.validFrom),
    endsAt: parseIsoUtc(raw.ends_at ?? raw.endsAt ?? raw.valid_until ?? raw.validUntil ?? raw.till),
  };
}

export function validateCountdownWindow(window: CountdownWindow): string | null {
  if (!window.countdownEnabled) return null;
  if (!window.startsAt) return "Countdown requires a start time";
  if (!window.endsAt) return "Countdown requires an end time";
  if (window.endsAt.getTime() <= window.startsAt.getTime()) {
    return "End time must be after start time";
  }
  return null;
}

export type CampaignValidity = "not_started" | "active" | "expired" | "cancelled" | "open";

export function campaignValidity(opts: {
  countdownEnabled: boolean;
  startsAt: Date | null;
  endsAt: Date | null;
  cancelled?: boolean;
  now?: Date;
}): CampaignValidity {
  if (opts.cancelled) return "cancelled";
  if (!opts.countdownEnabled) return "open";
  const now = (opts.now ?? new Date()).getTime();
  if (opts.startsAt && now < opts.startsAt.getTime()) return "not_started";
  if (opts.endsAt && now >= opts.endsAt.getTime()) return "expired";
  return "active";
}

export function remainingMsUntil(endsAt: Date | null, now: Date): number {
  if (!endsAt) return 0;
  return Math.max(0, endsAt.getTime() - now.getTime());
}

export function announcementPresentationMode(opts: {
  ctaLabel: string | null;
  imageUrl: string | null;
  countdownEnabled: boolean;
}): "plain" | "cta" | "image" | "full" {
  const hasCta = Boolean(opts.ctaLabel);
  const hasImage = Boolean(opts.imageUrl);
  const hasCount = Boolean(opts.countdownEnabled);
  if (hasCta && hasImage && hasCount) return "full";
  if (hasImage) return "image";
  if (hasCta) return "cta";
  return "plain";
}

export type CustomerAnnouncementFields = {
  title: string;
  body: string;
  ctaLabel: string | null;
  imageUrl: string | null;
  countdownEnabled: boolean;
  startsAt: Date | null;
  endsAt: Date | null;
};

export function parseCustomerAnnouncementFields(
  src: Record<string, unknown> | null | undefined,
): { ok: true; fields: CustomerAnnouncementFields } | { ok: false; error: string } {
  const raw = src ?? {};
  const title = sanitizePlainText(raw.title ?? raw.override_title ?? raw.overrideTitle, ANNOUNCEMENT_TITLE_MAX);
  const body = sanitizePlainText(raw.body ?? raw.override_body ?? raw.overrideBody, ANNOUNCEMENT_BODY_MAX);
  if (!title) return { ok: false, error: "Title is required" };
  if (!body) return { ok: false, error: "Message is required" };
  const ctaLabel = normalizeCtaLabel(raw.cta_label ?? raw.ctaLabel ?? raw.cta);
  const imageUrl = trimToNull(raw.image_url ?? raw.imageUrl ?? raw.overrideImage ?? raw.override_image);
  if (imageUrl && !/^https:\/\//i.test(imageUrl)) {
    return { ok: false, error: "Image URL must be HTTPS" };
  }
  const window = parseCountdownWindow(raw);
  const countdownError = validateCountdownWindow(window);
  if (countdownError) return { ok: false, error: countdownError };
  if (ctaLabel && String(raw.target_type ?? raw.targetType ?? "NONE").toUpperCase() === "NONE") {
    return { ok: false, error: "Select a tap destination when a CTA label is set" };
  }
  return {
    ok: true,
    fields: {
      title,
      body,
      ctaLabel,
      imageUrl,
      countdownEnabled: window.countdownEnabled,
      startsAt: window.startsAt,
      endsAt: window.endsAt,
    },
  };
}

export function announcementPushExtras(opts: {
  campaignId?: number | string | null;
  notificationId?: string | null;
  fields: CustomerAnnouncementFields;
  targetType: string | null;
  targetId: string | null;
  now?: Date;
}): Record<string, unknown> {
  const now = opts.now ?? new Date();
  const extras: Record<string, unknown> = {
    notification_type: "CUSTOMER_ANNOUNCEMENT",
    countdown_enabled: opts.fields.countdownEnabled ? "true" : "false",
    server_now: now.toISOString(),
  };
  if (opts.campaignId != null && String(opts.campaignId).trim()) {
    extras.campaign_id = String(opts.campaignId);
  }
  if (opts.notificationId) {
    extras.message_id = opts.notificationId;
    extras.notification_id = opts.notificationId;
  }
  if (opts.fields.ctaLabel) extras.cta_label = opts.fields.ctaLabel;
  if (opts.fields.imageUrl) {
    extras.image_url = opts.fields.imageUrl;
    extras.imageUrl = opts.fields.imageUrl;
  }
  if (opts.targetType) extras.target_type = opts.targetType;
  if (opts.targetId) extras.target_id = opts.targetId;
  if (opts.fields.startsAt) extras.starts_at = opts.fields.startsAt.toISOString();
  if (opts.fields.endsAt) extras.ends_at = opts.fields.endsAt.toISOString();
  if (opts.fields.countdownEnabled && opts.fields.endsAt) {
    extras.remaining_ms = String(remainingMsUntil(opts.fields.endsAt, now));
  }
  return extras;
}

export function validityUserMessage(status: CampaignValidity): string | null {
  if (status === "expired") return OFFER_EXPIRED_MESSAGE;
  if (status === "not_started") return OFFER_NOT_STARTED_MESSAGE;
  if (status === "cancelled") return CAMPAIGN_UNAVAILABLE_MESSAGE;
  return null;
}
