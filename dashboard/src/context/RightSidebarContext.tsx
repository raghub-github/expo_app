"use client";

import { createContext, useContext } from "react";

interface RightSidebarContextValue {
  isOpen: boolean;
  onToggle: () => void;
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
