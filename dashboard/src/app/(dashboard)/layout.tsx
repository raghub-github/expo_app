import { Suspense } from "react";
import { Sidebar } from "@/components/layout/Sidebar";
import { Header } from "@/components/layout/Header";

function HeaderFallback() {
  return (
    <header
      className="flex h-14 shrink-0 items-center border-b border-gray-200 bg-white px-4"
      aria-hidden
    >
      <div className="h-8 w-48 animate-pulse rounded bg-gray-100" />
    </header>
  );
}

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex h-screen overflow-hidden" style={{ backgroundColor: '#E6F6F5' }}>
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Suspense fallback={<div className="h-14 shrink-0 border-b border-gray-200 bg-white" aria-hidden />}>          <Header />
        </Suspense>
        <main className="flex-1 overflow-y-auto p-6" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none', backgroundColor: '#FFFFFF' }}>
          {children}
        </main>
      </div>
    </div>
  );
}
