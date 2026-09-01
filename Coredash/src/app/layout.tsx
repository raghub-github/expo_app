import type { Metadata } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import { Toaster } from "sonner";
import "./globals.css";

export const metadata: Metadata = {
  title: "GatiMitra | Business analytics",
  description: "Company performance, payments, tax, fleet, and operations from live Postgres",
  icons: {
    icon: [
      { url: "/favicon.png?v=2", type: "image/png", sizes: "32x32" },
      { url: "/favicon.png?v=2", type: "image/png", sizes: "192x192" },
    ],
    shortcut: [{ url: "/favicon.png?v=2", type: "image/png" }],
    apple: [{ url: "/favicon.png?v=2", type: "image/png", sizes: "180x180" }],
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="icon" href="/favicon.png?v=2" type="image/png" sizes="32x32" />
        <link rel="shortcut icon" href="/favicon.png?v=2" type="image/png" />
        <link rel="apple-touch-icon" href="/favicon.png?v=2" />
      </head>
      <body
        className={`${GeistSans.variable} ${GeistMono.variable} ${GeistSans.className} antialiased`}
        suppressHydrationWarning
      >
        {children}
        <Toaster
          position="top-right"
          toastOptions={{
            classNames: {
              error: "text-[#DC2626]",
            },
          }}
        />
      </body>
    </html>
  );
}
