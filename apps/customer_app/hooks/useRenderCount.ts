import { useRef } from "react";
import { getTapLastAgeMs } from "@/lib/perfTrace";

/**
 * Development-only render counter.
 * Logs only when a cart tap is in-flight (avoids Metro console.log flooding that
 * itself added hundreds of ms per add-to-cart on Android).
 */
export function useRenderCount(name: string): number {
  const count = useRef(0);
  count.current += 1;
  if (__DEV__) {
    const age = getTapLastAgeMs();
    if (age != null && age < 2500) {
      // eslint-disable-next-line no-console
      console.log(`[render] ${name} #${count.current} (+${age.toFixed(0)}ms after tap)`);
    }
  }
  return count.current;
}
