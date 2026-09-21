/**
 * Holds the React Navigation tab navigator so primary-tab jumps use
 * `navigation.jumpTo(routeName)` — the same path as CustomerTabBar.
 *
 * Food must NEVER go through Expo Router URL resolution
 * (`router.navigate("/(tabs)/food")`): that activates the tabs group's
 * initial route (Home) before Food and produces Food → Home → Food.
 *
 * If the tab navigator ref is missing, Food is queued until the ref attaches.
 * The user stays on the current page until Food can be selected directly.
 */

import type { NavigationProp, ParamListBase } from "@react-navigation/native";
import type { Router } from "expo-router";
import { InteractionManager } from "react-native";
import {
  getCustomerPrimaryTabNavState,
  hrefForPrimaryTab,
  requestPrimaryTab,
  type CustomerPrimaryTab,
  type PrimaryTabNavDecision,
} from "@/lib/customerPrimaryTabNav";
import { foodFixDbg, foodNavDbg, tabDbg } from "@/lib/tabNavDebug";
import { scrollFoodHomeListToTop } from "@/lib/foodHomeScrollGuard";

type TabsNav = NavigationProp<ParamListBase> & {
  jumpTo?: (name: string) => void;
  preload?: (name: string) => void;
};

type PendingPrimaryTab = {
  tab: CustomerPrimaryTab;
  source: string;
  epoch: number;
};

let tabsNavigation: TabsNav | null = null;
let pendingPrimaryTab: PendingPrimaryTab | null = null;

function routeNameForTab(tab: CustomerPrimaryTab): string {
  return tab === "index" ? "index" : tab;
}

function pinFoodHomeToTop(): void {
  scrollFoodHomeListToTop();
  InteractionManager.runAfterInteractions(() => {
    scrollFoodHomeListToTop();
  });
}

function dispatchPrimaryTab(nav: TabsNav, tab: CustomerPrimaryTab): void {
  const name = routeNameForTab(tab);
  if (typeof nav.jumpTo === "function") {
    nav.jumpTo(name);
    return;
  }
  nav.navigate(name);
}

/**
 * Mark Food as preloaded so BottomTabView will not freeze it while inactive
 * (`shouldFreeze = INACTIVE && !isPreloaded`). A frozen Food tab has to thaw
 * on tap, which stalls the tab-slide useEffect and leaves the previous page
 * painted for seconds.
 */
export function preloadCustomerFoodTab(nav: TabsNav | null = tabsNavigation): void {
  if (!nav || typeof nav.preload !== "function") return;
  try {
    nav.preload("food");
  } catch {
    /* navigator may not support preload */
  }
}

function flushPendingPrimaryTab(nav: TabsNav): void {
  const pending = pendingPrimaryTab;
  if (!pending) return;
  pendingPrimaryTab = null;
  const state = getCustomerPrimaryTabNavState();
  if (state.requestedTab !== pending.tab) {
    foodFixDbg("DUPLICATE food navigation blocked", {
      source: `${pending.source}:queued-stale`,
      method: "queue-drop",
      target: pending.tab,
      requested: state.requestedTab,
      inflight: state.inflightEpoch,
      epoch: pending.epoch,
    });
    return;
  }
  foodFixDbg(pending.tab === "food" ? "NAVIGATE food" : pending.tab === "index" ? "NAVIGATE home" : `NAVIGATE ${pending.tab}`, {
    source: `${pending.source}:queued`,
    method: "tabsNavigation.jumpTo",
    target: routeNameForTab(pending.tab),
    reason: "tab-navigator-attached",
  });
  dispatchPrimaryTab(nav, pending.tab);
  if (pending.tab === "food") pinFoodHomeToTop();
}

export function setCustomerTabsNavigation(nav: TabsNav | null): void {
  tabsNavigation = nav;
  foodNavDbg("TABS_NAV", {
    source: "setCustomerTabsNavigation",
    method: nav ? "bind" : "unbind",
    reason: nav ? "CustomerTabBar-mounted" : "CustomerTabBar-unmounted",
  });
  if (nav) {
    preloadCustomerFoodTab(nav);
    flushPendingPrimaryTab(nav);
  }
}

export function getCustomerTabsNavigation(): TabsNav | null {
  return tabsNavigation;
}

let lastFoodReassertAt = 0;
const FOOD_REASSERT_DEBOUNCE_MS = 50;

/**
 * If the tab navigator painted Home after a Food request, jump back to Food.
 * Does not go through requestPrimaryTab (that would no-op as same_tab).
 */
export function reassertFoodIfNavigatorOnHome(source: string, activeRouteName: string): boolean {
  const state = getCustomerPrimaryTabNavState();
  if (state.requestedTab !== "food" || activeRouteName !== "index") return false;
  const nav = tabsNavigation;
  if (!nav) return false;
  const now = Date.now();
  if (now - lastFoodReassertAt < FOOD_REASSERT_DEBOUNCE_MS) return false;
  lastFoodReassertAt = now;
  foodFixDbg("NAVIGATE food", {
    source,
    method: "tabsNavigation.jumpTo",
    target: "food",
    reason: "reassert-food-after-home-flash",
    navRoute: activeRouteName,
  });
  dispatchPrimaryTab(nav, "food");
    pinFoodHomeToTop();
    return true;
}

/**
 * One authoritative primary-tab navigation. Returns the decision for logging/tests.
 * Commit happens when the tab navigator acknowledges the route (see CustomerTabBar),
 * so a transient wrong index cannot clear the inflight epoch early.
 */
export function navigatePrimaryTab(
  tab: CustomerPrimaryTab,
  source: string,
  router?: Router | null
): PrimaryTabNavDecision {
  const decision = requestPrimaryTab(tab, source);
  const isFoodRelated = tab === "food" || decision.previousTab === "food";

  if (decision.action === "ignore") {
    if (isFoodRelated) {
      foodFixDbg("DUPLICATE food navigation blocked", {
        source,
        method: "navigatePrimaryTab",
        target: tab,
        from: decision.previousTab,
        reason: decision.reason,
        hasTabsNav: Boolean(tabsNavigation),
      });
    }
    tabDbg("TAB_NAVIGATE_IGNORED", {
      source,
      tab,
      reason: decision.reason,
      hasTabsNav: Boolean(tabsNavigation),
    });
    return decision;
  }

  if (tab === "food") {
    foodFixDbg("NAVIGATE food", {
      source,
      method: tabsNavigation ? "tabsNavigation.jumpTo" : "queue",
      target: "food",
      from: decision.previousTab,
      hasTabsNav: Boolean(tabsNavigation),
    });
  } else if (tab === "index" && decision.previousTab === "food") {
    foodFixDbg("LEAVE food", {
      source,
      method: tabsNavigation ? "tabsNavigation.jumpTo" : "queue",
      target: "index",
      from: "food",
      reason: "explicit-home-tab",
    });
    foodFixDbg("NAVIGATE home", {
      source,
      method: tabsNavigation ? "tabsNavigation.jumpTo" : router ? "router.navigate" : "queue",
      target: "index",
      from: "food",
    });
  } else if (isFoodRelated || tab === "index") {
    foodNavDbg("NAV", {
      source,
      method: tabsNavigation
        ? "tabsNavigation.jumpTo"
        : tab === "food"
          ? "queue"
          : router
            ? "router.navigate"
            : "no-nav",
      from: decision.previousTab,
      to: tab,
      reason: "requestPrimaryTab",
      href: hrefForPrimaryTab(tab),
      hasTabsNav: Boolean(tabsNavigation),
    });
  }

  const nav = tabsNavigation;
  if (nav) {
    pendingPrimaryTab = null;
    tabDbg("TAB_NAVIGATE", {
      source,
      tab,
      via: "tabsNavigation.jumpTo",
      routeName: routeNameForTab(tab),
      previous: decision.previousTab,
    });
    dispatchPrimaryTab(nav, tab);
    if (tab === "food") {
      pinFoodHomeToTop();
    } else {
      preloadCustomerFoodTab(nav);
    }
    return decision;
  }

  // Food: never Expo Router URL resolution — queue until the tab navigator binds.
  if (tab === "food") {
    pendingPrimaryTab = { tab, source, epoch: decision.epoch };
    foodFixDbg("NAVIGATE food", {
      source,
      method: "queue",
      target: "food",
      reason: "tabsNavigation-unavailable-stay-put",
    });
    tabDbg("TAB_NAVIGATE", {
      source,
      tab,
      via: "queued-until-tab-nav",
      previous: decision.previousTab,
    });
    return decision;
  }

  if (router) {
    tabDbg("TAB_NAVIGATE", {
      source,
      tab,
      via: "router.navigate",
      href: hrefForPrimaryTab(tab),
      previous: decision.previousTab,
    });
    try {
      router.navigate(hrefForPrimaryTab(tab) as never);
    } catch {
      tabDbg("TAB_NAVIGATE", { source, tab, via: "router.push-fallback" });
      router.push(hrefForPrimaryTab(tab) as never);
    }
    return decision;
  }

  pendingPrimaryTab = { tab, source, epoch: decision.epoch };
  tabDbg("TAB_NAVIGATE", { source, tab, via: "queued-until-tab-nav" });
  return decision;
}
