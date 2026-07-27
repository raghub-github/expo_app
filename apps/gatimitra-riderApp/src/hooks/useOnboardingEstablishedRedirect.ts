// @ts-nocheck — pending strict-mode cleanup; tracked in follow-up issue.
import { useEffect, useRef } from "react";
import { router, usePathname } from "expo-router";
import {
  resolveEstablishedRiderHref,
  type ServerOnboardingStep,
} from "@/src/lib/onboarding-routes";

type RiderStatusSlice = {
  onboardingStatus?: string;
  accountStatus?: string;
  approvalStatus?: string;
  paymentCompleted?: boolean;
  nextOnboardingStep?: string;
};

function pathMatchesHref(pathname: string | null, href: string): boolean {
  if (!pathname) return false;
  const normalizedPath = pathname.replace(/\/$/, "") || "/";
  const normalizedHref = href.replace(/\/$/, "");
  // href like "/(onboarding)/payment" — match by leaf segment
  const hrefLeaf = normalizedHref.split("/").filter(Boolean).pop();
  const pathLeaf = normalizedPath.split("/").filter(Boolean).pop();
  if (hrefLeaf && pathLeaf && hrefLeaf === pathLeaf) return true;
  return normalizedPath === normalizedHref || normalizedPath.endsWith(normalizedHref);
}

/** Redirect verified / post-KYC riders away from document upload screens. */
export function useOnboardingEstablishedRedirect(riderStatus?: RiderStatusSlice | null) {
  const pathname = usePathname();
  const lastHrefRef = useRef<string | null>(null);

  useEffect(() => {
    if (!riderStatus) return;
    const href = resolveEstablishedRiderHref(
      riderStatus.onboardingStatus,
      riderStatus.accountStatus,
      riderStatus.approvalStatus,
      {
        paymentCompleted: riderStatus.paymentCompleted,
        nextOnboardingStep: riderStatus.nextOnboardingStep as ServerOnboardingStep | undefined,
      },
    );
    if (!href) return;
    if (pathMatchesHref(pathname, href)) return;
    if (lastHrefRef.current === href) return;
    lastHrefRef.current = href;
    router.replace(href);
  }, [
    riderStatus?.onboardingStatus,
    riderStatus?.accountStatus,
    riderStatus?.approvalStatus,
    riderStatus?.paymentCompleted,
    riderStatus?.nextOnboardingStep,
    pathname,
  ]);
}
