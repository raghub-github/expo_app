"use client";

// See rider-queue/page.tsx for why "use client" is required here — the
// detailHref function prop cannot cross the server→client boundary.
import VerificationQueuePage from "../queue-page";

export default function Page() {
  return (
    <VerificationQueuePage
      title="Merchant verification queue"
      intro="Merchant onboarding documents pending manual review. Open the profile to see uploads side-by-side with the extracted provider data, then verify or reject."
      subjectType="merchant_store"
      detailHref={(storeId) => `/dashboard/super-admin/merchant/onboarding/${storeId}`}
    />
  );
}
