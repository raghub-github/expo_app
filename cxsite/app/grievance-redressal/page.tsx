import LegalPage, { getLegalMetadata } from "@/components/legal/LegalPage";

export const metadata = getLegalMetadata("grievance-redressal");

/** Full-width support-style shell via shared LegalPage. */
export default function Page() {
  return <LegalPage slug="grievance-redressal" />;
}
