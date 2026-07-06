import PartnerLegalPage from "@/components/legal/PartnerLegalPage";
import { getPartnerLegalMetadata } from "@/lib/legal/registry";

export const metadata = getPartnerLegalMetadata("terms");

export default function TermsPage() {
  return <PartnerLegalPage slug="terms" />;
}
