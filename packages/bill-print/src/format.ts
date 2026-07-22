export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function formatOrderRs(amount: number, decimals = 0): string {
  const n = Number.isFinite(amount) ? amount : 0;
  if (decimals === 0) return `₹${Math.round(n)}`;
  return `₹${n.toFixed(decimals)}`;
}

export function formatMoney(n: number): string {
  return formatOrderRs(n);
}

export function formatOrderPlacedAt(iso: string): string {
  try {
    return new Date(iso).toLocaleString("en-IN", {
      day: "numeric",
      month: "long",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
      timeZone: "Asia/Kolkata",
    });
  } catch {
    return iso;
  }
}

export function formatOrderIdForPrint(raw: string): string {
  const id = raw.trim().replace(/^#/, "");
  const digits = id.replace(/\D/g, "");
  if (digits.length >= 10) {
    const mid = Math.ceil(digits.length / 2);
    return `${digits.slice(0, mid)} ${digits.slice(mid)}`;
  }
  return id;
}

export function formatDropAddress(normalized?: string | null, raw?: string | null): string {
  const base = (normalized || raw || "").trim();
  if (!base) return "";
  return base
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)
    .join(", ");
}
