import {
  OPEN_SOON_WINDOW_MS,
  CLOSING_SOON_WINDOW_MS,
  countdownString,
  formatNextOpenTime,
  toTimestamp,
} from "./storeScheduleUi";

export type StoreOpenStatusLabel = {
  label: string;
  isGreen: boolean;
  sub: string | null;
  /** Open store — live countdown in last 30 min before close (red badge). */
  isClosingSoon?: boolean;
};

/** Badge copy for list cards and merchant header when open/closed. */
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
        /**
         * When countdown crosses zero, badge must immediately leave OPEN state.
         * This avoids showing stale "Open" until the next backend refresh arrives.
         */
        if (nextOpenTs != null && nextOpenTs > nowMs) {
          return { label: "Closed", isGreen: false, sub: formatNextOpenTime(nextOpenTs) };
        }
        return { label: "Closed", isGreen: false, sub: null };
      }
      if (msLeft <= CLOSING_SOON_WINDOW_MS) {
        return {
          label: "Closes soon",
          isGreen: false,
          isClosingSoon: true,
          sub: countdownString(msLeft),
        };
      }
      return { label: "Open", isGreen: true, sub: null };
    }
    return { label: "Open", isGreen: true, sub: null };
  }

  if (nextOpenTs != null) {
    const msLeft = nextOpenTs - nowMs;
    if (msLeft <= 0) {
      return { label: "Closed", isGreen: false, sub: formatNextOpenTime(nextOpenTs) };
    }
    if (msLeft <= OPEN_SOON_WINDOW_MS) {
      return {
        label: "Open soon",
        isGreen: true,
        sub: countdownString(msLeft),
      };
    }
    return {
      label: "Closed",
      isGreen: false,
      sub: formatNextOpenTime(nextOpenTs),
    };
  }

  return { label: "Closed", isGreen: false, sub: null };
}

export function formatOpenStatusTagText(openStatus: StoreOpenStatusLabel): string {
  if (openStatus.isClosingSoon && openStatus.sub) {
    return `Closes in ${openStatus.sub}`;
  }
  if (!openStatus.sub) return openStatus.label;
  if (openStatus.label === "Open soon") {
    return `${openStatus.label} · ${openStatus.sub}`;
  }
  if (openStatus.label === "Closed" && openStatus.sub.startsWith("Opens")) {
    return `Closed · ${openStatus.sub}`;
  }
  return `${openStatus.label} · ${openStatus.sub}`;
}
