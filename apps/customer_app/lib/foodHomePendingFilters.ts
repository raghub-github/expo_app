/**
 * Cross-screen intent: home promo Flash Deal → Food home with Flash Deal filter on.
 * Consumed once when food home focuses.
 */

let pendingFlashDealFilter = false;

export function requestFoodHomeFlashDealFilter(): void {
  pendingFlashDealFilter = true;
}

export function consumeFoodHomeFlashDealFilter(): boolean {
  if (!pendingFlashDealFilter) return false;
  pendingFlashDealFilter = false;
  return true;
}
