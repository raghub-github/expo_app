"use client";
import SearchBar from "./SearchBar";
import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import type { Metadata } from "next";
import { Inter, Roboto_Mono } from "next/font/google";
import "./globals.css";
import Link from "next/link";

const geistSans = Inter({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Roboto_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Metadata moved to layout.metadata.ts for server-side export

const sidebarLinks = [
  { label: "Rider Information", href: "/rider-dashboard" },
  { label: "Orders", href: "/rider-dashboard/orders" },
  { label: "Penalties", href: "/rider-dashboard/penalties" },
  { label: "Incentives", href: "/rider-dashboard/incentives" },
  { label: "Surges & Offers", href: "/rider-dashboard/surges-offers" },
  { label: "Withdrawals", href: "/rider-dashboard/withdrawals" },
  { label: "Activity Logs", href: "/rider-dashboard/activity-logs" },
  { label: "Rider's Concern", href: "/rider-dashboard/support-notes" },
  { label: "Leaderboard", href: "/rider-dashboard/riders" },
];

export default function RiderDashboardLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialSearch = searchParams.get('search') || "";
  const [filter, setFilter] = useState<string>(initialSearch);
  const [loading, setLoading] = useState<boolean>(false);

  // Search handler for global search bar
  const handleSearch = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const searchValue = filter.trim();
    if (!searchValue) {
      alert('Please enter Rider ID or Phone number to search.');
      return;
    }
    setLoading(true);
    router.push(`/rider-dashboard?search=${encodeURIComponent(searchValue)}`);
    setLoading(false);
  };

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    let value = e.target.value;
    if (/^g/i.test(value)) {
      value = value.toUpperCase();
    }
    setFilter(value);
    if (value.trim() === "") {
      router.push("/rider-dashboard");
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') {
      handleSearch();
    }
  }

  return (
    <div className={`${geistSans.variable} ${geistMono.variable} antialiased bg-[var(--background)] text-[var(--foreground)]`} style={{overflow: 'hidden'}}>
      {/* Header */}
      <header className="fixed top-0 left-0 w-full flex flex-col justify-center z-50" style={{height: '56px', minHeight: '48px', background: 'linear-gradient(90deg, #e0e7ff 0%, #f0fdfa 100%)', boxShadow: '0 2px 12px 0 rgba(60, 60, 120, 0.08)', borderBottomLeftRadius: '12px', borderBottomRightRadius: '12px'}}>
        <div className="flex items-center justify-between px-4 w-full h-12" style={{minHeight: '44px'}}>
          <div className="flex items-center gap-4 w-full">
            <div className="flex flex-col justify-center">
              <div className="text-base font-bold tracking-tight whitespace-nowrap bg-gradient-to-r from-blue-500 via-purple-500 to-pink-500 bg-clip-text text-transparent" style={{WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent'}}>
                Rider Dashboard
              </div>
              <div className="flex items-center gap-1 mt-0.5" style={{marginTop: '2px'}}>
                <span className="text-xs text-gray-500">Powered by</span>
                <span className="font-bold bg-gradient-to-r from-blue-500 via-purple-500 to-pink-500 bg-clip-text text-transparent text-xs" style={{WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent'}}>GatiMitra</span>
              </div>
            </div>
            <div className="flex-1 flex items-center justify-center h-full">
              <div className="w-full max-w-md flex items-center h-full">
                <SearchBar
                  value={filter}
                  onChange={handleInputChange}
                  onKeyDown={handleKeyDown}
                  onSubmit={handleSearch}
                  loading={loading}
                  compact={true}
                />
              </div>
            </div>
            <div className="flex items-center gap-2 whitespace-nowrap">
              <span className="font-medium text-gray-700 text-sm">Agent Name</span>
              <button className="px-2 py-1 rounded bg-gradient-to-r from-blue-500 to-purple-500 text-white font-semibold shadow border-none text-sm">Logout</button>
            </div>
          </div>
        </div>
      </header>

      <div className="flex min-h-screen bg-[var(--background)]">
        {/* Sidebar */}
        <aside className="fixed left-0 top-0 h-screen w-16 sm:w-52 bg-gradient-to-b from-blue-50 via-purple-50 to-pink-50 border-r border-[var(--border-color)] flex flex-col items-center pt-20 pb-6 gap-2 shadow-lg z-40" style={{overflow: 'hidden', minWidth: '56px'}}>
          <nav className="flex flex-col gap-4 w-full px-2">
            {sidebarLinks.map(link => (
              <SidebarButton key={link.label} label={link.label} href={link.href} compact={link.label !== "Rider Information"} />
            ))}
          </nav>
        </aside>
        {/* Main Content */}
        <main className="flex-1 p-6 pt-24 bg-[var(--background)]">
          {children}
        </main>
      </div>
    </div>
  );
}

import { usePathname } from "next/navigation";

function SidebarButton({ label, href, compact }: { label: string; href: string; compact?: boolean }) {
  const pathname = usePathname();
  const isActive = pathname === href;
  return (
    <Link href={href}
      className={`flex items-center w-full px-2 py-2 rounded font-medium transition-colors whitespace-nowrap ${compact ? 'text-sm' : ''} ${isActive ? 'bg-blue-100 text-blue-700 font-semibold' : 'bg-transparent text-gray-700 hover:bg-blue-50'}`}
      style={compact ? {minHeight: '36px', maxHeight: '40px'} : {}}
    >
      <span className="hidden sm:inline">{label}</span>
    </Link>
  );
}
