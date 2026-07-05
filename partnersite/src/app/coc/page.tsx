import PartnerLegalPage from "@/components/legal/PartnerLegalPage";
import { getPartnerLegalMetadata } from "@/lib/legal/registry";

export const metadata = getPartnerLegalMetadata("coc");

export default function CodeOfConductPage() {
  return <PartnerLegalPage slug="coc" />;
}
