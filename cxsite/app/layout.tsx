import type { Metadata } from "next";
import { Inter, Montserrat } from "next/font/google";
import "./globals.css";
import ReduxProvider from "@/components/providers/ReduxProvider";
import { CartAnimationProvider } from "@/components/cart/CartAnimation";
import { LocationProvider } from "@/components/providers/LocationProvider";
import AuthLocationSync from "@/components/providers/AuthLocationSync";
import OrganizationJsonLd from "@/components/legal/OrganizationJsonLd";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
  weight: ["300", "400", "500", "600", "700", "800", "900"],
});

const montserrat = Montserrat({
  subsets: ["latin"],
  variable: "--font-montserrat",
  display: "swap",
  weight: ["400", "500", "600", "700", "800", "900"],
});

export const metadata: Metadata = {
  metadataBase: new URL("https://gatimitra.com"),
  title: {
    default: "GatiMitra | Moving India Forward",
    template: "%s | GatiMitra",
  },
  description: "India's Lowest Commission Delivery Platform - Food • Parcel • Person Delivery",
  applicationName: "GatiMitra",
  authors: [{ name: "GatiMitra On Demand Services Private Limited" }],
  generator: "Next.js",
  keywords: [
    "food delivery",
    "parcel delivery",
    "ride booking",
    "ondc",
    "gatimitra",
    "india lowest commission delivery",
  ],
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, "max-image-preview": "large" },
  },
  openGraph: {
    type: "website",
    siteName: "GatiMitra",
    title: "GatiMitra | Moving India Forward",
    description: "India's Lowest Commission Delivery Platform",
    url: "https://gatimitra.com",
    images: [{ url: "/img/logoo.png", width: 512, height: 512, alt: "GatiMitra" }],
  },
  twitter: {
    card: "summary_large_image",
    site: "@gatimitra",
    title: "GatiMitra",
    description: "India's Lowest Commission Delivery Platform",
  },
  icons: {
    icon: "/img/fav.png",
    shortcut: "/img/fav.png",
    apple: "/img/fav.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${inter.variable} ${montserrat.variable}`}>
      <head>
        <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css" />
        <script src="https://checkout.razorpay.com/v1/checkout.js"></script>
        <OrganizationJsonLd />
      </head>
      <body>
        <ReduxProvider>
          <LocationProvider>
            <AuthLocationSync />
            <CartAnimationProvider>
              {children}
            </CartAnimationProvider>
          </LocationProvider>
        </ReduxProvider>
      </body>
    </html>
  );
}

