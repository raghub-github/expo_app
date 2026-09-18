"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

const STORAGE_KEY = "coredash.sidebar.collapsed";

type ShellChromeValue = {
  collapsed: boolean;
  setCollapsed: (next: boolean) => void;
  toggleCollapsed: () => void;
  sidebarWidth: number;
};

const ShellChromeContext = createContext<ShellChromeValue | null>(null);

export function ShellChromeProvider({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsedState] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw === "1") setCollapsedState(true);
    } catch {
      /* ignore */
    }
    setHydrated(true);
  }, []);

  const setCollapsed = useCallback((next: boolean) => {
    setCollapsedState(next);
    try {
      localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
    } catch {
      /* ignore */
    }
  }, []);

  const toggleCollapsed = useCallback(() => {
    setCollapsed(!collapsed);
  }, [collapsed, setCollapsed]);

  const value = useMemo(
    () => ({
      collapsed: hydrated ? collapsed : false,
      setCollapsed,
      toggleCollapsed,
      sidebarWidth: hydrated && collapsed ? 72 : 232,
    }),
    [collapsed, hydrated, setCollapsed, toggleCollapsed]
  );

  return <ShellChromeContext.Provider value={value}>{children}</ShellChromeContext.Provider>;
}

export function useShellChrome() {
  const ctx = useContext(ShellChromeContext);
  if (!ctx) throw new Error("useShellChrome must be used within ShellChromeProvider");
  return ctx;
}
