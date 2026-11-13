import { Suspense } from "react";
import { requireDashboardAccess } from "@/lib/permissions/page-protection";
import { MerchantVerificationsClient } from "./MerchantVerificationsClient";
import { StoreVerificationInnerWrapper } from "./StoreVerificationInnerWrapper";
import { VerificationPageSkeleton } from "./VerificationPageSkeleton";

export default async function MerchantVerificationsPage({
  searchParams,
}: {
  searchParams: Promise<{
    storeId?: string;
    returnTo?: string;
    step?: string;
    portal?: string;
    reviewRejected?: string;
  }>;
}) {
  await requireDashboardAccess("MERCHANT");
  const params = await searchParams;
  const storeId = params.storeId?.trim() || null;
  const returnTo = params.returnTo?.trim() || null;

  return (
    <div className={`${storeId ? "verification-typo" : "merchants-typo"} flex h-full min-h-0 w-full max-w-full flex-col overflow-hidden`}>
      {storeId ? (
        <Suspense fallback={<VerificationPageSkeleton />}>
          <StoreVerificationInnerWrapper
            storeId={storeId}
            returnTo={returnTo}
          />
        </Suspense>
      ) : (
        <MerchantVerificationsClient />
      )}
    </div>
  );
}
