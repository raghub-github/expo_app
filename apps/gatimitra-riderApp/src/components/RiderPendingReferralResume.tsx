/**
 * Captures rider-ref deep links + Play Install Referrer, then POSTs /v1/referral/apply
 * after login. Safe to run on every launch — apply is idempotent.
 */

import { useEffect, useRef } from "react";
import * as Linking from "expo-linking";
import { useSessionStore } from "@/src/stores/sessionStore";
import {
  clearPendingReferral,
  parseReferralFromUrl,
  peekPendingReferral,
  storePendingReferral,
} from "@/src/lib/pendingReferral";
import { capturePlayInstallReferrerOnce } from "@/src/lib/playInstallReferrer";
import {
  applyRiderReferral,
  fetchRiderReferralConfig,
} from "@/src/services/referral.service";

async function captureUrl(url: string | null | undefined): Promise<void> {
  const parsed = parseReferralFromUrl(url);
  if (!parsed?.code) return;
  await storePendingReferral({
    code: parsed.code,
    clickToken: parsed.clickToken ?? null,
    source: "deep_link",
  });
}

export function RiderPendingReferralResume() {
  const hydrated = useSessionStore((s) => s.hydrated);
  const accessToken = useSessionStore((s) => s.session?.accessToken ?? null);
  const applying = useRef(false);

  useEffect(() => {
    let sub: { remove: () => void } | undefined;
    void Linking.getInitialURL()
      .then((url) => captureUrl(url))
      .catch(() => undefined);
    sub = Linking.addEventListener("url", (event) => {
      void captureUrl(event.url);
    });
    return () => sub?.remove();
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    void capturePlayInstallReferrerOnce().catch(() => undefined);
  }, [hydrated]);

  useEffect(() => {
    if (!hydrated || !accessToken) return;
    if (applying.current) return;
    applying.current = true;
    void (async () => {
      try {
        const config = await fetchRiderReferralConfig().catch(() => null);
        if (config?.referralEnabled !== true) return;

        const capture = await capturePlayInstallReferrerOnce().catch(() => null);
        if (capture?.code && !capture.alreadyConsumed) {
          try {
            const result = await applyRiderReferral({
              referralCode: capture.code,
              playReferrer: capture.raw ?? undefined,
              source: "play_install_referrer",
            });
            if (result.ok || result.alreadyApplied) {
              await clearPendingReferral();
              return;
            }
          } catch {
            /* fall through to pending storage */
          }
        }

        const pending = await peekPendingReferral();
        if (!pending?.code) return;
        const result = await applyRiderReferral({
          referralCode: pending.code,
          clickToken: pending.clickToken ?? undefined,
          source: pending.source,
        });
        if (result.ok || result.alreadyApplied) {
          await clearPendingReferral();
        }
      } catch {
        /* keep pending for next launch / login */
      } finally {
        applying.current = false;
      }
    })();
  }, [hydrated, accessToken]);

  return null;
}
