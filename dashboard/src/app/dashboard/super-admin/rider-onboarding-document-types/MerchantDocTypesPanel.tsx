"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  ShieldAlert,
  ShieldCheck,
  Trash2,
  Utensils,
} from "lucide-react";
import type {
  MerchantOnboardingDocumentTypeRow,
  MerchantStoreTypeDocumentMapRow,
} from "@/lib/db/operations/merchant-onboarding-document-types";
import { toast } from "sonner";
import { defaultCuisineListEnabled, formatStoreTypeLabel } from "@/lib/onboarding-store-types";
import AdminSideSheet from "./AdminSideSheet";

const FORM_SECTIONS = ["PAN", "AADHAAR", "LICENCE", "GST", "BANK"] as const;

function normKey(v: string) {
  return (v || "").trim().toUpperCase().replace(/[\s-]+/g, "_");
}

function InstantSwitch({
  checked,
  onToggle,
  disabled,
}: {
  checked: boolean;
  onToggle: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={onToggle}
      className="inline-flex items-center gap-2 disabled:opacity-50"
    >
      <span
        className={`relative h-6 w-10 shrink-0 rounded-full transition ${
          checked ? "bg-emerald-600" : "bg-slate-300"
        }`}
      >
        <span
          className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition ${
            checked ? "translate-x-4" : ""
          }`}
        />
      </span>
      <span className={`text-xs font-semibold ${checked ? "text-emerald-700" : "text-slate-500"}`}>
        {checked ? "Active" : "Inactive"}
      </span>
    </button>
  );
}

type CatalogForm = {
  code: string;
  label: string;
  hint: string;
  formSection: (typeof FORM_SECTIONS)[number];
  sortOrder: number;
  displayOrder: number;
  isActive: boolean;
  isMandatory: boolean;
};

const emptyCatalogForm = (): CatalogForm => ({
  code: "",
  label: "",
  hint: "",
  formSection: "LICENCE",
  sortOrder: 0,
  displayOrder: 10,
  isActive: true,
  isMandatory: false,
});

export default function MerchantDocTypesPanel() {
  const [storeTypes, setStoreTypes] = useState<string[]>([]);
  const [catalog, setCatalog] = useState<MerchantOnboardingDocumentTypeRow[]>([]);
  const [requirements, setRequirements] = useState<MerchantStoreTypeDocumentMapRow[]>([]);
  const [cuisineFlags, setCuisineFlags] = useState<Record<string, boolean>>({});
  const [selectedType, setSelectedType] = useState<string>("");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editCatalogId, setEditCatalogId] = useState<number | null>(null);
  const [catalogForm, setCatalogForm] = useState<CatalogForm>(emptyCatalogForm());
  const [existingCode, setExistingCode] = useState("");

  const load = useCallback(async (opts?: { silent?: boolean }) => {
    const silent = opts?.silent === true;
    if (!silent) {
      setLoading(true);
      setMsg(null);
    }
    try {
      let data: {
        success?: boolean;
        storeTypes?: string[];
        catalog?: MerchantOnboardingDocumentTypeRow[];
        requirements?: MerchantStoreTypeDocumentMapRow[];
        cuisineFlags?: Record<string, boolean>;
        error?: string;
        code?: string;
      } = {};
      let res: Response | null = null;
      for (let i = 0; i < 3; i++) {
        res = await fetch("/api/super-admin/merchant-onboarding-document-types", {
          cache: "no-store",
          credentials: "include",
        });
        data = (await res.json().catch(() => ({}))) as typeof data;
        const code = String(data.code ?? "").toUpperCase();
        const retryable =
          res.status === 503 ||
          code === "SERVICE_UNAVAILABLE" ||
          code === "SESSION_REQUIRED" ||
          (res.status === 401 && code !== "SESSION_INVALID");
        if (res.ok && data.success) break;
        if (!retryable || i === 2) break;
        await new Promise((r) => setTimeout(r, 400 * (i + 1)));
      }
      if (!res || !res.ok || !data.success) {
        const code = String(data.code ?? "").toUpperCase();
        if (code === "SESSION_REQUIRED" || res?.status === 503 || code === "SERVICE_UNAVAILABLE") {
          return;
        }
        throw new Error(data.error || "Failed to load");
      }
      const types = Array.from(
        new Set((data.storeTypes ?? []).map((t) => t.toUpperCase()).filter((t) => t !== "RIDER"))
      );
      setStoreTypes(types);
      setCatalog(data.catalog ?? []);
      setRequirements(data.requirements ?? []);
      setCuisineFlags(data.cuisineFlags ?? {});
      setSelectedType((prev) => {
        if (prev && types.includes(prev)) return prev;
        return types[0] ?? "";
      });
    } catch (e) {
      setMsg({ type: "err", text: e instanceof Error ? e.message : "Load failed" });
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const catalogByCode = useMemo(() => {
    const m = new Map<string, MerchantOnboardingDocumentTypeRow>();
    for (const row of catalog) m.set(normKey(row.code), row);
    return m;
  }, [catalog]);

  const filteredTypes = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return storeTypes;
    return storeTypes.filter((t) => {
      const label = formatStoreTypeLabel(t).toLowerCase();
      return t.toLowerCase().includes(q) || label.includes(q);
    });
  }, [storeTypes, query]);

  const rowsForType = useMemo(() => {
    const seen = new Set<string>();
    return requirements
      .filter((r) => normKey(r.storeType) === selectedType)
      .filter((r) => {
        const k = r.documentCode.toUpperCase();
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      })
      .sort((a, b) => a.displayOrder - b.displayOrder || a.id - b.id);
  }, [requirements, selectedType]);

  const availableToAdd = useMemo(() => {
    const used = new Set(rowsForType.map((r) => normKey(r.documentCode)));
    return catalog.filter((c) => c.isActive && !used.has(normKey(c.code)));
  }, [catalog, rowsForType]);

  const activeCount = rowsForType.filter((r) => r.isActive).length;
  const mandatoryCount = rowsForType.filter((r) => r.isActive && r.isMandatory).length;

  const nextDisplayOrder = () => {
    const max = rowsForType.reduce((acc, r) => Math.max(acc, r.displayOrder || 0), 0);
    return max + 10;
  };

  const openCreate = () => {
    setEditCatalogId(null);
    setExistingCode("");
    setCatalogForm({ ...emptyCatalogForm(), displayOrder: nextDisplayOrder() });
    setSheetOpen(true);
  };

  const openEdit = (row: MerchantStoreTypeDocumentMapRow) => {
    const cat = catalogByCode.get(normKey(row.documentCode));
    setEditCatalogId(cat?.id ?? null);
    setExistingCode(row.documentCode);
    setCatalogForm({
      code: row.documentCode,
      label: cat?.label ?? row.documentCode,
      hint: cat?.hint ?? "",
      formSection: cat?.formSection ?? "LICENCE",
      sortOrder: cat?.sortOrder ?? row.displayOrder,
      displayOrder: row.displayOrder,
      isActive: cat?.isActive ?? row.isActive,
      isMandatory: row.isMandatory,
    });
    setSheetOpen(true);
  };

  const saveRequirement = async (payload: {
    storeType: string;
    documentCode: string;
    isMandatory?: boolean;
    isActive?: boolean;
    displayOrder?: number;
  }): Promise<MerchantStoreTypeDocumentMapRow | null> => {
    const res = await fetch("/api/super-admin/merchant-onboarding-document-types/requirements", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = (await res.json()) as {
      success?: boolean;
      error?: string;
      row?: MerchantStoreTypeDocumentMapRow;
    };
    if (!res.ok || !data.success) throw new Error(data.error || "Save failed");
    if (data.row) {
      setRequirements((prev) => {
        const idx = prev.findIndex(
          (r) =>
            r.storeType.toUpperCase() === data.row!.storeType.toUpperCase() &&
            r.documentCode.toUpperCase() === data.row!.documentCode.toUpperCase()
        );
        if (idx >= 0) {
          const next = [...prev];
          next[idx] = data.row!;
          return next;
        }
        return [...prev, data.row!];
      });
    }
    return data.row ?? null;
  };

  const saveSheet = async () => {
    if (!selectedType) return;
    setSaving(true);
    setMsg(null);
    try {
      let code = catalogForm.code.trim().toUpperCase().replace(/\s+/g, "_");
      if (!editCatalogId && existingCode) code = existingCode;
      const catId = editCatalogId ?? catalogByCode.get(normKey(code))?.id ?? null;
      const url = catId
        ? `/api/super-admin/merchant-onboarding-document-types/${catId}`
        : "/api/super-admin/merchant-onboarding-document-types";
      const res = await fetch(url, {
        method: catId ? "PATCH" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          code,
          label: catalogForm.label,
          hint: catalogForm.hint || null,
          formSection: catalogForm.formSection,
          sortOrder: catalogForm.sortOrder,
          isActive: true,
        }),
      });
      const data = (await res.json()) as {
        success?: boolean;
        error?: string;
        row?: MerchantOnboardingDocumentTypeRow;
      };
      if (!res.ok || !data.success) throw new Error(data.error || "Save failed");
      if (data.row) {
        setCatalog((prev) => {
          const idx = prev.findIndex((c) => c.id === data.row!.id);
          if (idx >= 0) {
            const next = [...prev];
            next[idx] = data.row!;
            return next;
          }
          return [...prev, data.row!];
        });
      }
      await saveRequirement({
        storeType: selectedType,
        documentCode: code,
        isMandatory: catalogForm.isMandatory,
        isActive: true,
        displayOrder: catalogForm.displayOrder,
      });
      setSheetOpen(false);
      setMsg({ type: "ok", text: editCatalogId || existingCode ? "Document updated" : "Document added" });
    } catch (e) {
      setMsg({ type: "err", text: e instanceof Error ? e.message : "Save failed" });
    } finally {
      setSaving(false);
    }
  };

  const toggleMandatory = async (row: MerchantStoreTypeDocumentMapRow) => {
    try {
      await saveRequirement({
        storeType: row.storeType,
        documentCode: row.documentCode,
        isMandatory: !row.isMandatory,
        isActive: row.isActive,
        displayOrder: row.displayOrder,
      });
    } catch (e) {
      setMsg({ type: "err", text: e instanceof Error ? e.message : "Failed" });
    }
  };

  const toggleRowActive = async (row: MerchantStoreTypeDocumentMapRow) => {
    const next = !row.isActive;
    const keyStore = row.storeType.toUpperCase();
    const keyCode = row.documentCode.toUpperCase();
    setRequirements((prev) =>
      prev.map((r) =>
        r.storeType.toUpperCase() === keyStore && r.documentCode.toUpperCase() === keyCode
          ? { ...r, isActive: next }
          : r
      )
    );
    try {
      await saveRequirement({
        storeType: row.storeType,
        documentCode: row.documentCode,
        isMandatory: row.isMandatory,
        isActive: next,
        displayOrder: row.displayOrder,
      });
      const label = catalogByCode.get(normKey(row.documentCode))?.label ?? row.documentCode;
      toast.success(`${label} ${next ? "active" : "inactive"}`);
    } catch (e) {
      setRequirements((prev) =>
        prev.map((r) =>
          r.storeType.toUpperCase() === keyStore && r.documentCode.toUpperCase() === keyCode
            ? { ...r, isActive: row.isActive }
            : r
        )
      );
      const errText = e instanceof Error ? e.message : "Failed to update status";
      setMsg({ type: "err", text: errText });
      toast.error(errText);
    }
  };

  const setRowDisplayOrder = async (
    row: MerchantStoreTypeDocumentMapRow,
    fromSerial: number,
    raw: number
  ) => {
    const n = rowsForType.length;
    if (n < 1) return;
    const toSerial = Number.isFinite(raw) ? Math.trunc(raw) : fromSerial;
    const clamped = Math.min(n, Math.max(1, toSerial));
    if (clamped === fromSerial) return;
    const other = rowsForType[clamped - 1];
    if (!other || other.documentCode === row.documentCode) return;

    try {
      if (other.displayOrder === row.displayOrder) {
        const next = [...rowsForType];
        const a = fromSerial - 1;
        const b = clamped - 1;
        const tmp = next[a]!;
        next[a] = next[b]!;
        next[b] = tmp;
        await Promise.all(
          next.map((r, i) =>
            saveRequirement({
              storeType: r.storeType,
              documentCode: r.documentCode,
              isMandatory: r.isMandatory,
              isActive: true,
              displayOrder: i + 1,
            })
          )
        );
      } else {
        await Promise.all([
          saveRequirement({
            storeType: row.storeType,
            documentCode: row.documentCode,
            isMandatory: row.isMandatory,
            isActive: true,
            displayOrder: other.displayOrder,
          }),
          saveRequirement({
            storeType: other.storeType,
            documentCode: other.documentCode,
            isMandatory: other.isMandatory,
            isActive: true,
            displayOrder: row.displayOrder,
          }),
        ]);
      }
    } catch (e) {
      setMsg({ type: "err", text: e instanceof Error ? e.message : "Failed to save order" });
      toast.error(e instanceof Error ? e.message : "Failed to save order");
    }
  };

  const deactivateRequirement = async (row: MerchantStoreTypeDocumentMapRow) => {
    const docLabel = catalogByCode.get(normKey(row.documentCode))?.label ?? row.documentCode;
    const typeLabel = formatStoreTypeLabel(row.storeType);
    if (!confirm(`Remove ${docLabel} from ${typeLabel}?`)) return;
    try {
      const res = await fetch("/api/super-admin/merchant-onboarding-document-types/requirements", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ storeType: row.storeType, documentCode: row.documentCode }),
      });
      const data = (await res.json()) as { success?: boolean; error?: string };
      if (!res.ok || !data.success) throw new Error(data.error || "Failed");
      const text = `${docLabel} removed from ${typeLabel}`;
      setMsg({ type: "ok", text });
      toast.success(text);
      setRequirements((prev) =>
        prev.filter(
          (r) =>
            !(
              r.storeType.toUpperCase() === row.storeType.toUpperCase() &&
              r.documentCode.toUpperCase() === row.documentCode.toUpperCase()
            )
        )
      );
    } catch (e) {
      const errText = e instanceof Error ? e.message : "Failed";
      setMsg({ type: "err", text: errText });
      toast.error(errText);
    }
  };

  const cuisineEnabled =
    selectedType in cuisineFlags
      ? cuisineFlags[selectedType] === true
      : defaultCuisineListEnabled(selectedType);

  const toggleCuisineList = async () => {
    if (!selectedType) return;
    const next = !cuisineEnabled;
    setCuisineFlags((prev) => ({ ...prev, [selectedType]: next }));
    try {
      const res = await fetch("/api/super-admin/merchant-onboarding-document-types/cuisine-flag", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ storeType: selectedType, cuisineListEnabled: next }),
      });
      const data = (await res.json()) as { success?: boolean; error?: string };
      if (!res.ok || !data.success) throw new Error(data.error || "Failed");
    } catch (e) {
      setCuisineFlags((prev) => ({ ...prev, [selectedType]: !next }));
      setMsg({ type: "err", text: e instanceof Error ? e.message : "Failed to save cuisine flag" });
    }
  };

  const applyExisting = (code: string) => {
    setExistingCode(code);
    const cat = catalogByCode.get(normKey(code));
    if (!cat) return;
    setCatalogForm({
      code: cat.code,
      label: cat.label,
      hint: cat.hint ?? "",
      formSection: cat.formSection,
      sortOrder: cat.sortOrder,
      displayOrder: nextDisplayOrder(),
      isActive: cat.isActive,
      isMandatory: false,
    });
  };

  return (
    <div className="space-y-4">
      {msg ? (
        <div
          className={`rounded-xl px-4 py-3 text-sm ${
            msg.type === "ok"
              ? "bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200"
              : "bg-red-50 text-red-700 ring-1 ring-red-200"
          }`}
        >
          {msg.text}
        </div>
      ) : null}

      <div className="grid gap-3 lg:grid-cols-[200px_minmax(0,1fr)]">
        <aside className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
          <div className="mb-2 flex items-center justify-between gap-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Store types
            </p>
            <button
              type="button"
              onClick={() => void load({ silent: true })}
              className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100"
              title="Refresh"
            >
              <RefreshCw className="h-4 w-4" />
            </button>
          </div>
          <div className="relative mb-3">
            <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
            <input
              className="w-full rounded-lg border border-slate-200 bg-slate-50 py-2 pl-8 pr-3 text-sm"
              placeholder="Search types"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          {loading ? (
            <div className="flex items-center gap-2 text-sm text-slate-500">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading…
            </div>
          ) : (
            <div className="max-h-[62vh] space-y-1 overflow-y-auto pr-1">
              {filteredTypes.map((t) => {
                const count = requirements.filter(
                  (r) => r.storeType.toUpperCase() === t && r.isActive
                ).length;
                const active = selectedType === t;
                return (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setSelectedType(t)}
                    className={`flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-sm transition ${
                      active
                        ? "bg-sky-600 text-white shadow-sm"
                        : "text-slate-700 hover:bg-slate-50"
                    }`}
                  >
                    <span className="truncate font-medium">{formatStoreTypeLabel(t)}</span>
                    <span
                      className={`ml-2 rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${
                        active ? "bg-white/20 text-white" : "bg-slate-100 text-slate-500"
                      }`}
                    >
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </aside>

        <section className="min-w-0 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 shadow-sm">
            <div>
              <h2 className="text-base font-semibold text-slate-900">
                {selectedType ? formatStoreTypeLabel(selectedType) : "Select a store type"}
              </h2>
              <p className="text-xs text-slate-500">
                {activeCount} active · {mandatoryCount} mandatory
                {rowsForType.length > activeCount
                  ? ` · ${rowsForType.length - activeCount} inactive`
                  : ""}
              </p>
            </div>
            <button
              type="button"
              onClick={openCreate}
              disabled={!selectedType}
              className="inline-flex items-center gap-1 rounded-lg bg-sky-600 px-2.5 py-1.5 text-sm font-semibold text-white hover:bg-sky-700 disabled:opacity-50"
            >
              <Plus className="h-4 w-4" />
              Add document
            </button>
          </div>

          {selectedType ? (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-indigo-100 bg-indigo-50/70 px-4 py-3">
              <div className="flex items-start gap-2.5">
                <Utensils className="mt-0.5 h-4 w-4 text-indigo-600" />
                <div>
                  <p className="text-sm font-semibold text-slate-900">Cuisine list in onboarding</p>
                  <p className="text-xs text-slate-600">
                    When active, Step 5 shows the cuisine picker and menu categories/items require cuisine for{" "}
                    {formatStoreTypeLabel(selectedType)} stores. When off, cuisine is hidden and not required.
                  </p>
                </div>
              </div>
              <InstantSwitch
                checked={cuisineEnabled}
                onToggle={() => void toggleCuisineList()}
              />
            </div>
          ) : null}

          {loading ? (
            <div className="flex items-center gap-2 text-slate-500">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading documents…
            </div>
          ) : rowsForType.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-300 bg-white px-4 py-10 text-center text-sm text-slate-500">
              No documents for this store type yet. Add PAN, Aadhaar, FSSAI, or any other required file.
            </div>
          ) : (
            <div className="overflow-hidden rounded-xl border bg-white shadow-sm">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50 text-left text-slate-600">
                  <tr>
                    <th className="px-4 py-3 w-20">#</th>
                    <th className="px-4 py-3">Code</th>
                    <th className="px-4 py-3">Label</th>
                    <th className="px-4 py-3">Section</th>
                    <th className="px-4 py-3">Requirement</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {rowsForType.map((row, index) => {
                    const cat = catalogByCode.get(normKey(row.documentCode));
                    const serial = index + 1;
                    return (
                      <tr
                        key={`${row.storeType}-${row.documentCode}`}
                        className={`border-t ${row.isActive ? "" : "bg-slate-50/90"}`}
                      >
                        <td className="px-4 py-3">
                          <input
                            type="number"
                            min={1}
                            max={rowsForType.length}
                            className="w-16 rounded-lg border border-slate-200 px-2 py-1 text-sm"
                            defaultValue={serial}
                            key={`${row.documentCode}-${serial}-${row.displayOrder}`}
                            onBlur={(e) =>
                              void setRowDisplayOrder(row, serial, Number(e.target.value))
                            }
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                e.currentTarget.blur();
                              }
                            }}
                            title="Serial in onboarding. Changing this swaps with the document already at that number."
                          />
                        </td>
                        <td className="px-4 py-3 font-mono text-xs">{row.documentCode}</td>
                        <td className="px-4 py-3">{cat?.label ?? row.documentCode}</td>
                        <td className="px-4 py-3">{cat?.formSection ?? "—"}</td>
                        <td className="px-4 py-3">
                          <button
                            type="button"
                            onClick={() => void toggleMandatory(row)}
                            className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${
                              row.isMandatory
                                ? "bg-amber-50 text-amber-800 ring-1 ring-amber-200"
                                : "bg-slate-100 text-slate-600"
                            }`}
                          >
                            {row.isMandatory ? (
                              <ShieldAlert className="h-3.5 w-3.5" />
                            ) : (
                              <ShieldCheck className="h-3.5 w-3.5" />
                            )}
                            {row.isMandatory ? "Mandatory" : "Optional"}
                          </button>
                        </td>
                        <td className="px-4 py-3">
                          <InstantSwitch
                            checked={row.isActive}
                            onToggle={() => void toggleRowActive(row)}
                          />
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex gap-2">
                            <button
                              type="button"
                              onClick={() => openEdit(row)}
                              className="inline-flex items-center gap-1 rounded border px-2 py-1 text-xs"
                            >
                              <Pencil className="h-3 w-3" />
                              Edit
                            </button>
                            <button
                              type="button"
                              onClick={() => void deactivateRequirement(row)}
                              className="inline-flex items-center gap-1 rounded border border-red-200 px-2 py-1 text-xs text-red-600"
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
        </section>
      </div>

      <AdminSideSheet
        open={sheetOpen}
        title={editCatalogId ? "Edit document type" : "Add document"}
        subtitle={
          selectedType
            ? `Applies to ${formatStoreTypeLabel(selectedType)} onboarding`
            : undefined
        }
        onClose={() => setSheetOpen(false)}
        onSubmit={() => {
          if (!saving) void saveSheet();
        }}
        footer={
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={saving}
              className="rounded-xl bg-sky-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
            >
              {saving ? "Saving…" : "Save"}
            </button>
            <button
              type="button"
              onClick={() => setSheetOpen(false)}
              className="rounded-xl border px-4 py-2 text-sm"
            >
              Cancel
            </button>
          </div>
        }
      >
        <div className="space-y-4">
          {!editCatalogId && availableToAdd.length > 0 ? (
            <label className="block text-sm">
              <span className="font-medium text-slate-700">Use existing type</span>
              <select
                className="mt-1 w-full rounded-xl border px-3 py-2"
                value={existingCode}
                onChange={(e) => {
                  const v = e.target.value;
                  if (!v) {
                    setExistingCode("");
                    setCatalogForm({ ...emptyCatalogForm(), displayOrder: nextDisplayOrder() });
                    return;
                  }
                  applyExisting(v);
                }}
              >
                <option value="">Create a new type</option>
                {availableToAdd.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.label} ({c.code})
                  </option>
                ))}
              </select>
            </label>
          ) : null}

          <div>
            <p className="mb-2 text-sm font-medium text-slate-700">Requirement</p>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setCatalogForm((f) => ({ ...f, isMandatory: true }))}
                className={`rounded-xl border px-3 py-2.5 text-sm font-semibold ${
                  catalogForm.isMandatory
                    ? "border-amber-300 bg-amber-50 text-amber-900"
                    : "border-slate-200 text-slate-600"
                }`}
              >
                Mandatory
              </button>
              <button
                type="button"
                onClick={() => setCatalogForm((f) => ({ ...f, isMandatory: false }))}
                className={`rounded-xl border px-3 py-2.5 text-sm font-semibold ${
                  !catalogForm.isMandatory
                    ? "border-slate-300 bg-slate-50 text-slate-900"
                    : "border-slate-200 text-slate-600"
                }`}
              >
                Optional
              </button>
            </div>
          </div>

          <label className="block text-sm">
            <span className="font-medium text-slate-700">Code</span>
            <input
              className="mt-1 w-full rounded-xl border px-3 py-2"
              value={catalogForm.code}
              disabled={Boolean(editCatalogId || existingCode)}
              onChange={(e) => setCatalogForm((f) => ({ ...f, code: e.target.value }))}
              placeholder="FSSAI"
            />
          </label>
          <label className="block text-sm">
            <span className="font-medium text-slate-700">Label</span>
            <input
              className="mt-1 w-full rounded-xl border px-3 py-2"
              value={catalogForm.label}
              onChange={(e) => setCatalogForm((f) => ({ ...f, label: e.target.value }))}
            />
          </label>
          <label className="block text-sm">
            <span className="font-medium text-slate-700">Hint</span>
            <textarea
              className="mt-1 w-full rounded-xl border px-3 py-2"
              rows={2}
              value={catalogForm.hint}
              onChange={(e) => setCatalogForm((f) => ({ ...f, hint: e.target.value }))}
            />
          </label>
          <label className="block text-sm">
            <span className="font-medium text-slate-700">Onboarding section</span>
            <select
              className="mt-1 w-full rounded-xl border px-3 py-2"
              value={catalogForm.formSection}
              onChange={(e) =>
                setCatalogForm((f) => ({
                  ...f,
                  formSection: e.target.value as CatalogForm["formSection"],
                }))
              }
            >
              {FORM_SECTIONS.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            <span className="font-medium text-slate-700">Display number</span>
            <input
              type="number"
              min={0}
              className="mt-1 w-full rounded-xl border px-3 py-2"
              value={catalogForm.displayOrder}
              onChange={(e) =>
                setCatalogForm((f) => ({ ...f, displayOrder: Number(e.target.value) }))
              }
            />
            <span className="mt-1 block text-xs text-slate-500">
              Position in AM and partner child onboarding. Lower numbers show first (1, 2, 3…).
            </span>
          </label>
          <label className="block text-sm">
            <span className="font-medium text-slate-700">Catalog sort order</span>
            <input
              type="number"
              className="mt-1 w-full rounded-xl border px-3 py-2"
              value={catalogForm.sortOrder}
              onChange={(e) =>
                setCatalogForm((f) => ({ ...f, sortOrder: Number(e.target.value) }))
              }
            />
          </label>
        </div>
      </AdminSideSheet>
    </div>
  );
}
