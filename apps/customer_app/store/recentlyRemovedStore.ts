/**
 * Recently Removed history for the food cart.
 * Persisted like the cart — survives navigation, remounts, and app restarts.
 * Cleared only on explicit cart clear / order success (via clearCart) / logout /
 * discard of that merchant's cart slot.
 */

import { create } from "zustand";
import { Image } from "expo-image";
import { getItem, setItem, removeItem } from "@/utils/storage";
import { STORAGE_KEYS } from "@/constants";
import { getActiveCustomerScopeId } from "@/lib/customerScope";
import { toAbsoluteImageUrl } from "@/utils/mediaUrl";
import type { CartItem } from "@/store/cartStore";
import {
  MAX_RECENTLY_REMOVED,
  buildRecentlyRemovedEntry,
  dropRecentlyRemovedByMerchant,
  dropRecentlyRemovedEntry,
  filterRecentlyRemovedByMerchant,
  pushRecentlyRemovedEntry,
  type RecentlyRemovedEntry,
} from "@/lib/recentlyRemoved";

function withAbsoluteImage(entry: RecentlyRemovedEntry): RecentlyRemovedEntry {
  const raw = String(entry.line.imageUrl ?? "").trim();
  if (!raw) return entry;
  const abs = toAbsoluteImageUrl(raw) ?? raw;
  if (abs === raw) return entry;
  return { ...entry, line: { ...entry.line, imageUrl: abs } };
}

function prefetchEntryImages(entries: RecentlyRemovedEntry[]): void {
  const uris: string[] = [];
  for (const e of entries) {
    const u = String(e.line.imageUrl ?? "").trim();
    if (u) uris.push(u);
  }
  if (uris.length === 0) return;
  void Image.prefetch(uris).catch(() => {});
}

type CaptureRemovalArgs = {
  merchantId: string;
  merchantName: string | null;
  merchantBannerUrl?: string | null;
  merchantStoreType?: string | null;
  item: CartItem;
  quantity: number;
};

type PersistedRecentlyRemoved = {
  entries: RecentlyRemovedEntry[];
  customerId?: string | null;
};

type RecentlyRemovedState = {
  entries: RecentlyRemovedEntry[];
  /** Entry keys currently mid-restore — blocks duplicate taps. */
  restoringKeys: Record<string, true>;
  hydrated: boolean;
  captureRemoval: (args: CaptureRemovalArgs) => void;
  dismissEntry: (entryKey: string) => void;
  clearForMerchant: (merchantId: string) => void;
  clearAll: () => void;
  getForMerchant: (merchantId: string | null | undefined) => RecentlyRemovedEntry[];
  beginRestore: (entryKey: string) => boolean;
  endRestore: (entryKey: string) => void;
  removeAfterSuccessfulRestore: (entryKey: string) => void;
  hydrate: () => Promise<void>;
  persist: () => Promise<void>;
};

let persistTimer: ReturnType<typeof setTimeout> | null = null;
const PERSIST_DEBOUNCE_MS = 180;

function sanitizeEntries(raw: unknown): RecentlyRemovedEntry[] {
  if (!Array.isArray(raw)) return [];
  const out: RecentlyRemovedEntry[] = [];
  for (const row of raw) {
    if (!row || typeof row !== "object") continue;
    const e = row as Partial<RecentlyRemovedEntry>;
    const merchantId = String(e.merchantId ?? "").trim();
    const entryKey = String(e.entryKey ?? "").trim();
    const line = e.line;
    if (!merchantId || !entryKey || !line || typeof line !== "object") continue;
    const menuItemId = String((line as RecentlyRemovedEntry["line"]).menuItemId ?? "").trim();
    const name = String((line as RecentlyRemovedEntry["line"]).name ?? "").trim();
    if (!menuItemId || !name) continue;
    out.push({
      entryKey,
      merchantId,
      merchantName: String(e.merchantName ?? "").trim() || "Restaurant",
      merchantBannerUrl: (e.merchantBannerUrl as string | null | undefined) ?? null,
      merchantStoreType: (e.merchantStoreType as string | null | undefined) ?? null,
      removedAt: Number(e.removedAt) || Date.now(),
      quantity: Math.max(1, Math.round(Number(e.quantity) || 1)),
      line: (() => {
        const snap = line as RecentlyRemovedEntry["line"];
        const rawImg = typeof snap.imageUrl === "string" ? snap.imageUrl.trim() : "";
        return {
          ...snap,
          menuItemId,
          name,
          price: Number(snap.price) || 0,
          isVeg: !!snap.isVeg,
          imageUrl: rawImg || null,
        };
      })(),
    });
  }
  // Bound total memory across merchants (2 unique configs per merchant max already
  // applied on capture; hard cap list length as a safety net).
  return out.slice(0, Math.max(2, MAX_RECENTLY_REMOVED * 8));
}

async function writeToStorage(entries: RecentlyRemovedEntry[]): Promise<void> {
  if (entries.length === 0) {
    await removeItem(STORAGE_KEYS.RECENTLY_REMOVED);
    return;
  }
  // Stamp when signed in so hydrate can refuse cross-account restore. Guest
  // sessions still persist (same as food cart) until login/logout teardown.
  const payload: PersistedRecentlyRemoved = {
    entries,
    customerId: getActiveCustomerScopeId(),
  };
  await setItem(STORAGE_KEYS.RECENTLY_REMOVED, JSON.stringify(payload));
}

function queuePersist(get: () => RecentlyRemovedState): void {
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    persistTimer = null;
    void writeToStorage(get().entries);
  }, PERSIST_DEBOUNCE_MS);
}

function flushPersistNow(get: () => RecentlyRemovedState): Promise<void> {
  if (persistTimer) {
    clearTimeout(persistTimer);
    persistTimer = null;
  }
  return writeToStorage(get().entries);
}

export const useRecentlyRemovedStore = create<RecentlyRemovedState>((set, get) => ({
  entries: [],
  restoringKeys: {},
  hydrated: false,

  captureRemoval: (args) => {
    const built = buildRecentlyRemovedEntry(args);
    if (!built) return;
    const entry = withAbsoluteImage(built);
    set((s) => {
      const entries = pushRecentlyRemovedEntry(s.entries, entry, MAX_RECENTLY_REMOVED);
      prefetchEntryImages([entry]);
      return { entries };
    });
    queuePersist(get);
  },

  dismissEntry: (entryKey) => {
    set((s) => ({
      entries: dropRecentlyRemovedEntry(s.entries, entryKey),
      restoringKeys: (() => {
        const next = { ...s.restoringKeys };
        delete next[entryKey];
        return next;
      })(),
    }));
    queuePersist(get);
  },

  clearForMerchant: (merchantId) => {
    set((s) => ({
      entries: dropRecentlyRemovedByMerchant(s.entries, merchantId),
      restoringKeys: {},
    }));
    void flushPersistNow(get);
  },

  clearAll: () => {
    set({ entries: [], restoringKeys: {} });
    void flushPersistNow(get);
  },

  getForMerchant: (merchantId) => filterRecentlyRemovedByMerchant(get().entries, merchantId),

  beginRestore: (entryKey) => {
    const key = String(entryKey ?? "").trim();
    if (!key) return false;
    if (get().restoringKeys[key]) return false;
    set((s) => ({ restoringKeys: { ...s.restoringKeys, [key]: true } }));
    return true;
  },

  endRestore: (entryKey) => {
    const key = String(entryKey ?? "").trim();
    if (!key) return;
    set((s) => {
      if (!s.restoringKeys[key]) return s;
      const next = { ...s.restoringKeys };
      delete next[key];
      return { restoringKeys: next };
    });
  },

  removeAfterSuccessfulRestore: (entryKey) => {
    set((s) => {
      const nextKeys = { ...s.restoringKeys };
      delete nextKeys[entryKey];
      return {
        entries: dropRecentlyRemovedEntry(s.entries, entryKey),
        restoringKeys: nextKeys,
      };
    });
    queuePersist(get);
  },

  hydrate: async () => {
    if (get().hydrated) return;
    try {
      const raw = await getItem(STORAGE_KEYS.RECENTLY_REMOVED);
      if (!raw) {
        set({ hydrated: true });
        return;
      }
      const parsed = JSON.parse(raw) as PersistedRecentlyRemoved;
      const stamped = String(parsed?.customerId ?? "").trim() || null;
      const active = getActiveCustomerScopeId();
      // Only refuse when we know both sides and they disagree. Avoid wiping on
      // a cold-start race before auth/scope finishes binding.
      if (stamped && active && stamped !== active) {
        await removeItem(STORAGE_KEYS.RECENTLY_REMOVED);
        set({ entries: [], hydrated: true });
        return;
      }
      const entries = sanitizeEntries(parsed.entries).map(withAbsoluteImage);
      prefetchEntryImages(entries);
      set({
        entries,
        hydrated: true,
      });
    } catch {
      set({ hydrated: true });
    }
  },

  persist: async () => {
    await flushPersistNow(get);
  },
}));
