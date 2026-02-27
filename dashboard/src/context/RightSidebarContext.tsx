"use client";

import { createContext, useContext } from "react";

interface RightSidebarContextValue {
  isOpen: boolean;
  onToggle: () => void;
  /** Set open state directly (e.g. close when left sidebar opens on mobile) */
  setOpen?: (open: boolean) => void;
}

const RightSidebarContext = createContext<RightSidebarContextValue | null>(null);

export function RightSidebarProvider({
  children,
  value,
}: {
  children: React.ReactNode;
  value: RightSidebarContextValue;
}) {
  return (
    <RightSidebarContext.Provider value={value}>
      {children}
    </RightSidebarContext.Provider>
  );
}

export function useRightSidebar() {
  const ctx = useContext(RightSidebarContext);
  return ctx;
}
