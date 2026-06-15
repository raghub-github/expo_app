import { useEffect } from "react";
import { router } from "expo-router";
import { resolveEstablishedRiderHref } from "@/src/lib/onboarding-routes";

type RiderStatusSlice = {
  onboardingStatus?: string;
  accountStatus?: string;
  approvalStatus?: string;
};

/** Redirect verified / post-KYC riders away from document upload screens. */
export function useOnboardingEstablishedRedirect(riderStatus?: RiderStatusSlice | null) {
  useEffect(() => {
    if (!riderStatus) return;
    const href = resolveEstablishedRiderHref(
      riderStatus.onboardingStatus,
      riderStatus.accountStatus,
      riderStatus.approvalStatus,
    );
    if (href) router.replace(href);
  }, [
    riderStatus?.onboardingStatus,
    riderStatus?.accountStatus,
    riderStatus?.approvalStatus,
  ]);
}
