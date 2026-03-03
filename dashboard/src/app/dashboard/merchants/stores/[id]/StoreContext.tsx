"use client";

import { createContext, useContext, type ReactNode } from "react";

export type StoreContextStore = {
  id: number;
  store_id?: string;
  name?: string;
  store_name?: string;
  store_display_name?: string;
  city?: string | null;
  full_address?: string | null;
  approval_status?: string;
  onboarding_completed?: boolean;
  store_email?: string | null;
  [key: string]: unknown;
} | null;

type StoreContextValue = {
  storeId: string;
  store: StoreContextStore;
};

const StoreContext = createContext<StoreContextValue>({ storeId: "", store: null });

export function StoreProvider({
  storeId,
  store,
  children,
}: {
  storeId: string;
  store: StoreContextStore;
  children: ReactNode;
}) {
  return (
    <StoreContext.Provider value={{ storeId, store }}>
      {children}
    </StoreContext.Provider>
  );
}

export function useStoreContext(): StoreContextValue {
  return useContext(StoreContext);
}
