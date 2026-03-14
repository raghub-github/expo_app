import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";

type ActiveTabContextValue = {
  activeTab: string;
  setActiveTab: (name: string) => void;
};

const ActiveTabContext = createContext<ActiveTabContextValue | null>(null);

export function ActiveTabProvider({ children }: { children: ReactNode }) {
  const [activeTab, setActiveTabState] = useState<string>("index");

  const setActiveTab = useCallback((name: string) => {
    setActiveTabState(name);
  }, []);

  const value = useMemo(
    () => ({ activeTab, setActiveTab }),
    [activeTab, setActiveTab]
  );

  return <ActiveTabContext.Provider value={value}>{children}</ActiveTabContext.Provider>;
}

export function useActiveTab(): ActiveTabContextValue {
  const ctx = useContext(ActiveTabContext);
  if (!ctx) {
    throw new Error("useActiveTab must be used within ActiveTabProvider");
  }
  return ctx;
}
