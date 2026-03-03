import { Suspense } from "react";
import { requireDashboardAccess } from "@/lib/permissions/page-protection";
import { MerchantVerificationsClient } from "./MerchantVerificationsClient";
import { StoreVerificationInnerWrapper } from "./StoreVerificationInnerWrapper";
import { VerificationPageSkeleton } from "./VerificationPageSkeleton";

export default async function MerchantVerificationsPage({
  searchParams,
}: {
  searchParams: Promise<{ storeId?: string; returnTo?: string }>;
}) {
  await requireDashboardAccess("MERCHANT");
  const params = await searchParams;
  const storeId = params.storeId?.trim() || null;
  const returnTo = params.returnTo?.trim() || null;

  return (
    <div className="space-y-6 w-full max-w-full overflow-x-hidden">
      <div className="rounded-lg border border-gray-200 bg-white p-6">
        {storeId ? (
          <Suspense fallback={<VerificationPageSkeleton />}>
            <StoreVerificationInnerWrapper
              storeId={storeId}
              returnTo={returnTo}
            />
          </Suspense>
        ) : (
          <>
            <h1 className="text-lg font-semibold text-gray-900 mb-2">
              Store Verifications
            </h1>
            <p className="text-gray-500 mb-4">
              Go to Merchants, select a store, and click Verify to open verification for that store. No data is shown here until you do that.
            </p>
            <MerchantVerificationsClient />
          </>
        )}
      </div>
    </div>
  );
}
