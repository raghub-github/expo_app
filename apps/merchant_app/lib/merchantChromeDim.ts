import { useSyncExternalStore } from "react";

/**
 * When a full-screen sheet/modal is open, native tab headers can stay
 * above RN Modal. Screens subscribe so the merchant header dims and the
 * floating tab bar hides, matching a true bottom-sheet overlay.
 */
let dimCount = 0;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) {
    try {
      listener();
    } catch {
      /* ignore */
    }
  }
}

export function acquireMerchantChromeDim(): () => void {
  dimCount += 1;
  emit();
  let released = false;
  return () => {
    if (released) return;
    released = true;
    dimCount = Math.max(0, dimCount - 1);
    emit();
  };
}

function subscribe(onStoreChange: () => void) {
  listeners.add(onStoreChange);
  return () => {
    listeners.delete(onStoreChange);
  };
}

function getSnapshot() {
  return dimCount > 0;
}

export function useMerchantChromeDimmed() {
  return useSyncExternalStore(subscribe, getSnapshot, () => false);
}
