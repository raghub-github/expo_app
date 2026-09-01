import type { Metadata } from "next";
import "./globals.css";
import ReduxProvider from "@/components/providers/ReduxProvider";
import { CartAnimationProvider } from "@/components/cart/CartAnimation";
import { LocationProvider } from "@/components/providers/LocationProvider";
import AuthLocationSync from "@/components/providers/AuthLocationSync";
import OrderLocationFromUrlSync from "@/components/location-search/OrderLocationFromUrlSync";
import LocationVisitGate from "@/components/location-search/LocationVisitGate";
import OrganizationJsonLd from "@/components/legal/OrganizationJsonLd";
import { AppAssetsProvider } from "@/components/providers/AppAssetsProvider";
import ImageProtection from "@/components/common/ImageProtection";
import { GATIMITRA_SUBTAGLINE, GATIMITRA_TAGLINE } from "@/lib/brandTagline";

export const metadata: Metadata = {
  metadataBase: new URL("https://gatimitra.com"),
  title: {
    default: `GatiMitra | ${GATIMITRA_TAGLINE}`,
    template: "GatiMitra | %s",
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
    title: `GatiMitra | ${GATIMITRA_TAGLINE}`,
    description: GATIMITRA_SUBTAGLINE,
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
    icon: [{ url: "/img/fav.png", type: "image/png", sizes: "512x512" }],
    shortcut: [{ url: "/img/fav.png", type: "image/png" }],
    apple: [{ url: "/img/fav.png", type: "image/png", sizes: "180x180" }],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body suppressHydrationWarning>
        <OrganizationJsonLd />
        <ImageProtection />
        <ReduxProvider>
          <AppAssetsProvider>
            <LocationProvider>
              <AuthLocationSync />
              <OrderLocationFromUrlSync />
              <LocationVisitGate />
              <CartAnimationProvider>
                {children}
              </CartAnimationProvider>
            </LocationProvider>
          </AppAssetsProvider>
        </ReduxProvider>
      </body>
    </html>
  );
}
