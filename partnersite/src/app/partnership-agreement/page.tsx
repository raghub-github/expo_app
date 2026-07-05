import PartnerLegalPage from "@/components/legal/PartnerLegalPage";
import { getPartnerLegalMetadata } from "@/lib/legal/registry";

export const metadata = getPartnerLegalMetadata("partnership-agreement");

export default function PartnershipAgreementPage() {
  return <PartnerLegalPage slug="partnership-agreement" />;
}
