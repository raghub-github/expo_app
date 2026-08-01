import {
  OPEN_SOON_WINDOW_MS,
  CLOSING_SOON_WINDOW_MS,
  countdownMmSs,
  formatClockHHMM,
  formatNextOpenTime,
  toTimestamp,
} from "./storeScheduleUi";

export type StoreOpenStatusLabel = {
  /** Full badge text, e.g. "Open", "Opens at 22:30", "Opens in 15:45", "Closes in 10:20". */
  label: string;
  isGreen: boolean;
  /** @deprecated Prefer `label` — kept for callers that still read sub. */
  sub: string | null;
  /** Open store — live countdown in the last 15 min before close (red badge). */
  isClosingSoon?: boolean;
  /** Closed store — live countdown in the last 20 min before open. */
  isOpeningSoon?: boolean;
};

/**
 * Simple list-card / header status:
 * - Closed, >20 min to open  → "Opens at HH:MM"
 * - Closed, ≤20 min to open  → "Opens in MM:SS" (live)
 * - Open                     → "Open"
 * - Open, ≤15 min to close   → "Closes in MM:SS" (live)
 */
export function buildStoreOpenStatusLabel(params: {
  isOpen: boolean;
  nextCloseAt?: string | number | null;
  nextOpenAt?: string | number | null;
  nowMs: number;
}): StoreOpenStatusLabel {
  const { isOpen, nowMs } = params;
  const nextCloseTs = toTimestamp(params.nextCloseAt);
  const nextOpenTs = toTimestamp(params.nextOpenAt);

  if (isOpen) {
    if (nextCloseTs != null) {
      const msLeft = nextCloseTs - nowMs;
      if (msLeft <= 0) {
        // Countdown crossed zero — treat as closed until realtime catches up.
        if (nextOpenTs != null && nextOpenTs > nowMs) {
          return closedLabel(nextOpenTs, nowMs);
        }
        return { label: "Closed", isGreen: false, sub: null };
      }
      if (msLeft <= CLOSING_SOON_WINDOW_MS) {
        const mmss = countdownMmSs(msLeft);
        return {
          label: `Closes in ${mmss}`,
          isGreen: false,
          isClosingSoon: true,
          sub: mmss,
        };
      }
      return { label: "Open", isGreen: true, sub: null };
    }
    return { label: "Open", isGreen: true, sub: null };
  }

  if (nextOpenTs != null) {
    return closedLabel(nextOpenTs, nowMs);
  }

  return { label: "Closed", isGreen: false, sub: null };
}

function closedLabel(nextOpenTs: number, nowMs: number): StoreOpenStatusLabel {
  const msLeft = nextOpenTs - nowMs;
  if (msLeft <= 0) {
    // Past open time — show clock until OPEN flip arrives.
    return {
      label: `Opens at ${formatClockHHMM(nextOpenTs)}`,
      isGreen: false,
      sub: formatNextOpenTime(nextOpenTs),
    };
  }
  if (msLeft <= OPEN_SOON_WINDOW_MS) {
    const mmss = countdownMmSs(msLeft);
    return {
      label: `Opens in ${mmss}`,
      isGreen: true,
      isOpeningSoon: true,
      sub: mmss,
    };
  }
  return {
    label: `Opens at ${formatClockHHMM(nextOpenTs)}`,
    isGreen: false,
    sub: formatNextOpenTime(nextOpenTs),
  };
}

/** Badge text for list cards — `label` is already the full string. */
export function formatOpenStatusTagText(openStatus: StoreOpenStatusLabel): string {
  return openStatus.label;
}
