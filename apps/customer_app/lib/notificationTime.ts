/**
 * Shared notification timestamp helpers (Postgres / Hermes-safe).
 * Mirrors merchant NotificationContext parseDate / formatters.
 */

export function parseNotificationDate(raw: string | null | undefined): Date | null {
  if (raw == null) return null;
  const s = String(raw).trim();
  if (!s) return null;

  if (/^\d+$/.test(s)) {
    const n = Number(s);
    if (Number.isFinite(n)) {
      const ms = s.length <= 10 ? n * 1000 : n;
      const dNum = new Date(ms);
      if (!Number.isNaN(dNum.getTime())) return dNum;
    }
  }

  const d1 = new Date(s);
  if (!Number.isNaN(d1.getTime())) return d1;

  // "YYYY-MM-DD HH:mm:ss(.sss...)(TZ?)" from Postgres
  const m = s.match(/^(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?)(.*)$/);
  if (m) {
    let time = m[2]!;
    time = time.replace(/\.(\d{3})\d+/, ".$1");
    let tz = (m[3] ?? "").trim();
    if (tz) {
      const off = tz.match(/^([+-])(\d{2})(?::?(\d{2}))?$/);
      if (off) {
        tz = `${off[1]}${off[2]}:${off[3] ?? "00"}`;
      } else if (tz === "Z" || tz === "z") {
        tz = "Z";
      } else if (/^[+-]\d{2}$/.test(tz)) {
        tz = `${tz}:00`;
      }
    } else {
      tz = "Z";
    }
    const normalized = `${m[1]}T${time}${tz}`;
    const d2 = new Date(normalized);
    if (!Number.isNaN(d2.getTime())) return d2;
  }

  return null;
}

export function formatNotificationTimeAgo(raw: string | null | undefined): string {
  const d = parseNotificationDate(raw);
  if (!d) return "";
  const diffMs = Date.now() - d.getTime();
  if (diffMs < 0) return "";
  const diffMins = Math.floor(diffMs / 60_000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);
  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins} min ago`;
  if (diffHours < 24) return `${diffHours} hour${diffHours !== 1 ? "s" : ""} ago`;
  if (diffDays < 7) return `${diffDays} day${diffDays !== 1 ? "s" : ""} ago`;
  try {
    return new Intl.DateTimeFormat("en-IN", {
      timeZone: "Asia/Kolkata",
      day: "2-digit",
      month: "short",
    }).format(d);
  } catch {
    return d.toLocaleDateString();
  }
}

export function formatNotificationDateTime(raw: string | null | undefined): string {
  const d = parseNotificationDate(raw);
  if (!d) return "";
  try {
    return new Intl.DateTimeFormat("en-IN", {
      timeZone: "Asia/Kolkata",
      year: "numeric",
      month: "short",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    }).format(d);
  } catch {
    return d.toLocaleString(undefined, {
      year: "numeric",
      month: "short",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  }
}
