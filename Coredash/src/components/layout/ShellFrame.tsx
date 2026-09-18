"use client";

import { Suspense, useEffect } from "react";
import { usePathname } from "next/navigation";
import { Sidebar } from "@/components/layout/Sidebar";
import { Topbar } from "@/components/layout/Topbar";
import { useShellChrome } from "@/components/layout/ShellChrome";

export function ShellFrame({
  children,
  userName,
  userEmail,
  userId,
}: {
  children: React.ReactNode;
  userName: string;
  userEmail: string;
  userId: string;
}) {
  const { sidebarWidth } = useShellChrome();
  const pathname = usePathname();
  const hideTopbar =
    pathname === "/riders" ||
    pathname.startsWith("/riders/") ||
    pathname === "/customers" ||
    pathname.startsWith("/customers/") ||
    pathname === "/merchants" ||
    pathname.startsWith("/merchants/");

  useEffect(() => {
    document.documentElement.style.setProperty("--cd-sidebar-w", `${sidebarWidth}px`);
  }, [sidebarWidth]);

  return (
    <div className="flex h-dvh overflow-hidden bg-[#F4F6FF]">
      <Sidebar userName={userName} userEmail={userEmail} userId={userId} />
      <div
        className="flex min-h-0 min-w-0 flex-1 flex-col transition-[margin] duration-200 ease-out"
        style={{ marginLeft: sidebarWidth }}
      >
        {!hideTopbar ? (
          <Suspense fallback={<div className="h-[72px] shrink-0 border-b border-[#E4E7F7] bg-white" />}>
            <Topbar />
          </Suspense>
        ) : null}
        <main
          className={`cd-scroll min-h-0 min-w-0 flex-1 overflow-y-auto ${hideTopbar ? "p-0" : "p-6"}`}
        >
          <Suspense fallback={<div className="h-40 animate-pulse rounded-2xl bg-white" />}>
            {children}
          </Suspense>
        </main>
      </div>
    </div>
  );
}
