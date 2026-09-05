/** Operations timezone for dashboard timestamps (India). */
export const DASHBOARD_TZ = "Asia/Kolkata";

/**
 * Parse API timestamps. New rows are ISO. Older activity-log strings were
 * `YYYY-MM-DD HH:MM:SS` in the server's local zone (UTC in production).
 */
export function parseDashboardTimestamp(raw: string | null | undefined): Date | null {
  const s = String(raw ?? "").trim();
  if (!s || s === "—") return null;

  if (/[zZ]|[+-]\d{2}:?\d{2}$/.test(s) || s.includes("T")) {
    const d = new Date(s);
    return Number.isFinite(d.getTime()) ? d : null;
  }

  const naive = s.match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2})/);
  if (naive) {
    const d = new Date(`${naive[1]}T${naive[2]}Z`);
    return Number.isFinite(d.getTime()) ? d : null;
  }

  const d = new Date(s);
  return Number.isFinite(d.getTime()) ? d : null;
}

export function formatIstDateTimeParts(raw: string | null | undefined): {
  date: string;
  time: string;
} {
  const d = parseDashboardTimestamp(raw);
  if (!d) return { date: "—", time: "" };
  const date = d
    .toLocaleDateString("en-IN", {
      timeZone: DASHBOARD_TZ,
      day: "numeric",
      month: "numeric",
      year: "numeric",
    })
    .replace(/\//g, "-");
  const time = d
    .toLocaleTimeString("en-IN", {
      timeZone: DASHBOARD_TZ,
      hour: "numeric",
      minute: "2-digit",
      second: "2-digit",
      hour12: true,
    })
    .replace(/\u202f/g, " ");
  return { date, time };
}
