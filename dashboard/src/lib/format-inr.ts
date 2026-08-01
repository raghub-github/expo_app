/** INR display for wallet / payments (en-IN locale). */
export function formatInr(
  amount: number,
  options?: { minimumFractionDigits?: number; maximumFractionDigits?: number }
): string {
  const min = options?.minimumFractionDigits ?? 2;
  const max = options?.maximumFractionDigits ?? 2;
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: min,
    maximumFractionDigits: max,
  }).format(Number.isFinite(amount) ? amount : 0);
}

/** ₹ with a light gap before digits — for dashboard order payment surfaces. */
export function formatInrWithGap(
  value?: number | null,
  options?: { minimumFractionDigits?: number; maximumFractionDigits?: number }
): string {
  if (value == null) return "—";
  const num = Number(value);
  if (!Number.isFinite(num)) return "—";
  const min = options?.minimumFractionDigits ?? 2;
  const max = options?.maximumFractionDigits ?? 2;
  const digits = num.toLocaleString("en-IN", {
    minimumFractionDigits: min,
    maximumFractionDigits: max,
  });
  return `₹ ${digits}`;
}

export function formatInrCompact(amount: number): string {
  if (amount >= 100_000) {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      notation: "compact",
      maximumFractionDigits: 1,
    }).format(amount);
  }
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(amount);
}
