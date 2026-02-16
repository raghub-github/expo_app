"use client";

import { createContext, useContext, useState, useCallback } from "react";

interface TicketFilterSidebarContextValue {
  isFilterSidebarOpen: boolean;
  openFilterSidebar: () => void;
  closeFilterSidebar: () => void;
  toggleFilterSidebar: () => void;
}

const TicketFilterSidebarContext = createContext<TicketFilterSidebarContextValue | null>(null);

export function TicketFilterSidebarProvider({ children }: { children: React.ReactNode }) {
  const [isFilterSidebarOpen, setIsFilterSidebarOpen] = useState(false);
  const openFilterSidebar = useCallback(() => setIsFilterSidebarOpen(true), []);
  const closeFilterSidebar = useCallback(() => setIsFilterSidebarOpen(false), []);
  const toggleFilterSidebar = useCallback(() => setIsFilterSidebarOpen((v) => !v), []);

  return (
    <TicketFilterSidebarContext.Provider
      value={{
        isFilterSidebarOpen,
        openFilterSidebar,
        closeFilterSidebar,
        toggleFilterSidebar,
      }}
    >
      {children}
    </TicketFilterSidebarContext.Provider>
  );
}

export function useTicketFilterSidebar() {
  return useContext(TicketFilterSidebarContext);
}
