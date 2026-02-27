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
    icon: "/favicon.png",
    shortcut: "/favicon.png",
    apple: "/favicon.png",
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
