"use client";

import { createContext, useContext } from "react";

export type TicketRightSidebarPanel = "properties" | "settings";

/** Ticket settings rail: which main-column view to show (automation form vs activity reports). */
export type TicketSettingsSection = "automation" | "activity";

interface RightSidebarContextValue {
  isOpen: boolean;
  onToggle: () => void;
  /** Set open state directly (e.g. close when left sidebar opens on mobile) */
  setOpen?: (open: boolean) => void;
  /** Ticket detail view only: properties editor vs gear (settings) panel */
  ticketRightSidebarPanel?: TicketRightSidebarPanel;
  setTicketRightSidebarPanel?: (panel: TicketRightSidebarPanel) => void;
  /** When ticketRightSidebarPanel is "settings", drives main-area content */
  ticketSettingsSection?: TicketSettingsSection;
  setTicketSettingsSection?: (section: TicketSettingsSection) => void;
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
