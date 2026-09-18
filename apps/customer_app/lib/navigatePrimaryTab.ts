/**
 * Holds the React Navigation tab navigator so primary-tab jumps use
 * `navigation.navigate(routeName)` — the same path as CustomerTabBar —
 * instead of Expo Router URL resolution that can briefly activate the
 * tabs group's initial route (Home) before Food.
 */

import type { NavigationProp, ParamListBase } from "@react-navigation/native";
import type { Router } from "expo-router";
import {
  commitPrimaryTab,
  hrefForPrimaryTab,
  requestPrimaryTab,
  type CustomerPrimaryTab,
  type PrimaryTabNavDecision,
} from "@/lib/customerPrimaryTabNav";

type TabsNav = NavigationProp<ParamListBase>;

let tabsNavigation: TabsNav | null = null;

export function setCustomerTabsNavigation(nav: TabsNav | null): void {
  tabsNavigation = nav;
}

export function getCustomerTabsNavigation(): TabsNav | null {
  return tabsNavigation;
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
  if (decision.action === "ignore") {
    return decision;
  }

  const nav = tabsNavigation;
  if (nav) {
    nav.navigate(tab === "index" ? "index" : tab);
  } else if (router) {
    try {
      router.navigate(hrefForPrimaryTab(tab) as never);
    } catch {
      router.push(hrefForPrimaryTab(tab) as never);
    }
  } else {
    // No navigator yet — still record intent; caller may retry after mount.
    commitPrimaryTab(decision.epoch, tab, `${source}:no-nav`);
  }

  return decision;
}
