/**
 * Time helpers used across backend + apps. Keep them small + dependency-free
 * (no dayjs, no luxon) so this package stays cheap to import into mobile.
 *
 * IST helpers exist because most of the business runs in Asia/Kolkata; ALL
 * timestamps in the DB are timestamptz so the actual stored value is UTC,
 * but display happens in IST.
 */

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

/** Returns the IST hour-of-day (0-23) for a given UTC moment. */
export function istHour(now: Date = new Date()): number {
  return new Date(now.getTime() + IST_OFFSET_MS).getUTCHours();
}

/** "Just now", "5m ago", "2h ago", "3d ago", "12 Mar". */
export function timeAgo(iso: string | Date | null): string {
  if (!iso) return "";
  const t = typeof iso === "string" ? new Date(iso) : iso;
  if (!Number.isFinite(t.getTime())) return "";
  const ms = Date.now() - t.getTime();
  const m = Math.floor(ms / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  return t.toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

/** Minutes between two ISO timestamps; negative when `b` is before `a`. */
export function minutesBetween(a: string | Date, b: string | Date): number {
  const ta = typeof a === "string" ? new Date(a).getTime() : a.getTime();
  const tb = typeof b === "string" ? new Date(b).getTime() : b.getTime();
  return Math.round((tb - ta) / 60_000);
}

/** Returns ISO string `minutes` minutes from now. */
export function isoFromNow(minutes: number): string {
  return new Date(Date.now() + minutes * 60_000).toISOString();
}
