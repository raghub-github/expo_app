/**
 * Merchant menu scroll activity — ADD ignores press while the list is actively
 * dragging/flinging. Cleared as soon as the gesture ends so the next deliberate
 * tap is never blocked by a settle delay.
 */

let menuScrolling = false;
let scrollGeneration = 0;

export function markMerchantMenuScrollActive(): void {
  if (!menuScrolling) scrollGeneration += 1;
  menuScrolling = true;
}

export function markMerchantMenuScrollEnded(): void {
  menuScrolling = false;
}

export function isMerchantMenuScrollActive(): boolean {
  return menuScrolling;
}

export function getMerchantMenuScrollGeneration(): number {
  return scrollGeneration;
}
