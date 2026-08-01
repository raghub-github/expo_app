'use client';

/**
 * Live rider referral config for marketing copy.
 *
 * Polls the server proxy so a Super Admin change shows up without a rebuild or
 * a manual page refresh. Returns `null` until loaded and whenever the backend
 * is unreachable, so callers can fall back to neutral copy rather than a
 * stale/incorrect number.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

const POLL_MS = 30000;

export function useReferralConfig() {
  const [config, setConfig] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const versionRef = useRef(-1);

  const load = useCallback(async (signal) => {
    try {
      const res = await fetch('/api/referral-config', {
        cache: 'no-store',
        signal,
      });
      if (!res.ok) return;
      const body = await res.json();
      if (!body?.ok) return;
      if (body.configVersion === versionRef.current) return;
      versionRef.current = body.configVersion;
      setConfig(body);
    } catch {
      /* offline or aborted — keep whatever we already have */
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);

    const timer = setInterval(() => {
      if (typeof document !== 'undefined' && document.hidden) return;
      void load(controller.signal);
    }, POLL_MS);

    // Refresh the moment someone returns to the tab.
    const onVisible = () => {
      if (!document.hidden) void load(controller.signal);
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      controller.abort();
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [load]);

  return { config, loaded };
}

/** Currency-aware formatter matching the backend's reward copy. */
export function formatReward(amount, currency = 'INR') {
  if (!Number.isFinite(amount) || amount <= 0) return null;
  const symbol = currency === 'INR' ? '₹' : `${currency} `;
  const rounded = Math.round(amount * 100) / 100;
  return `${symbol}${Number.isInteger(rounded) ? rounded : rounded.toFixed(2)}`;
}

/** First (lowest-order) milestone — the "welcome bonus" riders see first. */
export function firstMilestone(config) {
  return config?.milestones?.length ? config.milestones[0] : null;
}
