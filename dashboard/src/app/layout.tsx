import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "bootstrap-icons/font/bootstrap-icons.css";
import "./globals.css";
import { ReduxProvider } from "@/store/Provider";
import { QueryProvider } from "@/providers/QueryProvider";
import { GlobalErrorHandler } from "@/components/GlobalErrorHandler";
import { ToastProvider } from "@/context/ToastContext";
import { ChunkLoadErrorBoundary } from "@/components/ChunkLoadErrorBoundary";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "GatiMitra Control Dashboard",
  description: "Enterprise-grade unified control dashboard",
  icons: {
    icon: [
      { url: "/favicon.png?v=1", type: "image/png", sizes: "32x32" },
      { url: "/favicon.png?v=1", type: "image/png", sizes: "192x192" },
      { url: "/favicon.png?v=1", type: "image/png", sizes: "512x512" },
    ],
    shortcut: [{ url: "/favicon.png?v=1", type: "image/png" }],
    apple: [{ url: "/favicon.png?v=1", type: "image/png", sizes: "180x180" }],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Explicit links keep favicon stable across browser fallback behavior. */}
        <link rel="icon" href="/favicon.png?v=1" type="image/png" sizes="32x32" />
        <link rel="shortcut icon" href="/favicon.png?v=1" type="image/png" />
        <link rel="apple-touch-icon" href="/favicon.png?v=1" />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <ChunkLoadErrorBoundary>
          <GlobalErrorHandler />
          <ReduxProvider>
            <QueryProvider>
              <ToastProvider>{children}</ToastProvider>
            </QueryProvider>
          </ReduxProvider>
        </ChunkLoadErrorBoundary>
      </body>
    </html>
  );
}
