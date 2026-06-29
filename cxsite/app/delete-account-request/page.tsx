import DeleteAccountRequestClient from "@/components/legal/DeleteAccountRequestClient";
import { fullPageTitle, pageTitleSegment } from "@/lib/pageTitle";

export const metadata = {
  title: pageTitleSegment("Delete Account"),
  description:
    "OTP-verified account deletion for GatiMitra. Required by Google Play. We deactivate within 24 hours and remove your personal data as listed in our policy.",
  alternates: { canonical: "https://gatimitra.com/delete-account-request" },
  robots: { index: true, follow: true },
  openGraph: {
    title: fullPageTitle("Delete Account"),
    description: "OTP-verified account deletion — accepted from the GatiMitra website.",
    url: "https://gatimitra.com/delete-account-request",
    siteName: "GatiMitra",
    type: "website",
  },
};

export default function Page() {
  return <DeleteAccountRequestClient />;
}
