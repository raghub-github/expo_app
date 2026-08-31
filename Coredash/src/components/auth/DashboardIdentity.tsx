"use client";

import { createContext, useContext } from "react";

export type DashboardIdentity = {
  userId: string;
  email: string;
};

const DashboardIdentityContext = createContext<DashboardIdentity | null>(null);

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

export function useDashboardIdentity(): DashboardIdentity {
  const value = useContext(DashboardIdentityContext);
  if (!value) {
    throw new Error("useDashboardIdentity must be used within DashboardIdentityProvider");
  }
  return value;
}
