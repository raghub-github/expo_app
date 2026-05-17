import type { Offer } from "@/services/offersApi";

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

function parseCampaignDate(iso: string): Date | null {
  if (!iso?.trim()) return null;
  const trimmed = iso.trim();
  const day = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (day) {
    const y = parseInt(day[1], 10);
    const mo = parseInt(day[2], 10) - 1;
    const d = parseInt(day[3], 10);
    const dt = new Date(y, mo, d, 12, 0, 0, 0);
    return Number.isNaN(dt.getTime()) ? null : dt;
  }
  const dt = new Date(trimmed);
  return Number.isNaN(dt.getTime()) ? null : dt;
}

/** Campaign calendar date from merchant_offers.valid_from / valid_till (timestamptz, local). */
export function formatCampaignDateLocal(iso: string): string {
  const d = parseCampaignDate(iso);
  if (!d) return "—";
  const day = d.getDate();
  const month = d.toLocaleDateString("en-IN", { month: "short" });
  return `${formatOrdinalDay(day)} ${month} ${d.getFullYear()}`;
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

export function formatDbTimeColumn(time: string | null | undefined): string | null {
  const minutes = parseTimeToMinutes(time);
  if (minutes == null) return null;
  return formatMinutesAsTime(minutes);
}

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

/** Compact campaign dates for list cards (no daily slot times). */
export function formatOfferCardDateRange(offer: Offer): string {
  const from = formatCampaignDateLocal(offer.valid_from);
  const till = formatCampaignDateLocal(offer.valid_till);
  if (from === "—" && till === "—") return "Dates not set";
  if (from === till) return `Valid on ${from}`;
  return `${from} – ${till}`;
}

export function formatOfferTypeLabel(type: string): string {
  return type.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
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
    return "All day, every day";
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
  const startRaw = parseCampaignDate(offer.valid_from) ?? new Date(offer.valid_from);
  const endRaw = parseCampaignDate(offer.valid_till) ?? new Date(offer.valid_till);
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

export function getOfferStatusBadge(lifecycle: OfferLifecycleResult): { label: string } {
  if (lifecycle.phase === "active") {
    return { label: "Active" };
  }
  if (lifecycle.phase === "upcoming") {
    if (lifecycle.reason === "before_slot") return { label: "Scheduled" };
    return { label: "Upcoming" };
  }
  switch (lifecycle.reason) {
    case "outside_slot":
      return { label: "Outside slot" };
    case "wrong_day":
      return { label: "Not today" };
    case "disabled":
      return { label: "Inactive" };
    case "expired":
      return { label: "Expired" };
    default:
      return { label: "Inactive" };
  }
}

/** React Native badge colors aligned with partner site lifecycle labels. */
export function getOfferStatusBadgeColors(lifecycle: OfferLifecycleResult): {
  label: string;
  backgroundColor: string;
  color: string;
} {
  const { label } = getOfferStatusBadge(lifecycle);
  if (lifecycle.phase === "active") {
    return { label, backgroundColor: "#16a34a", color: "#fff" };
  }
  if (lifecycle.phase === "upcoming") {
    return { label, backgroundColor: "#f59e0b", color: "#fff" };
  }
  if (lifecycle.reason === "expired") {
    return { label, backgroundColor: "#dc2626", color: "#fff" };
  }
  if (lifecycle.reason === "disabled") {
    return { label, backgroundColor: "#eab308", color: "#1f2937" };
  }
  return { label, backgroundColor: "#9ca3af", color: "#fff" };
}

export type OfferTrackFilter = "active" | "scheduled" | "inactive" | "all";

export function offerMatchesTrackFilter(
  offer: Offer,
  filter: OfferTrackFilter,
  now: Date = new Date()
): boolean {
  const phase = getOfferLifecyclePhase(offer, now);
  switch (filter) {
    case "active":
      return phase === "active";
    case "scheduled":
      return phase === "upcoming";
    case "inactive":
      return phase === "inactive";
    case "all":
    default:
      return true;
  }
}

export function countOffersForTrackFilter(
  offers: Offer[],
  filter: OfferTrackFilter,
  now: Date = new Date()
): number {
  return offers.filter((o) => offerMatchesTrackFilter(o, filter, now)).length;
}

export function offerHeadline(offer: Offer): string {
  const flat =
    offer.discount_value != null && offer.discount_value !== ""
      ? Number(offer.discount_value)
      : null;
  const pct =
    offer.discount_percentage != null && offer.discount_percentage !== ""
      ? Number(offer.discount_percentage)
      : flat;
  switch (offer.offer_type) {
    case "FLAT":
    case "CART_FLAT":
      return flat != null && !Number.isNaN(flat) ? `₹${Math.round(flat)} off` : offer.offer_title;
    case "PERCENTAGE":
    case "CART_PERCENTAGE":
      return pct != null && !Number.isNaN(pct) ? `${pct}% off` : offer.offer_title;
    case "FREE_DELIVERY":
      return "Free delivery";
    case "BUY_X_GET_Y":
    case "BUY_N_GET_M":
    case "BOGO":
      return `Buy ${offer.buy_quantity ?? 1} get ${offer.get_quantity ?? 1} free`;
    case "COUPON":
      return offer.coupon_code ? `Coupon · ${offer.coupon_code}` : "Coupon offer";
    default:
      return offer.offer_title;
  }
}
