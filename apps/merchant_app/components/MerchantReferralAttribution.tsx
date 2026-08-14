/**
 * Captures merchant-ref deep links and applies them after login.
 * Never calculates rewards — only posts the captured code to the backend.
 */

import { useEffect, useRef } from "react";
import * as Linking from "expo-linking";
import { useAuth } from "@/context/AuthContext";
import {
  clearPendingMerchantReferral,
  parseMerchantReferralFromUrl,
  peekPendingMerchantReferral,
  storePendingMerchantReferral,
} from "@/lib/pendingMerchantReferral";
import { applyMerchantReferral, fetchMerchantReferralConfig } from "@/services/referral.service";

async function captureUrl(url: string | null | undefined): Promise<void> {
  const parsed = parseMerchantReferralFromUrl(url);
  if (!parsed) return;
  await storePendingMerchantReferral({
    code: parsed.code,
    clickToken: parsed.clickToken ?? null,
    source: "deep_link",
  });
}

export function MerchantReferralAttribution() {
  const { token, isAuthenticated } = useAuth();
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
    if (!isAuthenticated || !token) return;
    if (applying.current) return;
    applying.current = true;
    void (async () => {
      try {
        const pending = await peekPendingMerchantReferral();
        if (!pending?.code) return;
        const config = await fetchMerchantReferralConfig();
        if (config?.referralEnabled !== true) return;
        const result = await applyMerchantReferral(token, {
          referralCode: pending.code,
          clickToken: pending.clickToken,
        });
        if (result.ok || result.alreadyApplied) {
          await clearPendingMerchantReferral();
        }
      } catch {
        /* keep pending for next session */
      } finally {
        applying.current = false;
      }
    })();
  }, [isAuthenticated, token]);

  return null;
}
