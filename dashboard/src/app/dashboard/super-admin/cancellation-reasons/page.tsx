"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Plus,
  Loader2,
  Pencil,
  Trash2,
  RefreshCw,
  Check,
  X,
  RotateCcw,
  Search,
} from "lucide-react";
import type {
  CancellationAttributeRow,
  CancellationReasonCatalogRow,
} from "@/lib/db/operations/order-cancellation-reason-catalog";
import { invalidateCancellationCatalogClientCache } from "@/lib/orders/cancellation-catalog-client-cache";

type CatalogRow = CancellationReasonCatalogRow;
type CatalogChannel = "web" | "app";

const SERVICE_TYPE_OPTIONS = [
  { value: "", label: "All types" },
  { value: "food", label: "Food" },
  { value: "person_ride", label: "Ride" },
  { value: "parcel", label: "Parcel" },
] as const;

function serviceTypeLabel(value: string | null | undefined): string {
  if (!value) return "All";
  return SERVICE_TYPE_OPTIONS.find((o) => o.value === value)?.label ?? value;
}

function StatusPill({ active }: { active: boolean }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
        active
          ? "bg-emerald-100 text-emerald-800 ring-1 ring-emerald-200/80"
          : "bg-slate-100 text-slate-500 ring-1 ring-slate-200"
      }`}
    >
      {active ? "Active" : "Inactive"}
    </span>
  );
}

export default function SuperAdminCancellationReasonsPage() {
  const [channel, setChannel] = useState<CatalogChannel>("web");
  const [filterServiceType, setFilterServiceType] = useState<string>("ALL");
  const [rows, setRows] = useState<CatalogRow[]>([]);
  const [attributes, setAttributes] = useState<CancellationAttributeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [filterAttr, setFilterAttr] = useState<string>("ALL");
  const [showInactive, setShowInactive] = useState(true);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [reasonSearch, setReasonSearch] = useState("");
  const [attrSearch, setAttrSearch] = useState("");
  const [showAddReason, setShowAddReason] = useState(false);
  const [showAddAttribute, setShowAddAttribute] = useState(false);

  const [newAttrCode, setNewAttrCode] = useState("");
  const [newAttrLabel, setNewAttrLabel] = useState("");
  const [newAttrFault, setNewAttrFault] = useState("");
  const [newAttrSort, setNewAttrSort] = useState(0);

  const [newReasonAttr, setNewReasonAttr] = useState("");
  const [newLabel, setNewLabel] = useState("");
  const [newSort, setNewSort] = useState(0);
  const [newServiceType, setNewServiceType] = useState("");

  const [editAttrCode, setEditAttrCode] = useState<string | null>(null);
  const [editAttrLabel, setEditAttrLabel] = useState("");
  const [editAttrFault, setEditAttrFault] = useState("");
  const [editAttrSort, setEditAttrSort] = useState(0);
  const [editAttrActive, setEditAttrActive] = useState(true);

  const [editReasonId, setEditReasonId] = useState<number | null>(null);
  const [editReasonAttr, setEditReasonAttr] = useState("");
  const [editLabel, setEditLabel] = useState("");
  const [editSort, setEditSort] = useState(0);
  const [editActive, setEditActive] = useState(true);
  const [editServiceType, setEditServiceType] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setMsg(null);
    try {
      const res = await fetch(
        `/api/super-admin/order-cancellation-reason-catalog?channel=${channel}`,
        { cache: "no-store" }
      );
      const data = (await res.json().catch(() => ({}))) as {
        success?: boolean;
        rows?: CatalogRow[];
        attributes?: CancellationAttributeRow[];
        error?: string;
      };
      if (!res.ok || !data.success) {
        setMsg({ type: "err", text: data.error ?? `Failed to load (${res.status})` });
        setRows([]);
        setAttributes([]);
        return;
      }
      const attrs = Array.isArray(data.attributes) ? data.attributes : [];
      setAttributes(attrs);
      setRows(Array.isArray(data.rows) ? data.rows : []);
      setNewReasonAttr((prev) => prev || attrs.find((a) => a.isActive)?.code || "");
      if (attrs.length > 0 || (data.rows?.length ?? 0) > 0) {
        setMsg({
          type: "ok",
          text: `Loaded ${attrs.length} attributes, ${data.rows?.length ?? 0} reasons`,
        });
      }
    } catch (e) {
      setMsg({
        type: "err",
        text: e instanceof Error ? e.message : "Failed to load",
      });
    } finally {
      setLoading(false);
    }
  }, [channel]);

  useEffect(() => {
    void load();
  }, [load]);

  const activeAttributes = useMemo(
    () => attributes.filter((a) => a.isActive),
    [attributes]
  );

  const filteredRows = useMemo(() => {
    let list = [...rows].sort(
      (a, b) =>
        a.attribute.localeCompare(b.attribute) ||
        a.sortOrder - b.sortOrder ||
        a.id - b.id
    );
    if (!showInactive) list = list.filter((r) => r.isActive);
    if (filterAttr !== "ALL") list = list.filter((r) => r.attribute === filterAttr);
    if (channel === "app" && filterServiceType !== "ALL") {
      list = list.filter((r) => (r.serviceType ?? "") === filterServiceType);
    }
    const q = reasonSearch.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (r) =>
          r.label.toLowerCase().includes(q) ||
          r.reasonCode.toLowerCase().includes(q) ||
          r.attribute.toLowerCase().includes(q)
      );
    }
    return list;
  }, [rows, filterAttr, showInactive, channel, filterServiceType, reasonSearch]);

  const filteredAttributes = useMemo(() => {
    let list = [...attributes].sort((a, b) => a.sortOrder - b.sortOrder || a.code.localeCompare(b.code));
    if (!showInactive) list = list.filter((a) => a.isActive);
    const q = attrSearch.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (a) =>
          a.code.toLowerCase().includes(q) ||
          a.displayLabel.toLowerCase().includes(q) ||
          (a.defaultFault || "").toLowerCase().includes(q)
      );
    }
    return list;
  }, [attributes, showInactive, attrSearch]);

  const createAttribute = async () => {
    const code = newAttrCode.trim().toUpperCase();
    const displayLabel = newAttrLabel.trim();
    if (!code || !displayLabel) {
      setMsg({ type: "err", text: "Attribute code and display label are required" });
      return;
    }
    setSavingKey("attr-create");
    try {
      const res = await fetch("/api/super-admin/order-cancellation-attributes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code,
          displayLabel,
          defaultFault: newAttrFault.trim(),
          sortOrder: newAttrSort,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { success?: boolean; error?: string };
      if (!res.ok || !data.success) {
        setMsg({ type: "err", text: data.error ?? "Failed to add attribute" });
        return;
      }
      setNewAttrCode("");
      setNewAttrLabel("");
      setNewAttrFault("");
      setNewAttrSort(0);
      setShowAddAttribute(false);
      invalidateCancellationCatalogClientCache();
      await load();
    } finally {
      setSavingKey(null);
    }
  };

  const saveAttribute = async (code: string) => {
    setSavingKey(`attr-${code}`);
    try {
      const res = await fetch(`/api/super-admin/order-cancellation-attributes/${encodeURIComponent(code)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          displayLabel: editAttrLabel.trim(),
          defaultFault: editAttrFault.trim(),
          sortOrder: editAttrSort,
          isActive: editAttrActive,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { success?: boolean; error?: string };
      if (!res.ok || !data.success) {
        setMsg({ type: "err", text: data.error ?? "Update failed" });
        return;
      }
      setEditAttrCode(null);
      invalidateCancellationCatalogClientCache();
      await load();
    } finally {
      setSavingKey(null);
    }
  };

  const deactivateAttribute = async (code: string) => {
    if (!window.confirm(`Deactivate attribute "${code}"?`)) return;
    setSavingKey(`attr-off-${code}`);
    try {
      const res = await fetch(`/api/super-admin/order-cancellation-attributes/${encodeURIComponent(code)}`, {
        method: "DELETE",
      });
      const data = (await res.json().catch(() => ({}))) as { success?: boolean; error?: string };
      if (!res.ok || !data.success) {
        setMsg({ type: "err", text: data.error ?? "Deactivate failed" });
        return;
      }
      invalidateCancellationCatalogClientCache();
      await load();
    } finally {
      setSavingKey(null);
    }
  };

  const reactivateAttribute = async (code: string) => {
    setSavingKey(`attr-on-${code}`);
    try {
      const res = await fetch(`/api/super-admin/order-cancellation-attributes/${encodeURIComponent(code)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: true }),
      });
      const data = (await res.json().catch(() => ({}))) as { success?: boolean; error?: string };
      if (!res.ok || !data.success) {
        setMsg({ type: "err", text: data.error ?? "Reactivate failed" });
        return;
      }
      await load();
    } finally {
      setSavingKey(null);
    }
  };

  const createReason = async () => {
    const label = newLabel.trim();
    if (!newReasonAttr || !label) {
      setMsg({ type: "err", text: "Attribute and label are required" });
      return;
    }
    setSavingKey("reason-create");
    try {
      const res = await fetch("/api/super-admin/order-cancellation-reason-catalog", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          attribute: newReasonAttr,
          label,
          sortOrder: newSort,
          isActive: true,
          channel,
          serviceType: channel === "app" && newServiceType ? newServiceType : null,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { success?: boolean; error?: string };
      if (!res.ok || !data.success) {
        setMsg({ type: "err", text: data.error ?? "Create failed" });
        return;
      }
      setNewLabel("");
      setNewSort(0);
      setNewServiceType("");
      setShowAddReason(false);
      invalidateCancellationCatalogClientCache();
      await load();
    } finally {
      setSavingKey(null);
    }
  };

  const saveReason = async (id: number) => {
    setSavingKey(`reason-${id}`);
    try {
      const res = await fetch(`/api/super-admin/order-cancellation-reason-catalog/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          attribute: editReasonAttr,
          label: editLabel.trim(),
          sortOrder: editSort,
          isActive: editActive,
          channel,
          serviceType:
            channel === "app" ? (editServiceType ? editServiceType : null) : undefined,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { success?: boolean; error?: string };
      if (!res.ok || !data.success) {
        setMsg({ type: "err", text: data.error ?? "Update failed" });
        return;
      }
      setEditReasonId(null);
      invalidateCancellationCatalogClientCache();
      await load();
    } finally {
      setSavingKey(null);
    }
  };

  const setReasonActive = async (id: number, isActive: boolean) => {
    setSavingKey(`reason-${id}`);
    try {
      const res = await fetch(`/api/super-admin/order-cancellation-reason-catalog/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive }),
      });
      const data = (await res.json().catch(() => ({}))) as { success?: boolean; error?: string };
      if (!res.ok || !data.success) {
        setMsg({ type: "err", text: data.error ?? "Update failed" });
        return;
      }
      invalidateCancellationCatalogClientCache();
      await load();
    } finally {
      setSavingKey(null);
    }
  };

  const inputCls =
    "h-8 rounded-md border-0 bg-white/90 px-2.5 text-xs text-slate-800 shadow-sm ring-1 ring-slate-200/90 focus:ring-2 focus:ring-emerald-500/40 outline-none";
  const selectCls = `${inputCls} min-w-[120px] cursor-pointer`;
  const btnPrimary =
    "h-8 px-3 rounded-md bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-700 disabled:opacity-50 inline-flex items-center gap-1.5";
  const btnGhost =
    "h-7 px-2 rounded text-xs font-medium text-slate-600 hover:bg-slate-100 inline-flex items-center gap-1";

  const stats = useMemo(
    () => ({
      attributes: attributes.length,
      activeAttributes: attributes.filter((a) => a.isActive).length,
      reasons: rows.length,
      activeReasons: rows.filter((r) => r.isActive).length,
    }),
    [attributes, rows]
  );

  return (
    <div className="w-full min-w-0 -m-4 md:-m-6">
      <div className="bg-[#eef1f4] min-h-[calc(100vh-4rem)]">
        <div className="max-w-6xl mx-auto px-4 md:px-6 py-5 space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 mr-1">
                Catalog
              </span>
              {(["web", "app"] as const).map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => {
                    setChannel(c);
                    setFilterServiceType("ALL");
                    setEditReasonId(null);
                    setShowAddReason(false);
                    setReasonSearch("");
                  }}
                  className={`h-9 px-4 rounded-lg text-xs font-semibold transition-colors ${
                    channel === c
                      ? "bg-emerald-600 text-white shadow-sm"
                      : "bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50"
                  }`}
                >
                  {c === "web" ? "Web Cancellation" : "App Cancellation"}
                </button>
              ))}
              <p className="w-full text-xs text-slate-500 mt-0.5 sm:w-auto sm:mt-0 sm:ml-2">
                {channel === "web"
                  ? "Dashboard order cancel / refund (web)."
                  : "Rider, customer & merchant app cancellation options."}
              </p>
            </div>
            <button
              type="button"
              onClick={() => void load()}
              disabled={loading}
              className="h-9 px-3 rounded-lg bg-slate-900 text-xs font-medium text-white hover:bg-slate-800 disabled:opacity-50 inline-flex items-center gap-1.5"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
              Refresh
            </button>
          </div>

          {msg ? (
            <p
              className={`text-xs px-3 py-2 rounded-lg ${
                msg.type === "err"
                  ? "bg-red-50 text-red-800 border border-red-100"
                  : "bg-emerald-50 text-emerald-800 border border-emerald-100"
              }`}
            >
              {msg.text}
            </p>
          ) : null}

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: "Attributes", value: stats.attributes, sub: `${stats.activeAttributes} active` },
              { label: "Reasons", value: stats.reasons, sub: `${stats.activeReasons} active` },
              { label: "Filtered", value: filteredRows.length, sub: "reason rows" },
              { label: "Groups", value: activeAttributes.length, sub: "attribute codes" },
            ].map((s) => (
              <div
                key={s.label}
                className="rounded-lg bg-white px-3 py-2.5 border-l-4 border-l-emerald-500 shadow-sm ring-1 ring-slate-200/60"
              >
                <p className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">{s.label}</p>
                <p className="text-xl font-bold text-slate-900 tabular-nums">{s.value}</p>
                <p className="text-[10px] text-slate-500">{s.sub}</p>
              </div>
            ))}
          </div>

        {/* Attributes */}
        <section className="rounded-xl overflow-hidden bg-white shadow-sm ring-1 ring-slate-200/80">
          <div className="px-4 py-3 bg-gradient-to-r from-slate-800 to-slate-700 text-white flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-xs font-bold uppercase tracking-wider">
              Attributes — Select Attribute dropdown
            </h2>
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-slate-300">{filteredAttributes.length} rows</span>
              <button
                type="button"
                onClick={() => setShowAddAttribute((v) => !v)}
                className="h-7 px-2.5 rounded-md bg-white/15 text-[11px] font-semibold text-white hover:bg-white/25 inline-flex items-center gap-1"
              >
                {showAddAttribute ? (
                  <>
                    <X className="h-3 w-3" />
                    Cancel
                  </>
                ) : (
                  <>
                    <Plus className="h-3 w-3" />
                    Add attribute
                  </>
                )}
              </button>
            </div>
          </div>

          <div className="flex flex-wrap gap-2 items-center px-4 py-3 border-b border-slate-100 bg-slate-50/50">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
              <input
                value={attrSearch}
                onChange={(e) => setAttrSearch(e.target.value)}
                placeholder="Search attributes by code, label, fault…"
                className={`${inputCls} w-full pl-8`}
              />
            </div>
          </div>

          {showAddAttribute ? (
            <div className="flex flex-wrap gap-2 items-end px-4 py-3 border-b border-slate-100 bg-emerald-50/40">
              <input
                value={newAttrCode}
                onChange={(e) => setNewAttrCode(e.target.value.toUpperCase())}
                placeholder="Code (CUSTOMER)"
                className={`${inputCls} w-28 font-mono`}
              />
              <input
                value={newAttrLabel}
                onChange={(e) => setNewAttrLabel(e.target.value)}
                placeholder="Display label"
                className={`${inputCls} flex-1 min-w-[140px]`}
              />
              <input
                value={newAttrFault}
                onChange={(e) => setNewAttrFault(e.target.value)}
                placeholder="Default fault"
                className={`${inputCls} w-36`}
              />
              <input
                type="number"
                value={newAttrSort}
                onChange={(e) => setNewAttrSort(Number(e.target.value) || 0)}
                placeholder="Sort"
                className={`${inputCls} w-16`}
              />
              <button
                type="button"
                onClick={() => void createAttribute()}
                disabled={savingKey === "attr-create"}
                className={btnPrimary}
              >
                {savingKey === "attr-create" ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Plus className="h-3.5 w-3.5" />
                )}
                Add attribute
              </button>
            </div>
          ) : null}

          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="bg-slate-100 text-slate-600 border-b border-slate-200">
                  <th className="text-left px-4 py-2 font-semibold">Code</th>
                  <th className="text-left px-4 py-2 font-semibold">Display</th>
                  <th className="text-left px-4 py-2 font-semibold">Default fault</th>
                  <th className="text-left px-4 py-2 font-semibold w-14">Sort</th>
                  <th className="text-left px-4 py-2 font-semibold w-20">Status</th>
                  <th className="text-right px-4 py-2 font-semibold w-36">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredAttributes.map((a, i) => (
                  <tr
                    key={a.code}
                    className={`border-t border-slate-100 ${
                      i % 2 === 0 ? "bg-white" : "bg-[#f8fafb]"
                    } ${!a.isActive ? "opacity-55" : ""} hover:bg-emerald-50/40 transition-colors`}
                  >
                    <td className="px-3 py-2 font-mono font-semibold text-slate-800">{a.code}</td>
                    <td className="px-3 py-2">
                      {editAttrCode === a.code ? (
                        <input
                          value={editAttrLabel}
                          onChange={(e) => setEditAttrLabel(e.target.value)}
                          className={inputCls + " w-full"}
                        />
                      ) : (
                        <span className="text-slate-800">{a.displayLabel}</span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      {editAttrCode === a.code ? (
                        <input
                          value={editAttrFault}
                          onChange={(e) => setEditAttrFault(e.target.value)}
                          className={inputCls + " w-full"}
                        />
                      ) : (
                        <span className="text-slate-500 font-mono text-[10px]">
                          {a.defaultFault || "—"}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      {editAttrCode === a.code ? (
                        <input
                          type="number"
                          value={editAttrSort}
                          onChange={(e) => setEditAttrSort(Number(e.target.value) || 0)}
                          className={inputCls + " w-14"}
                        />
                      ) : (
                        a.sortOrder
                      )}
                    </td>
                    <td className="px-3 py-2">
                      {editAttrCode === a.code ? (
                        <label className="flex items-center gap-1 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={editAttrActive}
                            onChange={(e) => setEditAttrActive(e.target.checked)}
                          />
                          Active
                        </label>
                      ) : (
                        <StatusPill active={a.isActive} />
                      )}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {editAttrCode === a.code ? (
                        <div className="flex justify-end gap-1">
                          <button
                            type="button"
                            disabled={savingKey === `attr-${a.code}`}
                            onClick={() => void saveAttribute(a.code)}
                            className={btnGhost + " text-emerald-700"}
                          >
                            <Check className="h-3.5 w-3.5" />
                          </button>
                          <button type="button" onClick={() => setEditAttrCode(null)} className={btnGhost}>
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ) : (
                        <div className="flex justify-end gap-0.5">
                          <button
                            type="button"
                            className={btnGhost}
                            onClick={() => {
                              setEditAttrCode(a.code);
                              setEditAttrLabel(a.displayLabel);
                              setEditAttrFault(a.defaultFault);
                              setEditAttrSort(a.sortOrder);
                              setEditAttrActive(a.isActive);
                            }}
                          >
                            <Pencil className="h-3 w-3" />
                          </button>
                          {a.isActive ? (
                            <button
                              type="button"
                              className={btnGhost + " text-red-600"}
                              onClick={() => void deactivateAttribute(a.code)}
                            >
                              <Trash2 className="h-3 w-3" />
                            </button>
                          ) : (
                            <button
                              type="button"
                              className={btnGhost + " text-emerald-700"}
                              onClick={() => void reactivateAttribute(a.code)}
                            >
                              <RotateCcw className="h-3 w-3" />
                            </button>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
                {filteredAttributes.length === 0 && !loading ? (
                  <tr>
                    <td colSpan={6} className="px-3 py-6 text-center text-slate-500 bg-white">
                      {attrSearch.trim()
                        ? "No attributes match this search."
                        : "No attributes. Click “+ Add attribute” or run migration 0235/0236."}
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>

        {/* Reasons */}
        <section className="rounded-xl overflow-hidden bg-white shadow-sm ring-1 ring-slate-200/80">
          <div className="px-4 py-3 bg-gradient-to-r from-slate-800 to-slate-700 text-white flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-xs font-bold uppercase tracking-wider">Rejection reasons</h2>
            <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-200">
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={showInactive}
                  onChange={(e) => setShowInactive(e.target.checked)}
                  className="rounded border-slate-400"
                />
                Show inactive
              </label>
              <select
                value={filterAttr}
                onChange={(e) => setFilterAttr(e.target.value)}
                className="h-7 rounded px-2 text-xs text-slate-800 bg-white/95 border-0"
              >
                <option value="ALL">All attributes</option>
                {attributes.map((a) => (
                  <option key={a.code} value={a.code}>
                    {a.code}
                  </option>
                ))}
              </select>
              {channel === "app" ? (
                <select
                  value={filterServiceType}
                  onChange={(e) => setFilterServiceType(e.target.value)}
                  className="h-7 rounded px-2 text-xs text-slate-800 bg-white/95 border-0"
                >
                  <option value="ALL">All service types</option>
                  {SERVICE_TYPE_OPTIONS.filter((o) => o.value).map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              ) : null}
              <button
                type="button"
                onClick={() => setShowAddReason((v) => !v)}
                className="h-7 px-2.5 rounded-md bg-white/15 text-[11px] font-semibold text-white hover:bg-white/25 inline-flex items-center gap-1"
              >
                {showAddReason ? (
                  <>
                    <X className="h-3 w-3" />
                    Cancel
                  </>
                ) : (
                  <>
                    <Plus className="h-3 w-3" />
                    Add reason
                  </>
                )}
              </button>
            </div>
          </div>

          <div className="flex flex-wrap gap-2 items-center px-4 py-3 border-b border-slate-100 bg-slate-50/50">
            <div className="relative flex-1 min-w-[220px]">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
              <input
                value={reasonSearch}
                onChange={(e) => setReasonSearch(e.target.value)}
                placeholder="Search reasons by label, code, attribute…"
                className={`${inputCls} w-full pl-8`}
              />
            </div>
          </div>

          {showAddReason ? (
            <div className="flex flex-wrap gap-2 items-end px-4 py-3 border-b border-slate-100 bg-emerald-50/40">
              <select
                value={newReasonAttr}
                onChange={(e) => setNewReasonAttr(e.target.value)}
                className={selectCls}
              >
                <option value="">Attribute</option>
                {activeAttributes.map((a) => (
                  <option key={a.code} value={a.code}>
                    {a.displayLabel || a.code}
                  </option>
                ))}
              </select>
              <input
                value={newLabel}
                onChange={(e) => setNewLabel(e.target.value)}
                placeholder="Reason label"
                className={`${inputCls} flex-1 min-w-[200px]`}
              />
              {channel === "app" ? (
                <select
                  value={newServiceType}
                  onChange={(e) => setNewServiceType(e.target.value)}
                  className={selectCls}
                  title="Service type (optional)"
                >
                  {SERVICE_TYPE_OPTIONS.map((o) => (
                    <option key={o.value || "all"} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              ) : null}
              <input
                type="number"
                value={newSort}
                onChange={(e) => setNewSort(Number(e.target.value) || 0)}
                className={`${inputCls} w-16`}
                title="Sort order"
              />
              <button
                type="button"
                onClick={() => void createReason()}
                disabled={savingKey === "reason-create"}
                className={btnPrimary}
              >
                {savingKey === "reason-create" ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Plus className="h-3.5 w-3.5" />
                )}
                Add reason
              </button>
            </div>
          ) : null}

          <div className="overflow-x-auto">
            {loading ? (
              <div className="py-16 flex justify-center">
                <Loader2 className="h-7 w-7 animate-spin text-emerald-600" />
              </div>
            ) : (
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-100 text-slate-600 border-b border-slate-200">
                    <th className="text-left px-4 py-2 font-semibold w-24">Attribute</th>
                    <th className="text-left px-4 py-2 font-semibold">Label</th>
                    {channel === "app" ? (
                      <th className="text-left px-4 py-2 font-semibold w-24">Service</th>
                    ) : null}
                    <th className="text-left px-4 py-2 font-semibold">Code</th>
                    <th className="text-left px-4 py-2 font-semibold w-12">Sort</th>
                    <th className="text-left px-4 py-2 font-semibold w-20">Status</th>
                    <th className="text-right px-4 py-2 font-semibold w-32">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRows.map((row, i) => (
                    <tr
                      key={row.id}
                      className={`border-t border-slate-100 ${
                        i % 2 === 0 ? "bg-white" : "bg-[#f8fafb]"
                      } ${!row.isActive ? "opacity-55" : ""} hover:bg-emerald-50/40 transition-colors`}
                    >
                      <td className="px-3 py-2">
                        {editReasonId === row.id ? (
                          <select
                            value={editReasonAttr}
                            onChange={(e) => setEditReasonAttr(e.target.value)}
                            className={selectCls + " w-full"}
                          >
                            {attributes.filter((a) => a.isActive).map((a) => (
                              <option key={a.code} value={a.code}>
                                {a.code}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <span className="font-mono text-[10px] font-bold text-emerald-800 bg-emerald-50 px-1.5 py-0.5 rounded">
                            {row.attribute}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-slate-800">
                        {editReasonId === row.id ? (
                          <input
                            value={editLabel}
                            onChange={(e) => setEditLabel(e.target.value)}
                            className={inputCls + " w-full"}
                          />
                        ) : (
                          row.label
                        )}
                      </td>
                      {channel === "app" ? (
                        <td className="px-3 py-2 text-slate-600">
                          {editReasonId === row.id ? (
                            <select
                              value={editServiceType}
                              onChange={(e) => setEditServiceType(e.target.value)}
                              className={selectCls + " w-full"}
                            >
                              {SERVICE_TYPE_OPTIONS.map((o) => (
                                <option key={o.value || "all"} value={o.value}>
                                  {o.label}
                                </option>
                              ))}
                            </select>
                          ) : (
                            serviceTypeLabel(row.serviceType)
                          )}
                        </td>
                      ) : null}
                      <td className="px-3 py-2 text-slate-400 font-mono text-[10px] max-w-[180px] truncate">
                        {row.reasonCode}
                      </td>
                      <td className="px-3 py-2 text-slate-600">
                        {editReasonId === row.id ? (
                          <input
                            type="number"
                            value={editSort}
                            onChange={(e) => setEditSort(Number(e.target.value) || 0)}
                            className={inputCls + " w-14"}
                          />
                        ) : (
                          row.sortOrder
                        )}
                      </td>
                      <td className="px-3 py-2">
                        {editReasonId === row.id ? (
                          <label className="flex items-center gap-1 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={editActive}
                              onChange={(e) => setEditActive(e.target.checked)}
                            />
                            Active
                          </label>
                        ) : (
                          <StatusPill active={row.isActive} />
                        )}
                      </td>
                      <td className="px-3 py-2 text-right">
                        {editReasonId === row.id ? (
                          <div className="flex justify-end gap-1">
                            <button
                              type="button"
                              disabled={savingKey === `reason-${row.id}`}
                              onClick={() => void saveReason(row.id)}
                              className={btnGhost + " text-emerald-700"}
                            >
                              <Check className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setEditReasonId(null)}
                              className={btnGhost}
                            >
                              <X className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        ) : (
                          <div className="flex justify-end gap-0.5">
                            <button
                              type="button"
                              className={btnGhost}
                              onClick={() => {
                                setEditReasonId(row.id);
                                setEditReasonAttr(row.attribute);
                                setEditLabel(row.label);
                                setEditSort(row.sortOrder);
                                setEditActive(row.isActive);
                                setEditServiceType(row.serviceType ?? "");
                              }}
                            >
                              <Pencil className="h-3 w-3" />
                            </button>
                            {row.isActive ? (
                              <button
                                type="button"
                                className={btnGhost + " text-red-600"}
                                onClick={() => void setReasonActive(row.id, false)}
                              >
                                <Trash2 className="h-3 w-3" />
                              </button>
                            ) : (
                              <button
                                type="button"
                                className={btnGhost + " text-emerald-700"}
                                onClick={() => void setReasonActive(row.id, true)}
                              >
                                <RotateCcw className="h-3 w-3" />
                              </button>
                            )}
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                  {filteredRows.length === 0 ? (
                    <tr>
                      <td
                        colSpan={channel === "app" ? 7 : 6}
                        className="px-3 py-8 text-center text-slate-500 bg-white"
                      >
                        {reasonSearch.trim()
                          ? "No reasons match this search."
                          : "No reasons match this filter."}
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            )}
          </div>
          <div className="px-4 py-2 border-t border-slate-100 bg-slate-50/80 text-[10px] text-slate-500">
            {filteredRows.length} of {rows.length} reasons shown
          </div>
        </section>
        </div>
      </div>
    </div>
  );
}
