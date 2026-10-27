"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { LG_BREAKPOINT } from "@/lib/hooks/useMinWidth";

const STORAGE_KEY = "coredash.sidebar.collapsed";

type ShellChromeValue = {
  collapsed: boolean;
  setCollapsed: (next: boolean) => void;
  toggleCollapsed: () => void;
  /** Visual width of the fixed sidebar panel (drawer width on mobile when open). */
  sidebarWidth: number;
  /** Margin the main column should reserve (0 on mobile — sidebar is overlay). */
  contentOffset: number;
  mobileNavOpen: boolean;
  openMobileNav: () => void;
  closeMobileNav: () => void;
  toggleMobileNav: () => void;
  isDesktop: boolean;
};

const ShellChromeContext = createContext<ShellChromeValue | null>(null);

export function ShellChromeProvider({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsedState] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [isDesktop, setIsDesktop] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw === "1") setCollapsedState(true);
    } catch {
      /* ignore */
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    const mq = window.matchMedia(`(min-width: ${LG_BREAKPOINT}px)`);
    const sync = () => {
      const desktop = mq.matches;
      setIsDesktop(desktop);
      if (desktop) setMobileNavOpen(false);
    };
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    if (!mobileNavOpen || isDesktop) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMobileNavOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [mobileNavOpen, isDesktop]);

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

  const openMobileNav = useCallback(() => setMobileNavOpen(true), []);
  const closeMobileNav = useCallback(() => setMobileNavOpen(false), []);
  const toggleMobileNav = useCallback(() => setMobileNavOpen((v) => !v), []);

  const desktopCollapsed = hydrated ? collapsed : false;
  const sidebarWidth = !isDesktop ? 280 : desktopCollapsed ? 72 : 232;
  const contentOffset = isDesktop ? sidebarWidth : 0;

  const value = useMemo(
    () => ({
      collapsed: desktopCollapsed,
      setCollapsed,
      toggleCollapsed,
      sidebarWidth,
      contentOffset,
      mobileNavOpen,
      openMobileNav,
      closeMobileNav,
      toggleMobileNav,
      isDesktop,
    }),
    [
      desktopCollapsed,
      setCollapsed,
      toggleCollapsed,
      sidebarWidth,
      contentOffset,
      mobileNavOpen,
      openMobileNav,
      closeMobileNav,
      toggleMobileNav,
      isDesktop,
    ]
  );

  return <ShellChromeContext.Provider value={value}>{children}</ShellChromeContext.Provider>;
}

export function useShellChrome() {
  const ctx = useContext(ShellChromeContext);
  if (!ctx) throw new Error("useShellChrome must be used within ShellChromeProvider");
  return ctx;
}
