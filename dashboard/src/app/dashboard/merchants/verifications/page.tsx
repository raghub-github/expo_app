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
    <div className="verification-typo w-full max-w-full overflow-x-hidden">
      {storeId ? (
        <Suspense fallback={<VerificationPageSkeleton />}>
          <StoreVerificationInnerWrapper
            storeId={storeId}
            returnTo={returnTo}
          />
        </Suspense>
      ) : (
        <div className="space-y-6 rounded-lg border border-gray-200 bg-white p-6">
          <h1 className="mb-2 text-lg font-semibold text-gray-900">
            Store Verifications
          </h1>
          <p className="mb-4 text-gray-500">
            Go to Merchants, select a store, and click Verify to open verification for that store. No data is shown here until you do that.
          </p>
          <MerchantVerificationsClient />
        </div>
      )}
    </div>
  );
}
