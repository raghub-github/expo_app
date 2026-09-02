type SubscriptionLike = {
  expiresAt?: unknown;
  expires_at?: unknown;
  startsAt?: unknown;
  starts_at?: unknown;
  billingCycle?: unknown;
  billing_cycle?: unknown;
} | null | undefined;

function parseTimestamp(value: unknown): Date | null {
  if (value == null) return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    const ms = value < 1e12 ? value * 1000 : value;
    const d = new Date(ms);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  if (typeof value === "string") {
    const raw = value.trim();
    if (!raw || raw === "null" || raw === "undefined") return null;
    const d = new Date(raw);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return null;
}

function addBillingPeriod(start: Date, cycle: string): Date {
  const end = new Date(start);
  const normalized = cycle.trim().toLowerCase();
  if (normalized === "weekly") {
    end.setDate(end.getDate() + 7);
  } else if (normalized === "yearly") {
    end.setFullYear(end.getFullYear() + 1);
  } else {
    end.setMonth(end.getMonth() + 1);
  }
  return end;
}

export function toIsoTimestampString(value: unknown): string {
  const d = parseTimestamp(value);
  return d ? d.toISOString() : "";
}

/** Resolve subscription expiry from API payload (camel or snake case). */
export function resolveSubscriptionExpiryIso(subscription: SubscriptionLike): string | null {
  if (!subscription) return null;

  const direct = parseTimestamp(subscription.expiresAt ?? subscription.expires_at);
  if (direct) return direct.toISOString();

  const starts = parseTimestamp(subscription.startsAt ?? subscription.starts_at);
  const cycle = String(subscription.billingCycle ?? subscription.billing_cycle ?? "monthly");
  if (starts) {
    return addBillingPeriod(starts, cycle).toISOString();
  }

  return null;
}

export function formatSubscriptionExpiryLabel(iso: string | null | undefined): string | null {
  if (!iso?.trim()) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/** Daily-updated countdown for membership banners (e.g. "Expires in 5 days"). */
export function formatSubscriptionExpiryCountdown(
  iso: string | null | undefined,
  now: Date = new Date()
): string | null {
  if (!iso?.trim()) return null;
  const expiry = new Date(iso);
  if (Number.isNaN(expiry.getTime())) return null;

  const endOfToday = new Date(now);
  endOfToday.setHours(23, 59, 59, 999);

  const ms = expiry.getTime() - now.getTime();
  if (ms <= 0) return "Expired";

  const days = Math.ceil((expiry.getTime() - endOfToday.getTime()) / (24 * 60 * 60 * 1000));
  if (days <= 0) return "Expires today";
  if (days === 1) return "Expires tomorrow";
  return `Expires in ${days} days`;
}
