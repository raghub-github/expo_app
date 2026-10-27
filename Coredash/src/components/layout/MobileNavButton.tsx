"use client";

import { Menu } from "lucide-react";
import { useShellChrome } from "@/components/layout/ShellChrome";

export function MobileNavButton({ className = "" }: { className?: string }) {
  const { openMobileNav, isDesktop } = useShellChrome();
  if (isDesktop) return null;
  return (
    <button
      type="button"
      onClick={openMobileNav}
      aria-label="Open navigation"
      className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[#E5E7EB] bg-white text-[#1E1C4A] shadow-sm hover:bg-[#F9FAFB] lg:hidden ${className}`}
    >
      <Menu className="h-5 w-5" strokeWidth={1.75} />
    </button>
  );
}
