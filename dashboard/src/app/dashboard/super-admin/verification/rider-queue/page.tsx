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
