"use client";

import { createContext, useContext, useMemo, useState, type ReactNode } from "react";

type MenuPageChromeContextValue = {
  itemsToolbar: ReactNode | null;
  setItemsToolbar: (node: ReactNode | null) => void;
};

const MenuPageChromeContext = createContext<MenuPageChromeContextValue | null>(null);

export function MenuPageChromeProvider({ children }: { children: ReactNode }) {
  const [itemsToolbar, setItemsToolbar] = useState<ReactNode | null>(null);
  const value = useMemo(
    () => ({ itemsToolbar, setItemsToolbar }),
    [itemsToolbar]
  );
  return <MenuPageChromeContext.Provider value={value}>{children}</MenuPageChromeContext.Provider>;
}

export function useMenuPageChrome() {
  const ctx = useContext(MenuPageChromeContext);
  if (!ctx) {
    throw new Error("useMenuPageChrome must be used within MenuPageChromeProvider");
  }
  return ctx;
}
