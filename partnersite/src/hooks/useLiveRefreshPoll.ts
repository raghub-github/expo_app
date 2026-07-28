"use client";

import { useEffect, useRef } from "react";

/**
 * Light poll + focus/visibility refresh for pages that must pick up remote
 * status changes (e.g. admin rejects another onboarding step mid-resubmit).
 */
export function useLiveRefreshPoll(
  enabled: boolean,
  onRefresh: () => void | Promise<void>,
  intervalMs = 2_500
) {
  const onRefreshRef = useRef(onRefresh);
  onRefreshRef.current = onRefresh;

  useEffect(() => {
    if (!enabled) return;

    const run = () => {
      void Promise.resolve(onRefreshRef.current()).catch(() => {});
    };

    const onVisibility = () => {
      if (document.visibilityState === "visible") run();
    };
    const onFocus = () => run();

    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);

    const id = window.setInterval(() => {
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
      run();
    }, intervalMs);

    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
      window.clearInterval(id);
    };
  }, [enabled, intervalMs]);
}
