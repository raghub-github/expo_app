"use client";

import { useEffect, useRef } from "react";
import { useMerchantSession } from "@/context/MerchantSessionContext";
import {
  clearPendingMerchantReferral,
  peekPendingMerchantReferral,
} from "@/lib/pendingMerchantReferral";

/**
 * If a pending merchant referral survives login (existing parent),
 * apply it to the parent via the unified engine. Idempotent.
 */
export function PartnerMerchantReferralAttribution() {
  const session = useMerchantSession();
  const triedRef = useRef(false);

  useEffect(() => {
    if (!session || session.isLoading || !session.isAuthenticated || !session.parent?.id || triedRef.current) return;
    const pending = peekPendingMerchantReferral();
    if (!pending?.code) return;
    triedRef.current = true;
    void (async () => {
      try {
        const res = await fetch("/api/referral/apply-pending", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ referralCode: pending.code }),
        });
        if (res.ok) {
          clearPendingMerchantReferral();
        }
        // 409 REFERRAL_SERVICE_DISABLED: keep pending so a later ON can apply.
        // Other 4xx (invalid code) is dropped so we do not retry forever.
      } catch {
        triedRef.current = false;
      }
    })();
  }, [session?.isAuthenticated, session?.isLoading, session?.parent?.id]);

  return null;
}
