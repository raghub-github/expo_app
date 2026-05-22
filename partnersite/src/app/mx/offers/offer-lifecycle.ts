import type { Offer } from "@/lib/database";

export type OfferTrackFilter = "active" | "scheduled" | "inactive" | "all";
export type OfferLifecyclePhase = "upcoming" | "active" | "inactive";
export type OfferLifecycleReason =
  | "in_window"
  | "not_started"
  | "expired"
  | "disabled"
  | "outside_slot"
  | "before_slot"
  | "wrong_day"
  | "invalid_dates";

export type OfferLifecycleResult = {
  phase: OfferLifecyclePhase;
  reason: OfferLifecycleReason;
};

const DAY_INDEX_TO_NAME = [
  "SUNDAY",
  "MONDAY",
  "TUESDAY",
  "WEDNESDAY",
  "THURSDAY",
  "FRIDAY",
  "SATURDAY",
] as const;

const DAY_ALIAS: Record<string, string> = {
  SUN: "SUNDAY",
  MON: "MONDAY",
  TUE: "TUESDAY",
  WED: "WEDNESDAY",
  THU: "THURSDAY",
  FRI: "FRIDAY",
  SAT: "SATURDAY",
};

function normalizeDayToken(day: string): string {
  const u = day.trim().toUpperCase();
  return DAY_ALIAS[u] ?? u;
}

function formatOrdinalDay(day: number): string {
  const suffix =
    day % 10 === 1 && day !== 11
      ? "st"
      : day % 10 === 2 && day !== 12
        ? "nd"
        : day % 10 === 3 && day !== 13
          ? "rd"
          : "th";
  return `${day}${suffix}`;
}

/** Campaign calendar date from merchant_offers.valid_from / valid_till (timestamptz, local). */
export function formatCampaignDateLocal(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const day = d.getDate();
  const month = d.toLocaleDateString("en-IN", { month: "short" });
  return `${formatOrdinalDay(day)} ${month} ${d.getFullYear()}`;
}

/** Display merchant_offers.applicable_time_start / applicable_time_end (time without time zone). */
export function formatDbTimeColumn(time: string | null | undefined): string | null {
  const minutes = parseTimeToMinutes(time);
  if (minutes == null) return null;
  return formatMinutesAsTime(minutes);
}

/**
 * Card header: campaign dates from valid_from/valid_till + daily slot from applicable_time_*.
 * Does not read clock time from valid_from/valid_till (those are campaign boundaries only).
 */
export function formatOfferValidityRange(offer: Offer): string {
  const fromDate = formatCampaignDateLocal(offer.valid_from);
  const tillDate = formatCampaignDateLocal(offer.valid_till);
  const slotStart = formatDbTimeColumn(offer.applicable_time_start);
  const slotEnd = formatDbTimeColumn(offer.applicable_time_end);

  if (slotStart && slotEnd) {
    return `${fromDate}, ${slotStart} – ${tillDate}, ${slotEnd}`;
  }
  if (slotStart) {
    return `${fromDate}, ${slotStart} – ${tillDate}`;
  }
  if (slotEnd) {
    return `${fromDate} – ${tillDate}, ${slotEnd}`;
  }
  return `${fromDate} – ${tillDate}`;
}

function parseTimeToMinutes(time: string | null | undefined): number | null {
  if (!time?.trim()) return null;
  const m = time.trim().match(/^(\d{1,2}):(\d{2})/);
  if (!m) return null;
  const h = parseInt(m[1], 10);
  const min = parseInt(m[2], 10);
  if (Number.isNaN(h) || Number.isNaN(min)) return null;
  return h * 60 + min;
}

function formatMinutesAsTime(minutes: number): string {
  const h = Math.floor(minutes / 60) % 24;
  const m = minutes % 60;
  const d = new Date();
  d.setHours(h, m, 0, 0);
  return d.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", hour12: true });
}

export function hasOfferScheduleRestrictions(offer: Offer): boolean {
  return Boolean(
    (offer.applicable_on_days?.length ?? 0) > 0 ||
      offer.applicable_time_start?.trim() ||
      offer.applicable_time_end?.trim()
  );
}

export function formatOfferSlotSummary(offer: Offer): string {
  const days = offer.applicable_on_days?.filter(Boolean) ?? [];
  const startM = parseTimeToMinutes(offer.applicable_time_start);
  const endM = parseTimeToMinutes(offer.applicable_time_end);

  if (days.length === 0 && startM == null && endM == null) {
    return "All day, every day (no time slot)";
  }

  const parts: string[] = [];
  if (days.length > 0) {
    const labels = days.map((d) => {
      const n = normalizeDayToken(d);
      return n.charAt(0) + n.slice(1, 3).toLowerCase();
    });
    parts.push(labels.join(", "));
  }
  if (startM != null && endM != null) {
    parts.push(`${formatMinutesAsTime(startM)} – ${formatMinutesAsTime(endM)}`);
  } else if (startM != null) {
    parts.push(`From ${formatMinutesAsTime(startM)}`);
  } else if (endM != null) {
    parts.push(`Until ${formatMinutesAsTime(endM)}`);
  }
  return parts.join(" · ");
}

function isApplicableOnDay(offer: Offer, now: Date): boolean {
  const days = offer.applicable_on_days?.filter(Boolean) ?? [];
  if (days.length === 0) return true;
  const today = DAY_INDEX_TO_NAME[now.getDay()];
  return days.some((d) => normalizeDayToken(d) === today);
}

type SlotPosition = "in_slot" | "before_slot" | "after_slot" | "no_slot";

function getSlotPosition(offer: Offer, now: Date): SlotPosition {
  const startM = parseTimeToMinutes(offer.applicable_time_start);
  const endM = parseTimeToMinutes(offer.applicable_time_end);
  if (startM == null && endM == null) return "no_slot";

  const nowM = now.getHours() * 60 + now.getMinutes();
  if (startM != null && endM != null) {
    if (startM <= endM) {
      if (nowM < startM) return "before_slot";
      if (nowM > endM) return "after_slot";
      return "in_slot";
    }
    if (nowM >= startM || nowM <= endM) return "in_slot";
    return "after_slot";
  }
  if (startM != null && nowM < startM) return "before_slot";
  if (endM != null && nowM > endM) return "after_slot";
  return "in_slot";
}

export function getOfferValidityWindow(offer: Offer): { start: Date; end: Date } {
  const startRaw = new Date(offer.valid_from);
  const endRaw = new Date(offer.valid_till);
  if (Number.isNaN(startRaw.getTime()) || Number.isNaN(endRaw.getTime())) {
    return { start: startRaw, end: endRaw };
  }
  const start = new Date(
    startRaw.getFullYear(),
    startRaw.getMonth(),
    startRaw.getDate(),
    0,
    0,
    0,
    0
  );
  const end = new Date(
    endRaw.getFullYear(),
    endRaw.getMonth(),
    endRaw.getDate(),
    23,
    59,
    59,
    999
  );
  return { start, end };
}

export function getOfferLifecycle(offer: Offer, now: Date = new Date()): OfferLifecycleResult {
  const { start, end } = getOfferValidityWindow(offer);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return { phase: "inactive", reason: "invalid_dates" };
  }

  const t = now.getTime();
  if (t < start.getTime()) return { phase: "upcoming", reason: "not_started" };
  if (t > end.getTime()) return { phase: "inactive", reason: "expired" };
  if (offer.is_active === false) return { phase: "inactive", reason: "disabled" };

  if (!isApplicableOnDay(offer, now)) {
    return { phase: "inactive", reason: "wrong_day" };
  }

  const slot = getSlotPosition(offer, now);
  if (slot === "before_slot") return { phase: "upcoming", reason: "before_slot" };
  if (slot === "after_slot") return { phase: "inactive", reason: "outside_slot" };

  return { phase: "active", reason: "in_window" };
}

export function getOfferLifecyclePhase(offer: Offer, now: Date = new Date()): OfferLifecyclePhase {
  return getOfferLifecycle(offer, now).phase;
}

export function getOfferStatusBadge(lifecycle: OfferLifecycleResult): {
  label: string;
  className: string;
} {
  if (lifecycle.phase === "active") {
    return { label: "Active", className: "border border-emerald-200 text-emerald-700 bg-emerald-50" };
  }
  if (lifecycle.phase === "upcoming") {
    return { label: "Upcoming", className: "border border-sky-200 text-sky-700 bg-sky-50" };
  }
  switch (lifecycle.reason) {
    case "outside_slot":
    case "wrong_day":
      return {
        label: "Not Active Today",
        className: "border border-gray-300 text-gray-600 bg-gray-50",
      };
    case "disabled":
      return { label: "Inactive", className: "border border-yellow-200 text-amber-700 bg-yellow-50" };
    default:
      return { label: "Inactive", className: "border border-gray-300 text-gray-600 bg-white" };
  }
}

/** Campaign ended (valid_till date passed) or dates invalid. */
export function isOfferCampaignExpired(offer: Offer, now: Date = new Date()): boolean {
  const { reason } = getOfferLifecycle(offer, now);
  return reason === "expired" || reason === "invalid_dates";
}

/**
 * Track tabs: Inactive = ended/disabled; Scheduled = not started; Active = in campaign (any day/slot state).
 */
export function offerMatchesTrackFilter(
  offer: Offer,
  filter: OfferTrackFilter,
  now: Date = new Date()
): boolean {
  const { reason } = getOfferLifecycle(offer, now);
  const expired = reason === "expired" || reason === "invalid_dates";
  const disabled = reason === "disabled";
  const notStarted = reason === "not_started";

  switch (filter) {
    case "inactive":
      return expired || disabled;
    case "scheduled":
      return notStarted;
    case "active":
      return !expired && !disabled && !notStarted;
    case "all":
    default:
      return true;
  }
}

export function getOfferPlatformLabel(platform: string | null | undefined): string {
  const p = String(platform ?? "").toUpperCase().trim();
  switch (p) {
    case "AGENT_DASHBOARD":
    case "ADMIN_DASHBOARD":
      return "GatiMitra Team";
    case "MERCHANT_PORTAL":
      return "Merchant Portal";
    case "MERCHANT_APP":
      return "Merchant App";
    case "SYSTEM":
      return "System";
    default:
      return "Merchant App";
  }
}

export function isGatiMitraTeamPlatform(platform: string | null | undefined): boolean {
  const p = String(platform ?? "").toUpperCase().trim();
  return p === "AGENT_DASHBOARD" || p === "ADMIN_DASHBOARD";
}

/** Email local-part or login handle — not a human display name. */
export function looksLikeLoginHandle(name: string): boolean {
  const t = name.trim();
  if (!t) return false;
  if (t.includes("@")) return true;
  if (/\s/.test(t)) return false;
  return /^[a-z0-9._-]+$/i.test(t) && t.length <= 64;
}

export type FormatOfferActorOptions = {
  /** Merchant owner / account display name when DB stored an email handle. */
  ownerDisplayName?: string | null;
};

export function formatOfferActorDisplay(
  platform: string | null | undefined,
  personName: string | null | undefined,
  options?: FormatOfferActorOptions
): string {
  const label = getOfferPlatformLabel(platform);
  if (isGatiMitraTeamPlatform(platform)) return label;

  let name = personName?.trim() ?? "";
  if (name && looksLikeLoginHandle(name) && options?.ownerDisplayName?.trim()) {
    name = options.ownerDisplayName.trim();
  }
  return name ? `${label} · ${name}` : label;
}

export function offerWasUpdated(offer: Offer): boolean {
  if (offer.updated_by_name?.trim()) return true;
  const createdPlatform = (offer as Offer & { created_source_platform?: string }).created_source_platform;
  const updatedPlatform = (offer as Offer & { updated_source_platform?: string }).updated_source_platform;
  if (updatedPlatform && updatedPlatform !== createdPlatform) return true;
  const created = new Date(offer.created_at).getTime();
  const updated = new Date(offer.updated_at).getTime();
  if (!Number.isNaN(created) && !Number.isNaN(updated) && updated - created > 3000) return true;
  return false;
}

export function countOffersForTrackFilter(
  offers: Offer[],
  filter: OfferTrackFilter,
  now: Date = new Date()
): number {
  return offers.filter((o) => offerMatchesTrackFilter(o, filter, now)).length;
}

export function getOfferMenuItemIds(offer: Offer): string[] {
  const meta = (offer.offer_metadata ?? {}) as { menu_item_ids?: string[] };
  return offer.menu_item_ids ?? meta.menu_item_ids ?? [];
}
