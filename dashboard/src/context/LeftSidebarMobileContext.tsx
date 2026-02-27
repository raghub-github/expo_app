"use client";

import { createContext, useContext, useState, useCallback } from "react";

interface LeftSidebarMobileContextValue {
  isMobileMenuOpen: boolean;
  setMobileMenuOpen: (open: boolean) => void;
  toggleMobileMenu: () => void;
}

const LeftSidebarMobileContext = createContext<LeftSidebarMobileContextValue | null>(null);

export function LeftSidebarMobileProvider({ children }: { children: React.ReactNode }) {
  const [isMobileMenuOpen, setMobileMenuOpen] = useState(false);
  const toggleMobileMenu = useCallback(() => setMobileMenuOpen((v) => !v), []);
  return (
    <LeftSidebarMobileContext.Provider
      value={{ isMobileMenuOpen, setMobileMenuOpen, toggleMobileMenu }}
    >
      {children}
    </LeftSidebarMobileContext.Provider>
  );
}

export function useLeftSidebarMobile() {
  return useContext(LeftSidebarMobileContext);
}
