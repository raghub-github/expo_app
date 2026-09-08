/**
 * Merchant menu scroll activity — ADD ignores press while the list is actively
 * dragging/flinging. Cleared as soon as the gesture ends so the next deliberate
 * tap is never blocked by a settle delay.
 */

import { AppState, type AppStateStatus } from "react-native";

let menuScrolling = false;
let scrollGeneration = 0;
let stuckScrollTimer: ReturnType<typeof setTimeout> | null = null;

const STUCK_SCROLL_MS = 1600;

function clearStuckTimer(): void {
  if (stuckScrollTimer) {
    clearTimeout(stuckScrollTimer);
    stuckScrollTimer = null;
  }
}

export function markMerchantMenuScrollActive(): void {
  if (!menuScrolling) scrollGeneration += 1;
  menuScrolling = true;
  clearStuckTimer();
  stuckScrollTimer = setTimeout(() => {
    stuckScrollTimer = null;
    menuScrolling = false;
  }, STUCK_SCROLL_MS);
}

export function markMerchantMenuScrollEnded(): void {
  clearStuckTimer();
  menuScrolling = false;
}

export function resetMerchantMenuScrollGuard(): void {
  clearStuckTimer();
  menuScrolling = false;
}

export function isMerchantMenuScrollActive(): boolean {
  return menuScrolling;
}

export function getMerchantMenuScrollGeneration(): number {
  return scrollGeneration;
}

AppState.addEventListener("change", (state: AppStateStatus) => {
  if (state === "active") {
    resetMerchantMenuScrollGuard();
  }
});
