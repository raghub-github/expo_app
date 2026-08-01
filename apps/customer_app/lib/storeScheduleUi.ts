/** Show "Opens in MM:SS" when store opens within this window. */
export const OPEN_SOON_WINDOW_MS = 20 * 60 * 1000;

/** Show "Closes in MM:SS" only within this window before close. */
export const CLOSING_SOON_WINDOW_MS = 15 * 60 * 1000;

export function toTimestamp(v: string | number | null | undefined): number | null {
  if (v == null) return null;
  if (typeof v === "number") return v > 1e12 ? v : v * 1000;
  const t = Date.parse(v);
  return Number.isNaN(t) ? null : t;
}

export function formatCountdown(msLeft: number): { hr: number; min: number; sec: number } {
  if (msLeft <= 0) return { hr: 0, min: 0, sec: 0 };
  const sec = Math.floor((msLeft / 1000) % 60);
  const min = Math.floor((msLeft / (1000 * 60)) % 60);
  const hr = Math.floor(msLeft / (1000 * 60 * 60));
  return { hr, min, sec };
}

/** Live badge countdown — always MM:SS (windows are ≤20 min). */
export function countdownMmSs(msLeft: number): string {
  const totalSec = Math.max(0, Math.floor(msLeft / 1000));
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${String(min).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

export function countdownString(msLeft: number, compact = false): string {
  if (msLeft <= 0) return compact ? "0 min" : "0 sec";
  const { hr, min, sec } = formatCountdown(msLeft);
  if (compact) {
    const totalMin = hr * 60 + min + (sec > 0 ? 1 : 0);
    if (totalMin < 1) return "< 1 min";
    if (totalMin <= 60) return `${totalMin} min`;
    return `${hr} Hr ${min} min`;
  }
  const parts: string[] = [];
  if (hr > 0) parts.push(`${hr} Hr`);
  parts.push(`${min} min`);
  parts.push(`${sec} sec`);
  return parts.join(" ");
}

/** Clock time as HH:MM (24h) for simple status badges. */
export function formatClockHHMM(ts: number): string {
  const d = new Date(ts);
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

export function formatNextOpenTime(ts: number): string {
  const d = new Date(ts);
  const now = new Date();
  const timeStr = formatClockHHMM(ts);
  // Real calendar-day difference — NOT just "is it a different day". Naming the actual
  // day matters when the next open skips a closed weekday (e.g. store shut Tue → opens
  // Wed, which is 2 days out).
  const startOfDay = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const dayDiff = Math.round((startOfDay(d) - startOfDay(now)) / 86_400_000);
  if (dayDiff <= 0) return `Opens at ${timeStr}`;
  if (dayDiff === 1) return `Opens tomorrow ${timeStr}`;
  const weekday = d.toLocaleDateString("en-IN", { weekday: "short" }); // e.g. "Wed"
  if (dayDiff < 7) return `Opens ${weekday} ${timeStr}`;
  const dateStr = d.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
  return `Opens ${weekday}, ${dateStr} ${timeStr}`;
}

export type OpenSoonState = {
  isOpenSoon: boolean;
  msUntilOpen: number | null;
};

export function getOpenSoonState(
  nextOpenAt: string | number | null | undefined,
  nowMs: number,
  isClosed: boolean
): OpenSoonState {
  if (!isClosed) return { isOpenSoon: false, msUntilOpen: null };
  const ts = toTimestamp(nextOpenAt);
  if (ts == null) return { isOpenSoon: false, msUntilOpen: null };
  const msUntilOpen = ts - nowMs;
  if (msUntilOpen <= 0 || msUntilOpen > OPEN_SOON_WINDOW_MS) {
    return { isOpenSoon: false, msUntilOpen: msUntilOpen > 0 ? msUntilOpen : null };
  }
  return { isOpenSoon: true, msUntilOpen };
}

export type ClosedStoreCtaCopy = {
  title: string;
  sub: string;
};

/** Floating cart / dock labels when store is closed. */
export function closedStoreCtaCopy(
  nextOpenAt: string | number | null | undefined,
  nowMs: number,
  fallbackSub = "Opens later"
): ClosedStoreCtaCopy {
  const { isOpenSoon, msUntilOpen } = getOpenSoonState(nextOpenAt, nowMs, true);
  if (isOpenSoon && msUntilOpen != null) {
    return {
      title: "Opens soon",
      sub: countdownMmSs(msUntilOpen),
    };
  }
  const ts = toTimestamp(nextOpenAt);
  if (ts != null && ts > nowMs) {
    return { title: "Store closed", sub: `Opens at ${formatClockHHMM(ts)}` };
  }
  return { title: "Store closed", sub: fallbackSub };
}
