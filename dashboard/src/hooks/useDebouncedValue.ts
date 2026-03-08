"use client";

import { useState, useEffect, useCallback } from "react";

/**
 * Returns a value that updates only after the input has been stable for `delayMs`.
 * Use for search/filter inputs to avoid firing API calls on every keystroke.
 */
export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(t);
  }, [value, delayMs]);

  return debounced;
}

/**
 * Returns a callback that invokes the given function after the delay, reset on each call.
 * Use for on-change handlers where you want to debounce the side effect (e.g. router.push).
 */
export function useDebouncedCallback<T extends (...args: unknown[]) => void>(
  fn: T,
  delayMs: number
): T {
  const timeoutRef = { current: null as ReturnType<typeof setTimeout> | null };
  const callback = useCallback(
    ((...args: Parameters<T>) => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(() => {
        timeoutRef.current = null;
        fn(...args);
      }, delayMs);
    }) as T,
    [fn, delayMs]
  );
  return callback;
}
