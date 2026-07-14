import { useRef } from "react";

/**
 * Temporary, development-only render-count logger.
 * Logs `[render] <name> #N` on every render of the calling component. No-op in production.
 * Used to verify a cart tap does NOT re-render components it shouldn't (e.g. the merchant
 * page body) and DOES re-render the ones it should (row stepper, cart dock).
 */
export function useRenderCount(name: string): number {
  const count = useRef(0);
  count.current += 1;
  if (__DEV__) {
    // eslint-disable-next-line no-console
    console.log(`[render] ${name} #${count.current}`);
  }
  return count.current;
}
