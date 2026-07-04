let listScrolling = false;
let scrollEndTimer: ReturnType<typeof setTimeout> | null = null;

const SCROLL_SETTLE_MS = 200;

/** Parent list began dragging — block card taps until scroll settles. */
export function markFoodHomeListScrollActive(): void {
  listScrolling = true;
  if (scrollEndTimer) {
    clearTimeout(scrollEndTimer);
    scrollEndTimer = null;
  }
}

/** Parent list stopped — defer clearing so lift-after-scroll does not open a store. */
export function markFoodHomeListScrollEnded(): void {
  if (scrollEndTimer) clearTimeout(scrollEndTimer);
  scrollEndTimer = setTimeout(() => {
    listScrolling = false;
    scrollEndTimer = null;
  }, SCROLL_SETTLE_MS);
}

export function isFoodHomeListScrollActive(): boolean {
  return listScrolling;
}
