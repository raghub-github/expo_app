/**
 * Single source of truth for the customer app's primary bottom tabs
 * (Home / Food / Orders / Profile).
 *
 * Every intentional tab change must go through `requestPrimaryTab` → commit.
 * Background data, focus, and stale async callbacks must not invent a newer
 * epoch — they can only be ignored via `isStalePrimaryTabEpoch`.
 */

export type CustomerPrimaryTab = "index" | "food" | "orders" | "profile";

export type PrimaryTabNavDecision =
  | {
      action: "commit";
      epoch: number;
      tab: CustomerPrimaryTab;
      previousTab: CustomerPrimaryTab;
      source: string;
    }
  | {
      action: "ignore";
      reason: "same_tab" | "stale_epoch" | "duplicate_inflight";
      epoch: number;
      tab: CustomerPrimaryTab;
      previousTab: CustomerPrimaryTab;
      source: string;
    };

type PrimaryTabNavState = {
  epoch: number;
  committedTab: CustomerPrimaryTab;
  /** Latest accepted user/intent tab (may equal committed while navigator catches up). */
  requestedTab: CustomerPrimaryTab;
  inflightEpoch: number | null;
  lastSource: string;
};

const HREF_BY_TAB: Record<CustomerPrimaryTab, string> = {
  index: "/(tabs)/",
  food: "/(tabs)/food",
  orders: "/(tabs)/orders",
  profile: "/(tabs)/profile",
};

let state: PrimaryTabNavState = {
  epoch: 0,
  committedTab: "index",
  requestedTab: "index",
  inflightEpoch: null,
  lastSource: "bootstrap",
};

function logNav(
  kind: "NAV_INTENT" | "NAV_COMMIT" | "NAV_IGNORED_STALE",
  payload: Record<string, unknown>
): void {
  if (typeof __DEV__ === "undefined" || !__DEV__) return;
  // eslint-disable-next-line no-console
  console.log(`[${kind}]`, {
    ...payload,
    NAV_SOURCE: payload.source ?? state.lastSource,
    epoch: state.epoch,
    committedTab: state.committedTab,
    requestedTab: state.requestedTab,
  });
}

export function resetCustomerPrimaryTabNavForTests(
  initial: CustomerPrimaryTab = "index"
): void {
  state = {
    epoch: 0,
    committedTab: initial,
    requestedTab: initial,
    inflightEpoch: null,
    lastSource: "test-reset",
  };
}

export function getCustomerPrimaryTabNavState(): Readonly<PrimaryTabNavState> {
  return state;
}

export function hrefForPrimaryTab(tab: CustomerPrimaryTab): string {
  return HREF_BY_TAB[tab];
}

export function primaryTabFromRouteName(routeName: string | undefined | null): CustomerPrimaryTab {
  if (routeName === "food") return "food";
  if (routeName === "orders") return "orders";
  if (routeName === "profile") return "profile";
  return "index";
}

/** Expo pathname forms: `/`, `/food`, `/(tabs)/food`, etc. */
export function primaryTabFromPathname(pathname: string | undefined | null): CustomerPrimaryTab | null {
  if (!pathname) return null;
  const p = pathname.replace(/\/+$/, "") || "/";
  if (p === "/" || p === "/(tabs)" || p === "/(tabs)/" || p.endsWith("/(tabs)") || p === "/index") {
    return "index";
  }
  if (p === "/food" || p.endsWith("/food") || p === "/(tabs)/food") return "food";
  if (p === "/orders" || p.endsWith("/(tabs)/orders") || p === "/(tabs)/orders") return "orders";
  if (p === "/profile" || p.endsWith("/(tabs)/profile") || p === "/(tabs)/profile") return "profile";
  return null;
}

/**
 * Record an explicit primary-tab intent. Returns whether a navigation action
 * should be performed. Same-tab taps are no-ops (no remount). Newer intents
 * always win over older inflight epochs.
 */
export function requestPrimaryTab(
  tab: CustomerPrimaryTab,
  source: string
): PrimaryTabNavDecision {
  const previousTab = state.requestedTab;

  if (tab === state.requestedTab && state.inflightEpoch == null && tab === state.committedTab) {
    const decision: PrimaryTabNavDecision = {
      action: "ignore",
      reason: "same_tab",
      epoch: state.epoch,
      tab,
      previousTab,
      source,
    };
    logNav("NAV_IGNORED_STALE", { ...decision, pathname: HREF_BY_TAB[tab] });
    return decision;
  }

  if (
    tab === state.requestedTab &&
    state.inflightEpoch != null
  ) {
    const decision: PrimaryTabNavDecision = {
      action: "ignore",
      reason: "duplicate_inflight",
      epoch: state.inflightEpoch,
      tab,
      previousTab,
      source,
    };
    logNav("NAV_IGNORED_STALE", { ...decision, pathname: HREF_BY_TAB[tab] });
    return decision;
  }

  state.epoch += 1;
  state.requestedTab = tab;
  state.inflightEpoch = state.epoch;
  state.lastSource = source;

  const decision: PrimaryTabNavDecision = {
    action: "commit",
    epoch: state.epoch,
    tab,
    previousTab,
    source,
  };
  logNav("NAV_INTENT", {
    ...decision,
    pathname: HREF_BY_TAB[tab],
    previousPathname: HREF_BY_TAB[previousTab],
  });
  return decision;
}

/** Mark navigation applied for this epoch (navigator accepted the jump). */
export function commitPrimaryTab(epoch: number, tab: CustomerPrimaryTab, source?: string): boolean {
  if (epoch < state.epoch && tab !== state.requestedTab) {
    logNav("NAV_IGNORED_STALE", {
      reason: "stale_epoch",
      epoch,
      tab,
      source: source ?? "commit",
      currentEpoch: state.epoch,
    });
    return false;
  }
  if (epoch !== state.epoch && tab !== state.requestedTab) {
    logNav("NAV_IGNORED_STALE", {
      reason: "stale_epoch",
      epoch,
      tab,
      source: source ?? "commit",
      currentEpoch: state.epoch,
    });
    return false;
  }
  state.committedTab = tab;
  state.requestedTab = tab;
  if (state.inflightEpoch === epoch) {
    state.inflightEpoch = null;
  }
  if (source) state.lastSource = source;
  logNav("NAV_COMMIT", {
    epoch,
    tab,
    source: source ?? state.lastSource,
    pathname: HREF_BY_TAB[tab],
  });
  return true;
}

/** True when an async callback's captured epoch is no longer the latest intent. */
export function isStalePrimaryTabEpoch(epoch: number): boolean {
  return epoch !== state.epoch;
}

/**
 * Sync committed tab from the live navigator when it matches the requested tab
 * (catch-up). Never invents a new user intent from a transient wrong index while
 * an explicit intent is inflight. When idle, follow the navigator (deep links).
 */
export function acknowledgeNavigatorPrimaryTab(
  routeName: string,
  source = "navigator-ack"
): void {
  const tab = primaryTabFromRouteName(routeName);
  if (state.inflightEpoch != null && tab !== state.requestedTab) {
    logNav("NAV_IGNORED_STALE", {
      reason: "stale_epoch",
      epoch: state.epoch,
      tab,
      source,
      requestedTab: state.requestedTab,
      note: "navigator-mismatch-during-inflight",
    });
    return;
  }
  if (tab === state.committedTab && tab === state.requestedTab && state.inflightEpoch == null) {
    return;
  }
  state.committedTab = tab;
  state.requestedTab = tab;
  state.inflightEpoch = null;
  logNav("NAV_COMMIT", {
    epoch: state.epoch,
    tab,
    source,
    pathname: HREF_BY_TAB[tab],
    note: "navigator-ack",
  });
}

/**
 * Whether the tab pill / chrome should follow routeName, or keep showing the
 * latest requested tab while the navigator catches up (prevents Home↔Food pill bounce).
 */
export function resolveOptimisticPrimaryTabIndex(
  routeName: string,
  tabIndexForRoute: (name: string) => number
): number {
  if (state.inflightEpoch != null) {
    return tabIndexForRoute(state.requestedTab);
  }
  return tabIndexForRoute(routeName);
}

/**
 * Simulate a delayed async callback attempting to navigate after a newer tap.
 * Used by tests — production code should call requestPrimaryTab + isStale check.
 */
export function tryStalePrimaryTabNavigate(
  capturedEpoch: number,
  tab: CustomerPrimaryTab,
  source: string
): PrimaryTabNavDecision {
  if (isStalePrimaryTabEpoch(capturedEpoch)) {
    const decision: PrimaryTabNavDecision = {
      action: "ignore",
      reason: "stale_epoch",
      epoch: capturedEpoch,
      tab,
      previousTab: state.requestedTab,
      source,
    };
    logNav("NAV_IGNORED_STALE", { ...decision, currentEpoch: state.epoch });
    return decision;
  }
  return requestPrimaryTab(tab, source);
}
