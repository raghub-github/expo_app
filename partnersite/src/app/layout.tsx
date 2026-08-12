import type { Metadata } from "next";
import { MerchantSessionProvider } from "@/context/MerchantSessionContext";
import { QueryProvider } from "@/components/QueryProvider";
import { Geist_Mono, Lora, Poppins } from "next/font/google";
import "./globals.css";

const siteLora = Lora({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-site-lora",
  display: "swap",
});

const sitePoppins = Poppins({
  subsets: ["latin"],
  weight: ["500", "600", "700", "800"],
  variable: "--font-site-poppins",
  display: "swap",
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "GatiMitra - Merchant Portal",
  description: "Manage your orders and merchant operations",
  icons: {
    icon: [
      { url: "/favicon.png", sizes: "any" },
      { url: "/onlylogo.png", sizes: "32x32", type: "image/png" },
    ],
    apple: [
      { url: "/onlylogo.png" },
      { url: "/onlylogo.png", sizes: "180x180", type: "image/png" },
    ],
    shortcut: "/favicon.png",
  },
  manifest: "/manifest.json",
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: "#ffffff",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="icon" href="/favicon.png" type="image/png" />
        <link rel="icon" href="/favicon.ico" sizes="any" />
        <link rel="apple-touch-icon" href="/onlylogo.png" />
      </head>
      <body
        className={`${siteLora.variable} ${sitePoppins.variable} ${geistMono.variable} antialiased bg-white`}
        style={{ background: '#fff', minHeight: '100%', width: '100%', overflowX: 'hidden' }}
      >
        <QueryProvider>
          <MerchantSessionProvider>
            {children}
          </MerchantSessionProvider>
        </QueryProvider>
      </body>
    </html>
  );
}
