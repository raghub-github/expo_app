import HelpCenterClient from "@/components/legal/HelpCenterClient";

export const metadata = {
  title: "Help Center — GatiMitra",
  description:
    "Browse and search GatiMitra Help Center — orders, wallet, ride, food, courier, payments, membership, technical issues, refunds and privacy.",
  alternates: { canonical: "https://gatimitra.com/help-center" },
  openGraph: {
    title: "Help Center — GatiMitra",
    description: "Quick answers and self-service for every GatiMitra service.",
    url: "https://gatimitra.com/help-center",
    siteName: "GatiMitra",
    type: "website",
  },
};

export default function Page() {
  return <HelpCenterClient />;
}
