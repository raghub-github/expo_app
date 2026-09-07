import { useCallback, useEffect, useMemo, useState } from "react";
import { getItem, setItem } from "@/utils/storage";
import { STORAGE_KEYS } from "@/constants";
import { useAuthStore } from "@/store/authStore";
import { getHiddenStoreIds, setHiddenStoreRemote } from "@/services/hiddenStores.service";

const KEY = STORAGE_KEYS.HIDDEN_STORES;

function parseIds(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.map((id) => String(id).trim()).filter(Boolean);
  } catch {
    return [];
  }
}

function normalizeId(storeId: string | number | null | undefined): string {
  return storeId == null ? "" : String(storeId).trim();
}

let memory = new Set<string>();
let hydrated = false;
const listeners = new Set<() => void>();

function emit(): void {
  for (const fn of listeners) fn();
}

async function hydrate(): Promise<Set<string>> {
  if (hydrated) return memory;
  memory = new Set(parseIds(await getItem(KEY)));
  hydrated = true;
  emit();
  return memory;
}

async function persist(next: Set<string>): Promise<void> {
  memory = next;
  emit();
  await setItem(KEY, JSON.stringify([...next]));
}

function addLocal(id: string): Set<string> {
  const next = new Set(memory);
  next.add(id);
  return next;
}

function removeLocal(id: string): Set<string> {
  const next = new Set(memory);
  next.delete(id);
  return next;
}

export async function resetHiddenStoresMemory(): Promise<void> {
  memory = new Set();
  hydrated = false;
  emit();
  await setItem(KEY, JSON.stringify([]));
}

export function useHiddenStores(): {
  hiddenIds: Set<string>;
  isHidden: (storeId: string) => boolean;
  hideStore: (storeId: string) => Promise<void>;
  unhideStore: (storeId: string) => Promise<void>;
} {
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(() => new Set(memory));
  const accessToken = useAuthStore((s) => s.session?.accessToken);

  useEffect(() => {
    void hydrate();
    const onChange = () => setHiddenIds(new Set(memory));
    listeners.add(onChange);
    return () => {
      listeners.delete(onChange);
    };
  }, []);

  useEffect(() => {
    if (!accessToken) return;
    let cancelled = false;
    void (async () => {
      try {
        await hydrate();
        const remote = await getHiddenStoreIds();
        if (cancelled) return;
        const remoteSet = new Set(remote.map((id) => normalizeId(id)).filter(Boolean));
        const localOnly = [...memory].filter((id) => id && !remoteSet.has(id));
        for (const id of localOnly) {
          try {
            await setHiddenStoreRemote(id, true);
          } catch {
            /* keep local until a later sync */
          }
        }
        const merged = new Set([...memory, ...remoteSet]);
        await persist(merged);
      } catch {
        /* local list still applies */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [accessToken]);

  const isHidden = useCallback((storeId: string) => {
    const id = normalizeId(storeId);
    if (!id) return false;
    return memory.has(id) || hiddenIds.has(id);
  }, [hiddenIds]);

  const hideStore = useCallback(async (storeId: string) => {
    const id = normalizeId(storeId);
    if (!id) return;
    await hydrate();
    await persist(addLocal(id));
    try {
      await setHiddenStoreRemote(id, true);
    } catch {
      /* local hide still applies until next sync */
    }
  }, []);

  const unhideStore = useCallback(async (storeId: string) => {
    const id = normalizeId(storeId);
    if (!id) return;
    await hydrate();
    await persist(removeLocal(id));
    try {
      await setHiddenStoreRemote(id, false);
    } catch {
      /* local unhide still applies */
    }
  }, []);

  return useMemo(
    () => ({ hiddenIds, isHidden, hideStore, unhideStore }),
    [hiddenIds, isHidden, hideStore, unhideStore]
  );
}

export function filterHiddenStores<
  T extends { id?: string | number | null; publicSlug?: string | null },
>(list: T[], hiddenIds: Set<string>): T[] {
  if (hiddenIds.size === 0) return list;
  return list.filter((item) => {
    const id = normalizeId(item?.id);
    const slug = normalizeId(item?.publicSlug);
    if (id && hiddenIds.has(id)) return false;
    if (slug && hiddenIds.has(slug)) return false;
    return true;
  });
}
