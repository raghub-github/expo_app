import { createContext, useContext, useState, useCallback, type ReactNode } from "react";

type StoreStatusContextValue = {
  isOnline: boolean;
  toggle: () => void;
};

const StoreStatusContext = createContext<StoreStatusContextValue | null>(null);

export function StoreStatusProvider({ children }: { children: ReactNode }) {
  const [isOnline, setIsOnline] = useState(true);
  const toggle = useCallback(() => setIsOnline((v) => !v), []);
  return (
    <StoreStatusContext.Provider value={{ isOnline, toggle }}>
      {children}
    </StoreStatusContext.Provider>
  );
}

export function useStoreStatus() {
  const ctx = useContext(StoreStatusContext);
  if (!ctx) throw new Error("useStoreStatus must be used within StoreStatusProvider");
  return ctx;
}
