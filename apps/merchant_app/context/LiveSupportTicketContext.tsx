import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { AppState, type AppStateStatus } from "react-native";
import { isAppForeground } from "@/lib/appForeground";
import { useAuth } from "@/context/AuthContext";
import { useSelectedStore } from "@/context/SelectedStoreContext";
import { getTicketMessages, type TicketMessage } from "@/services/ticketApi";
import { normalizeTicketMessages, setCachedTicketChat } from "@/lib/ticketChatCache";
import {
  clearStoredLiveSupportTicket,
  isLiveSupportTicketTerminal,
  loadStoredLiveSupportTicket,
  saveStoredLiveSupportTicket,
  type StoredLiveSupportTicket,
} from "@/lib/liveSupportTicketStorage";

export type ActiveLiveSupportTicket = StoredLiveSupportTicket;

type LiveSupportTicketContextValue = {
  activeTicket: ActiveLiveSupportTicket | null;
  unreadCount: number;
  /** True after user drag-dismisses the live-support FAB (survives page switches). */
  fabDismissed: boolean;
  dismissLiveSupportFab: () => void;
  /** Show FAB again — call when merchant opens a ticket from My Tickets (or registers live support). */
  revealLiveSupportFab: () => void;
  registerLiveSupportTicket: (ticket: ActiveLiveSupportTicket) => void;
  syncLiveSupportTicketStatus: (ticketId: number, status: string) => void;
  markLiveSupportAsRead: (readAt?: string, messages?: TicketMessage[]) => void;
  setLiveSupportChatOpen: (ticketId: number | null) => void;
  clearLiveSupportTicket: () => void;
  refreshActiveTicket: () => Promise<void>;
};

const LiveSupportTicketContext = createContext<LiveSupportTicketContextValue | null>(null);

function countUnreadAgentMessages(messages: TicketMessage[], lastReadAt: string | null | undefined): number {
  const cutoffMs = lastReadAt ? new Date(lastReadAt).getTime() : 0;
  if (!Number.isFinite(cutoffMs)) return 0;
  return messages.filter((m) => {
    const sender = String(m.sender_type ?? "").toUpperCase();
    if (sender === "MERCHANT") return false;
    const ts = new Date(m.created_at).getTime();
    return Number.isFinite(ts) && ts > cutoffMs;
  }).length;
}

function latestMessageTimestamp(messages: TicketMessage[]): string {
  let maxMs = 0;
  for (const m of messages) {
    const ts = new Date(m.created_at).getTime();
    if (Number.isFinite(ts) && ts > maxMs) maxMs = ts;
  }
  return maxMs > 0 ? new Date(maxMs).toISOString() : new Date().toISOString();
}

export function LiveSupportTicketProvider({ children }: { children: ReactNode }) {
  const { token } = useAuth();
  const { selectedStore } = useSelectedStore();
  const storeId = selectedStore?.id ?? null;

  const [activeTicket, setActiveTicket] = useState<ActiveLiveSupportTicket | null>(null);
  const [unreadCount, setUnreadCount] = useState(0);
  /** Session-scoped: hide floating headset until merchant opens a ticket from My Tickets. */
  const [fabDismissed, setFabDismissed] = useState(false);
  const refreshInFlight = useRef(false);
  const chatOpenTicketIdRef = useRef<number | null>(null);

  const dismissLiveSupportFab = useCallback(() => {
    setFabDismissed(true);
  }, []);

  const revealLiveSupportFab = useCallback(() => {
    setFabDismissed(false);
  }, []);

  const persist = useCallback(
    async (ticket: ActiveLiveSupportTicket | null) => {
      if (storeId == null) return;
      if (ticket == null) {
        await clearStoredLiveSupportTicket(storeId);
        return;
      }
      await saveStoredLiveSupportTicket(storeId, ticket);
    },
    [storeId]
  );

  const clearLiveSupportTicket = useCallback(() => {
    setActiveTicket(null);
    setUnreadCount(0);
    if (storeId != null) void clearStoredLiveSupportTicket(storeId);
  }, [storeId]);

  const registerLiveSupportTicket = useCallback(
    (ticket: ActiveLiveSupportTicket) => {
      if (isLiveSupportTicketTerminal(ticket.status)) {
        clearLiveSupportTicket();
        return;
      }
      // Opening / attaching a live ticket (e.g. from chat) should show the FAB again.
      setFabDismissed(false);
      setActiveTicket((prev) => {
        const next = {
          ...ticket,
          lastReadAt: ticket.lastReadAt ?? prev?.lastReadAt ?? new Date().toISOString(),
        };
        void persist(next);
        return next;
      });
    },
    [clearLiveSupportTicket, persist]
  );

  const syncLiveSupportTicketStatus = useCallback(
    (ticketId: number, status: string) => {
      setActiveTicket((prev) => {
        if (prev == null || prev.ticketId !== ticketId) return prev;
        if (isLiveSupportTicketTerminal(status)) {
          if (storeId != null) void clearStoredLiveSupportTicket(storeId);
          setUnreadCount(0);
          return null;
        }
        const next = { ...prev, status };
        if (storeId != null) void saveStoredLiveSupportTicket(storeId, next);
        return next;
      });
    },
    [storeId]
  );

  const markLiveSupportAsRead = useCallback(
    (readAt?: string, messages?: TicketMessage[]) => {
      const ts =
        readAt ??
        (messages && messages.length > 0
          ? latestMessageTimestamp(messages)
          : new Date().toISOString());
      setUnreadCount(0);
      setActiveTicket((prev) => {
        if (prev == null) return prev;
        const next = { ...prev, lastReadAt: ts };
        if (storeId != null) void saveStoredLiveSupportTicket(storeId, next);
        return next;
      });
    },
    [storeId]
  );

  const setLiveSupportChatOpen = useCallback((ticketId: number | null) => {
    chatOpenTicketIdRef.current = ticketId;
  }, []);

  const refreshActiveTicket = useCallback(async () => {
    if (refreshInFlight.current || storeId == null || !token || activeTicket == null) return;
    refreshInFlight.current = true;
    try {
      const ticketId = activeTicket.ticketId;
      const data = await getTicketMessages(storeId, ticketId, token);
      if (isLiveSupportTicketTerminal(data.ticket.status)) {
        syncLiveSupportTicketStatus(data.ticket.id, data.ticket.status);
        setUnreadCount(0);
        return;
      }
      const normalizedMessages = normalizeTicketMessages(data.ticket, data.messages, ticketId);
      setCachedTicketChat(storeId, ticketId, data.ticket, normalizedMessages);
      const unread = countUnreadAgentMessages(normalizedMessages, activeTicket.lastReadAt);
      setUnreadCount(unread);
      setActiveTicket((prev) => {
        if (prev == null || prev.ticketId !== ticketId) return prev;
        return {
          ...prev,
          status: data.ticket.status,
          ticketDisplayId: data.ticket.ticket_id || prev.ticketDisplayId,
          subject: data.ticket.subject ?? data.ticket.ticket_title ?? prev.subject,
        };
      });
    } catch {
      // Keep showing last known ticket; merchant can still open chat.
    } finally {
      refreshInFlight.current = false;
    }
  }, [activeTicket, storeId, syncLiveSupportTicketStatus, token]);

  // Restore persisted ticket when store changes.
  useEffect(() => {
    let cancelled = false;
    setActiveTicket(null);
    setUnreadCount(0);
    setFabDismissed(false);
    if (storeId == null) return;
    void (async () => {
      const stored = await loadStoredLiveSupportTicket(storeId);
      if (cancelled || stored == null) return;
      if (isLiveSupportTicketTerminal(stored.status)) {
        await clearStoredLiveSupportTicket(storeId);
        return;
      }
      setActiveTicket(stored);
      if (!token) return;
      try {
        const data = await getTicketMessages(storeId, stored.ticketId, token);
        if (cancelled) return;
        if (isLiveSupportTicketTerminal(data.ticket.status)) {
          await clearStoredLiveSupportTicket(storeId);
          setActiveTicket(null);
          return;
        }
        const normalizedMessages = normalizeTicketMessages(
          data.ticket,
          data.messages,
          stored.ticketId
        );
        setCachedTicketChat(storeId, stored.ticketId, data.ticket, normalizedMessages);
        const verified: ActiveLiveSupportTicket = {
          ...stored,
          status: data.ticket.status,
          ticketDisplayId: data.ticket.ticket_id || stored.ticketDisplayId,
          subject:
            data.ticket.subject ??
            data.ticket.ticket_title ??
            stored.subject,
        };
        setActiveTicket(verified);
        setUnreadCount(countUnreadAgentMessages(normalizedMessages, verified.lastReadAt));
        await saveStoredLiveSupportTicket(storeId, verified);
      } catch {
        // Offline — keep stored snapshot.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [storeId, token]);

  // Poll status + unread while an active live ticket exists.
  useEffect(() => {
    if (activeTicket == null || storeId == null || !token) return;
    void refreshActiveTicket();
    const id = setInterval(() => {
      if (!isAppForeground()) return;
      if (
        chatOpenTicketIdRef.current != null &&
        chatOpenTicketIdRef.current === activeTicket.ticketId
      ) {
        return;
      }
      void refreshActiveTicket();
    }, 15_000);
    return () => clearInterval(id);
  }, [activeTicket?.ticketId, refreshActiveTicket, storeId, token]);

  useEffect(() => {
    const onChange = (state: AppStateStatus) => {
      if (state === "active") void refreshActiveTicket();
    };
    const sub = AppState.addEventListener("change", onChange);
    return () => sub.remove();
  }, [refreshActiveTicket]);

  const value = useMemo(
    () => ({
      activeTicket,
      unreadCount,
      fabDismissed,
      dismissLiveSupportFab,
      revealLiveSupportFab,
      registerLiveSupportTicket,
      syncLiveSupportTicketStatus,
      markLiveSupportAsRead,
      setLiveSupportChatOpen,
      clearLiveSupportTicket,
      refreshActiveTicket,
    }),
    [
      activeTicket,
      unreadCount,
      fabDismissed,
      dismissLiveSupportFab,
      revealLiveSupportFab,
      registerLiveSupportTicket,
      syncLiveSupportTicketStatus,
      markLiveSupportAsRead,
      setLiveSupportChatOpen,
      clearLiveSupportTicket,
      refreshActiveTicket,
    ]
  );

  return (
    <LiveSupportTicketContext.Provider value={value}>
      {children}
    </LiveSupportTicketContext.Provider>
  );
}

export function useLiveSupportTicket(): LiveSupportTicketContextValue {
  const ctx = useContext(LiveSupportTicketContext);
  if (!ctx) {
    throw new Error("useLiveSupportTicket must be used within LiveSupportTicketProvider");
  }
  return ctx;
}
