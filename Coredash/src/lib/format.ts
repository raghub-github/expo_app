export const GMV_FULL = "Gross Merchandise Value";

export function formatInr(amount: number, compact = false): string {
  const value = Number.isFinite(amount) ? amount : 0;
  if (compact && Math.abs(value) >= 100_000) {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      notation: "compact",
      maximumFractionDigits: 1,
    }).format(value);
  }
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: value >= 1000 ? 0 : 2,
  }).format(value);
}

export function formatCount(n: number): string {
  return new Intl.NumberFormat("en-IN").format(Number.isFinite(n) ? n : 0);
}

export function formatPct(n: number, digits = 1): string {
  if (!Number.isFinite(n)) return "0%";
  return `${n.toFixed(digits)}%`;
}

export function formatDateTime(iso: string | Date | null | undefined): string {
  if (!iso) return "—";
  const d = typeof iso === "string" ? new Date(iso) : iso;
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "2-digit",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function formatDay(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "2-digit",
    month: "short",
  });
}

export function prettyLabel(raw: string | null | undefined): string {
  if (!raw) return "Unknown";
  return raw
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}
