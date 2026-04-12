"use client";

import { useState } from "react";
import { Plus, Pencil, Trash2, X } from "lucide-react";
import type { TicketPriorityDefinition } from "@/store/api/superAdminApi";
import {
  useCreateTicketPriorityAdminMutation,
  useUpdateTicketPriorityAdminMutation,
  useDeleteTicketPriorityAdminMutation,
} from "@/store/api/superAdminApi";

function ActiveSwitch({
  active,
  busy,
  onToggle,
  ariaLabel,
}: {
  active: boolean;
  busy?: boolean;
  onToggle: () => void;
  ariaLabel: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={active}
      aria-label={ariaLabel}
      disabled={busy}
      onClick={onToggle}
      className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 disabled:opacity-50 disabled:cursor-not-allowed ${
        active ? "bg-emerald-500" : "bg-gray-200"
      }`}
    >
      <span
        className={`pointer-events-none mt-0.5 inline-block h-5 w-5 rounded-full bg-white shadow transition ${
          active ? "translate-x-5" : "translate-x-0.5"
        }`}
      />
    </button>
  );
}

type FormRow = Partial<TicketPriorityDefinition> & { priorityCode: string; displayName: string };

export function TicketPrioritiesPanel({
  priorities,
  onError,
}: {
  priorities: TicketPriorityDefinition[];
  onError: (msg: string) => void;
}) {
  const [form, setForm] = useState<FormRow | null>(null);
  const [saving, setSaving] = useState(false);
  const [togglingId, setTogglingId] = useState<number | null>(null);

  const [createMut] = useCreateTicketPriorityAdminMutation();
  const [updateMut] = useUpdateTicketPriorityAdminMutation();
  const [deleteMut] = useDeleteTicketPriorityAdminMutation();

  const toggleActive = async (p: TicketPriorityDefinition) => {
    setTogglingId(p.id);
    try {
      await updateMut({ id: p.id, updates: { isActive: !p.isActive } }).unwrap();
    } catch (e) {
      onError(e instanceof Error ? e.message : "Failed to update priority");
    } finally {
      setTogglingId(null);
    }
  };

  const create = async () => {
    if (!form?.priorityCode?.trim() || !form?.displayName?.trim()) {
      onError("Priority code and display name are required");
      return;
    }
    setSaving(true);
    try {
      await createMut({
        priorityCode: form.priorityCode.trim(),
        displayName: form.displayName.trim(),
        description: form.description?.trim() || null,
        sortOrder: form.sortOrder != null ? Number(form.sortOrder) : 0,
        colorHex: form.colorHex?.trim() || null,
        priorityLevel:
          form.priorityLevel != null && Number.isFinite(Number(form.priorityLevel)) ? Number(form.priorityLevel) : undefined,
        defaultSlaMinutes:
          form.defaultSlaMinutes != null && Number.isFinite(Number(form.defaultSlaMinutes))
            ? Number(form.defaultSlaMinutes)
            : undefined,
        displayIcon: form.displayIcon?.trim() || undefined,
      }).unwrap();
      setForm(null);
    } catch (e) {
      onError(e instanceof Error ? e.message : "Failed to create priority");
    } finally {
      setSaving(false);
    }
  };

  const saveEdit = async () => {
    if (!form?.id || !form.displayName?.trim()) {
      onError("Display name is required");
      return;
    }
    setSaving(true);
    try {
      await updateMut({
        id: form.id,
        updates: {
          priorityCode: form.priorityCode?.trim(),
          displayName: form.displayName.trim(),
          description: form.description?.trim() || null,
          sortOrder: form.sortOrder != null ? Number(form.sortOrder) : 0,
          colorHex: form.colorHex?.trim() || null,
          priorityLevel:
            form.priorityLevel != null && Number.isFinite(Number(form.priorityLevel)) ? Number(form.priorityLevel) : undefined,
          defaultSlaMinutes:
            form.defaultSlaMinutes != null && Number.isFinite(Number(form.defaultSlaMinutes))
              ? Number(form.defaultSlaMinutes)
              : undefined,
          displayIcon: form.displayIcon?.trim() || undefined,
        },
      }).unwrap();
      setForm(null);
    } catch (e) {
      onError(e instanceof Error ? e.message : "Failed to save priority");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: number) => {
    if (!confirm("Deactivate this priority? It will be hidden from new assignments.")) return;
    setSaving(true);
    try {
      await deleteMut(id).unwrap();
      setForm(null);
    } catch (e) {
      onError(e instanceof Error ? e.message : "Failed to deactivate priority");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="w-full min-w-0 space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-lg font-semibold text-gray-800">Ticket priorities</h2>
        <button
          type="button"
          onClick={() =>
            setForm({
              priorityCode: "",
              displayName: "",
              description: null,
              sortOrder: 100,
              colorHex: null,
              priorityLevel: undefined,
              defaultSlaMinutes: undefined,
              displayIcon: null,
            })
          }
          className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          <Plus className="h-4 w-4" /> Add priority
        </button>
      </div>

      {form && form.id == null && (
        <div className="p-4 rounded-lg border border-gray-200 bg-gray-50 space-y-3">
          <h3 className="font-medium text-gray-800">New priority</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Code (unique)</label>
              <input
                value={form.priorityCode}
                onChange={(e) => setForm((f) => f && { ...f, priorityCode: e.target.value })}
                placeholder="e.g. p1_escalation"
                className="w-full rounded border border-gray-300 px-3 py-2 text-sm font-mono"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Display name</label>
              <input
                value={form.displayName}
                onChange={(e) => setForm((f) => f && { ...f, displayName: e.target.value })}
                placeholder="e.g. P1 escalation"
                className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
              />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Priority level (optional)</label>
              <input
                type="number"
                min={1}
                value={form.priorityLevel === undefined || form.priorityLevel === null ? "" : form.priorityLevel}
                onChange={(e) =>
                  setForm((f) =>
                    f && {
                      ...f,
                      priorityLevel: e.target.value === "" ? undefined : Number(e.target.value),
                    }
                  )
                }
                placeholder="Auto next"
                className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Sort order</label>
              <input
                type="number"
                value={form.sortOrder ?? ""}
                onChange={(e) => setForm((f) => f && { ...f, sortOrder: e.target.value === "" ? 0 : Number(e.target.value) })}
                className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Default SLA (minutes)</label>
              <input
                type="number"
                min={0}
                value={form.defaultSlaMinutes === undefined || form.defaultSlaMinutes === null ? "" : form.defaultSlaMinutes}
                onChange={(e) =>
                  setForm((f) =>
                    f && {
                      ...f,
                      defaultSlaMinutes: e.target.value === "" ? undefined : Number(e.target.value),
                    }
                  )
                }
                className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Display icon (optional)</label>
              <input
                value={form.displayIcon ?? ""}
                onChange={(e) => setForm((f) => f && { ...f, displayIcon: e.target.value || null })}
                placeholder="e.g. alert-circle"
                className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Color (hex, optional)</label>
            <input
              value={form.colorHex ?? ""}
              onChange={(e) => setForm((f) => f && { ...f, colorHex: e.target.value || null })}
              placeholder="#64748b"
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm max-w-md"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Description</label>
            <input
              value={form.description ?? ""}
              onChange={(e) => setForm((f) => f && { ...f, description: e.target.value || null })}
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
            />
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={saving}
              onClick={() => void create()}
              className="rounded bg-blue-600 px-3 py-1.5 text-sm text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {saving ? "Saving..." : "Create"}
            </button>
            <button type="button" onClick={() => setForm(null)} className="rounded border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50">
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="rounded-lg border border-gray-200 overflow-x-auto">
        <table className="w-full text-sm min-w-[960px]">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="text-left py-2 px-3 font-medium text-gray-700">Code</th>
              <th className="text-left py-2 px-3 font-medium text-gray-700">Name</th>
              <th className="text-left py-2 px-3 font-medium text-gray-700">Level</th>
              <th className="text-left py-2 px-3 font-medium text-gray-700">Sort</th>
              <th className="text-left py-2 px-3 font-medium text-gray-700">SLA (min)</th>
              <th className="text-left py-2 px-3 font-medium text-gray-700">Color</th>
              <th className="text-left py-2 px-3 font-medium text-gray-700">Active</th>
              <th className="w-24" />
            </tr>
          </thead>
          <tbody>
            {priorities.length === 0 ? (
              <tr>
                <td colSpan={8} className="py-8 text-center text-gray-500">
                  No priorities found. Ensure <code className="text-xs">ticket_priorities</code> exists (migration 0194) or add a row above.
                </td>
              </tr>
            ) : (
              priorities.map((p) => (
                <tr key={p.id} className="border-b border-gray-100 hover:bg-gray-50/50">
                  <td className="py-2 px-3 font-mono text-xs text-gray-800">{p.priorityCode}</td>
                  <td className="py-2 px-3 text-gray-800">{p.displayName}</td>
                  <td className="py-2 px-3 text-gray-600">{p.priorityLevel ?? "—"}</td>
                  <td className="py-2 px-3 text-gray-600">{p.sortOrder}</td>
                  <td className="py-2 px-3 text-gray-600">{p.defaultSlaMinutes ?? "—"}</td>
                  <td className="py-2 px-3">
                    {p.colorHex ? (
                      <span className="inline-flex items-center gap-1">
                        <span className="w-4 h-4 rounded border border-gray-300 shrink-0" style={{ backgroundColor: p.colorHex }} />
                        <span className="text-xs">{p.colorHex}</span>
                      </span>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="py-2 px-3">
                    <ActiveSwitch
                      active={p.isActive}
                      busy={togglingId === p.id}
                      onToggle={() => void toggleActive(p)}
                      ariaLabel={p.isActive ? "Priority active" : "Priority inactive"}
                    />
                  </td>
                  <td className="py-2 px-3">
                    <div className="flex gap-1">
                      <button
                        type="button"
                        onClick={() => setForm({ ...p })}
                        className="p-1.5 rounded text-gray-500 hover:bg-gray-200 hover:text-gray-700"
                        title="Edit"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => void remove(p.id)}
                        disabled={saving}
                        className="p-1.5 rounded text-gray-500 hover:bg-red-50 hover:text-red-600"
                        title="Deactivate"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {form?.id != null && (
        <div className="p-4 rounded-lg border border-gray-200 bg-gray-50 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-medium text-gray-800">Edit priority</h3>
            <button type="button" onClick={() => setForm(null)} className="p-1 rounded text-gray-500 hover:bg-gray-200" aria-label="Close">
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Code</label>
              <input
                value={form.priorityCode}
                onChange={(e) => setForm((f) => f && { ...f, priorityCode: e.target.value })}
                className="w-full rounded border border-gray-300 px-3 py-2 text-sm font-mono"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Display name</label>
              <input
                value={form.displayName}
                onChange={(e) => setForm((f) => f && { ...f, displayName: e.target.value })}
                className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
              />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Priority level</label>
              <input
                type="number"
                min={1}
                value={form.priorityLevel === undefined || form.priorityLevel === null ? "" : form.priorityLevel}
                onChange={(e) =>
                  setForm((f) =>
                    f && {
                      ...f,
                      priorityLevel: e.target.value === "" ? undefined : Number(e.target.value),
                    }
                  )
                }
                className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Sort order</label>
              <input
                type="number"
                value={form.sortOrder ?? ""}
                onChange={(e) => setForm((f) => f && { ...f, sortOrder: e.target.value === "" ? 0 : Number(e.target.value) })}
                className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Default SLA (minutes)</label>
              <input
                type="number"
                min={0}
                value={form.defaultSlaMinutes === undefined || form.defaultSlaMinutes === null ? "" : form.defaultSlaMinutes}
                onChange={(e) =>
                  setForm((f) =>
                    f && {
                      ...f,
                      defaultSlaMinutes: e.target.value === "" ? undefined : Number(e.target.value),
                    }
                  )
                }
                className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Display icon</label>
              <input
                value={form.displayIcon ?? ""}
                onChange={(e) => setForm((f) => f && { ...f, displayIcon: e.target.value || null })}
                className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Color</label>
            <input
              value={form.colorHex ?? ""}
              onChange={(e) => setForm((f) => f && { ...f, colorHex: e.target.value || null })}
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm max-w-md"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Description</label>
            <input
              value={form.description ?? ""}
              onChange={(e) => setForm((f) => f && { ...f, description: e.target.value || null })}
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
            />
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={saving}
              onClick={() => void saveEdit()}
              className="rounded bg-blue-600 px-3 py-1.5 text-sm text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {saving ? "Saving..." : "Save"}
            </button>
            <button type="button" onClick={() => setForm(null)} className="rounded border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50">
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
