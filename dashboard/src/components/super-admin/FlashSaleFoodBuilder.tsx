"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, Store, X, Search } from "lucide-react";
import {
  computeFlashSaleOffPercent,
  computeFlashSaleSubsidy,
  validateFlashSalePrice,
} from "@/lib/billing/flashSale";
import { cn } from "@/lib/utils";

const controlCls =
  "w-full min-h-[34px] rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-[#00A88F] focus:outline-none focus:ring-2 focus:ring-[#00A88F]/20";

export type FlashSaleSelectedItem = {
  menuItemId: string;
  storeId: number;
  storeName: string;
  storePublicId?: string;
  name: string;
  originalCustomerPrice: number;
  flashPrice: string;
};

export type FlashSaleStoreRef = {
  id: number;
  name: string;
  publicId: string;
};

type StoreHit = { id: number; storeId: string; name: string; city: string | null };
type MenuHit = {
  id: number;
  itemId: string | null;
  name: string;
  originalCustomerPrice: number;
  inStock: boolean;
};

type Props = {
  stores: FlashSaleStoreRef[];
  items: FlashSaleSelectedItem[];
  onStoresChange: (stores: FlashSaleStoreRef[]) => void;
  onItemsChange: (items: FlashSaleSelectedItem[]) => void;
};

function parseFlashInput(raw: string): number | null {
  const t = raw.trim();
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

function itemKey(storeId: number, menuItemId: string): string {
  return `${storeId}:${menuItemId}`;
}

export function FlashSaleFoodBuilder({ stores, items, onStoresChange, onItemsChange }: Props) {
  const [storeQuery, setStoreQuery] = useState("");
  const [storeHits, setStoreHits] = useState<StoreHit[]>([]);
  const [loadingStores, setLoadingStores] = useState(false);
  const [storeSearchError, setStoreSearchError] = useState<string | null>(null);
  const [storeSearchOpen, setStoreSearchOpen] = useState(false);
  const storeSearchBlurTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [activeStoreId, setActiveStoreId] = useState<number | null>(null);
  const [menuQuery, setMenuQuery] = useState("");
  const [menuSort, setMenuSort] = useState<"default" | "price_asc" | "price_desc" | "name_asc" | "random">(
    "default"
  );
  const [menu, setMenu] = useState<MenuHit[]>([]);
  const [loadingMenu, setLoadingMenu] = useState(false);
  const [menuError, setMenuError] = useState<string | null>(null);
  const [menuReloadToken, setMenuReloadToken] = useState(0);
  const [bulkPrice, setBulkPrice] = useState("");
  const [bulkError, setBulkError] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [draftIds, setDraftIds] = useState<Set<string>>(new Set());
  const [draftPrices, setDraftPrices] = useState<Record<string, string>>({});
  const [rowMsg, setRowMsg] = useState<Record<string, string>>({});
  const [randomSeed, setRandomSeed] = useState(0);
  const itemsRef = useRef(items);
  itemsRef.current = items;
  const menuCacheRef = useRef<Map<number, MenuHit[]>>(new Map());
  const onItemsChangeRef = useRef(onItemsChange);
  onItemsChangeRef.current = onItemsChange;

  const selectedIds = useMemo(() => new Set(stores.map((s) => s.id)), [stores]);
  const activeStore = stores.find((s) => s.id === activeStoreId) ?? null;

  useEffect(() => {
    if (activeStoreId != null && selectedIds.has(activeStoreId)) return;
    setActiveStoreId(stores[0]?.id ?? null);
  }, [stores, activeStoreId, selectedIds]);

  const enrichItemsFromMenu = (storeId: number, menuRows: MenuHit[]) => {
    const prev = itemsRef.current;
    if (prev.length === 0 || menuRows.length === 0) return;
    let changed = false;
    const next = prev.map((it) => {
      if (it.storeId !== storeId) return it;
      const hit = menuRows.find(
        (m) =>
          String(m.id) === String(it.menuItemId) ||
          (m.itemId != null && String(m.itemId) === String(it.menuItemId))
      );
      if (!hit) return it;
      if (
        it.name === hit.name &&
        it.originalCustomerPrice === hit.originalCustomerPrice &&
        it.originalCustomerPrice > 0
      ) {
        return it;
      }
      changed = true;
      return { ...it, name: hit.name, originalCustomerPrice: hit.originalCustomerPrice };
    });
    if (changed) onItemsChangeRef.current(next);
  };

  const fetchMenuForStore = async (storeId: number, opts?: { force?: boolean; signal?: AbortSignal }) => {
    if (!opts?.force) {
      const cached = menuCacheRef.current.get(storeId);
      if (cached) return cached;
    }
    const r = await fetch(`/api/super-admin/flash-sale/stores/${storeId}/items`, {
      credentials: "include",
      signal: opts?.signal,
    });
    const d = (await r.json().catch(() => ({}))) as { items?: MenuHit[]; error?: string };
    if (!r.ok) {
      throw new Error(typeof d.error === "string" ? d.error : "Menu failed to load.");
    }
    const rows = Array.isArray(d.items) ? d.items : [];
    menuCacheRef.current.set(storeId, rows);
    enrichItemsFromMenu(storeId, rows);
    return rows;
  };

  // Prefetch menus for selected outlets so ORIGINAL prices hydrate without opening the sheet.
  useEffect(() => {
    if (stores.length === 0) return;
    let cancelled = false;
    void (async () => {
      for (const s of stores) {
        if (cancelled) return;
        if (menuCacheRef.current.has(s.id)) {
          enrichItemsFromMenu(s.id, menuCacheRef.current.get(s.id)!);
          continue;
        }
        try {
          await fetchMenuForStore(s.id);
        } catch {
          // Prefetch failures are non-fatal; sheet Retry can reload.
        }
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stores.map((s) => s.id).join(",")]);

  useEffect(() => {
    if (!storeSearchOpen) return;
    const t = setTimeout(() => {
      setLoadingStores(true);
      setStoreSearchError(null);
      fetch(`/api/super-admin/flash-sale/stores?q=${encodeURIComponent(storeQuery)}`, {
        credentials: "include",
      })
        .then(async (r) => {
          const d = (await r.json().catch(() => ({}))) as { stores?: StoreHit[]; error?: string };
          if (!r.ok) {
            setStoreHits([]);
            setStoreSearchError(typeof d.error === "string" ? d.error : "Store search failed.");
            return;
          }
          setStoreHits(Array.isArray(d.stores) ? d.stores : []);
        })
        .catch(() => {
          setStoreHits([]);
          setStoreSearchError("Store search failed.");
        })
        .finally(() => setLoadingStores(false));
    }, 200);
    return () => clearTimeout(t);
  }, [storeQuery, storeSearchOpen]);

  useEffect(() => {
    return () => {
      if (storeSearchBlurTimer.current) clearTimeout(storeSearchBlurTimer.current);
    };
  }, []);

  // Sheet menu: prefer cache, then network (with Retry via menuReloadToken).
  useEffect(() => {
    if (activeStoreId == null || !sheetOpen) {
      if (activeStoreId == null) {
        setMenu([]);
        setMenuError(null);
        setLoadingMenu(false);
      }
      return;
    }
    const force = menuReloadToken > 0;
    const cached = menuCacheRef.current.get(activeStoreId);
    if (cached && !force) {
      setMenu(cached);
      setMenuError(null);
      setLoadingMenu(false);
      enrichItemsFromMenu(activeStoreId, cached);
      return;
    }
    const ac = new AbortController();
    let timedOut = false;
    const kill = window.setTimeout(() => {
      timedOut = true;
      ac.abort();
    }, 30000);
    setLoadingMenu(true);
    setMenuError(null);
    fetchMenuForStore(activeStoreId, { force, signal: ac.signal })
      .then((rows) => {
        if (ac.signal.aborted) return;
        setMenu(rows);
        setMenuError(null);
      })
      .catch((err: unknown) => {
        // Ignore aborts from effect cleanup / Strict Mode remount — only surface real timeouts.
        if (ac.signal.aborted && !timedOut) return;
        if (timedOut) {
          setMenuError("Menu is taking too long. Try again.");
        } else {
          setMenuError(err instanceof Error ? err.message : "Menu failed to load.");
        }
        setMenu([]);
      })
      .finally(() => {
        window.clearTimeout(kill);
        setLoadingMenu(false);
      });
    return () => {
      ac.abort();
      window.clearTimeout(kill);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeStoreId, sheetOpen, menuReloadToken]);

  useEffect(() => {
    setDraftPrices((prev) => {
      const next = { ...prev };
      for (const it of items) {
        const k = itemKey(it.storeId, it.menuItemId);
        if (next[k] == null) next[k] = it.flashPrice;
      }
      return next;
    });
  }, [items]);

  useEffect(() => {
    if (!sheetOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSheetOpen(false);
    };
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [sheetOpen]);

  const filteredMenu = useMemo(() => {
    const q = menuQuery.trim().toLowerCase();
    let rows = !q
      ? [...menu]
      : menu.filter(
          (m) =>
            m.name.toLowerCase().includes(q) ||
            String(m.id).includes(q) ||
            (m.itemId != null && String(m.itemId).toLowerCase().includes(q))
        );
    if (menuSort === "price_asc") {
      rows.sort((a, b) => a.originalCustomerPrice - b.originalCustomerPrice || a.name.localeCompare(b.name));
    } else if (menuSort === "price_desc") {
      rows.sort((a, b) => b.originalCustomerPrice - a.originalCustomerPrice || a.name.localeCompare(b.name));
    } else if (menuSort === "name_asc") {
      rows.sort((a, b) => a.name.localeCompare(b.name));
    } else if (menuSort === "random") {
      // Deterministic shuffle keyed by randomSeed so re-renders don't reshuffle.
      const seed = randomSeed || 1;
      rows.sort((a, b) => {
        const ha = ((a.id * 2654435761) ^ seed) >>> 0;
        const hb = ((b.id * 2654435761) ^ seed) >>> 0;
        return ha - hb;
      });
    }
    return rows;
  }, [menu, menuQuery, menuSort, randomSeed]);

  const allVisibleChecked =
    filteredMenu.length > 0 && filteredMenu.every((m) => draftIds.has(String(m.id)));

  const openSheetForStore = (storeId: number) => {
    setActiveStoreId(storeId);
    setMenuReloadToken(0);
    setDraftIds(
      new Set(
        itemsRef.current.filter((it) => it.storeId === storeId).map((it) => it.menuItemId)
      )
    );
    setMenuQuery("");
    setMenuSort("default");
    setRandomSeed(0);
    setSheetOpen(true);
  };

  const pickRandomVisible = () => {
    if (filteredMenu.length === 0) return;
    // Pick ~25% of visible (min 1, max 20) at random for quick Flash Sale shortlists.
    const n = Math.min(20, Math.max(1, Math.round(filteredMenu.length * 0.25)));
    const shuffled = [...filteredMenu].sort(() => Math.random() - 0.5);
    const pick = shuffled.slice(0, n);
    setDraftIds((prev) => {
      const next = new Set(prev);
      for (const m of pick) next.add(String(m.id));
      return next;
    });
    setMenuSort("random");
    setRandomSeed((s) => s + 1 || Date.now());
  };

  const addStore = (s: StoreHit) => {
    if (selectedIds.has(s.id)) {
      openSheetForStore(s.id);
      return;
    }
    const nextStores = [...stores, { id: s.id, name: s.name, publicId: s.storeId }];
    onStoresChange(nextStores);
    setStoreQuery("");
    setMenuQuery("");
    setDraftIds(new Set());
    setActiveStoreId(s.id);
    setMenuReloadToken(0);
    setSheetOpen(true);
    void fetchMenuForStore(s.id).catch(() => undefined);
  };

  const removeStore = (storeId: number) => {
    onStoresChange(stores.filter((s) => s.id !== storeId));
    onItemsChange(items.filter((it) => it.storeId !== storeId));
    menuCacheRef.current.delete(storeId);
    if (activeStoreId === storeId) setActiveStoreId(null);
    setSheetOpen(false);
  };

  const confirmDraftSelection = () => {
    if (activeStore == null) return;
    const kept = items.filter((it) => it.storeId !== activeStore.id);
    const added: FlashSaleSelectedItem[] = [];
    for (const m of menu) {
      const id = String(m.id);
      if (!draftIds.has(id)) continue;
      const existing = items.find(
        (it) => it.storeId === activeStore.id && it.menuItemId === id
      );
      const k = itemKey(activeStore.id, id);
      added.push(
        existing ?? {
          menuItemId: id,
          storeId: activeStore.id,
          storeName: activeStore.name,
          storePublicId: activeStore.publicId,
          name: m.name,
          originalCustomerPrice: m.originalCustomerPrice,
          flashPrice: draftPrices[k] ?? "",
        }
      );
    }
    onItemsChange([...kept, ...added]);
    setSheetOpen(false);
  };

  const saveRow = (storeId: number, menuItemId: string) => {
    const item = items.find((it) => it.storeId === storeId && it.menuItemId === menuItemId);
    if (!item) return;
    const k = itemKey(storeId, menuItemId);
    const raw = draftPrices[k] ?? item.flashPrice;
    const price = parseFlashInput(raw);
    if (price == null) {
      setRowMsg((m) => ({ ...m, [k]: "Enter a Flash Sale price." }));
      return;
    }
    const err = validateFlashSalePrice(price, item.originalCustomerPrice);
    if (err) {
      setRowMsg((m) => ({ ...m, [k]: err }));
      return;
    }
    onItemsChange(
      items.map((it) =>
        it.storeId === storeId && it.menuItemId === menuItemId
          ? { ...it, flashPrice: String(price) }
          : it
      )
    );
    setDraftPrices((p) => ({ ...p, [k]: String(price) }));
    setRowMsg((m) => ({ ...m, [k]: "saved" }));
  };

  const applyBulkPrice = () => {
    const price = parseFlashInput(bulkPrice);
    if (price == null) {
      setBulkError("Enter a Flash Sale price first.");
      return;
    }
    if (items.length === 0) {
      setBulkError("Select items first.");
      return;
    }
    const lowestOrig = Math.min(...items.map((it) => it.originalCustomerPrice));
    const err = validateFlashSalePrice(price, lowestOrig);
    if (err) {
      setBulkError(err);
      return;
    }
    const value = String(price);
    setBulkError(null);
    const nextDraft = { ...draftPrices };
    for (const it of items) nextDraft[itemKey(it.storeId, it.menuItemId)] = value;
    setDraftPrices(nextDraft);
    onItemsChange(items.map((it) => ({ ...it, flashPrice: value })));
    setRowMsg(
      Object.fromEntries(items.map((it) => [itemKey(it.storeId, it.menuItemId), "saved"]))
    );
  };

  const itemsByStore = useMemo(() => {
    const map = new Map<number, FlashSaleSelectedItem[]>();
    for (const it of items) {
      const list = map.get(it.storeId) ?? [];
      list.push(it);
      map.set(it.storeId, list);
    }
    return map;
  }, [items]);

  const sheet =
    sheetOpen && activeStore && typeof document !== "undefined"
      ? createPortal(
          <div
            className="fixed inset-0 z-[10000] flex justify-end bg-slate-900/40"
            role="dialog"
            aria-modal="true"
            aria-label="Select Flash Sale items"
            onClick={() => setSheetOpen(false)}
          >
            <div
              className="flex h-full w-full max-w-md flex-col bg-white shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <header className="flex items-start justify-between gap-3 border-b border-slate-100 px-4 py-3">
                <div className="min-w-0">
                  <h2 className="text-base font-semibold text-slate-900">Select items</h2>
                  <p className="truncate text-xs text-slate-500">
                    {activeStore.name}
                    {activeStore.publicId ? ` · ${activeStore.publicId}` : ""} · tick one or many
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setSheetOpen(false)}
                  className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100"
                  aria-label="Close"
                >
                  <X className="h-4 w-4" />
                </button>
              </header>
              <div className="border-b border-slate-100 px-4 py-3">
                <div className="flex items-center gap-2">
                  <div className="relative min-w-0 flex-1">
                    <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                    <input
                      className={cn(controlCls, "pl-8")}
                      value={menuQuery}
                      onChange={(e) => setMenuQuery(e.target.value)}
                      placeholder="Search"
                      autoFocus
                    />
                  </div>
                  <select
                    className="h-[34px] w-[148px] shrink-0 rounded-lg border border-slate-200 bg-white px-2 text-xs text-slate-800 focus:border-[#00A88F] focus:outline-none focus:ring-2 focus:ring-[#00A88F]/20"
                    value={menuSort}
                    onChange={(e) => {
                      const v = e.target.value as typeof menuSort;
                      setMenuSort(v);
                      if (v === "random") setRandomSeed((s) => s + 1 || Date.now());
                    }}
                    aria-label="Sort items"
                  >
                    <option value="default">Default</option>
                    <option value="price_asc">Price: Low → High</option>
                    <option value="price_desc">Price: High → Low</option>
                    <option value="name_asc">Name: A → Z</option>
                    <option value="random">Random order</option>
                  </select>
                </div>
                <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-2">
                  <label className="flex items-center gap-2 text-xs text-slate-600">
                    <input
                      type="checkbox"
                      className="h-4 w-4 rounded border-slate-300 text-[#00A88F]"
                      checked={allVisibleChecked}
                      onChange={() => {
                        setDraftIds((prev) => {
                          const next = new Set(prev);
                          if (allVisibleChecked) {
                            for (const m of filteredMenu) next.delete(String(m.id));
                          } else {
                            for (const m of filteredMenu) next.add(String(m.id));
                          }
                          return next;
                        });
                      }}
                    />
                    Select all visible ({filteredMenu.length})
                  </label>
                  <button
                    type="button"
                    onClick={pickRandomVisible}
                    disabled={filteredMenu.length === 0}
                    className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40"
                  >
                    Random select
                  </button>
                </div>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto">
                {loadingMenu ? (
                  <p className="px-4 py-5 text-sm text-slate-500">Loading menu…</p>
                ) : menuError ? (
                  <div className="space-y-3 px-4 py-5">
                    <p className="text-sm text-red-600">{menuError}</p>
                    <button
                      type="button"
                      className="rounded-lg bg-[#00A88F] px-3.5 py-2 text-sm font-medium text-white"
                      onClick={() => {
                        if (activeStoreId != null) menuCacheRef.current.delete(activeStoreId);
                        setMenuReloadToken((n) => n + 1);
                      }}
                    >
                      Retry
                    </button>
                  </div>
                ) : filteredMenu.length === 0 ? (
                  <p className="px-4 py-5 text-sm text-slate-500">No items in this store.</p>
                ) : (
                  filteredMenu.map((m) => {
                    const id = String(m.id);
                    const checked = draftIds.has(id);
                    return (
                      <label
                        key={m.id}
                        className={cn(
                          "flex cursor-pointer items-center gap-3 border-b border-slate-50 px-4 py-2.5 hover:bg-slate-50",
                          checked && "bg-[#00A88F]/10"
                        )}
                      >
                        <input
                          type="checkbox"
                          className="h-4 w-4 shrink-0 rounded border-slate-300 text-[#00A88F]"
                          checked={checked}
                          onChange={() => {
                            setDraftIds((prev) => {
                              const next = new Set(prev);
                              if (next.has(id)) next.delete(id);
                              else next.add(id);
                              return next;
                            });
                          }}
                        />
                        <span className="min-w-0 flex-1 text-sm font-medium text-slate-900">
                          {m.name}
                        </span>
                        <span className="shrink-0 text-xs tabular-nums text-slate-500">
                          ₹{Math.round(m.originalCustomerPrice)}
                          {!m.inStock ? " · OOS" : ""}
                        </span>
                      </label>
                    );
                  })
                )}
              </div>
              <footer className="flex items-center justify-between gap-3 border-t border-slate-100 px-4 py-3">
                <p className="text-xs text-slate-500">{draftIds.size} selected</p>
                <button
                  type="button"
                  className="rounded-xl bg-[#00A88F] px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                  disabled={draftIds.size === 0}
                  onClick={confirmDraftSelection}
                >
                  Add selected
                </button>
              </footer>
            </div>
          </div>,
          document.body
        )
      : null;

  return (
    <div className="space-y-3">
      <div className="relative space-y-1.5">
        <label className="block text-[11px] font-medium uppercase tracking-wide text-slate-500">
          Add outlets
        </label>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            className={cn(controlCls, "pl-9")}
            value={storeQuery}
            onChange={(e) => setStoreQuery(e.target.value)}
            onFocus={() => {
              if (storeSearchBlurTimer.current) clearTimeout(storeSearchBlurTimer.current);
              setStoreSearchOpen(true);
            }}
            onBlur={() => {
              storeSearchBlurTimer.current = setTimeout(() => setStoreSearchOpen(false), 150);
            }}
            placeholder="Search store name or GMMC ID"
            autoComplete="off"
          />
        </div>
        {storeSearchOpen ? (
          <div className="absolute left-0 right-0 z-30 mt-1 max-h-48 overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-lg">
            {loadingStores ? (
              <p className="px-3 py-2.5 text-sm text-slate-500">Searching…</p>
            ) : storeSearchError ? (
              <p className="px-3 py-2.5 text-sm text-red-600">{storeSearchError}</p>
            ) : storeHits.length === 0 ? (
              <p className="px-3 py-2.5 text-sm text-slate-500">
                {storeQuery.trim() ? "No matching stores." : "Type a name or GMMC id to add an outlet."}
              </p>
            ) : (
              storeHits.map((s) => {
                const already = selectedIds.has(s.id);
                return (
                  <button
                    type="button"
                    key={s.id}
                    className={cn(
                      "flex w-full items-center justify-between gap-3 border-b border-slate-50 px-3 py-2.5 text-left last:border-0 hover:bg-slate-50",
                      already && "bg-[#00A88F]/10"
                    )}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      addStore(s);
                      setStoreSearchOpen(false);
                    }}
                  >
                    <span className="min-w-0 truncate text-sm font-medium text-slate-900">{s.name}</span>
                    <span className="shrink-0 text-[11px] text-slate-500">
                      {already ? "Added · " : ""}
                      {s.storeId}
                      {s.city ? ` · ${s.city}` : ""}
                    </span>
                  </button>
                );
              })
            )}
          </div>
        ) : null}
      </div>

      {stores.length > 0 ? (
        <div className="space-y-2">
          {stores.map((s) => {
            const count = itemsByStore.get(s.id)?.length ?? 0;
            return (
              <div
                key={s.id}
                className="flex flex-wrap items-center gap-2 rounded-xl border border-[#00A88F]/20 bg-[linear-gradient(180deg,#f4fbf9,white)] px-3 py-2"
              >
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#00A88F] text-white">
                  <Store className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-slate-900">{s.name}</p>
                  <p className="truncate text-[11px] text-slate-500">
                    {s.publicId || "Food store"}
                    {count > 0
                      ? ` · ${count} eligible item${count === 1 ? "" : "s"}`
                      : " · no items yet"}
                  </p>
                </div>
                <button
                  type="button"
                  className="rounded-lg bg-[#00A88F] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#009078]"
                  onClick={() => openSheetForStore(s.id)}
                >
                  {count > 0 ? "Change items" : "Select items"}
                </button>
                <button
                  type="button"
                  className="rounded-lg px-2 py-1.5 text-xs font-medium text-slate-500 hover:bg-red-50 hover:text-red-600"
                  onClick={() => removeStore(s.id)}
                >
                  Remove
                </button>
              </div>
            );
          })}
        </div>
      ) : null}

      {items.length > 1 ? (
        <div className="flex flex-wrap items-center gap-2">
          <input
            className={cn(controlCls, "max-w-[140px]")}
            inputMode="decimal"
            value={bulkPrice}
            onChange={(e) => {
              setBulkPrice(e.target.value);
              setBulkError(null);
            }}
            placeholder="Same price e.g. 19"
          />
          <button
            type="button"
            className="min-h-[34px] rounded-lg bg-slate-900 px-3 text-xs font-semibold text-white"
            onClick={applyBulkPrice}
          >
            Apply to all
          </button>
          {bulkError ? <p className="text-[11px] text-red-600">{bulkError}</p> : null}
        </div>
      ) : null}

      {items.length > 0 ? (
        <div className="space-y-2">
          {stores.map((s) => {
            const storeItems = itemsByStore.get(s.id) ?? [];
            if (storeItems.length === 0) return null;
            return (
              <div key={`group-${s.id}`} className="space-y-1.5">
                <div className="flex items-center gap-2 px-0.5">
                  <Store className="h-3.5 w-3.5 text-[#00A88F]" />
                  <p className="min-w-0 truncate text-[12px] font-semibold text-slate-800">
                    {s.name}
                    {s.publicId ? (
                      <span className="ml-1.5 font-normal text-slate-500">{s.publicId}</span>
                    ) : null}
                    <span className="ml-1.5 font-normal text-slate-400">
                      · {storeItems.length} eligible item{storeItems.length === 1 ? "" : "s"}
                    </span>
                  </p>
                </div>
                {storeItems.map((it) => {
                  const k = itemKey(it.storeId, it.menuItemId);
                  const draft = draftPrices[k] ?? it.flashPrice;
                  const flash = parseFlashInput(draft);
                  const savedFlash = parseFlashInput(it.flashPrice);
                  const subsidy =
                    savedFlash != null
                      ? computeFlashSaleSubsidy(it.originalCustomerPrice, savedFlash)
                      : 0;
                  const pct =
                    savedFlash != null
                      ? computeFlashSaleOffPercent(it.originalCustomerPrice, savedFlash)
                      : null;
                  const livePct =
                    flash != null
                      ? computeFlashSaleOffPercent(it.originalCustomerPrice, flash)
                      : pct;
                  const msg = rowMsg[k];
                  const dirty = draft.trim() !== String(it.flashPrice ?? "").trim();
                  return (
                    <div
                      key={k}
                      className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5"
                    >
                      <div className="min-w-0 flex-1 basis-40">
                        <p className="truncate text-[13px] font-semibold text-slate-900">{it.name}</p>
                        <p className="text-[11px] text-slate-500">
                          Original{" "}
                          <span className="tabular-nums line-through">
                            ₹{Math.round(it.originalCustomerPrice)}
                          </span>
                        </p>
                      </div>
                      <div className="flex min-w-[118px] items-center gap-1 rounded-md border border-[#00A88F]/20 bg-[#00A88F]/5 px-2 py-1">
                        <span className="text-[9px] font-semibold uppercase tracking-wide text-[#007a68]">
                          Flash
                        </span>
                        <span className="text-sm font-semibold text-slate-900">₹</span>
                        <input
                          className={cn(
                            "w-full min-h-[26px] min-w-0 border-0 bg-transparent px-0 text-sm font-semibold tabular-nums text-slate-900 outline-none",
                            msg && msg !== "saved" && "text-red-600"
                          )}
                          inputMode="decimal"
                          value={draft}
                          onChange={(e) => {
                            const v = e.target.value;
                            setDraftPrices((p) => ({ ...p, [k]: v }));
                            setRowMsg((m) => ({ ...m, [k]: "" }));
                          }}
                          placeholder="0"
                        />
                      </div>
                      <p className="min-w-[72px] text-[12px] font-semibold tabular-nums text-orange-700">
                        {livePct != null ? `${livePct}% OFF` : "—"}
                      </p>
                      <p className="min-w-[78px] text-[12px] font-semibold tabular-nums text-slate-700">
                        {subsidy > 0 ? `Platform ₹${subsidy.toFixed(0)}` : "Platform —"}
                      </p>
                      <button
                        type="button"
                        className={cn(
                          "inline-flex min-h-[30px] items-center gap-1 rounded-md px-2.5 text-[11px] font-semibold",
                          dirty || msg !== "saved"
                            ? "bg-[#00A88F] text-white hover:bg-[#009078]"
                            : "bg-emerald-50 text-emerald-800"
                        )}
                        onClick={() => saveRow(it.storeId, it.menuItemId)}
                      >
                        {msg === "saved" && !dirty ? <Check className="h-3 w-3" /> : null}
                        {msg === "saved" && !dirty ? "Saved" : "Save"}
                      </button>
                      {msg && msg !== "saved" ? (
                        <p className="w-full text-[11px] text-red-600">{msg}</p>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      ) : stores.length > 0 ? (
        <p className="text-xs text-slate-500">
          Pick menu items per outlet, then set Flash prices. % off updates live from the existing offer math.
        </p>
      ) : null}

      {items.some((it) => parseFlashInput(it.flashPrice) != null) ? (
        <p className="text-[11px] leading-snug text-slate-500">
          Customer pays Flash price + existing checkout fees. Merchant CTC unchanged. Platform funds the gap.
        </p>
      ) : null}

      {sheet}
    </div>
  );
}
