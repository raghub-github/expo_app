"use client";

import { createContext, useContext } from "react";

export type DashboardIdentity = {
  userId: string;
  email: string;
};

const DashboardIdentityContext = createContext<DashboardIdentity | null>(null);

/** Placeholder used only during SSR/prerender when the shell provider is not yet in tree. */
const SSR_PLACEHOLDER: DashboardIdentity = { userId: "", email: "" };

export function DashboardIdentityProvider({
  userId,
  email,
  children,
}: DashboardIdentity & { children: React.ReactNode }) {
  return (
    <DashboardIdentityContext.Provider value={{ userId, email }}>
      {children}
    </DashboardIdentityContext.Provider>
  );
}

export function useDashboardIdentityOptional(): DashboardIdentity | null {
  return useContext(DashboardIdentityContext);
}

export function useDashboardIdentity(): DashboardIdentity {
  const value = useContext(DashboardIdentityContext);
  if (!value) {
    // Next.js may prerender client pages that call useSearchParams outside the
    // shell provider tree, then hydrate into the real provider. Don't crash SSR.
    if (typeof window === "undefined") return SSR_PLACEHOLDER;
    throw new Error("useDashboardIdentity must be used within DashboardIdentityProvider");
  }
  return value;
}
