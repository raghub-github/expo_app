import { create } from "zustand";
import {
  loadInbox,
  type NotificationApiConfig,
} from "@gatimitra/expo-push-kit";
import { getRiderAppConfig } from "@/src/config/env";
import { useSessionStore } from "@/src/stores/sessionStore";
import { readRiderDismissedNotificationIds } from "@/src/lib/riderDismissedNotifications";
import {
  filterRiderInboxPageItems,
  isRiderInboxUnread,
} from "@/src/lib/riderInboxFilter";

type RiderInboxUnreadState = {
  unread: number;
  hydrated: boolean;
  refreshing: boolean;
  setUnread: (n: number) => void;
  refresh: () => Promise<void>;
};

function apiConfig(): NotificationApiConfig {
  return {
    baseUrl: getRiderAppConfig().apiBaseUrl,
    getAuthHeader: async () => {
      const token = useSessionStore.getState().session?.accessToken;
      return token ? `Bearer ${token}` : null;
    },
  };
}

/**
 * Bell badge source of truth: filtered API inbox unread (not local push dump).
 */
export const useRiderInboxUnreadStore = create<RiderInboxUnreadState>((set) => ({
  unread: 0,
  hydrated: false,
  refreshing: false,

  setUnread: (n) => set({ unread: Math.max(0, n) }),

  refresh: async () => {
    const token = useSessionStore.getState().session?.accessToken;
    if (!token) {
      set({ unread: 0, hydrated: true, refreshing: false });
      return;
    }
    set({ refreshing: true });
    try {
      const [page, dismissed] = await Promise.all([
        loadInbox(apiConfig(), { limit: 100 }),
        readRiderDismissedNotificationIds(),
      ]);
      const visible = filterRiderInboxPageItems(page.items).filter(
        (i) => !dismissed.has(i.notification_id)
      );
      const unread = visible.filter(isRiderInboxUnread).length;
      set({ unread, hydrated: true, refreshing: false });
    } catch {
      set({ hydrated: true, refreshing: false });
    }
  },
}));

export function refreshRiderInboxUnread(): void {
  void useRiderInboxUnreadStore.getState().refresh();
}
