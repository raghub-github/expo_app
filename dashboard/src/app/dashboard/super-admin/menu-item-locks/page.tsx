"use client";

import React, { useCallback, useEffect, useState } from "react";
import { Loader2, Lock, Search, Store, Unlock, UnlockKeyhole } from "lucide-react";

type LockRow = {
  menuItemPk: number;
  itemId: string;
  itemName: string;
  isLocked: boolean;
  lockReason: string;
  lockReasonRaw: string | null;
  lockedBy: string | null;
  lockedAt: string | null;
  unlockedBy: string | null;
  unlockedAt: string | null;
  adminOverride: boolean;
  storePublicId: string | null;
  storeName: string | null;
  merchantName: string | null;
  merchantId: string | null;
};

type StoreSummaryRow = {
  storeNumericId: number;
  storePublicId: string;
  storeName: string | null;
  merchantName: string | null;
  merchantId: string | null;
  lockedItems: number;
};

function formatWhen(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

const DEFAULT_UNLOCK_REASON = "Unlocked By Gatimitra Team";
const DEFAULT_LOCK_REASON = "manual_admin_lock";

type ReasonModalState =
  | {
      mode: "single";
      row: LockRow;
      nextLock: boolean;
      title: string;
      defaultReason: string;
    }
  | {
      mode: "bulk";
      storeId: string;
      lockedCount: number;
    };

export default function MenuItemLocksPage() {
  const [loading, setLoading] = useState(false);
  const [savingPk, setSavingPk] = useState<number | null>(null);
  const [bulkUnlocking, setBulkUnlocking] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [mode, setMode] = useState<"summary" | "detail">("summary");
  const [items, setItems] = useState<LockRow[]>([]);
  const [stores, setStores] = useState<StoreSummaryRow[]>([]);
  const [total, setTotal] = useState(0);
  const [totalLockedAllStores, setTotalLockedAllStores] = useState(0);

  const [store, setStore] = useState("");
  const [merchant, setMerchant] = useState("");
  const [itemName, setItemName] = useState("");
  const [itemId, setItemId] = useState("");
  const [lockedOnly, setLockedOnly] = useState(true);
  const [activeStoreFilter, setActiveStoreFilter] = useState("");
  const [reasonModal, setReasonModal] = useState<ReasonModalState | null>(null);
  const [reasonDraft, setReasonDraft] = useState(DEFAULT_UNLOCK_REASON);

  const loadSummary = useCallback(async () => {
    setMsg(null);
    setLoading(true);
    try {
      const res = await fetch("/api/super-admin/menu-item-locks");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load");
      setMode("summary");
      setStores(data.stores ?? []);
      setItems([]);
      setTotal(data.totalStores ?? 0);
      setTotalLockedAllStores(data.totalLocked ?? 0);
      setActiveStoreFilter("");
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Load failed");
      setStores([]);
      setItems([]);
      setTotal(0);
      setTotalLockedAllStores(0);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadDetail = useCallback(
    async (storeOverride?: string) => {
      const storeQ = (storeOverride ?? store).trim();
      const merchantQ = merchant.trim();
      const itemNameQ = itemName.trim();
      const itemIdQ = itemId.trim();

      if (!storeQ && !merchantQ && !itemNameQ && !itemIdQ) {
        setMsg("Enter a Store ID (or other filter) to view locked items.");
        return;
      }

      setMsg(null);
      setLoading(true);
      try {
        const params = new URLSearchParams();
        params.set("view", "detail");
        if (storeQ) params.set("store", storeQ);
        if (merchantQ) params.set("merchant", merchantQ);
        if (itemNameQ) params.set("itemName", itemNameQ);
        if (itemIdQ) params.set("itemId", itemIdQ);
        if (!lockedOnly) params.set("lockedOnly", "0");
        params.set("limit", "500");

        const res = await fetch(`/api/super-admin/menu-item-locks?${params}`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Failed to load");
        setMode("detail");
        setItems(data.items ?? []);
        setTotal(data.total ?? 0);
        setStores([]);
        const resolvedStore =
          typeof data.resolvedStorePublicId === "string" && data.resolvedStorePublicId.trim()
            ? data.resolvedStorePublicId.trim()
            : storeQ;
        setActiveStoreFilter(resolvedStore);
        if (resolvedStore && resolvedStore !== storeQ) {
          setStore(resolvedStore);
        }
      } catch (e) {
        setMsg(e instanceof Error ? e.message : "Load failed");
        setItems([]);
        setTotal(0);
      } finally {
        setLoading(false);
      }
    },
    [store, merchant, itemName, itemId, lockedOnly]
  );

  useEffect(() => {
    void loadSummary();
  }, [loadSummary]);

  const openStoreDetail = (storePublicId: string) => {
    setStore(storePublicId);
    setMerchant("");
    setItemName("");
    setItemId("");
    setLockedOnly(true);
    void loadDetail(storePublicId);
  };

  const toggleLock = async (row: LockRow, reason: string) => {
    const nextLock = !row.isLocked;

    setSavingPk(row.menuItemPk);
    setMsg(null);
    try {
      const res = await fetch("/api/super-admin/menu-item-locks", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          menuItemPk: row.menuItemPk,
          lock: nextLock,
          reason,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Update failed");
      setMsg(nextLock ? `Locked ${row.itemName}` : `Unlocked ${row.itemName}`);
      if (mode === "detail") await loadDetail(activeStoreFilter || store);
      else await loadSummary();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Update failed");
    } finally {
      setSavingPk(null);
    }
  };

  const openToggleLockModal = (row: LockRow) => {
    const nextLock = !row.isLocked;
    const defaultReason = nextLock ? DEFAULT_LOCK_REASON : DEFAULT_UNLOCK_REASON;
    setReasonDraft(defaultReason);
    setReasonModal({
      mode: "single",
      row,
      nextLock,
      title: nextLock ? "Lock item" : "Unlock item",
      defaultReason,
    });
  };

  const unlockAllForStore = () => {
    const storeId =
      activeStoreFilter.trim() ||
      items[0]?.storePublicId?.trim() ||
      store.trim();
    if (!storeId) {
      setMsg("Search by Store ID first to unlock all items for that store.");
      return;
    }

    const lockedInView = items.filter((i) => i.isLocked).length;
    setReasonDraft(DEFAULT_UNLOCK_REASON);
    setReasonModal({
      mode: "bulk",
      storeId,
      lockedCount: lockedInView || total,
    });
  };

  const runBulkUnlock = async (storeId: string, reason: string) => {
    setBulkUnlocking(true);
    setMsg(null);
    try {
      const res = await fetch("/api/super-admin/menu-item-locks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "unlock_all",
          storePublicId: storeId,
          reason,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Bulk unlock failed");
      setMsg(`Unlocked ${data.unlocked ?? 0} item(s) for ${data.storeName ?? storeId}`);
      await loadDetail(activeStoreFilter || store);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Bulk unlock failed");
    } finally {
      setBulkUnlocking(false);
    }
  };

  const confirmReasonModal = async () => {
    if (!reasonModal) return;
    const fallbackReason =
      reasonModal.mode === "single" && reasonModal.nextLock
        ? DEFAULT_LOCK_REASON
        : DEFAULT_UNLOCK_REASON;
    const reason = reasonDraft.trim() || fallbackReason;
    const modalSnapshot = reasonModal;
    setReasonModal(null);

    if (modalSnapshot.mode === "single") {
      await toggleLock(modalSnapshot.row, reason);
      return;
    }

    await runBulkUnlock(modalSnapshot.storeId, reason);
  };

  const closeReasonModal = () => {
    if (savingPk != null || bulkUnlocking) return;
    setReasonModal(null);
  };

  const showUnlockAll =
    mode === "detail" &&
    (activeStoreFilter.trim() || store.trim()) &&
    items.some((i) => i.isLocked);

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 sm:p-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Item Lock Management</h1>
        <p className="mt-1 text-sm text-gray-600">
          Stores with plan-locked items are listed first. Search by Store ID to view and unlock
          items for that store.
        </p>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-gray-700">Store</span>
            <input
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              placeholder="e.g. 1015 or GMMC1015"
              value={store}
              onChange={(e) => setStore(e.target.value)}
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-gray-700">Merchant</span>
            <input
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              placeholder="Merchant ID or name"
              value={merchant}
              onChange={(e) => setMerchant(e.target.value)}
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-gray-700">Item name</span>
            <input
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              placeholder="Search item name"
              value={itemName}
              onChange={(e) => setItemName(e.target.value)}
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-gray-700">Item ID</span>
            <input
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              placeholder="Public or numeric ID"
              value={itemId}
              onChange={(e) => setItemId(e.target.value)}
            />
          </label>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <label className="inline-flex items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={lockedOnly}
              onChange={(e) => setLockedOnly(e.target.checked)}
            />
            Show locked items only
          </label>
          <button
            type="button"
            onClick={() => void loadDetail()}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
            Search items
          </button>
          <button
            type="button"
            onClick={() => void loadSummary()}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            <Store className="h-4 w-4" />
            Store overview
          </button>
          {showUnlockAll ? (
            <button
              type="button"
              onClick={() => unlockAllForStore()}
              disabled={bulkUnlocking || loading}
              className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              {bulkUnlocking ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <UnlockKeyhole className="h-4 w-4" />
              )}
              Unlock all
            </button>
          ) : null}
          {msg ? <span className="text-sm text-gray-600">{msg}</span> : null}
        </div>
      </div>

      {mode === "summary" ? (
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
          <div className="border-b border-gray-100 px-4 py-3 text-sm text-gray-600">
            {loading
              ? "Loading…"
              : `${total} store${total === 1 ? "" : "s"} with locked items · ${totalLockedAllStores} total locked`}
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-gray-50 text-xs uppercase text-gray-500">
                <tr>
                  <th className="px-4 py-3">Store</th>
                  <th className="px-4 py-3">Merchant</th>
                  <th className="px-4 py-3">Locked items</th>
                  <th className="px-4 py-3">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {!loading && stores.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-4 py-8 text-center text-gray-500">
                      No stores have plan-locked menu items right now.
                    </td>
                  </tr>
                ) : null}
                {stores.map((row) => (
                  <tr key={row.storePublicId} className="hover:bg-gray-50/80">
                    <td className="px-4 py-3">
                      <div className="font-medium text-gray-900">{row.storeName ?? "—"}</div>
                      <div className="text-xs text-gray-500">{row.storePublicId}</div>
                    </td>
                    <td className="px-4 py-3">
                      <div>{row.merchantName ?? "—"}</div>
                      <div className="text-xs text-gray-500">{row.merchantId}</div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2.5 py-0.5 text-xs font-semibold text-red-700">
                        <Lock className="h-3 w-3" />
                        {row.lockedItems} locked
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        onClick={() => openStoreDetail(row.storePublicId)}
                        className="inline-flex items-center gap-1 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-xs font-semibold text-indigo-700 hover:bg-indigo-100"
                      >
                        <Search className="h-3.5 w-3.5" />
                        View items
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-100 px-4 py-3 text-sm text-gray-600">
            <span>
              {loading
                ? "Loading…"
                : `${total} item${total === 1 ? "" : "s"} found`}
              {activeStoreFilter ? (
                <span className="ml-2 text-gray-500">· Store {activeStoreFilter}</span>
              ) : null}
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-gray-50 text-xs uppercase text-gray-500">
                <tr>
                  <th className="px-4 py-3">Item</th>
                  <th className="px-4 py-3">Store</th>
                  <th className="px-4 py-3">Merchant</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Reason</th>
                  <th className="px-4 py-3">Locked by</th>
                  <th className="px-4 py-3">Locked at</th>
                  <th className="px-4 py-3">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {!loading && items.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-8 text-center text-gray-500">
                      No items match your filters.
                    </td>
                  </tr>
                ) : null}
                {items.map((row) => (
                  <tr key={row.menuItemPk} className="hover:bg-gray-50/80">
                    <td className="px-4 py-3">
                      <div className="font-medium text-gray-900">{row.itemName}</div>
                      <div className="text-xs text-gray-500">
                        {row.itemId} · #{row.menuItemPk}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div>{row.storeName ?? "—"}</div>
                      <div className="text-xs text-gray-500">{row.storePublicId}</div>
                    </td>
                    <td className="px-4 py-3">
                      <div>{row.merchantName ?? "—"}</div>
                      <div className="text-xs text-gray-500">{row.merchantId}</div>
                    </td>
                    <td className="px-4 py-3">
                      {row.isLocked ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-700">
                          <Lock className="h-3 w-3" /> Locked
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700">
                          <Unlock className="h-3 w-3" /> Unlocked
                        </span>
                      )}
                      {row.adminOverride ? (
                        <div className="mt-1 text-xs text-amber-700">Admin override</div>
                      ) : null}
                    </td>
                    <td className="px-4 py-3 text-gray-700">{row.lockReason}</td>
                    <td className="px-4 py-3 text-gray-700">{row.lockedBy ?? "—"}</td>
                    <td className="px-4 py-3 text-gray-600">{formatWhen(row.lockedAt)}</td>
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        disabled={savingPk === row.menuItemPk}
                        onClick={() => openToggleLockModal(row)}
                        className={`inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-semibold disabled:opacity-50 ${
                          row.isLocked
                            ? "bg-emerald-600 text-white hover:bg-emerald-700"
                            : "bg-red-600 text-white hover:bg-red-700"
                        }`}
                      >
                        {savingPk === row.menuItemPk ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : row.isLocked ? (
                          <Unlock className="h-3.5 w-3.5" />
                        ) : (
                          <Lock className="h-3.5 w-3.5" />
                        )}
                        {row.isLocked ? "Unlock" : "Lock"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {reasonModal ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="lock-reason-modal-title"
          onClick={closeReasonModal}
        >
          <div
            className="w-full max-w-md rounded-2xl border border-gray-200 bg-white p-5 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="lock-reason-modal-title" className="text-lg font-bold text-gray-900">
              {reasonModal.mode === "bulk"
                ? "Unlock all items"
                : reasonModal.title}
            </h2>
            <p className="mt-1 text-sm text-gray-600">
              {reasonModal.mode === "bulk" ? (
                <>
                  Unlock <strong>{reasonModal.lockedCount}</strong> locked item(s) for store{" "}
                  <strong>{reasonModal.storeId}</strong>? Admin override will apply.
                </>
              ) : (
                <>
                  {reasonModal.nextLock ? "Lock" : "Unlock"}{" "}
                  <strong>{reasonModal.row.itemName}</strong>
                </>
              )}
            </p>
            <label className="mt-4 block text-sm font-medium text-gray-700">
              {reasonModal.mode === "bulk" || !reasonModal.nextLock
                ? "Unlock reason (optional)"
                : "Lock reason (optional)"}
            </label>
            <input
              type="text"
              value={reasonDraft}
              onChange={(e) => setReasonDraft(e.target.value)}
              className="mt-1.5 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter") void confirmReasonModal();
                if (e.key === "Escape") closeReasonModal();
              }}
            />
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={closeReasonModal}
                disabled={savingPk != null || bulkUnlocking}
                className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void confirmReasonModal()}
                disabled={savingPk != null || bulkUnlocking}
                className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
              >
                {(savingPk != null || bulkUnlocking) && (
                  <Loader2 className="h-4 w-4 animate-spin" />
                )}
                Confirm
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
