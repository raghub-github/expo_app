import HelpCenterClient from "@/components/legal/HelpCenterClient";
import { fullPageTitle, pageTitleSegment } from "@/lib/pageTitle";

export const metadata = {
  title: pageTitleSegment("Help Center"),
  description:
    "Browse and search GatiMitra Help Center — orders, wallet, ride, food, courier, payments, membership, technical issues, refunds and privacy.",
  alternates: { canonical: "https://gatimitra.com/help-center" },
  openGraph: {
    title: fullPageTitle("Help Center"),
    description: "Quick answers and self-service for every GatiMitra service.",
    url: "https://gatimitra.com/help-center",
    siteName: "GatiMitra",
    type: "website",
  },
};

export default function Page() {
  return <HelpCenterClient />;
}
