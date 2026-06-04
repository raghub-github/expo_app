"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, FileText, Loader2, Pencil, Plus, RefreshCw, Trash2 } from "lucide-react";
import type { RiderOnboardingDocumentTypeRow } from "@/lib/db/operations/rider-onboarding-document-types";

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
  const [rows, setRows] = useState<RiderOnboardingDocumentTypeRow[]>([]);
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
      const res = await fetch("/api/super-admin/rider-onboarding-document-types", {
        cache: "no-store",
      });
      const data = (await res.json()) as {
        success?: boolean;
        rows?: RiderOnboardingDocumentTypeRow[];
        error?: string;
      };
      if (!res.ok || !data.success) throw new Error(data.error || "Failed to load");
      setRows(data.rows ?? []);
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
    () =>
      [...rows].sort(
        (a, b) =>
          a.captureGroup.localeCompare(b.captureGroup) ||
          a.sortOrder - b.sortOrder ||
          a.id - b.id
      ),
    [rows]
  );

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
      const data = (await res.json()) as { success?: boolean; error?: string };
      if (!res.ok || !data.success) throw new Error(data.error || "Save failed");
      setShowForm(false);
      setMsg({ type: "ok", text: editId ? "Document type updated" : "Document type created" });
      await load();
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
      await load();
    } catch (e) {
      setMsg({ type: "err", text: e instanceof Error ? e.message : "Failed" });
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
              <FileText className="h-6 w-6 text-sky-600" />
              Rider document types
            </h1>
            <p className="text-sm text-slate-500">
              Define upload documents (DL, RC, rental proof, etc.) shown dynamically in the rider onboarding app.
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
            className="inline-flex items-center gap-2 rounded-lg bg-sky-600 px-3 py-2 text-sm font-semibold text-white"
          >
            <Plus className="h-4 w-4" />
            Add document
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
        <div className="space-y-4 rounded-xl border bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold">{editId ? "Edit document" : "New document"}</h2>
          <div className="grid gap-4 md:grid-cols-2">
            <label className="block text-sm">
              <span className="font-medium">Code</span>
              <input
                className="mt-1 w-full rounded-lg border px-3 py-2"
                value={form.code}
                onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))}
                placeholder="insurance_proof"
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
            <label className="block text-sm md:col-span-2">
              <span className="font-medium">Hint</span>
              <input
                className="mt-1 w-full rounded-lg border px-3 py-2"
                value={form.hint}
                onChange={(e) => setForm((f) => ({ ...f, hint: e.target.value }))}
              />
            </label>
            <label className="block text-sm">
              <span className="font-medium">Icon (Ionicons)</span>
              <input
                className="mt-1 w-full rounded-lg border px-3 py-2"
                value={form.icon}
                onChange={(e) => setForm((f) => ({ ...f, icon: e.target.value }))}
              />
            </label>
            <label className="block text-sm">
              <span className="font-medium">Capture screen</span>
              <select
                className="mt-1 w-full rounded-lg border px-3 py-2"
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
              <span className="font-medium">Sort order</span>
              <input
                type="number"
                className="mt-1 w-full rounded-lg border px-3 py-2"
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
                  <span className="font-medium">Text field label</span>
                  <input
                    className="mt-1 w-full rounded-lg border px-3 py-2"
                    value={form.textFieldLabel}
                    onChange={(e) => setForm((f) => ({ ...f, textFieldLabel: e.target.value }))}
                  />
                </label>
                <label className="block text-sm">
                  <span className="font-medium">Text placeholder</span>
                  <input
                    className="mt-1 w-full rounded-lg border px-3 py-2"
                    value={form.textFieldPlaceholder}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, textFieldPlaceholder: e.target.value }))
                    }
                  />
                </label>
                <label className="block text-sm">
                  <span className="font-medium">Min text length</span>
                  <input
                    type="number"
                    className="mt-1 w-full rounded-lg border px-3 py-2"
                    value={form.minTextLength}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, minTextLength: Number(e.target.value) }))
                    }
                  />
                </label>
              </>
            ) : null}
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={saving}
              onClick={() => void save()}
              className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
            >
              {saving ? "Saving…" : "Save"}
            </button>
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="rounded-lg border px-4 py-2 text-sm"
            >
              Cancel
            </button>
          </div>
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
    </div>
  );
}
