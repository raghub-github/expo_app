'use client';

import Image from "next/image";
import { useEffect, useState } from "react";
import { useAuthOptional, type SystemUserSummary } from "@/providers/AuthProvider";
import { getUserInitials } from "@/lib/user-avatar";
import { loadBootstrapFromStorage } from "@/lib/dashboard-bootstrap-storage";
import { HEADER_IDENTITY_CACHE_KEY } from "@/lib/dashboard-auth-client-state";

interface OrderHeaderProps {
  /** When true, header shows skeleton (e.g. while order details are loading). */
  forceSkeleton?: boolean;
}

type CachedIdentity = {
  systemUserId?: string | null;
  fullName?: string | null;
  email?: string | null;
};

function readPrefetchedIdentity(): CachedIdentity {
  if (typeof window === "undefined") return {};
  try {
    const headerRaw = window.localStorage.getItem(HEADER_IDENTITY_CACHE_KEY);
    const header = headerRaw ? (JSON.parse(headerRaw) as CachedIdentity) : null;
    const bootstrap = loadBootstrapFromStorage<{
      systemUser?: SystemUserSummary | null;
      session?: { user?: { email?: string } | null } | null;
    }>(24 * 60 * 60 * 1000);

    const systemUser = bootstrap?.data?.systemUser ?? null;
    return {
      systemUserId: header?.systemUserId?.trim() || systemUser?.systemUserId?.trim() || null,
      fullName: header?.fullName?.trim() || systemUser?.fullName?.trim() || null,
      email:
        header?.email?.trim() ||
        systemUser?.email?.trim() ||
        bootstrap?.data?.session?.user?.email?.trim() ||
        null,
    };
  } catch {
    return {};
  }
}

function persistIdentity(identity: CachedIdentity) {
  if (typeof window === "undefined") return;
  if (!identity.systemUserId && !identity.fullName && !identity.email) return;
  try {
    const prevRaw = window.localStorage.getItem(HEADER_IDENTITY_CACHE_KEY);
    const prev = prevRaw ? (JSON.parse(prevRaw) as Record<string, unknown>) : {};
    window.localStorage.setItem(
      HEADER_IDENTITY_CACHE_KEY,
      JSON.stringify({
        ...prev,
        systemUserId: identity.systemUserId ?? prev.systemUserId ?? null,
        fullName: identity.fullName ?? prev.fullName ?? null,
        email: identity.email ?? prev.email ?? null,
      })
    );
  } catch {
    // ignore
  }
}

export default function OrderHeader({ forceSkeleton = false }: OrderHeaderProps) {
  const auth = useAuthOptional();
  const authUser = auth?.user ?? null;
  const systemUser = auth?.systemUser ?? null;
  const authReady = auth?.authReady ?? false;

  /**
   * Never read localStorage in useState initializer — that makes the first client
   * paint differ from SSR (hydration mismatch on logo / avatar).
   * Start empty; hydrate cache after mount.
   */
  const [cached, setCached] = useState<CachedIdentity>({});
  const [identityReady, setIdentityReady] = useState(false);

  useEffect(() => {
    setCached(readPrefetchedIdentity());
    setIdentityReady(true);
  }, []);

  const email = systemUser?.email ?? authUser?.email ?? cached.email ?? null;
  const name =
    systemUser?.fullName ??
    cached.fullName ??
    (authUser as { full_name?: string } | null)?.full_name ??
    (authUser as { user_metadata?: { full_name?: string; name?: string } } | null)?.user_metadata
      ?.full_name ??
    (authUser as { user_metadata?: { name?: string } } | null)?.user_metadata?.name ??
    null;

  // Prefer business system user id (e.g. SUPER-ADMIN0002), never numeric PK.
  const systemUserId =
    systemUser?.systemUserId?.trim() ||
    cached.systemUserId?.trim() ||
    null;

  useEffect(() => {
    if (!systemUser?.systemUserId && !systemUser?.fullName && !systemUser?.email) return;
    const next = {
      systemUserId: systemUser.systemUserId?.trim() || null,
      fullName: systemUser.fullName?.trim() || null,
      email: systemUser.email?.trim() || null,
    };
    setCached((prev) => ({
      systemUserId: next.systemUserId || prev.systemUserId || null,
      fullName: next.fullName || prev.fullName || null,
      email: next.email || prev.email || null,
    }));
    persistIdentity(next);
  }, [systemUser?.systemUserId, systemUser?.fullName, systemUser?.email]);

  const displayEmail = email ?? "—";
  const initials = getUserInitials(name, email);
  const displayName = name ?? displayEmail;

  /** Only the user block can skeleton — logo is static and must match SSR. */
  const showUserSkeleton =
    forceSkeleton ||
    !identityReady ||
    (!authReady && !email && !systemUserId && !name);

  return (
    <header className="z-40 shrink-0 border-b border-slate-200 bg-white/95 shadow-[0_1px_4px_rgba(15,23,42,0.08)] backdrop-blur">
      <div className="flex h-11 w-full items-center justify-between px-3 sm:h-12 sm:px-4 md:px-6">
        <div className="flex items-center gap-2 sm:gap-3">
          <div className="relative h-6 w-[120px] sm:h-7 sm:w-[150px] md:h-7 md:w-[170px]">
            <Image
              src="/logo.png"
              alt="GatiMitra"
              fill
              priority
              className="object-contain"
            />
          </div>
        </div>

        <div className="flex items-center gap-2 sm:gap-2.5">
          {showUserSkeleton ? (
            <>
              <div className="h-7 w-7 sm:h-8 sm:w-8 rounded-full bg-slate-100 animate-pulse" />
              <div className="h-3 w-32 sm:w-40 rounded bg-slate-100 animate-pulse" />
            </>
          ) : (
            <>
              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-500 text-[11px] font-semibold text-white shadow-sm sm:h-8 sm:w-8 sm:text-xs">
                {initials}
              </div>
              <div className="min-w-0 text-right">
                <p className="max-w-[180px] truncate font-mono text-[10px] font-semibold text-slate-800 sm:max-w-[220px] sm:text-[11px]">
                  {systemUserId || "—"}
                </p>
                <p className="max-w-[180px] truncate text-[11px] font-medium text-slate-600 sm:max-w-[220px] sm:text-xs">
                  {displayName}
                </p>
              </div>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
