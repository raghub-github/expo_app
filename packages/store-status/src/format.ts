/**
 * The label formatter. Pure function — no I/O, no DB. Pass it the four
 * columns the backend tick wrote plus the timezone, get a label back.
 *
 * Edge-cases the engine cares about:
 *   - Tick has never run for this row (phase == null) → UNKNOWN
 *   - Schedule says WITHIN_SLOT but merchant manually closed
 *     (manualOverrideActive=true, isOpenNow=false) → render that
 *     specifically so merchants and customers see the truth
 *   - PRE_BREAK is "open right now, break starts soon" — still OPEN
 *   - BREAK is "in between two slots" — render as BREAK chip, not CLOSED
 *   - OFF_DAY needs a day name in the secondary line if the next-open is
 *     more than 24 h away ("opens Mon 11:30")
 */
import type {
  LiveSchedulePhase,
  LiveStoreStatusInput,
  LiveStoreStatusLabel,
} from "./types.js";

const DEFAULT_TZ = "Asia/Kolkata";

/**
 * Format an ISO instant as "HH:mm" in the store's local timezone.
 * Returns null if the input is null or unparseable so callers can short-
 * circuit the label.
 */
function formatLocalHHMM(iso: string | null, timezone: string): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  // Intl.DateTimeFormat is the only sane way to do "HH:mm in Asia/Kolkata"
  // in cross-runtime TS — works in Node, React Native, browsers.
  return new Intl.DateTimeFormat("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
    // hourCycle alone (no hour12): `hour12: false` without an explicit hourCycle can resolve
    // to "h24" (1-24) on some ICU builds, rendering "24:30" instead of "00:30" at midnight.
    hourCycle: "h23",
    timeZone: timezone,
  }).format(d);
}

/**
 * "tomorrow" / "today" / weekday label for a future ISO instant relative
 * to "now". Used in OFF_DAY and OUTSIDE_HOURS labels to tell the user
 * which day the store reopens.
 */
function relativeDayLabel(targetIso: string, timezone: string, now: Date = new Date()): string {
  const t = new Date(targetIso);
  if (Number.isNaN(t.getTime())) return "";
  // Compute the wall-clock date in the store TZ for both `now` and `t`.
  const fmt = new Intl.DateTimeFormat("en-IN", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const nowParts = fmt.formatToParts(now);
  const targetParts = fmt.formatToParts(t);
  const getYmd = (parts: Intl.DateTimeFormatPart[]): string => {
    const y = parts.find((p) => p.type === "year")?.value ?? "";
    const m = parts.find((p) => p.type === "month")?.value ?? "";
    const d = parts.find((p) => p.type === "day")?.value ?? "";
    return `${y}-${m}-${d}`;
  };
  const nowYmd = getYmd(nowParts);
  const targetYmd = getYmd(targetParts);
  if (nowYmd === targetYmd) return "today";
  // Compute "tomorrow"
  const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  if (getYmd(fmt.formatToParts(tomorrow)) === targetYmd) return "tomorrow";
  // Otherwise weekday name in the store TZ
  return new Intl.DateTimeFormat("en-IN", { weekday: "short", timeZone: timezone }).format(t);
}

const VALID_PHASES: LiveSchedulePhase[] = [
  "OFF_DAY",
  "BREAK",
  "PRE_BREAK",
  "WITHIN_SLOT",
  "OUTSIDE_HOURS",
  "NO_HOURS",
];
function isValidPhase(p: unknown): p is LiveSchedulePhase {
  return typeof p === "string" && (VALID_PHASES as string[]).includes(p);
}

/**
 * The format function. Pure. Deterministic given inputs + `now` (default
 * `new Date()`). Accepts an optional `now` so tests can pin the clock.
 */
export function formatStoreStatusLabel(
  input: LiveStoreStatusInput,
  now: Date = new Date(),
): LiveStoreStatusLabel {
  const tz = input.timezone || DEFAULT_TZ;
  const { phase, nextOpenAt, nextCloseAt, manualOverrideActive, isOpenNow } = input;

  // Tick has never run — don't try to invent a label.
  if (!isValidPhase(phase)) {
    return { primary: "Status not available", chip: "UNKNOWN" };
  }

  const openHHMM = formatLocalHHMM(nextOpenAt, tz);
  const closeHHMM = formatLocalHHMM(nextCloseAt, tz);

  switch (phase) {
    case "WITHIN_SLOT": {
      if (manualOverrideActive || !isOpenNow) {
        // The honest, two-line truth: schedule said open, merchant overrode.
        return {
          primary: closeHHMM
            ? `Closed by merchant · schedule open until ${closeHHMM}`
            : "Closed by merchant",
          chip: "CLOSED",
          secondary: openHHMM ? `Reopens at ${openHHMM}` : undefined,
          countdown: nextOpenAt ? { targetIso: nextOpenAt, verb: "Opens in" } : undefined,
        };
      }
      return {
        primary: closeHHMM ? `Open · closes at ${closeHHMM}` : "Open",
        chip: "OPEN",
        countdown: nextCloseAt ? { targetIso: nextCloseAt, verb: "Closes in" } : undefined,
      };
    }

    case "PRE_BREAK": {
      if (manualOverrideActive || !isOpenNow) {
        return {
          primary: "Closed by merchant",
          chip: "CLOSED",
          secondary: openHHMM ? `Reopens at ${openHHMM}` : undefined,
          countdown: nextOpenAt ? { targetIso: nextOpenAt, verb: "Opens in" } : undefined,
        };
      }
      return {
        primary: closeHHMM ? `Open · break at ${closeHHMM}` : "Open",
        chip: "OPEN",
        secondary: openHHMM && nextOpenAt ? `Reopens at ${openHHMM} after break` : undefined,
        countdown: nextCloseAt ? { targetIso: nextCloseAt, verb: "Closes in" } : undefined,
      };
    }

    case "BREAK": {
      return {
        primary: openHHMM ? `On break · reopens at ${openHHMM}` : "On break",
        chip: "BREAK",
        countdown: nextOpenAt ? { targetIso: nextOpenAt, verb: "Reopens in" } : undefined,
      };
    }

    case "OUTSIDE_HOURS": {
      if (!nextOpenAt) {
        return { primary: "Closed", chip: "CLOSED" };
      }
      const dayWord = relativeDayLabel(nextOpenAt, tz, now);
      return {
        primary:
          dayWord === "today"
            ? `Closed · opens at ${openHHMM}`
            : `Closed · opens ${dayWord} at ${openHHMM}`,
        chip: "CLOSED",
        countdown: { targetIso: nextOpenAt, verb: "Opens in" },
      };
    }

    case "OFF_DAY": {
      if (!nextOpenAt) {
        return { primary: "Closed today", chip: "CLOSED" };
      }
      const dayWord = relativeDayLabel(nextOpenAt, tz, now);
      return {
        primary:
          dayWord === "tomorrow"
            ? `Closed today · opens tomorrow ${openHHMM}`
            : dayWord === "today"
              ? `Closed · opens at ${openHHMM}`
              : `Closed today · opens ${dayWord} ${openHHMM}`,
        chip: "CLOSED",
        countdown: { targetIso: nextOpenAt, verb: "Opens in" },
      };
    }

    case "NO_HOURS": {
      return {
        primary: "Hours not set",
        chip: "UNKNOWN",
        secondary: "Merchant hasn’t configured operating hours yet",
      };
    }
  }
}
