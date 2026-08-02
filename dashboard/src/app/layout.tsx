import type { Metadata } from "next";
import { Suspense } from "react";
import "bootstrap-icons/font/bootstrap-icons.css";
import "./globals.css";
import { ReduxProvider } from "@/store/Provider";
import { QueryProvider } from "@/providers/QueryProvider";
import { GlobalErrorHandler } from "@/components/GlobalErrorHandler";
import { ToastProvider } from "@/context/ToastContext";
import { ChunkLoadErrorBoundary } from "@/components/ChunkLoadErrorBoundary";
import ControlAppShell from "@/providers/ControlAppShell";
import { geistMono, geistSans } from "@/lib/fonts/app-fonts";
import { ticketsNumFont, ticketsTextFont } from "@/lib/fonts/tickets-fonts";

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
        className={`${geistSans.variable} ${geistMono.variable} ${ticketsTextFont.variable} ${ticketsNumFont.variable} antialiased`}
      >
        <ChunkLoadErrorBoundary>
          <GlobalErrorHandler />
          <ReduxProvider>
            <QueryProvider>
              <ToastProvider>
                <Suspense fallback={null}>
                  <ControlAppShell>{children}</ControlAppShell>
                </Suspense>
              </ToastProvider>
            </QueryProvider>
          </ReduxProvider>
        </ChunkLoadErrorBoundary>
      </body>
    </html>
  );
}
