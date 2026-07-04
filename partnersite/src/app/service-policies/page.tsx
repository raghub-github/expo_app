import PartnerLegalPage from "@/components/legal/PartnerLegalPage";
import { getPartnerLegalMetadata } from "@/lib/legal/registry";

export const metadata = getPartnerLegalMetadata("service-policies");

export default function ServicePoliciesPage() {
  return <PartnerLegalPage slug="service-policies" />;
}
