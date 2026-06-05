"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, Bike, Loader2, Pencil, Plus, RefreshCw, Trash2 } from "lucide-react";
import type { RiderOnboardingVehicleTypeRow } from "@/lib/db/operations/rider-onboarding-vehicle-types";
import type { RiderOnboardingDocumentTypeRow } from "@/lib/db/operations/rider-onboarding-document-types";
import type { RiderOnboardingVehicleCategoryRow } from "@/lib/db/operations/rider-onboarding-vehicle-categories";

const FALLBACK_DOC_OPTIONS = ["dl", "rc", "rental_proof", "ev_proof"] as const;
const FLOW_OPTIONS = [
  { value: "dl_rc", label: "DL + RC wizard" },
  { value: "rental_ev", label: "Rental / EV proof" },
  { value: "payment", label: "Skip to payment" },
] as const;

type FormState = {
  code: string;
  categoryCode: string;
  label: string;
  hint: string;
  icon: string;
  sortOrder: number;
  isActive: boolean;
  onboardingFlow: "dl_rc" | "rental_ev" | "payment";
  requiredDocs: string[];
  hasOwnVehicle: boolean;
  requiresMaxSpeed: boolean;
  infoMessage: string;
  mapsToVehicleType: string;
};

const emptyForm = (): FormState => ({
  code: "",
  categoryCode: "2_wheeler",
  label: "",
  hint: "",
  icon: "bicycle-outline",
  sortOrder: 0,
  isActive: true,
  onboardingFlow: "dl_rc",
  requiredDocs: [],
  hasOwnVehicle: false,
  requiresMaxSpeed: false,
  infoMessage: "",
  mapsToVehicleType: "",
});

function rowToForm(row: RiderOnboardingVehicleTypeRow): FormState {
  return {
    code: row.code,
    categoryCode: row.categoryCode ?? "2_wheeler",
    label: row.label,
    hint: row.hint ?? "",
    icon: row.icon ?? "",
    sortOrder: row.sortOrder,
    isActive: row.isActive,
    onboardingFlow: row.onboardingFlow,
    requiredDocs: row.documentRequirements.required_docs ?? [],
    hasOwnVehicle: Boolean(row.documentRequirements.has_own_vehicle),
    requiresMaxSpeed: Boolean(row.documentRequirements.requires_max_speed),
    infoMessage: row.infoMessage ?? "",
    mapsToVehicleType: row.mapsToVehicleType ?? "",
  };
}

function formToPayload(form: FormState) {
  return {
    code: form.code,
    categoryCode: form.categoryCode || null,
    label: form.label,
    hint: form.hint || null,
    icon: form.icon || null,
    sortOrder: form.sortOrder,
    isActive: form.isActive,
    onboardingFlow: form.onboardingFlow,
    documentRequirements: {
      required_docs: form.requiredDocs,
      has_own_vehicle: form.hasOwnVehicle,
      requires_max_speed: form.requiresMaxSpeed,
    },
    infoMessage: form.infoMessage || null,
    mapsToVehicleType: form.mapsToVehicleType || null,
  };
}

export default function RiderOnboardingVehicleTypesPage() {
  const [rows, setRows] = useState<RiderOnboardingVehicleTypeRow[]>([]);
  const [docOptions, setDocOptions] = useState<RiderOnboardingDocumentTypeRow[]>([]);
  const [categoryOptions, setCategoryOptions] = useState<RiderOnboardingVehicleCategoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [showForm, setShowForm] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setMsg(null);
    try {
      const [vehicleRes, docRes, categoryRes] = await Promise.all([
        fetch("/api/super-admin/rider-onboarding-vehicle-types", { cache: "no-store" }),
        fetch("/api/super-admin/rider-onboarding-document-types", { cache: "no-store" }),
        fetch("/api/super-admin/rider-onboarding-vehicle-categories", { cache: "no-store" }),
      ]);
      const data = (await vehicleRes.json()) as {
        success?: boolean;
        rows?: RiderOnboardingVehicleTypeRow[];
        error?: string;
      };
      const docData = (await docRes.json()) as {
        success?: boolean;
        rows?: RiderOnboardingDocumentTypeRow[];
      };
      const categoryData = (await categoryRes.json()) as {
        success?: boolean;
        rows?: RiderOnboardingVehicleCategoryRow[];
      };
      if (!vehicleRes.ok || !data.success) throw new Error(data.error || "Failed to load");
      setRows(data.rows ?? []);
      setDocOptions(docData.rows?.filter((d) => d.isActive) ?? []);
      setCategoryOptions(categoryData.rows?.filter((c) => c.isActive) ?? []);
    } catch (e) {
      setMsg({ type: "err", text: e instanceof Error ? e.message : "Load failed" });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const sortedRows = useMemo(
    () => [...rows].sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id),
    [rows]
  );

  const assignableDocs = useMemo(() => {
    if (docOptions.length) {
      return docOptions.map((d) => ({ code: d.code, label: d.label }));
    }
    return FALLBACK_DOC_OPTIONS.map((code) => ({ code, label: code }));
  }, [docOptions]);

  const startCreate = () => {
    setEditId(null);
    setForm(emptyForm());
    setShowForm(true);
  };

  const startEdit = (row: RiderOnboardingVehicleTypeRow) => {
    setEditId(row.id);
    setForm(rowToForm(row));
    setShowForm(true);
  };

  const toggleDoc = (doc: string) => {
    setForm((f) => ({
      ...f,
      requiredDocs: f.requiredDocs.includes(doc)
        ? f.requiredDocs.filter((d) => d !== doc)
        : [...f.requiredDocs, doc],
    }));
  };

  const save = async () => {
    setSaving(true);
    setMsg(null);
    try {
      const payload = formToPayload(form);
      const url = editId
        ? `/api/super-admin/rider-onboarding-vehicle-types/${editId}`
        : "/api/super-admin/rider-onboarding-vehicle-types";
      const res = await fetch(url, {
        method: editId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = (await res.json()) as { success?: boolean; error?: string };
      if (!res.ok || !data.success) throw new Error(data.error || "Save failed");
      setShowForm(false);
      setEditId(null);
      setForm(emptyForm());
      await load();
      setMsg({ type: "ok", text: editId ? "Updated" : "Created" });
    } catch (e) {
      setMsg({ type: "err", text: e instanceof Error ? e.message : "Save failed" });
    } finally {
      setSaving(false);
    }
  };

  const deactivate = async (id: number) => {
    if (!confirm("Deactivate this vehicle type? Rider app will show it as Inactive.")) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/super-admin/rider-onboarding-vehicle-types/${id}`, {
        method: "DELETE",
      });
      const data = (await res.json()) as { success?: boolean; error?: string };
      if (!res.ok || !data.success) throw new Error(data.error || "Failed");
      await load();
      setMsg({ type: "ok", text: "Deactivated" });
    } catch (e) {
      setMsg({ type: "err", text: e instanceof Error ? e.message : "Failed" });
    } finally {
      setSaving(false);
    }
  };

  const reactivate = async (row: RiderOnboardingVehicleTypeRow) => {
    setSaving(true);
    try {
      const res = await fetch(`/api/super-admin/rider-onboarding-vehicle-types/${row.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: true }),
      });
      const data = (await res.json()) as { success?: boolean; error?: string };
      if (!res.ok || !data.success) throw new Error(data.error || "Failed");
      await load();
      setMsg({ type: "ok", text: "Reactivated" });
    } catch (e) {
      setMsg({ type: "err", text: e instanceof Error ? e.message : "Failed" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link
            href="/dashboard/super-admin"
            className="inline-flex items-center gap-1 rounded-lg border px-3 py-2 text-sm text-slate-600 hover:bg-slate-50"
          >
            <ArrowLeft className="h-4 w-4" />
            Back
          </Link>
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-bold text-slate-900">
              <Bike className="h-6 w-6 text-emerald-600" />
              Rider vehicle types
            </h1>
            <p className="text-sm text-slate-500">
              Manage operating vehicle options, required documents, and onboarding flow for the rider app.
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => void load()}
            className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm"
          >
            <RefreshCw className="h-4 w-4" />
            Refresh
          </button>
          <button
            type="button"
            onClick={startCreate}
            className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white"
          >
            <Plus className="h-4 w-4" />
            Add vehicle
          </button>
        </div>
      </div>

      {msg ? (
        <div
          className={`rounded-lg px-4 py-3 text-sm ${
            msg.type === "ok"
              ? "bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200"
              : "bg-red-50 text-red-700 ring-1 ring-red-200"
          }`}
        >
          {msg.text}
        </div>
      ) : null}

      {showForm ? (
        <div className="rounded-xl border bg-white p-5 shadow-sm space-y-4">
          <h2 className="text-lg font-semibold">{editId ? "Edit vehicle type" : "New vehicle type"}</h2>
          <div className="grid gap-4 md:grid-cols-2">
            <label className="block text-sm">
              <span className="font-medium">Code</span>
              <input
                className="mt-1 w-full rounded-lg border px-3 py-2"
                value={form.code}
                onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))}
                placeholder="own_bike"
              />
            </label>
            <label className="block text-sm">
              <span className="font-medium">Label</span>
              <input
                className="mt-1 w-full rounded-lg border px-3 py-2"
                value={form.label}
                onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))}
              />
            </label>
            <label className="block text-sm">
              <span className="font-medium">Category</span>
              <select
                className="mt-1 w-full rounded-lg border px-3 py-2"
                value={form.categoryCode}
                onChange={(e) => setForm((f) => ({ ...f, categoryCode: e.target.value }))}
              >
                {categoryOptions.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm">
              <span className="font-medium">Hint (subtitle)</span>
              <input
                className="mt-1 w-full rounded-lg border px-3 py-2"
                value={form.hint}
                onChange={(e) => setForm((f) => ({ ...f, hint: e.target.value }))}
              />
            </label>
            <label className="block text-sm">
              <span className="font-medium">Icon (Ionicons name)</span>
              <input
                className="mt-1 w-full rounded-lg border px-3 py-2"
                value={form.icon}
                onChange={(e) => setForm((f) => ({ ...f, icon: e.target.value }))}
                placeholder="bicycle-outline"
              />
            </label>
            <label className="block text-sm">
              <span className="font-medium">Sort order</span>
              <input
                type="number"
                className="mt-1 w-full rounded-lg border px-3 py-2"
                value={form.sortOrder}
                onChange={(e) => setForm((f) => ({ ...f, sortOrder: Number(e.target.value) }))}
              />
            </label>
            <label className="block text-sm">
              <span className="font-medium">Onboarding flow</span>
              <select
                className="mt-1 w-full rounded-lg border px-3 py-2"
                value={form.onboardingFlow}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    onboardingFlow: e.target.value as FormState["onboardingFlow"],
                  }))
                }
              >
                {FLOW_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm md:col-span-2">
              <span className="font-medium">Info message (shown when selected)</span>
              <textarea
                className="mt-1 w-full rounded-lg border px-3 py-2"
                rows={2}
                value={form.infoMessage}
                onChange={(e) => setForm((f) => ({ ...f, infoMessage: e.target.value }))}
              />
            </label>
            <label className="block text-sm">
              <span className="font-medium">Maps to vehicle type</span>
              <input
                className="mt-1 w-full rounded-lg border px-3 py-2"
                value={form.mapsToVehicleType}
                onChange={(e) => setForm((f) => ({ ...f, mapsToVehicleType: e.target.value }))}
                placeholder="bike, cycle, ev_bike"
              />
            </label>
            <div className="flex flex-wrap items-center gap-4 text-sm md:col-span-2">
              <label className="inline-flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={form.isActive}
                  onChange={(e) => setForm((f) => ({ ...f, isActive: e.target.checked }))}
                />
                Active
              </label>
              <label className="inline-flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={form.hasOwnVehicle}
                  onChange={(e) => setForm((f) => ({ ...f, hasOwnVehicle: e.target.checked }))}
                />
                Has own vehicle
              </label>
              <label className="inline-flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={form.requiresMaxSpeed}
                  onChange={(e) => setForm((f) => ({ ...f, requiresMaxSpeed: e.target.checked }))}
                />
                Requires max speed
              </label>
            </div>
            <div className="md:col-span-2">
              <span className="text-sm font-medium">Required documents</span>
              <div className="mt-2 flex flex-wrap gap-3">
                {assignableDocs.map((doc) => (
                  <label key={doc.code} className="inline-flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={form.requiredDocs.includes(doc.code)}
                      onChange={() => toggleDoc(doc.code)}
                    />
                    {doc.label} ({doc.code})
                  </label>
                ))}
              </div>
            </div>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={saving}
              onClick={() => void save()}
              className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
            >
              {saving ? "Saving…" : "Save"}
            </button>
            <button
              type="button"
              onClick={() => {
                setShowForm(false);
                setEditId(null);
              }}
              className="rounded-lg border px-4 py-2 text-sm"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : null}

      <div className="overflow-hidden rounded-xl border bg-white shadow-sm">
        {loading ? (
          <div className="flex items-center justify-center gap-2 p-10 text-slate-500">
            <Loader2 className="h-5 w-5 animate-spin" />
            Loading…
          </div>
        ) : (
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Order</th>
                <th className="px-4 py-3">Code</th>
                <th className="px-4 py-3">Category</th>
                <th className="px-4 py-3">Label</th>
                <th className="px-4 py-3">Flow</th>
                <th className="px-4 py-3">Docs</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {sortedRows.map((row) => (
                <tr key={row.id} className="border-t">
                  <td className="px-4 py-3">{row.sortOrder}</td>
                  <td className="px-4 py-3 font-mono text-xs">{row.code}</td>
                  <td className="px-4 py-3 text-xs">{row.categoryCode ?? "—"}</td>
                  <td className="px-4 py-3">
                    <div className="font-medium">{row.label}</div>
                    {row.hint ? <div className="text-xs text-slate-500">{row.hint}</div> : null}
                  </td>
                  <td className="px-4 py-3">{row.onboardingFlow}</td>
                  <td className="px-4 py-3 text-xs">
                    {(row.documentRequirements.required_docs ?? []).join(", ") || "—"}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${
                        row.isActive
                          ? "bg-emerald-100 text-emerald-800"
                          : "bg-slate-100 text-slate-500"
                      }`}
                    >
                      {row.isActive ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2">
                      <button type="button" onClick={() => startEdit(row)} className="text-slate-600">
                        <Pencil className="h-4 w-4" />
                      </button>
                      {row.isActive ? (
                        <button
                          type="button"
                          onClick={() => void deactivate(row.id)}
                          className="text-red-600"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => void reactivate(row)}
                          className="text-emerald-700 text-xs font-semibold"
                        >
                          Activate
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
