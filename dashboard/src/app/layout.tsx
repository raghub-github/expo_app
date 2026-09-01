import type { Metadata } from "next";
import "./globals.css";

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
        <link rel="icon" href="/favicon.png?v=1" type="image/png" sizes="32x32" />
        <link rel="shortcut icon" href="/favicon.png?v=1" type="image/png" />
        <link rel="apple-touch-icon" href="/favicon.png?v=1" />
      </head>
      <body className="antialiased">{children}</body>
    </html>
  );
}
