import PartnerLegalPage from "@/components/legal/PartnerLegalPage";
import { getPartnerLegalMetadata } from "@/lib/legal/registry";

export const metadata = getPartnerLegalMetadata("privacy-policy");

export default function PrivacyPolicyPage() {
  return <PartnerLegalPage slug="privacy-policy" />;
}
