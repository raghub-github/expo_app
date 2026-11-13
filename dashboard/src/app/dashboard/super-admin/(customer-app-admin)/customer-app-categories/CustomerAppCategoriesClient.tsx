"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Plus,
  X,
  Loader2,
  ImageIcon,
  Store,
  Search,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { usePermissions } from "@/hooks/usePermissions";
import { queryKeys } from "@/lib/queryKeys";
import { CxAppHomeSectionToggle } from "@/components/cxapp-home/CxAppHomeSectionToggle";
import { CategoriesVirtualTable } from "@/components/user-app-categories/CategoriesVirtualTable";
import { LazyThumb } from "@/components/ui/LazyThumb";
import {
  USER_APP_CATEGORY_STORE_TYPES,
  parseUserAppCategoryStoreType,
  type UserAppCategoryRow,
  type UserAppCategoryStoreType,
  type UserAppCategoryStatus,
} from "@/lib/user-app-categories/shared";
import { fetchUserAppCategoriesBootstrap } from "@/lib/user-app-categories/fetch-bootstrap";

function emptyForm(store: UserAppCategoryStoreType, display_order = 0): FormState {
  return {
    store_type: store,
    name: "",
    image_url: "",
    status: "active",
    display_order,
  };
}

type FormState = {
  store_type: UserAppCategoryStoreType;
  name: string;
  image_url: string;
  status: UserAppCategoryStatus;
  display_order: number;
};

type StatusFilter = "all" | UserAppCategoryStatus;

function CategoriesTableSkeleton() {
  return (
    <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white w-full shadow-sm">
      <div className="animate-pulse p-4 space-y-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="flex items-center gap-4">
            <div className="h-8 w-8 rounded-full bg-gray-200 shrink-0" />
            <div className="h-4 flex-1 max-w-[180px] rounded bg-gray-200" />
            <div className="h-4 w-12 rounded bg-gray-100" />
            <div className="h-4 w-14 rounded bg-gray-100" />
            <div className="h-5 w-9 rounded-full bg-gray-200" />
            <div className="h-7 w-24 rounded bg-gray-100 ml-auto" />
          </div>
        ))}
      </div>
    </div>
  );
}

export default function CustomerAppCategoriesClient() {
  const router = useRouter();
  const { isSuperAdmin, loading: permLoading } = usePermissions();
  const [storeType, setStoreType] = useState<UserAppCategoryStoreType>("FOOD");
  const [items, setItems] = useState<UserAppCategoryRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<FormState>(() => emptyForm("FOOD", 0));
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [info, setInfo] = useState<string | null>(null);
  const [quickRowId, setQuickRowId] = useState<number | null>(null);
  /** Row id busy for toggle or delete */
  const [rowBusyId, setRowBusyId] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [allTabLabel, setAllTabLabel] = useState("All");
  const [allTabImageUrl, setAllTabImageUrl] = useState<string | null>(null);
  const [allTabSaving, setAllTabSaving] = useState(false);
  const [allTabUploading, setAllTabUploading] = useState(false);

  const {
    data: bootstrapData,
    isLoading: bootstrapLoading,
    isFetching: bootstrapFetching,
    error: bootstrapError,
    refetch: refetchBootstrap,
  } = useQuery({
    queryKey: queryKeys.admin.userAppCategories(storeType),
    queryFn: () => fetchUserAppCategoriesBootstrap(storeType),
    // Wait for auth — fetching while permLoading often 401s and leaves a stuck skeleton.
    enabled: !permLoading && isSuperAdmin,
    staleTime: 10 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    // Prefer cached bootstrap — always refetch was forcing multi-refresh skeletons.
    refetchOnMount: true,
    refetchOnWindowFocus: false,
    placeholderData: (previousData) => previousData,
    retry: 2,
  });

  const loading = bootstrapLoading && !bootstrapData;
  const listFetching = bootstrapFetching && !!bootstrapData;
  const displayItems =
    items.length > 0 || !bootstrapData?.items?.length ? items : bootstrapData.items;

  useEffect(() => {
    if (bootstrapData?.items) {
      setItems(bootstrapData.items);
    }
  }, [bootstrapData?.items]);

  useEffect(() => {
    if (bootstrapData?.allTab) {
      setAllTabLabel(bootstrapData.allTab.label);
      setAllTabImageUrl(bootstrapData.allTab.imageUrl);
    }
  }, [bootstrapData?.allTab]);

  useEffect(() => {
    if (bootstrapError) {
      setError(
        bootstrapError instanceof Error ? bootstrapError.message : "Failed to load categories"
      );
      return;
    }
    if (bootstrapData) {
      setError(null);
    }
  }, [bootstrapError, bootstrapData]);

  const reloadCategories = useCallback(
    async (opts?: { silent?: boolean }) => {
      if (!opts?.silent) setError(null);
      const result = await refetchBootstrap();
      if (result.error) {
        setError(
          result.error instanceof Error ? result.error.message : "Failed to load categories"
        );
      }
    },
    [refetchBootstrap]
  );

  useEffect(() => {
    if (!permLoading && !isSuperAdmin) {
      router.push("/dashboard");
    }
  }, [permLoading, isSuperAdmin, router]);

  useEffect(() => {
    setModalOpen(false);
    setInfo(null);
    // Keep previous rows visible until the new storeType bootstrap paints (no empty flash).
  }, [storeType]);

  useEffect(() => {
    setSearchQuery("");
    setStatusFilter("all");
  }, [storeType]);

  const sortedItems = useMemo(() => {
    const copy = [...displayItems];
    copy.sort((a, b) => {
      if (a.display_order !== b.display_order) return a.display_order - b.display_order;
      return a.id - b.id;
    });
    return copy;
  }, [displayItems]);

  const filteredItems = useMemo(() => {
    let list = sortedItems;
    if (statusFilter !== "all") {
      list = list.filter((r) => r.status === statusFilter);
    }
    const q = searchQuery.trim().toLowerCase();
    if (q) {
      list = list.filter((r) => r.name.toLowerCase().includes(q));
    }
    return list;
  }, [sortedItems, statusFilter, searchQuery]);

  const missingImageCount = useMemo(
    () => displayItems.filter((i) => !i.image_url || !String(i.image_url).trim()).length,
    [displayItems]
  );

  const openCreate = () => {
    setEditingId(null);
    const nextOrder =
      displayItems.length === 0 ? 0 : Math.max(...displayItems.map((i) => i.display_order)) + 1;
    setForm(emptyForm(storeType, nextOrder));
    setModalOpen(true);
    setError(null);
    setInfo(null);
  };

  const openEdit = (row: UserAppCategoryRow) => {
    setEditingId(row.id);
    setForm({
      store_type: parseUserAppCategoryStoreType(row.store_type) ?? "FOOD",
      name: row.name,
      image_url: row.image_url || "",
      status: row.status,
      display_order: row.display_order,
    });
    setModalOpen(true);
    setError(null);
    setInfo(null);
  };

  const closeModal = () => {
    setModalOpen(false);
    setEditingId(null);
    setSaving(false);
    setUploading(false);
  };

  const toggleRowStatus = async (row: UserAppCategoryRow) => {
    const next: UserAppCategoryStatus = row.status === "active" ? "inactive" : "active";
    const previous = row.status;
    // Optimistic UI — toggle flips on first click without waiting for the network.
    setItems((prev) =>
      prev.map((i) => (i.id === row.id ? { ...i, status: next } : i))
    );
    setRowBusyId(row.id);
    setError(null);
    try {
      const res = await fetch(`/api/admin/user-app-categories/${row.id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: next }),
      });
      const data = await res.json();
      if (!res.ok) {
        setItems((prev) =>
          prev.map((i) => (i.id === row.id ? { ...i, status: previous } : i))
        );
        setError(data.error || "Could not update status");
        return;
      }
      const item = data.item as UserAppCategoryRow | undefined;
      if (item?.id === row.id) {
        setItems((prev) => prev.map((i) => (i.id === row.id ? item : i)));
      }
    } catch {
      setItems((prev) =>
        prev.map((i) => (i.id === row.id ? { ...i, status: previous } : i))
      );
      setError("Could not update status");
    } finally {
      setRowBusyId(null);
    }
  };

  const removeRow = async (row: UserAppCategoryRow) => {
    const ok = window.confirm(
      `Remove “${row.name}” from categories? This cannot be undone.`
    );
    if (!ok) return;
    setRowBusyId(row.id);
    setError(null);
    try {
      const res = await fetch(`/api/admin/user-app-categories/${row.id}`, {
        method: "DELETE",
        credentials: "include",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError((data as { error?: string }).error || "Could not remove");
        return;
      }
      setInfo(`“${row.name}” was removed.`);
      await reloadCategories({ silent: true });
    } catch {
      setError("Could not remove");
    } finally {
      setRowBusyId(null);
    }
  };

  const commitDisplayOrder = async (
    row: UserAppCategoryRow,
    next: number,
    inputEl: HTMLInputElement | null
  ) => {
    const v = Math.trunc(next);
    if (!Number.isFinite(v) || v === row.display_order) {
      if (inputEl) inputEl.value = String(row.display_order);
      return;
    }
    setRowBusyId(row.id);
    setError(null);
    try {
      const res = await fetch(`/api/admin/user-app-categories/${row.id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ display_order: v }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Could not update order");
        if (inputEl) inputEl.value = String(row.display_order);
        return;
      }
      await reloadCategories({ silent: true });
    } catch {
      setError("Could not update order");
      if (inputEl) inputEl.value = String(row.display_order);
    } finally {
      setRowBusyId(null);
    }
  };

  const onPickImage = async (file: File | null) => {
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.set("file", file);
      fd.set("storeType", form.store_type);
      if (form.image_url.trim()) {
        fd.set("currentImageUrl", form.image_url.trim());
      }
      const res = await fetch("/api/admin/user-app-categories/upload-image", {
        method: "POST",
        body: fd,
        credentials: "include",
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Upload failed");
        return;
      }
      setForm((f) => ({ ...f, image_url: data.url }));
    } catch {
      setError("Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const quickImageForRow = async (row: UserAppCategoryRow, file: File | null) => {
    if (!file) return;
    setQuickRowId(row.id);
    setError(null);
    try {
      const fd = new FormData();
      fd.set("file", file);
      fd.set("storeType", row.store_type);
      if (row.image_url?.trim()) {
        fd.set("currentImageUrl", row.image_url.trim());
      }
      const up = await fetch("/api/admin/user-app-categories/upload-image", {
        method: "POST",
        body: fd,
        credentials: "include",
      });
      const upData = await up.json();
      if (!up.ok) {
        setError(upData.error || "Upload failed");
        return;
      }
      const newUrl = typeof upData.url === "string" ? upData.url : "";
      const prevUrl =
        row.image_url != null && String(row.image_url).trim() !== ""
          ? String(row.image_url).trim()
          : null;
      if (newUrl) {
        setItems((prev) =>
          prev.map((i) => (i.id === row.id ? { ...i, image_url: newUrl } : i))
        );
      }
      const patch = await fetch(`/api/admin/user-app-categories/${row.id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image_url: newUrl || null }),
      });
      const pData = await patch.json();
      if (!patch.ok) {
        setItems((prev) =>
          prev.map((i) => (i.id === row.id ? { ...i, image_url: prevUrl } : i))
        );
        setError(pData.error || "Save image failed");
        return;
      }
      const item = pData.item as UserAppCategoryRow | undefined;
      if (item?.id === row.id) {
        setItems((prev) => prev.map((i) => (i.id === row.id ? item : i)));
      } else if (newUrl) {
        setItems((prev) =>
          prev.map((i) => (i.id === row.id ? { ...i, image_url: newUrl } : i))
        );
      }
    } catch {
      setError("Upload failed");
    } finally {
      setQuickRowId(null);
    }
  };

  const saveAllTabMeta = async (patch: { label?: string; imageUrl?: string | null }) => {
    setAllTabSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/user-app-categories/meta", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          store_type: storeType,
          label: patch.label ?? allTabLabel,
          image_url: patch.imageUrl === undefined ? allTabImageUrl : patch.imageUrl,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Could not save All tab");
        return;
      }
      setAllTabLabel(data.allTab?.label?.trim() || "All");
      setAllTabImageUrl(data.allTab?.imageUrl?.trim() || null);
      setInfo("All tab updated.");
    } catch {
      setError("Could not save All tab");
    } finally {
      setAllTabSaving(false);
    }
  };

  const onPickAllTabImage = async (file: File | null) => {
    if (!file) return;
    setAllTabUploading(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.set("file", file);
      fd.set("storeType", storeType);
      if (allTabImageUrl?.trim()) {
        fd.set("currentImageUrl", allTabImageUrl.trim());
      }
      const res = await fetch("/api/admin/user-app-categories/upload-image", {
        method: "POST",
        body: fd,
        credentials: "include",
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Upload failed");
        return;
      }
      await saveAllTabMeta({ imageUrl: data.url ?? null });
    } catch {
      setError("Upload failed");
    } finally {
      setAllTabUploading(false);
    }
  };

  const save = async () => {
    const name = form.name.trim();
    if (!name) {
      setError("Name is required");
      return;
    }
    const display_order = Number.isFinite(form.display_order) ? Math.trunc(form.display_order) : 0;
    setSaving(true);
    setError(null);
    try {
      const image_url = form.image_url.trim() || null;
      const wasEditingId = editingId;
      let savedItem: UserAppCategoryRow | undefined;

      if (editingId != null) {
        const res = await fetch(`/api/admin/user-app-categories/${editingId}`, {
          method: "PATCH",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            store_type: form.store_type,
            name,
            image_url,
            status: form.status,
            display_order,
          }),
        });
        const data = await res.json();
        if (!res.ok) {
          setError(data.error || "Save failed");
          return;
        }
        savedItem = data.item as UserAppCategoryRow | undefined;
        if (form.store_type !== storeType) {
          setInfo(
            `Saved under ${form.store_type}. Choose that store vertical above to see this row in the table.`
          );
        } else {
          setInfo(null);
        }
      } else {
        const res = await fetch("/api/admin/user-app-categories", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            store_type: form.store_type,
            name,
            image_url,
            status: form.status,
            display_order,
          }),
        });
        const data = await res.json();
        if (!res.ok) {
          setError(data.error || "Save failed");
          return;
        }
        savedItem = data.item as UserAppCategoryRow | undefined;
        if (form.store_type !== storeType) {
          setInfo(
            `Saved under ${form.store_type}. Choose that store vertical above to see this row in the table.`
          );
        } else {
          setInfo(null);
        }
      }

      closeModal();

      if (savedItem) {
        const inCurrentVertical = String(savedItem.store_type) === storeType;
        if (wasEditingId != null) {
          if (inCurrentVertical) {
            setItems((prev) => prev.map((i) => (i.id === wasEditingId ? savedItem! : i)));
          } else {
            setItems((prev) => prev.filter((i) => i.id !== wasEditingId));
          }
        } else if (inCurrentVertical) {
          setItems((prev) => {
            if (prev.some((i) => i.id === savedItem!.id)) {
              return prev.map((i) => (i.id === savedItem!.id ? savedItem! : i));
            }
            return [...prev, savedItem!];
          });
        } else {
          await reloadCategories({ silent: true });
        }
      } else {
        await reloadCategories({ silent: true });
      }
    } catch {
      setError("Save failed");
    } finally {
      setSaving(false);
    }
  };

  if (!permLoading && !isSuperAdmin) {
    return null;
  }

  return (
    <div className="flex w-full min-w-0 max-w-none flex-col gap-3">
      <div className="rounded-md border-[0.5px] border-[#121212]/40 bg-white">
        <div className="flex flex-wrap items-center gap-2 border-b-[0.5px] border-[#121212]/10 px-3 py-2.5">
          <div className="min-w-0 flex-1">
            <h1 className="text-sm font-semibold tracking-tight text-[#121212] sm:text-base">
              Customer app categories
            </h1>
            <p className="text-[11px] leading-snug text-[#121212]/50">
              Mobile category tiles — image, order, active status
            </p>
          </div>
          <CxAppHomeSectionToggle />
          <button
            type="button"
            onClick={openCreate}
            className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-md bg-[#121212] px-3 text-xs font-semibold text-white hover:bg-black"
          >
            <Plus className="h-3.5 w-3.5" />
            Add category
          </button>
        </div>

        <div className="flex flex-nowrap items-center gap-2 overflow-x-auto px-3 py-2 [scrollbar-width:thin]">
          <label className="inline-flex h-9 shrink-0 items-center gap-1.5 text-xs font-medium text-[#121212]/70">
            <Store className="h-3.5 w-3.5 shrink-0 text-[#121212]/40" />
            <select
              value={storeType}
              onChange={(e) => setStoreType(e.target.value as UserAppCategoryStoreType)}
              className="h-9 rounded-md border border-[#121212]/12 bg-white px-2 text-xs text-[#121212] outline-none focus:border-[#121212]/35"
              aria-label="Store vertical"
            >
              {USER_APP_CATEGORY_STORE_TYPES.map((st) => (
                <option key={st} value={st}>
                  {st}
                </option>
              ))}
            </select>
          </label>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
            className="h-9 shrink-0 rounded-md border border-[#121212]/12 bg-white px-2.5 text-xs text-[#121212] outline-none focus:border-[#121212]/35"
            aria-label="Status"
          >
            <option value="all">All status</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
          <div className="relative min-w-[10rem] flex-1 sm:max-w-xs">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#121212]/35" />
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by name…"
              className="h-9 w-full rounded-md border border-[#121212]/12 bg-white py-1.5 pl-8 pr-2 text-xs text-[#121212] placeholder:text-[#121212]/40 outline-none focus:border-[#121212]/35"
              autoComplete="off"
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 border-t-[0.5px] border-[#121212]/10 bg-[#F7F7F7]/80 px-3 py-2">
          <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[#121212]/55 ring-1 ring-[#121212]/10">
            Top tile
          </span>
          <span className="text-xs font-semibold text-[#121212]">All tab</span>
          <span className="hidden text-[11px] text-[#121212]/45 sm:inline">
            Fixed first category tab
          </span>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <input
              id="uac-all-tab-thumb"
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              className="sr-only"
              disabled={allTabUploading || allTabSaving}
              onChange={(e) => {
                const f = e.target.files?.[0] ?? null;
                void onPickAllTabImage(f);
                e.target.value = "";
              }}
            />
            <label
              htmlFor="uac-all-tab-thumb"
              className={`relative inline-flex cursor-pointer rounded-full ${
                allTabUploading ? "pointer-events-none opacity-60" : ""
              }`}
            >
              {allTabImageUrl ? (
                <span className="relative inline-block">
                  <LazyThumb
                    key={allTabImageUrl}
                    src={allTabImageUrl}
                    priority
                    className="h-9 w-9 rounded-full border border-[#121212]/15 object-cover bg-white"
                  />
                  {allTabUploading ? (
                    <span className="absolute inset-0 flex items-center justify-center rounded-full bg-white/60">
                      <Loader2 className="h-3.5 w-3.5 animate-spin text-[#121212]/50" />
                    </span>
                  ) : null}
                </span>
              ) : (
                <div className="flex h-9 w-9 items-center justify-center rounded-full border border-dashed border-[#121212]/25 bg-white text-[#121212]/40">
                  {allTabUploading ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <ImageIcon className="h-4 w-4" />
                  )}
                </div>
              )}
            </label>
            <input
              type="text"
              value={allTabLabel}
              onChange={(e) => setAllTabLabel(e.target.value)}
              maxLength={24}
              aria-label="All tab label"
              className="h-9 w-[7.5rem] rounded-md border border-[#121212]/12 bg-white px-2.5 text-xs text-[#121212] outline-none focus:border-[#121212]/35 sm:w-36"
            />
            <button
              type="button"
              disabled={allTabSaving || allTabUploading}
              onClick={() => void saveAllTabMeta({ label: allTabLabel.trim() || "All" })}
              className="inline-flex h-9 items-center justify-center rounded-md border border-[#121212]/12 bg-white px-3 text-xs font-semibold text-[#121212] hover:bg-white disabled:opacity-50"
            >
              {allTabSaving ? "Saving…" : "Save All tab"}
            </button>
          </div>
        </div>
      </div>

      {displayItems.length > 0 &&
        (searchQuery.trim() !== "" || statusFilter !== "all") &&
        filteredItems.length !== displayItems.length && (
          <p className="text-[11px] text-[#121212]/50">
            Showing <strong>{filteredItems.length}</strong> of <strong>{displayItems.length}</strong> tiles
            {searchQuery.trim() ? ` matching “${searchQuery.trim()}”` : ""}
            {statusFilter !== "all" ? ` · ${statusFilter}` : ""}
          </p>
        )}

      {displayItems.length > 0 && missingImageCount > 0 && (
        <p className="rounded-md border border-amber-100 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          <strong>{missingImageCount}</strong> tile(s) need an image — click thumbnail or Edit.
        </p>
      )}

      {error && !modalOpen && (
        <div className="rounded-md border border-red-100 bg-red-50 px-3 py-2 text-xs text-red-700">
          {error}
        </div>
      )}
      {info && !modalOpen && (
        <div className="rounded-md border border-cyan-100 bg-cyan-50 px-3 py-2 text-xs text-cyan-900">
          {info}
        </div>
      )}

      {loading ? (
        <CategoriesTableSkeleton />
      ) : displayItems.length === 0 ? (
        <p className="text-sm text-gray-500 py-6">
          No categories for <strong>{storeType}</strong>. Use <strong>Add category</strong>.
        </p>
      ) : filteredItems.length === 0 ? (
        <p className="text-sm text-gray-500 py-6">
          No tiles match your search or status filter.{" "}
          <button
            type="button"
            className="text-cyan-700 font-medium hover:underline"
            onClick={() => {
              setSearchQuery("");
              setStatusFilter("all");
            }}
          >
            Clear filters
          </button>
        </p>
      ) : (
        <CategoriesVirtualTable
          rows={filteredItems}
          rowBusyId={rowBusyId}
          quickRowId={quickRowId}
          listFetching={listFetching}
          onQuickImage={(row, file) => void quickImageForRow(row, file)}
          onCommitOrder={(row, next, input) => void commitDisplayOrder(row, next, input)}
          onToggleStatus={(row) => void toggleRowStatus(row)}
          onEdit={openEdit}
          onRemove={(row) => void removeRow(row)}
        />
      )}

      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
          <div className="bg-white rounded-lg border border-gray-200 shadow-lg max-w-md w-full max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
              <h2 className="text-base font-semibold text-gray-900">
                {editingId != null ? "Edit category" : "New category"}
              </h2>
              <button
                type="button"
                onClick={closeModal}
                className="p-1 rounded hover:bg-gray-100 text-gray-500"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="px-4 py-3 space-y-3">
              {error && <div className="p-2 rounded-md bg-red-50 text-red-700 text-xs">{error}</div>}

              <div>
                <label className="block text-[11px] font-medium text-gray-600 mb-0.5">Store vertical *</label>
                <select
                  value={form.store_type}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, store_type: e.target.value as UserAppCategoryStoreType }))
                  }
                  className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-xs"
                >
                  {USER_APP_CATEGORY_STORE_TYPES.map((st) => (
                    <option key={st} value={st}>
                      {st}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-medium text-gray-600 mb-0.5">Display name *</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-xs"
                  placeholder="e.g. Biryani"
                />
              </div>

              <div>
                <label className="block text-[11px] font-medium text-gray-600 mb-0.5">Display order *</label>
                <input
                  type="number"
                  step={1}
                  value={form.display_order}
                  onChange={(e) => {
                    const v = e.target.value;
                    const n = parseInt(v, 10);
                    setForm((f) => ({
                      ...f,
                      display_order: v === "" || !Number.isFinite(n) ? 0 : n,
                    }));
                  }}
                  className="w-full max-w-[8rem] rounded-md border border-gray-300 px-2 py-1.5 text-xs tabular-nums"
                />
                <p className="text-[10px] text-gray-500 mt-0.5">
                  Lower numbers appear first. If another tile already uses this order, the two positions swap
                  automatically.
                </p>
              </div>

              <div>
                <label className="block text-[11px] font-medium text-gray-600 mb-0.5">Status *</label>
                <select
                  value={form.status}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      status: e.target.value as UserAppCategoryStatus,
                    }))
                  }
                  className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-xs"
                >
                  <option value="active">active</option>
                  <option value="inactive">inactive</option>
                </select>
              </div>

              <div>
                <span className="block text-[11px] font-medium text-gray-600 mb-0.5">Category image</span>
                <label className="inline-flex flex-col gap-1 cursor-pointer group w-fit">
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/gif"
                    disabled={uploading}
                    className="sr-only"
                    onChange={(e) => onPickImage(e.target.files?.[0] ?? null)}
                  />
                  {form.image_url ? (
                    <LazyThumb
                      src={form.image_url}
                      priority
                      className="h-20 w-20 rounded-lg object-cover bg-transparent border border-gray-200/60 group-hover:border-cyan-400/70"
                    />
                  ) : (
                    <div className="h-20 w-20 rounded-lg bg-transparent border border-dashed border-gray-300 flex items-center justify-center text-gray-400">
                      {uploading ? (
                        <Loader2 className="h-6 w-6 animate-spin text-cyan-600" />
                      ) : (
                        <ImageIcon className="h-7 w-7" />
                      )}
                    </div>
                  )}
                  <span className="text-[10px] text-cyan-700">{uploading ? "Uploading…" : "Click to choose image"}</span>
                </label>
              </div>
            </div>
            <div className="px-4 py-2.5 border-t border-gray-200 flex justify-end gap-2 bg-gray-50/80">
              <button
                type="button"
                onClick={closeModal}
                className="px-3 py-1.5 rounded-md border border-gray-300 text-xs font-medium text-gray-700 hover:bg-white"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={saving || uploading}
                onClick={save}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md bg-cyan-600 text-white text-xs font-medium hover:bg-cyan-700 disabled:opacity-50"
              >
                {saving && <Loader2 className="h-3 w-3 animate-spin" />}
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
