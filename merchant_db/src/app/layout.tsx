import type { Metadata } from "next";
import { MerchantSessionProvider } from "@/context/MerchantSessionContext";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "GatiMitra - Merchant Portal",
  description: "Manage your orders and merchant operations",
  icons: {
    icon: "/logo.png",
    apple: "/logo.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-white`}
        style={{ background: '#fff', minHeight: '100vh', width: '100vw', overflow: 'auto' }}
      >
        <MerchantSessionProvider>
          {children}
        </MerchantSessionProvider>
      </body>
    </html>
  );
}
