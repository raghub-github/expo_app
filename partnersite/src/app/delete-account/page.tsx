import PartnerLegalPage from "@/components/legal/PartnerLegalPage";
import { getPartnerLegalMetadata } from "@/lib/legal/registry";

export const metadata = getPartnerLegalMetadata("account-deletion");

export default function DeleteAccountPage() {
  return <PartnerLegalPage slug="account-deletion" />;
}
