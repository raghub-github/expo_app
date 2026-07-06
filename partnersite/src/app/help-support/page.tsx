import PartnerLegalPage from "@/components/legal/PartnerLegalPage";
import { getPartnerLegalMetadata } from "@/lib/legal/registry";

export const metadata = getPartnerLegalMetadata("help-support");

export default function HelpSupportPage() {
  return <PartnerLegalPage slug="help-support" />;
}
