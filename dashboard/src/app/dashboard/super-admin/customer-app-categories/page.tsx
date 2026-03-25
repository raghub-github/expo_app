"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  LayoutGrid,
  Pencil,
  Plus,
  X,
  Loader2,
  ImageIcon,
  Trash2,
  Store,
  Search,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { usePermissions } from "@/hooks/usePermissions";
import {
  USER_APP_CATEGORY_STORE_TYPES,
  parseUserAppCategoryStoreType,
  type UserAppCategoryRow,
  type UserAppCategoryStoreType,
  type UserAppCategoryStatus,
} from "@/lib/user-app-categories/shared";

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

export default function CustomerAppCategoriesPage() {
  const router = useRouter();
  const { isSuperAdmin, loading: permLoading } = usePermissions();
  const [storeType, setStoreType] = useState<UserAppCategoryStoreType>("FOOD");
  const [items, setItems] = useState<UserAppCategoryRow[]>([]);
  const [loading, setLoading] = useState(true);
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

  const load = useCallback(async (opts?: { silent?: boolean }) => {
    const silent = opts?.silent === true;
    if (!silent) {
      setLoading(true);
    }
    setError(null);
    try {
      const qs = new URLSearchParams({
        storeType,
        includeInactive: "1",
      });
      const res = await fetch(`/api/admin/user-app-categories?${qs.toString()}`, {
        credentials: "include",
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to load");
        if (!silent) {
          setItems([]);
        }
        return;
      }
      setItems(data.items || []);
    } catch {
      setError("Failed to load");
      if (!silent) {
        setItems([]);
      }
    } finally {
      if (!silent) {
        setLoading(false);
      }
    }
  }, [storeType]);

  useEffect(() => {
    if (!permLoading && !isSuperAdmin) {
      router.push("/dashboard");
    }
  }, [permLoading, isSuperAdmin, router]);

  useEffect(() => {
    if (isSuperAdmin) load();
  }, [isSuperAdmin, load]);

  useEffect(() => {
    setModalOpen(false);
    setInfo(null);
  }, [storeType]);

  useEffect(() => {
    setSearchQuery("");
    setStatusFilter("all");
  }, [storeType]);

  const sortedItems = useMemo(() => {
    const copy = [...items];
    copy.sort((a, b) => {
      if (a.display_order !== b.display_order) return a.display_order - b.display_order;
      return a.id - b.id;
    });
    return copy;
  }, [items]);

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
    () => items.filter((i) => !i.image_url || !String(i.image_url).trim()).length,
    [items]
  );

  const openCreate = () => {
    setEditingId(null);
    const nextOrder =
      items.length === 0 ? 0 : Math.max(...items.map((i) => i.display_order)) + 1;
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
        setError(data.error || "Could not update status");
        return;
      }
      const item = data.item as UserAppCategoryRow | undefined;
      if (item?.id === row.id) {
        setItems((prev) => prev.map((i) => (i.id === row.id ? item : i)));
      } else {
        await load({ silent: true });
      }
    } catch {
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
      setItems((prev) => prev.filter((i) => i.id !== row.id));
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
      await load({ silent: true });
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
      } else {
        await load({ silent: true });
      }
    } catch {
      setError("Upload failed");
    } finally {
      setQuickRowId(null);
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
          await load({ silent: true });
        }
      } else {
        await load({ silent: true });
      }
    } catch {
      setError("Save failed");
    } finally {
      setSaving(false);
    }
  };

  if (permLoading) {
    return (
      <div className="p-6 flex justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-cyan-600" />
      </div>
    );
  }

  if (!isSuperAdmin) {
    return null;
  }

  return (
    <div className="w-full min-w-0 max-w-none space-y-4">
      <div className="flex flex-wrap items-start gap-3">
        <Link
          href="/dashboard/super-admin"
          className="rounded-lg border border-gray-200 bg-white p-2 hover:bg-gray-50 shrink-0"
        >
          <ArrowLeft className="h-4 w-4 text-gray-600" />
        </Link>
        <div className="flex items-center gap-2 min-w-0">
          <div className="p-1.5 rounded-lg bg-cyan-50 text-cyan-600 shrink-0">
            <LayoutGrid className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-gray-900 leading-tight">Customer app categories</h1>
            <p className="text-xs text-gray-500 mt-0.5">
              Tiles for the mobile app — images, active/inactive, store vertical.
            </p>
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between xl:gap-6">
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-xs font-medium text-gray-700">
            <Store className="h-3.5 w-3.5 text-cyan-600 shrink-0" />
            <span className="whitespace-nowrap">Store vertical</span>
            <select
              value={storeType}
              onChange={(e) => setStoreType(e.target.value as UserAppCategoryStoreType)}
              className="rounded-md border border-gray-300 bg-white px-2.5 py-1.5 text-xs min-h-[32px] focus:ring-1 focus:ring-cyan-500"
            >
              {USER_APP_CATEGORY_STORE_TYPES.map((st) => (
                <option key={st} value={st}>
                  {st}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-2 text-xs font-medium text-gray-700">
            <span className="text-gray-500 whitespace-nowrap">Status</span>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
              className="rounded-md border border-gray-300 bg-white px-2.5 py-1.5 text-xs min-h-[32px] focus:ring-1 focus:ring-cyan-500"
            >
              <option value="all">All</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </label>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-3 w-full min-w-0 xl:w-auto xl:shrink-0">
          <div className="relative w-full sm:w-56 md:w-60 max-w-[min(100%,16rem)] shrink-0">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400 pointer-events-none" />
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by name…"
              className="w-full rounded-md border border-gray-300 bg-white pl-9 pr-2.5 py-1.5 text-xs min-h-[32px] focus:ring-1 focus:ring-cyan-500 focus:border-cyan-500"
              autoComplete="off"
            />
          </div>
          <button
            type="button"
            onClick={openCreate}
            className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md bg-cyan-600 text-white text-xs font-medium hover:bg-cyan-700 shrink-0 min-h-[32px] w-full sm:w-auto"
          >
            <Plus className="h-3.5 w-3.5" />
            Add category
          </button>
        </div>
      </div>

      {items.length > 0 &&
        (searchQuery.trim() !== "" || statusFilter !== "all") &&
        filteredItems.length !== items.length && (
          <p className="text-[11px] text-gray-500">
            Showing <strong>{filteredItems.length}</strong> of <strong>{items.length}</strong> tiles
            {searchQuery.trim() ? ` matching “${searchQuery.trim()}”` : ""}
            {statusFilter !== "all" ? ` · ${statusFilter}` : ""}
          </p>
        )}

      {items.length > 0 && missingImageCount > 0 && (
        <p className="text-xs text-amber-900 bg-amber-50 border border-amber-100 rounded-md px-3 py-2">
          <strong>{missingImageCount}</strong> tile(s) need an image — click thumbnail or Edit.
        </p>
      )}

      {error && !modalOpen && (
        <div className="text-xs text-red-700 bg-red-50 border border-red-100 rounded-md px-3 py-2">{error}</div>
      )}
      {info && !modalOpen && (
        <div className="text-xs text-cyan-900 bg-cyan-50 border border-cyan-100 rounded-md px-3 py-2">{info}</div>
      )}

      {loading ? (
        <div className="py-10 flex justify-center text-gray-400">
          <Loader2 className="h-6 w-6 animate-spin text-cyan-600" />
        </div>
      ) : items.length === 0 ? (
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
        <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white w-full shadow-sm">
          <table className="w-full min-w-[720px] text-xs border-separate border-spacing-x-4 border-spacing-y-0 table-fixed">
            <colgroup>
              <col style={{ width: "8%" }} />
              <col style={{ width: "26%" }} />
              <col style={{ width: "13%" }} />
              <col style={{ width: "14%" }} />
              <col style={{ width: "12%" }} />
              <col style={{ width: "27%" }} />
            </colgroup>
            <thead>
              <tr className="bg-gray-50 text-gray-600">
                <th className="pl-3 pr-3 py-2.5 font-semibold text-[10px] uppercase tracking-wide text-center align-middle border-b border-gray-200">
                  Image
                </th>
                <th className="px-3 py-2.5 font-semibold text-[10px] uppercase tracking-wide text-center align-middle border-b border-gray-200">
                  Name
                </th>
                <th className="px-3 py-2.5 font-semibold text-[10px] uppercase tracking-wide text-center tabular-nums align-middle border-b border-gray-200">
                  Order
                </th>
                <th className="px-3 py-2.5 font-semibold text-[10px] uppercase tracking-wide text-center align-middle border-b border-gray-200">
                  Store
                </th>
                <th className="px-3 py-2.5 font-semibold text-[10px] uppercase tracking-wide text-center align-middle border-b border-gray-200">
                  Active
                </th>
                <th className="pl-3 pr-3 py-2.5 font-semibold text-[10px] uppercase tracking-wide text-right align-middle border-b border-gray-200">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {filteredItems.map((row, rowIndex) => {
                const busy = rowBusyId === row.id;
                const imgBusy = quickRowId === row.id;
                const isInactive = row.status === "inactive";
                const stripe =
                  !isInactive && rowIndex % 2 === 1 ? "bg-gray-50/70" : !isInactive ? "bg-white" : "";
                return (
                  <tr
                    key={row.id}
                    className={`group transition-colors ${stripe} ${
                      isInactive
                        ? "bg-gray-50/90 text-gray-600 hover:bg-gray-100/90"
                        : "hover:bg-cyan-50/60"
                    }`}
                  >
                    <td className="pl-3 pr-3 py-2.5 align-middle text-center border-b border-gray-100">
                      <label
                        className={`relative inline-flex mx-auto cursor-pointer rounded-full ${
                          imgBusy ? "pointer-events-none opacity-60" : ""
                        }`}
                      >
                        <input
                          type="file"
                          accept="image/jpeg,image/png,image/webp,image/gif"
                          className="sr-only"
                          disabled={imgBusy || busy}
                          onChange={(e) => {
                            const f = e.target.files?.[0] ?? null;
                            void quickImageForRow(row, f);
                            e.target.value = "";
                          }}
                        />
                        {row.image_url ? (
                          <span className="relative inline-block">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={row.image_url}
                              alt=""
                              className={`h-8 w-8 rounded-full object-cover bg-transparent border border-gray-200/60 group-hover:border-cyan-400/70 ${
                                imgBusy ? "opacity-50" : ""
                              } ${isInactive ? "grayscale-[0.35] opacity-90" : ""}`}
                            />
                            {imgBusy && (
                              <span className="absolute inset-0 flex items-center justify-center rounded-full bg-transparent">
                                <Loader2 className="h-3.5 w-3.5 animate-spin text-cyan-600 drop-shadow-sm" />
                              </span>
                            )}
                          </span>
                        ) : (
                          <div className="h-8 w-8 rounded-full bg-transparent border border-dashed border-gray-300 flex items-center justify-center text-gray-400">
                            {imgBusy ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <ImageIcon className="h-3.5 w-3.5" />
                            )}
                          </div>
                        )}
                      </label>
                    </td>
                    <td className="px-3 py-2.5 align-middle text-center border-b border-gray-100">
                      <div className="flex flex-wrap items-center justify-center gap-1.5 min-w-0 text-center">
                        <span
                          className={`font-medium break-words [overflow-wrap:anywhere] ${isInactive ? "text-gray-600" : "text-gray-900"}`}
                        >
                          {row.name}
                        </span>
                        {isInactive && (
                          <span className="inline-flex shrink-0 px-1.5 py-px rounded-full text-[10px] font-medium bg-gray-200 text-gray-700 border border-gray-300/80">
                            Inactive
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-2.5 align-middle text-center border-b border-gray-100">
                      <input
                        key={`${row.id}-${row.display_order}`}
                        type="number"
                        step={1}
                        defaultValue={row.display_order}
                        disabled={busy}
                        title="Edit order — another tile with this order swaps places"
                        onKeyDown={(e) => {
                          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                        }}
                        onBlur={(e) => {
                          const raw = e.target.value.trim();
                          const v = parseInt(raw, 10);
                          if (raw === "" || !Number.isFinite(v)) {
                            e.target.value = String(row.display_order);
                            return;
                          }
                          void commitDisplayOrder(row, v, e.target);
                        }}
                        className="w-[4.25rem] max-w-full mx-auto block rounded border border-gray-300 bg-white px-1.5 py-1 text-center text-[11px] tabular-nums text-gray-800 focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 disabled:opacity-50"
                      />
                    </td>
                    <td className="px-3 py-2.5 align-middle text-center border-b border-gray-100">
                      <span className="inline-flex items-center justify-center px-2 py-0.5 rounded text-[10px] font-semibold bg-gray-100 text-gray-700 border border-gray-200 max-w-full">
                        {row.store_type}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 align-middle text-center border-b border-gray-100">
                      <button
                        type="button"
                        role="switch"
                        aria-checked={row.status === "active"}
                        disabled={busy}
                        onClick={() => void toggleRowStatus(row)}
                        className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-cyan-500 disabled:opacity-50 ${
                          row.status === "active" ? "bg-emerald-500" : "bg-gray-300"
                        }`}
                      >
                        <span
                          className={`pointer-events-none inline-block h-4 w-4 mt-0.5 ml-0.5 transform rounded-full bg-white shadow transition ${
                            row.status === "active" ? "translate-x-3.5" : "translate-x-0"
                          }`}
                        />
                        {busy && (
                          <span className="absolute inset-0 flex items-center justify-center rounded-full bg-white/40">
                            <Loader2 className="h-3 w-3 animate-spin text-gray-600" />
                          </span>
                        )}
                      </button>
                      <span className="sr-only">
                        {row.status === "active" ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td className="pl-3 pr-3 py-2.5 align-middle border-b border-gray-100">
                      <div className="flex flex-wrap items-center justify-end gap-1">
                        <button
                          type="button"
                          onClick={() => openEdit(row)}
                          disabled={busy}
                          className="inline-flex items-center gap-0.5 px-2 py-1 rounded border border-cyan-200 bg-cyan-50 text-[10px] font-medium text-cyan-800 hover:bg-cyan-100 disabled:opacity-50"
                        >
                          <Pencil className="h-3 w-3" />
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => void removeRow(row)}
                          disabled={busy}
                          className="inline-flex items-center gap-0.5 px-2 py-1 rounded border border-red-200 bg-red-50 text-[10px] font-medium text-red-800 hover:bg-red-100 disabled:opacity-50"
                        >
                          <Trash2 className="h-3 w-3" />
                          Remove
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
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
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={form.image_url}
                      alt=""
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
