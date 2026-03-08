import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import type { ChildStore } from "@/context/AuthContext";

type SelectedStoreContextValue = {
  selectedStore: ChildStore | null;
  setSelectedStore: (store: ChildStore | null) => void;
};

const SelectedStoreContext = createContext<SelectedStoreContextValue | null>(null);

export function SelectedStoreProvider({ children }: { children: ReactNode }) {
  const [selectedStore, setSelectedStoreState] = useState<ChildStore | null>(null);

  const setSelectedStore = useCallback((store: ChildStore | null) => {
    setSelectedStoreState(store);
  }, []);

  const value = useMemo(
    () => ({
      selectedStore,
      setSelectedStore,
    }),
    [selectedStore, setSelectedStore],
  );

  return (
    <SelectedStoreContext.Provider value={value}>
      {children}
    </SelectedStoreContext.Provider>
  );
}

export function useSelectedStore(): SelectedStoreContextValue {
  const ctx = useContext(SelectedStoreContext);
  if (!ctx) {
    throw new Error("useSelectedStore must be used within SelectedStoreProvider");
  }
  return ctx;
}

