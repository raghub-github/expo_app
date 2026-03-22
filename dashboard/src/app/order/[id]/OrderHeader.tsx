'use client';

import Image from "next/image";
import { useAuthOptional } from "@/providers/AuthProvider";
import { getUserInitials } from "@/lib/user-avatar";

interface OrderHeaderProps {
  /** When true, header shows skeleton (e.g. while order details are loading). */
  forceSkeleton?: boolean;
}

export default function OrderHeader({ forceSkeleton = false }: OrderHeaderProps) {
  const auth = useAuthOptional();
  const authUser = auth?.user ?? null;
  const authReady = auth?.authReady ?? false;
  const email = authUser?.email ?? null;
  const name =
    (authUser as any)?.full_name ??
    (authUser as any)?.user_metadata?.full_name ??
    (authUser as any)?.user_metadata?.name ??
    null;

  const displayEmail = email ?? "—";
  const initials = getUserInitials(name, email);
  const displayName = name ?? displayEmail;

  const showSkeleton = forceSkeleton || (!authReady && !email);

  return (
    <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/95 backdrop-blur shadow-[0_1px_4px_rgba(15,23,42,0.08)]">
      <div className="flex h-11 w-full items-center justify-between px-3 sm:h-12 sm:px-4 md:px-6">
        {/* Logo hard-left */}
        <div className="flex items-center gap-2 sm:gap-3">
          {showSkeleton ? (
            <div className="h-6 w-[120px] sm:h-7 sm:w-[150px] md:h-7 md:w-[170px] rounded bg-slate-100 animate-pulse" />
          ) : (
            <div className="relative h-6 w-[120px] sm:h-7 sm:w-[150px] md:h-7 md:w-[170px]">
              <Image
                src="/logo.png"
                alt="GatiMitra"
                fill
                priority
                className="object-contain"
              />
            </div>
          )}
        </div>

        {/* Agent email hard-right */}
        <div className="flex items-center gap-2 sm:gap-2.5">
          {showSkeleton ? (
            <>
              <div className="h-7 w-7 sm:h-8 sm:w-8 rounded-full bg-slate-100 animate-pulse" />
              <div className="h-3 w-32 sm:w-40 rounded bg-slate-100 animate-pulse" />
            </>
          ) : (
            <>
              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-500 text-[11px] font-semibold text-white shadow-sm sm:h-8 sm:w-8 sm:text-xs">
                {initials}
              </div>
              <p className="max-w-[180px] truncate text-[11px] font-medium text-slate-600 sm:max-w-[220px] sm:text-xs text-right">
                {displayName}
              </p>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
