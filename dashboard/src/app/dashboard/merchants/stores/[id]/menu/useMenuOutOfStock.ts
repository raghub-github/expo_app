"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { QueryClient } from "@tanstack/react-query";
import type { MenuCategory, MenuItem } from "./menu-types";
import { queryKeys } from "@/lib/queryKeys";
import {
  effectiveInStock,
  getItemOosLabel,
  isOosActive,
  itemInStockIgnoringCategory,
  type MenuOosChoice,
  type MenuOosModal,
} from "@/lib/merchant-menu-stock";

type RestoreConfirm = {
  title: string;
  message: string;
  onConfirm: () => Promise<void> | void;
};

export function useMenuOutOfStock({
  storeId,
  menuItems,
  categories,
  queryClient,
  toast,
  onStockUpdated,
}: {
  storeId: string;
  menuItems: MenuItem[];
  categories: MenuCategory[];
  queryClient: QueryClient;
  toast: (msg: string) => void;
  /** Restore scroll position after cache patch (avoids jump that feels like a reload). */
  onStockUpdated?: () => void;
}) {
  const [oosModal, setOosModal] = useState<MenuOosModal | null>(null);
  const [oosBusy, setOosBusy] = useState(false);
  const [oosChoice, setOosChoice] = useState<MenuOosChoice>("HOURS");
  const [oosHours, setOosHours] = useState(5);
  const [oosDate, setOosDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [oosTime, setOosTime] = useState(() => {
    const d = new Date(Date.now() + 60 * 60 * 1000);
    return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  });
  const [oosCustomTouched, setOosCustomTouched] = useState(false);
  const [oosSheetShown, setOosSheetShown] = useState(false);
  const [restoreConfirm, setRestoreConfirm] = useState<RestoreConfirm | null>(null);
  const [nowTick, setNowTick] = useState(() => Date.now());

  useEffect(() => {
    const t = setInterval(() => setNowTick(Date.now()), 30 * 1000);
    return () => clearInterval(t);
  }, []);

  const categoryById = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories]);

  const patchMenuCache = useCallback(
    (updater: (prev: { items?: unknown[]; categories?: unknown[] }) => { items?: unknown[]; categories?: unknown[] }) => {
      queryClient.setQueryData(queryKeys.merchantStore.menu(storeId), (prev: unknown) => {
        if (!prev || typeof prev !== "object") return prev;
        const current = prev as { items?: unknown[]; categories?: unknown[] };
        return { ...(current as Record<string, unknown>), ...updater(current) };
      });
      onStockUpdated?.();
    },
    [onStockUpdated, queryClient, storeId]
  );

  const apiPatch = useCallback(
    async (body: Record<string, unknown>) => {
      const res = await fetch(`/api/merchant/stores/${storeId}/menu/out-of-stock`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || (data as { success?: boolean }).success === false) {
        throw new Error((data as { error?: string }).error || "Failed to update out-of-stock");
      }
      return data as Record<string, unknown>;
    },
    [storeId]
  );

  const isItemInStock = useCallback(
    (item: MenuItem) => effectiveInStock(item, categoryById, nowTick),
    [categoryById, nowTick]
  );

  const itemOosLabel = useCallback(
    (item: MenuItem) => getItemOosLabel(item, categoryById, nowTick),
    [categoryById, nowTick]
  );

  const openMarkOosForItem = useCallback((item: MenuItem) => {
    setOosChoice("HOURS");
    setOosHours(5);
    const d = new Date(Date.now() + 5 * 60 * 60 * 1000);
    setOosDate(d.toISOString().slice(0, 10));
    setOosTime(`${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`);
    setOosModal({ kind: "item", item_id: item.item_id, item_name: item.item_name });
  }, []);

  const requestRestoreConfirm = useCallback((action: () => Promise<void> | void) => {
    setRestoreConfirm({
      title: "Bring back in stock?",
      message: "This will make it available to customers and start receiving orders.",
      onConfirm: async () => {
        setRestoreConfirm(null);
        await action();
      },
    });
  }, []);

  const clearOutOfStockForCategory = useCallback(
    async (categoryId: number) => {
      setOosBusy(true);
      try {
        const prevMarker = categoryById.get(categoryId)?.out_of_stock_updated_at ?? null;
        const data = await apiPatch({ targetType: "category", id: categoryId, mode: "CLEAR" });
        patchMenuCache((prev) => ({
          categories: (prev.categories ?? []).map((row) => {
            const c = row as MenuCategory;
            return c.id === categoryId
              ? {
                  ...c,
                  out_of_stock_manual: false,
                  out_of_stock_until: null,
                  out_of_stock_updated_at: (data.out_of_stock_updated_at as string) ?? null,
                }
              : row;
          }),
          items:
            prevMarker != null
              ? (prev.items ?? []).map((row) => {
                  const it = row as MenuItem;
                  if ((it.category_id ?? null) !== categoryId) return row;
                  const itMarker = it.out_of_stock_updated_at ?? null;
                  const wasCascaded =
                    itMarker != null && String(itMarker) === String(prevMarker) && !it.out_of_stock_manual;
                  if (!wasCascaded) return row;
                  return {
                    ...it,
                    out_of_stock_manual: false,
                    out_of_stock_until: null,
                    in_stock: true,
                  };
                })
              : prev.items,
        }));
        toast("Category marked In Stock!");
      } catch (e) {
        toast(e instanceof Error ? e.message : "Failed to update");
      } finally {
        setOosBusy(false);
      }
    },
    [apiPatch, categoryById, patchMenuCache, toast]
  );

  const clearOutOfStockForItem = useCallback(
    async (item: MenuItem) => {
      setOosBusy(true);
      try {
        const nowIso = new Date().toISOString();
        const data = await apiPatch({ targetType: "item", id: item.item_id, mode: "CLEAR" });
        patchMenuCache((prev) => ({
          items: (prev.items ?? []).map((row) => {
            const r = row as MenuItem;
            return r.item_id === item.item_id
              ? {
                  ...r,
                  out_of_stock_manual: false,
                  out_of_stock_until: null,
                  in_stock: true,
                  out_of_stock_updated_at: (data.out_of_stock_updated_at as string) ?? nowIso,
                }
              : row;
          }),
        }));
        toast("Item marked In Stock!");

        const catId = item.category_id ?? null;
        if (catId != null) {
          const cat = categoryById.get(catId);
          const catOosActive = cat
            ? isOosActive(cat.out_of_stock_manual, cat.out_of_stock_until ?? null, nowTick)
            : false;
          if (catOosActive) {
            const allBack = menuItems
              .filter((it) => (it.category_id ?? null) === catId)
              .every((it) => itemInStockIgnoringCategory(it, nowTick));
            if (allBack) {
              await clearOutOfStockForCategory(catId);
            }
          }
        }
      } catch (e) {
        toast(e instanceof Error ? e.message : "Failed to update");
      } finally {
        setOosBusy(false);
      }
    },
    [apiPatch, categoryById, clearOutOfStockForCategory, menuItems, nowTick, patchMenuCache, toast]
  );

  const confirmOutOfStock = useCallback(async () => {
    if (!oosModal) return;
    setOosBusy(true);
    try {
      const mode =
        oosChoice === "HOURS"
          ? "HOURS"
          : oosChoice === "NEXT_OPEN"
            ? "NEXT_OPEN"
            : oosChoice === "CUSTOM"
              ? "CUSTOM"
              : "MANUAL";
      const untilIso =
        oosChoice === "CUSTOM" ? new Date(`${oosDate}T${oosTime}:00`).toISOString() : undefined;
      const body =
        oosModal.kind === "item"
          ? {
              targetType: "item",
              id: oosModal.item_id,
              mode,
              hours: oosChoice === "HOURS" ? oosHours : undefined,
              until: untilIso,
            }
          : oosModal.kind === "category"
            ? {
                targetType: "category",
                id: oosModal.categoryId,
                mode,
                hours: oosChoice === "HOURS" ? oosHours : undefined,
                until: untilIso,
              }
            : {
                targetType: "combo",
                id: oosModal.comboId,
                mode,
                hours: oosChoice === "HOURS" ? oosHours : undefined,
                until: untilIso,
              };

      const data = await apiPatch(body);
      const marker = (data.out_of_stock_updated_at as string) ?? new Date().toISOString();

      if (oosModal.kind === "item") {
        patchMenuCache((prev) => ({
          items: (prev.items ?? []).map((row) => {
            const p = row as MenuItem;
            return p.item_id === oosModal.item_id
              ? {
                  ...p,
                  out_of_stock_manual: Boolean(data.out_of_stock_manual),
                  out_of_stock_until: (data.out_of_stock_until as string | null) ?? null,
                  out_of_stock_updated_at: marker,
                  in_stock: true,
                }
              : row;
          }),
        }));
      } else if (oosModal.kind === "category") {
        patchMenuCache((prev) => ({
          categories: (prev.categories ?? []).map((row) => {
            const c = row as MenuCategory;
            return c.id === oosModal.categoryId
              ? {
                  ...c,
                  out_of_stock_manual: Boolean(data.out_of_stock_manual),
                  out_of_stock_until: (data.out_of_stock_until as string | null) ?? null,
                  out_of_stock_updated_at: marker,
                }
              : row;
          }),
          items: (prev.items ?? []).map((row) => {
            const it = row as MenuItem;
            if ((it.category_id ?? null) !== oosModal.categoryId) return row;
            const itemAlreadyOos = isOosActive(it.out_of_stock_manual, it.out_of_stock_until ?? null, nowTick);
            if (itemAlreadyOos) return row;
            return {
              ...it,
              out_of_stock_manual: false,
              out_of_stock_until: (data.out_of_stock_until as string | null) ?? null,
              out_of_stock_updated_at: marker,
              in_stock: true,
            };
          }),
        }));
      }

      setOosModal(null);
      toast("Out of stock updated!");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Failed to update");
    } finally {
      setOosBusy(false);
    }
  }, [apiPatch, nowTick, oosChoice, oosDate, oosHours, oosModal, oosTime, patchMenuCache, toast]);

  useEffect(() => {
    if (!oosModal) return;
    setOosSheetShown(false);
    const raf = requestAnimationFrame(() => setOosSheetShown(true));
    setOosCustomTouched(false);
    const d = new Date(Date.now() + 60 * 60 * 1000);
    setOosDate(d.toISOString().slice(0, 10));
    setOosTime(`${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`);
    const t = setInterval(() => {
      setOosDate((prev) => {
        if (oosCustomTouched) return prev;
        return new Date(Date.now() + 60 * 60 * 1000).toISOString().slice(0, 10);
      });
      setOosTime((prev) => {
        if (oosCustomTouched) return prev;
        const dd = new Date(Date.now() + 60 * 60 * 1000);
        return `${String(dd.getHours()).padStart(2, "0")}:${String(dd.getMinutes()).padStart(2, "0")}`;
      });
    }, 60 * 1000);
    return () => {
      cancelAnimationFrame(raf);
      clearInterval(t);
    };
  }, [oosModal, oosCustomTouched]);

  const handleItemStockToggle = useCallback(
    (item: MenuItem) => {
      const next = !isItemInStock(item);
      if (!next) {
        openMarkOosForItem(item);
        return;
      }
      requestRestoreConfirm(() => clearOutOfStockForItem(item));
    },
    [clearOutOfStockForItem, isItemInStock, openMarkOosForItem, requestRestoreConfirm]
  );

  return {
    oosModal,
    setOosModal,
    oosBusy,
    oosChoice,
    setOosChoice,
    oosHours,
    setOosHours,
    oosDate,
    setOosDate,
    oosTime,
    setOosTime,
    oosCustomTouched,
    setOosCustomTouched,
    oosSheetShown,
    restoreConfirm,
    setRestoreConfirm,
    confirmOutOfStock,
    isItemInStock,
    itemOosLabel,
    handleItemStockToggle,
    requestRestoreConfirm,
    clearOutOfStockForItem,
    openMarkOosForItem,
  };
}
