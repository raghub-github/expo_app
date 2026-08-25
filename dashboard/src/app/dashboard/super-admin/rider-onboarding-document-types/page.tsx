"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Bike,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  Store,
  Trash2,
} from "lucide-react";
import type { RiderOnboardingDocumentTypeRow } from "@/lib/db/operations/rider-onboarding-document-types";
import MerchantDocTypesPanel from "./MerchantDocTypesPanel";
import AdminSideSheet from "./AdminSideSheet";

const CAPTURE_GROUPS = [
  { value: "dl_rc", label: "DL / RC screen" },
  { value: "rental_ev", label: "Rental / EV screen" },
] as const;

type FormState = {
  code: string;
  label: string;
  hint: string;
  icon: string;
  captureGroup: "dl_rc" | "rental_ev";
  requiresTextField: boolean;
  textFieldLabel: string;
  textFieldPlaceholder: string;
  minTextLength: number;
  sortOrder: number;
  isActive: boolean;
};

const emptyForm = (): FormState => ({
  code: "",
  label: "",
  hint: "",
  icon: "document-outline",
  captureGroup: "dl_rc",
  requiresTextField: false,
  textFieldLabel: "",
  textFieldPlaceholder: "",
  minTextLength: 4,
  sortOrder: 0,
  isActive: true,
});

function rowToForm(row: RiderOnboardingDocumentTypeRow): FormState {
  return {
    code: row.code,
    label: row.label,
    hint: row.hint ?? "",
    icon: row.icon ?? "",
    captureGroup: row.captureGroup,
    requiresTextField: row.requiresTextField,
    textFieldLabel: row.textFieldLabel ?? "",
    textFieldPlaceholder: row.textFieldPlaceholder ?? "",
    minTextLength: row.minTextLength,
    sortOrder: row.sortOrder,
    isActive: row.isActive,
  };
}

export default function RiderOnboardingDocumentTypesPage() {
  const [audience, setAudience] = useState<"rider" | "merchant">("rider");
  const [rows, setRows] = useState<RiderOnboardingDocumentTypeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [showForm, setShowForm] = useState(false);

  const load = useCallback(async (opts?: { silent?: boolean }) => {
    const silent = opts?.silent === true;
    if (!silent) {
      setLoading(true);
      setMsg(null);
    }
    try {
      let data: {
        success?: boolean;
        rows?: RiderOnboardingDocumentTypeRow[];
        error?: string;
        code?: string;
      } = {};
      let res: Response | null = null;
      for (let i = 0; i < 3; i++) {
        res = await fetch("/api/super-admin/rider-onboarding-document-types", {
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
      setRows(data.rows ?? []);
    } catch (e) {
      setMsg({ type: "err", text: e instanceof Error ? e.message : "Load failed" });
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const sortedRows = useMemo(() => {
    const seen = new Set<string>();
    return [...rows]
      .sort(
        (a, b) =>
          a.captureGroup.localeCompare(b.captureGroup) ||
          a.sortOrder - b.sortOrder ||
          a.id - b.id
      )
      .filter((row) => {
        const key = row.code.trim().toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
  }, [rows]);

  const startCreate = () => {
    setEditId(null);
    setForm(emptyForm());
    setShowForm(true);
  };

  const startEdit = (row: RiderOnboardingDocumentTypeRow) => {
    setEditId(row.id);
    setForm(rowToForm(row));
    setShowForm(true);
  };

  const save = async () => {
    setSaving(true);
    setMsg(null);
    try {
      const payload = {
        code: form.code,
        label: form.label,
        hint: form.hint || null,
        icon: form.icon || null,
        captureGroup: form.captureGroup,
        requiresTextField: form.requiresTextField,
        textFieldLabel: form.textFieldLabel || null,
        textFieldPlaceholder: form.textFieldPlaceholder || null,
        minTextLength: form.minTextLength,
        sortOrder: form.sortOrder,
        isActive: form.isActive,
      };
      const url = editId
        ? `/api/super-admin/rider-onboarding-document-types/${editId}`
        : "/api/super-admin/rider-onboarding-document-types";
      const res = await fetch(url, {
        method: editId ? "PATCH" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = (await res.json()) as {
        success?: boolean;
        error?: string;
        row?: RiderOnboardingDocumentTypeRow;
      };
      if (!res.ok || !data.success) throw new Error(data.error || "Save failed");
      if (data.row) {
        setRows((prev) => {
          const idx = prev.findIndex((r) => r.id === data.row!.id);
          if (idx >= 0) {
            const next = [...prev];
            next[idx] = data.row!;
            return next;
          }
          return [...prev, data.row!];
        });
      } else {
        void load({ silent: true });
      }
      setShowForm(false);
      setMsg({ type: "ok", text: editId ? "Document type updated" : "Document type created" });
    } catch (e) {
      setMsg({ type: "err", text: e instanceof Error ? e.message : "Save failed" });
    } finally {
      setSaving(false);
    }
  };

  const deactivate = async (id: number) => {
    if (!confirm("Deactivate this document type?")) return;
    setMsg(null);
    try {
      const res = await fetch(`/api/super-admin/rider-onboarding-document-types/${id}`, {
        method: "DELETE",
      });
      const data = (await res.json()) as { success?: boolean; error?: string };
      if (!res.ok || !data.success) throw new Error(data.error || "Failed");
      setMsg({ type: "ok", text: "Document type deactivated" });
      setRows((prev) =>
        prev.map((r) => (r.id === id ? { ...r, isActive: false } : r))
      );
    } catch (e) {
      setMsg({ type: "err", text: e instanceof Error ? e.message : "Failed" });
    }
  };

  return (
    <div className="min-h-full bg-slate-50">
      <div className="border-b border-slate-200 bg-white">
        <div className="flex flex-wrap items-center justify-end gap-1 px-3 py-2 sm:px-4">
          <div className="inline-flex rounded-lg bg-slate-100 p-0.5">
            <button
              type="button"
              onClick={() => setAudience("rider")}
              className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1.5 text-sm font-semibold ${
                audience === "rider" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500"
              }`}
            >
              <Bike className="h-4 w-4" />
              Rider
            </button>
            <button
              type="button"
              onClick={() => setAudience("merchant")}
              className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1.5 text-sm font-semibold ${
                audience === "merchant" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500"
              }`}
            >
              <Store className="h-4 w-4" />
              Merchant
            </button>
          </div>
          {audience === "rider" ? (
            <>
              <button
                type="button"
                onClick={() => void load()}
                className="inline-flex items-center gap-1 rounded-lg border bg-white px-2.5 py-1.5 text-sm"
              >
                <RefreshCw className="h-4 w-4" />
                Refresh
              </button>
              <button
                type="button"
                onClick={startCreate}
                className="inline-flex items-center gap-1 rounded-lg bg-sky-600 px-2.5 py-1.5 text-sm font-semibold text-white"
              >
                <Plus className="h-4 w-4" />
                Add document
              </button>
            </>
          ) : null}
        </div>
      </div>

      <div className="w-full min-w-0 space-y-3 px-3 py-3 sm:px-4">
        {audience === "merchant" ? <MerchantDocTypesPanel /> : null}

        {audience === "rider" ? (
          <>
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

            {loading ? (
              <div className="flex items-center gap-2 text-slate-500">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading…
              </div>
            ) : (
              <div className="overflow-hidden rounded-xl border bg-white shadow-sm">
                <table className="min-w-full text-sm">
                  <thead className="bg-slate-50 text-left text-slate-600">
                    <tr>
                      <th className="px-4 py-3">Code</th>
                      <th className="px-4 py-3">Label</th>
                      <th className="px-4 py-3">Screen</th>
                      <th className="px-4 py-3">Text field</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedRows.map((row) => (
                      <tr key={row.id} className="border-t">
                        <td className="px-4 py-3 font-mono text-xs">{row.code}</td>
                        <td className="px-4 py-3">{row.label}</td>
                        <td className="px-4 py-3">{row.captureGroup}</td>
                        <td className="px-4 py-3">{row.requiresTextField ? "Yes" : "No"}</td>
                        <td className="px-4 py-3">
                          <span
                            className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                              row.isActive
                                ? "bg-emerald-50 text-emerald-700"
                                : "bg-slate-100 text-slate-500"
                            }`}
                          >
                            {row.isActive ? "Active" : "Inactive"}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex gap-2">
                            <button
                              type="button"
                              onClick={() => startEdit(row)}
                              className="inline-flex items-center gap-1 rounded border px-2 py-1 text-xs"
                            >
                              <Pencil className="h-3 w-3" />
                              Edit
                            </button>
                            {row.isActive ? (
                              <button
                                type="button"
                                onClick={() => void deactivate(row.id)}
                                className="inline-flex items-center gap-1 rounded border border-red-200 px-2 py-1 text-xs text-red-600"
                              >
                                <Trash2 className="h-3 w-3" />
                                Deactivate
                              </button>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <AdminSideSheet
              open={showForm}
              title={editId ? "Edit document type" : "New document"}
              subtitle="Shown dynamically in the rider onboarding app"
              onClose={() => setShowForm(false)}
              onSubmit={() => {
                if (!saving) void save();
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
                    onClick={() => setShowForm(false)}
                    className="rounded-xl border px-4 py-2 text-sm"
                  >
                    Cancel
                  </button>
                </div>
              }
            >
              <div className="space-y-4">
                <label className="block text-sm">
                  <span className="font-medium text-slate-700">Code</span>
                  <input
                    className="mt-1 w-full rounded-xl border px-3 py-2"
                    value={form.code}
                    onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))}
                    placeholder="insurance_proof"
                  />
                </label>
                <label className="block text-sm">
                  <span className="font-medium text-slate-700">Label</span>
                  <input
                    className="mt-1 w-full rounded-xl border px-3 py-2"
                    value={form.label}
                    onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))}
                  />
                </label>
                <label className="block text-sm">
                  <span className="font-medium text-slate-700">Hint</span>
                  <textarea
                    className="mt-1 w-full rounded-xl border px-3 py-2"
                    rows={2}
                    value={form.hint}
                    onChange={(e) => setForm((f) => ({ ...f, hint: e.target.value }))}
                  />
                </label>
                <label className="block text-sm">
                  <span className="font-medium text-slate-700">Icon (Ionicons)</span>
                  <input
                    className="mt-1 w-full rounded-xl border px-3 py-2"
                    value={form.icon}
                    onChange={(e) => setForm((f) => ({ ...f, icon: e.target.value }))}
                  />
                </label>
                <label className="block text-sm">
                  <span className="font-medium text-slate-700">Capture screen</span>
                  <select
                    className="mt-1 w-full rounded-xl border px-3 py-2"
                    value={form.captureGroup}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        captureGroup: e.target.value as FormState["captureGroup"],
                      }))
                    }
                  >
                    {CAPTURE_GROUPS.map((g) => (
                      <option key={g.value} value={g.value}>
                        {g.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block text-sm">
                  <span className="font-medium text-slate-700">Sort order</span>
                  <input
                    type="number"
                    className="mt-1 w-full rounded-xl border px-3 py-2"
                    value={form.sortOrder}
                    onChange={(e) => setForm((f) => ({ ...f, sortOrder: Number(e.target.value) }))}
                  />
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={form.requiresTextField}
                    onChange={(e) => setForm((f) => ({ ...f, requiresTextField: e.target.checked }))}
                  />
                  Requires text field (e.g. DL/RC number)
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={form.isActive}
                    onChange={(e) => setForm((f) => ({ ...f, isActive: e.target.checked }))}
                  />
                  Active
                </label>
                {form.requiresTextField ? (
                  <>
                    <label className="block text-sm">
                      <span className="font-medium text-slate-700">Text field label</span>
                      <input
                        className="mt-1 w-full rounded-xl border px-3 py-2"
                        value={form.textFieldLabel}
                        onChange={(e) => setForm((f) => ({ ...f, textFieldLabel: e.target.value }))}
                      />
                    </label>
                    <label className="block text-sm">
                      <span className="font-medium text-slate-700">Text placeholder</span>
                      <input
                        className="mt-1 w-full rounded-xl border px-3 py-2"
                        value={form.textFieldPlaceholder}
                        onChange={(e) =>
                          setForm((f) => ({ ...f, textFieldPlaceholder: e.target.value }))
                        }
                      />
                    </label>
                    <label className="block text-sm">
                      <span className="font-medium text-slate-700">Min text length</span>
                      <input
                        type="number"
                        className="mt-1 w-full rounded-xl border px-3 py-2"
                        value={form.minTextLength}
                        onChange={(e) =>
                          setForm((f) => ({ ...f, minTextLength: Number(e.target.value) }))
                        }
                      />
                    </label>
                  </>
                ) : null}
              </div>
            </AdminSideSheet>
          </>
        ) : null}
      </div>
    </div>
  );
}
