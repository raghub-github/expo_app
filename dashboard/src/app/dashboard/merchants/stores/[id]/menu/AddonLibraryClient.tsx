"use client";

import { useEffect, useState } from "react";
import { Plus, Edit2, Trash2, X, ChevronRight } from "lucide-react";
import { useToast } from "@/context/ToastContext";

type ModifierGroup = {
  id: number;
  group_id: string;
  title: string;
  description: string | null;
  is_required: boolean;
  min_selection: number;
  max_selection: number;
  display_order: number;
  options_count: number;
  used_in_items_count: number;
};

type ModifierOption = {
  id: number;
  option_id: string;
  name: string;
  price_delta: string;
  image_url: string | null;
  in_stock: boolean;
  display_order: number;
};

/** Inline option row for the combined create form */
type InlineOption = { name: string; price: string };

export function AddonLibraryClient({ storeId }: { storeId: string }) {
  const { toast } = useToast();
  const [groups, setGroups] = useState<ModifierGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editingGroup, setEditingGroup] = useState<ModifierGroup | null>(null);
  const [formTitle, setFormTitle] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formRequired, setFormRequired] = useState(false);
  const [formMin, setFormMin] = useState(0);
  const [formMax, setFormMax] = useState(1);
  const [inlineOptions, setInlineOptions] = useState<InlineOption[]>([{ name: "", price: "" }]);
  const [saving, setSaving] = useState(false);
  const [detailGroupId, setDetailGroupId] = useState<number | null>(null);
  const [options, setOptions] = useState<ModifierOption[]>([]);
  const [optionsLoading, setOptionsLoading] = useState(false);
  const [optionFormName, setOptionFormName] = useState("");
  const [optionFormPrice, setOptionFormPrice] = useState("");
  const [addingOption, setAddingOption] = useState(false);

  const base = `/api/merchant/stores/${storeId}/menu`;

  const trackAudit = (payload: { actionType: "CREATE" | "UPDATE" | "DELETE"; resourceType: string; resourceId?: string; actionDetails?: Record<string, unknown>; actionStatus?: "SUCCESS" | "FAILED"; errorMessage?: string }) => {
    try {
      if (typeof window === "undefined") return;
      void fetch("/api/audit/track", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          eventType: "API_CALL",
          dashboardType: "MERCHANT",
          actionType: payload.actionType,
          resourceType: payload.resourceType,
          resourceId: payload.resourceId,
          actionDetails: payload.actionDetails ?? {},
          requestPath: window.location.pathname,
          actionStatus: payload.actionStatus ?? "SUCCESS",
          errorMessage: payload.errorMessage,
        }),
      });
    } catch {
      // never block UI
    }
  };

  const loadGroups = async () => {
    setLoading(true);
    try {
      const r = await fetch(`${base}/modifier-groups`);
      const j = await r.json().catch(() => ({}));
      if (r.ok && j?.modifierGroups) setGroups(j.modifierGroups);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadGroups();
  }, [storeId]);

  useEffect(() => {
    if (detailGroupId == null) return;
    setOptionsLoading(true);
    const url = `/api/merchant/stores/${storeId}/menu/modifier-groups/${detailGroupId}/options`;
    fetch(url)
      .then((res) => res.json())
      .then((j) => {
        if (j?.options) setOptions(j.options);
      })
      .finally(() => setOptionsLoading(false));
  }, [detailGroupId, storeId]);

  const handleCreate = async () => {
    if (!formTitle.trim()) return;
    const optionsToAdd = inlineOptions.filter((o) => o.name.trim());
    if (optionsToAdd.length === 0) {
      toast("Add at least one option (name + price).");
      return;
    }
    setSaving(true);
    try {
      const r = await fetch(`${base}/modifier-groups`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: formTitle.trim(),
          description: formDescription.trim() || null,
          is_required: formRequired,
          min_selection: formMin,
          max_selection: formMax,
        }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j?.error || "Failed to create group");
      const newId = j?.id;
      if (!newId) throw new Error("No group id returned");
      for (let i = 0; i < optionsToAdd.length; i++) {
        const o = optionsToAdd[i];
        const price = parseFloat(o.price) || 0;
        if (price < 0) throw new Error(`Invalid price for "${o.name.trim()}"`);
        const optRes = await fetch(`${base}/modifier-groups/${newId}/options`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: o.name.trim(), price_delta: price }),
        });
        if (!optRes.ok) {
          const errJ = await optRes.json().catch(() => ({}));
          throw new Error(errJ?.error || `Failed to add option "${o.name.trim()}"`);
        }
      }
      trackAudit({
        actionType: "CREATE",
        resourceType: "merchant_modifier_groups",
        resourceId: String(newId),
        actionDetails: { options_count: optionsToAdd.length },
      });
      toast(`Addon group created with ${optionsToAdd.length} option(s).`);
      setFormTitle("");
      setFormDescription("");
      setFormRequired(false);
      setFormMin(0);
      setFormMax(1);
      setInlineOptions([{ name: "", price: "" }]);
      setShowForm(false);
      loadGroups();
    } catch (e) {
      trackAudit({
        actionType: "CREATE",
        resourceType: "merchant_modifier_groups",
        actionStatus: "FAILED",
        errorMessage: e instanceof Error ? e.message : "Failed to create",
      });
      toast(e instanceof Error ? e.message : "Failed to create");
    }
    setSaving(false);
  };

  const handleUpdate = async () => {
    if (!editingGroup || !formTitle.trim()) return;
    setSaving(true);
    try {
      const r = await fetch(`${base}/modifier-groups/${editingGroup.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: formTitle.trim(),
          description: formDescription.trim() || null,
          is_required: formRequired,
          min_selection: formMin,
          max_selection: formMax,
        }),
      });
      if (!r.ok) throw new Error("Failed to update");
      toast("Addon group updated.");
      setEditingGroup(null);
      setFormTitle("");
      setFormDescription("");
      loadGroups();
      if (detailGroupId === editingGroup.id) setDetailGroupId(null);
    } catch (e) {
      trackAudit({
        actionType: "UPDATE",
        resourceType: "merchant_modifier_groups",
        resourceId: editingGroup ? String(editingGroup.id) : undefined,
        actionStatus: "FAILED",
        errorMessage: e instanceof Error ? e.message : "Failed to update",
      });
      toast(e instanceof Error ? e.message : "Failed to update");
    }
    setSaving(false);
  };

  const handleDelete = async (g: ModifierGroup) => {
    if (!confirm(`Delete "${g.title}"? This will remove it from all linked items.`)) return;
    try {
      const r = await fetch(`${base}/modifier-groups/${g.id}`, { method: "DELETE" });
      if (!r.ok) throw new Error("Failed to delete");
      trackAudit({
        actionType: "DELETE",
        resourceType: "merchant_modifier_groups",
        resourceId: String(g.id),
        actionDetails: { title: g.title },
      });
      toast("Addon group deleted.");
      if (detailGroupId === g.id) setDetailGroupId(null);
      loadGroups();
    } catch (e) {
      trackAudit({
        actionType: "DELETE",
        resourceType: "merchant_modifier_groups",
        resourceId: String(g.id),
        actionStatus: "FAILED",
        errorMessage: e instanceof Error ? e.message : "Failed to delete",
      });
      toast(e instanceof Error ? e.message : "Failed to delete");
    }
  };

  const openEdit = (g: ModifierGroup) => {
    setEditingGroup(g);
    setFormTitle(g.title);
    setFormDescription(g.description ?? "");
    setFormRequired(g.is_required);
    setFormMin(g.min_selection);
    setFormMax(g.max_selection);
  };

  const handleAddOption = async () => {
    if (detailGroupId == null || !optionFormName.trim()) return;
    const price = parseFloat(optionFormPrice) || 0;
    if (price < 0) return;
    setAddingOption(true);
    try {
      const r = await fetch(`${base}/modifier-groups/${detailGroupId}/options`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: optionFormName.trim(), price_delta: price }),
      });
      if (!r.ok) throw new Error("Failed to add option");
      const jAdd = await r.json().catch(() => ({}));
      trackAudit({
        actionType: "CREATE",
        resourceType: "merchant_modifier_options",
        resourceId: jAdd?.id != null ? String(jAdd.id) : undefined,
        actionDetails: { modifier_group_id: detailGroupId, name: optionFormName.trim() },
      });
      toast("Option added.");
      setOptionFormName("");
      setOptionFormPrice("");
      const j = await fetch(`${base}/modifier-groups/${detailGroupId}/options`).then((res) => res.json());
      if (j?.options) setOptions(j.options);
      loadGroups();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Failed to add");
    }
    setAddingOption(false);
  };

  const filtered = search.trim()
    ? groups.filter((g) => g.title.toLowerCase().includes(search.trim().toLowerCase()))
    : groups;

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-3 sm:px-4 py-3 border-b border-gray-200 bg-white">
        <h2 className="text-lg font-bold text-gray-900">Addon Library</h2>
        <div className="flex items-center gap-2">
          <input
            type="text"
            placeholder="Search addon groups..."
            className="px-3 py-2 text-sm border border-gray-300 rounded-lg w-48 focus:border-orange-400 focus:ring-1 focus:ring-orange-100"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <button
            type="button"
            onClick={() => {
              setShowForm(true);
              setEditingGroup(null);
              setFormTitle("");
              setFormDescription("");
              setFormRequired(false);
              setFormMin(0);
              setFormMax(1);
              setInlineOptions([{ name: "", price: "" }]);
            }}
            className="flex items-center gap-1.5 px-3 py-2 text-sm font-semibold rounded-lg bg-orange-500 text-white hover:bg-orange-600"
          >
            <Plus size={16} />
            New group
          </button>
        </div>
      </div>

      {(showForm || editingGroup) && (
        <div className="mx-3 sm:mx-4 mt-3 p-4 rounded-xl border border-orange-200 bg-orange-50/50">
          <h3 className="font-semibold text-gray-900 mb-3">{editingGroup ? "Edit group" : "New addon group (group + options in one step)"}</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Title *</label>
              <input
                type="text"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                value={formTitle}
                onChange={(e) => setFormTitle(e.target.value)}
                placeholder="e.g. Toppings"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Description</label>
              <input
                type="text"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                value={formDescription}
                onChange={(e) => setFormDescription(e.target.value)}
                placeholder="Optional"
              />
            </div>
            <div className="flex flex-wrap items-center gap-4 sm:col-span-2">
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={formRequired} onChange={(e) => setFormRequired(e.target.checked)} className="rounded text-orange-500" />
                <span className="text-sm">Required</span>
              </label>
              <span className="text-sm text-gray-600">Min: </span>
              <input type="number" min={0} className="w-16 px-2 py-1 border rounded text-sm" value={formMin} onChange={(e) => setFormMin(parseInt(e.target.value, 10) || 0)} />
              <span className="text-sm text-gray-600">Max: </span>
              <input type="number" min={0} className="w-16 px-2 py-1 border rounded text-sm" value={formMax} onChange={(e) => setFormMax(parseInt(e.target.value, 10) || 1)} />
            </div>
          </div>
          {!editingGroup && (
            <div className="mt-4 pt-3 border-t border-orange-200">
              <div className="text-xs font-semibold text-gray-700 mb-2">Addon options (name + price) * — add at least one</div>
              <div className="space-y-2">
                {inlineOptions.map((o, idx) => (
                  <div key={idx} className="flex flex-wrap items-center gap-2">
                    <input
                      type="text"
                      placeholder="Option name"
                      className="flex-1 min-w-[120px] px-3 py-2 border border-gray-300 rounded-lg text-sm"
                      value={o.name}
                      onChange={(e) =>
                        setInlineOptions((prev) => {
                          const next = [...prev];
                          next[idx] = { ...next[idx], name: e.target.value };
                          return next;
                        })
                      }
                    />
                    <input
                      type="number"
                      min={0}
                      step={0.01}
                      placeholder="+₹ price"
                      className="w-24 px-3 py-2 border border-gray-300 rounded-lg text-sm"
                      value={o.price}
                      onChange={(e) =>
                        setInlineOptions((prev) => {
                          const next = [...prev];
                          next[idx] = { ...next[idx], price: e.target.value };
                          return next;
                        })
                      }
                    />
                    <button
                      type="button"
                      onClick={() => setInlineOptions((prev) => prev.filter((_, i) => i !== idx))}
                      className="p-2 rounded-lg text-red-600 hover:bg-red-50"
                      title="Remove"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() => setInlineOptions((prev) => [...prev, { name: "", price: "" }])}
                  className="flex items-center gap-1 text-sm font-medium text-orange-600 hover:text-orange-700"
                >
                  <Plus size={14} /> Add another option
                </button>
              </div>
            </div>
          )}
          <div className="flex gap-2 mt-3">
            <button
              onClick={editingGroup ? handleUpdate : handleCreate}
              disabled={saving || !formTitle.trim() || (!editingGroup && inlineOptions.every((o) => !o.name.trim()))}
              className="px-4 py-2 rounded-lg font-semibold text-white bg-orange-500 hover:bg-orange-600 disabled:opacity-50"
            >
              {saving ? "Saving..." : editingGroup ? "Save" : "Create group & options"}
            </button>
            <button
              onClick={() => {
                setShowForm(false);
                setEditingGroup(null);
              }}
              className="px-4 py-2 rounded-lg font-semibold text-gray-600 bg-white border border-gray-300 hover:bg-gray-50"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="flex-1 min-h-0 overflow-auto p-3 sm:p-4">
        {loading ? (
          <div className="text-gray-500 text-sm">Loading...</div>
        ) : (
          <div className="grid gap-3">
            {filtered.map((g) => (
              <div
                key={g.id}
                className="flex items-center justify-between p-4 rounded-xl border border-gray-200 bg-white shadow-sm hover:border-orange-200 transition-colors"
              >
                <div className="min-w-0 flex-1">
                  <div className="font-semibold text-gray-900 truncate">{g.title}</div>
                  <div className="text-xs text-gray-500 mt-0.5">
                    {g.options_count} options · Used in {g.used_in_items_count} items
                    {g.is_required && " · Required"}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button type="button" onClick={() => setDetailGroupId(detailGroupId === g.id ? null : g.id)} className="p-2 rounded-lg text-gray-500 hover:bg-gray-100" title="View options">
                    <ChevronRight size={18} className={detailGroupId === g.id ? "rotate-90" : ""} />
                  </button>
                  <button type="button" onClick={() => openEdit(g)} className="p-2 rounded-lg text-blue-600 hover:bg-blue-50">
                    <Edit2 size={16} />
                  </button>
                  <button type="button" onClick={() => handleDelete(g)} className="p-2 rounded-lg text-red-600 hover:bg-red-50">
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            ))}
            {filtered.length === 0 && <div className="text-gray-500 text-sm py-8 text-center">No addon groups yet. Create one to reuse across menu items.</div>}
          </div>
        )}

        {detailGroupId != null && (
          <div className="fixed inset-0 z-[9998] flex items-center justify-center bg-black/40 p-4" onClick={() => setDetailGroupId(null)}>
            <div className="bg-white rounded-xl shadow-xl w-full max-w-md max-h-[80vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between p-4 border-b">
                <h3 className="font-bold text-gray-900">Options</h3>
                <button type="button" onClick={() => setDetailGroupId(null)} className="p-2 hover:bg-gray-100 rounded-lg">
                  <X size={18} />
                </button>
              </div>
              <div className="p-4 border-b bg-gray-50 flex gap-2">
                <input type="text" placeholder="Option name" className="flex-1 px-3 py-2 border rounded-lg text-sm" value={optionFormName} onChange={(e) => setOptionFormName(e.target.value)} />
                <input type="number" min={0} step={0.01} placeholder="+₹" className="w-20 px-3 py-2 border rounded-lg text-sm" value={optionFormPrice} onChange={(e) => setOptionFormPrice(e.target.value)} />
                <button type="button" onClick={handleAddOption} disabled={addingOption || !optionFormName.trim()} className="px-3 py-2 rounded-lg bg-orange-500 text-white text-sm font-semibold disabled:opacity-50">
                  Add
                </button>
              </div>
              <div className="flex-1 overflow-auto p-4">
                {optionsLoading ? (
                  <div className="text-sm text-gray-500">Loading...</div>
                ) : (
                  <ul className="space-y-2">
                    {options.map((o) => (
                      <li key={o.id} className="flex items-center justify-between py-2 border-b border-gray-100 text-sm">
                        <span className="font-medium text-gray-900">{o.name}</span>
                        <span className="text-orange-600">+₹{Number(o.price_delta).toFixed(0)}</span>
                      </li>
                    ))}
                    {options.length === 0 && !optionsLoading && <div className="text-gray-500 text-sm">No options. Add one above.</div>}
                  </ul>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
