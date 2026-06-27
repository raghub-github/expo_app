import SupportClient from "@/components/legal/SupportClient";

export const metadata = {
  title: "Support — GatiMitra",
  description:
    "Open a GatiMitra support ticket, report an issue or share feedback. Our team responds in under 4 hours on average.",
  alternates: { canonical: "https://gatimitra.com/support" },
  openGraph: {
    title: "Support — GatiMitra",
    description: "Submit a ticket, report an issue or contact our team directly.",
    url: "https://gatimitra.com/support",
    siteName: "GatiMitra",
    type: "website",
  },
};

type SP = { searchParams?: { type?: string } };

export default function Page({ searchParams }: SP) {
  return <SupportClient initialType={searchParams?.type} />;
}
