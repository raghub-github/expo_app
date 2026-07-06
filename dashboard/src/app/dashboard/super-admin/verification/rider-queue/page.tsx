"use client";

// Marked "use client" because we pass a function prop (detailHref) into the
// shared VerificationQueuePage component. Function props can't cross the
// server→client boundary — Server Components fails with "An error occurred
// in the Server Components render" if this file omits the directive.
import VerificationQueuePage from "../queue-page";

export default function Page() {
  return (
    <VerificationQueuePage
      title="Rider verification queue"
      intro="Riders whose onboarding documents Cashfree couldn't auto-verify, or were routed to manual review by policy. Pick one, check the uploaded documents against the extracted data, and mark verified or rejected."
      subjectType="rider"
      detailHref={(riderId) => `/dashboard/super-admin/agents/rider-onboarding/${riderId}`}
    />
  );
}
