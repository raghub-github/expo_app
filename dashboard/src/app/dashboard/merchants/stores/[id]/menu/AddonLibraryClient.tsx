"use client";

import { useEffect, useState } from "react";
import { Plus, Edit2, Trash2, X, ChevronDown, ChevronRight, Package } from "lucide-react";
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
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [options, setOptions] = useState<Record<number, ModifierOption[]>>({});
  const [optionsLoading, setOptionsLoading] = useState<Record<number, boolean>>({});
  const [optionFormName, setOptionFormName] = useState("");
  const [optionFormPrice, setOptionFormPrice] = useState("");
  const [addingOptionFor, setAddingOptionFor] = useState<number | null>(null);

  const base = `/api/merchant/stores/${storeId}/menu`;

  const trackAudit = (payload: {
    actionType: "CREATE" | "UPDATE" | "DELETE";
    resourceType: string;
    resourceId?: string;
    actionDetails?: Record<string, unknown>;
    actionStatus?: "SUCCESS" | "FAILED";
    errorMessage?: string;
  }) => {
    try {
      if (process.env.NODE_ENV === "development") return;
      if (typeof window === "undefined") return;
      void fetch("/api/audit/track", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          eventType: "API_CALL",
          dashboardType: "MERCHANT",
          ...payload,
          requestPath: window.location.pathname,
          actionStatus: payload.actionStatus ?? "SUCCESS",
        }),
      });
    } catch {}
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

  const loadOptions = async (groupId: number) => {
    setOptionsLoading((prev) => ({ ...prev, [groupId]: true }));
    try {
      const r = await fetch(`${base}/modifier-groups/${groupId}/options`);
      const j = await r.json().catch(() => ({}));
      if (r.ok && j?.options) setOptions((prev) => ({ ...prev, [groupId]: j.options }));
      else if (!r.ok) toast(j?.error || "Could not load options");
    } finally {
      setOptionsLoading((prev) => ({ ...prev, [groupId]: false }));
    }
  };

  const toggleExpand = (g: ModifierGroup) => {
    const next = expandedId === g.id ? null : g.id;
    setExpandedId(next);
    if (next != null && !options[next]) loadOptions(next);
  };

  const handleCreate = async () => {
    if (!formTitle.trim()) {
      toast("Enter a group name");
      return;
    }
    const optionsToAdd = inlineOptions.filter((o) => o.name.trim());
    if (optionsToAdd.length === 0) {
      toast("Add at least one option (name and price)");
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
      for (const o of optionsToAdd) {
        const price = parseFloat(o.price) || 0;
        if (price < 0) throw new Error(`Invalid price for "${o.name.trim()}"`);
        const optRes = await fetch(`${base}/modifier-groups/${newId}/options`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: o.name.trim(), price_delta: price }),
        });
        const errJ = await optRes.json().catch(() => ({}));
        if (!optRes.ok) throw new Error(errJ?.error || `Failed to add "${o.name.trim()}"`);
      }
      trackAudit({
        actionType: "CREATE",
        resourceType: "merchant_modifier_groups",
        resourceId: String(newId),
        actionDetails: { options_count: optionsToAdd.length },
      });
      toast(`"${formTitle.trim()}" created with ${optionsToAdd.length} option(s)`);
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
      toast("Group updated");
      setEditingGroup(null);
      setFormTitle("");
      setFormDescription("");
      loadGroups();
      if (expandedId === editingGroup.id) setExpandedId(null);
    } catch (e) {
      trackAudit({
        actionType: "UPDATE",
        resourceType: "merchant_modifier_groups",
        resourceId: String(editingGroup.id),
        actionStatus: "FAILED",
        errorMessage: e instanceof Error ? e.message : "Failed to update",
      });
      toast(e instanceof Error ? e.message : "Failed to update");
    }
    setSaving(false);
  };

  const handleDelete = async (g: ModifierGroup) => {
    if (!confirm(`Delete "${g.title}"? It will be removed from all linked items.`)) return;
    try {
      const r = await fetch(`${base}/modifier-groups/${g.id}`, { method: "DELETE" });
      if (!r.ok) throw new Error("Failed to delete");
      trackAudit({
        actionType: "DELETE",
        resourceType: "merchant_modifier_groups",
        resourceId: String(g.id),
        actionDetails: { title: g.title },
      });
      toast("Group deleted");
      if (expandedId === g.id) setExpandedId(null);
      setOptions((prev) => {
        const next = { ...prev };
        delete next[g.id];
        return next;
      });
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

  const handleAddOption = async (groupId: number) => {
    if (!optionFormName.trim()) {
      toast("Enter option name");
      return;
    }
    const price = parseFloat(optionFormPrice) || 0;
    if (price < 0) {
      toast("Price must be 0 or more");
      return;
    }
    setAddingOptionFor(groupId);
    try {
      const r = await fetch(`${base}/modifier-groups/${groupId}/options`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: optionFormName.trim(), price_delta: price }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j?.error || "Failed to add option");
      trackAudit({
        actionType: "CREATE",
        resourceType: "merchant_modifier_options",
        resourceId: j?.id != null ? String(j.id) : undefined,
        actionDetails: { modifier_group_id: groupId, name: optionFormName.trim() },
      });
      toast("Option added");
      setOptionFormName("");
      setOptionFormPrice("");
      loadOptions(groupId);
      loadGroups();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Failed to add option");
    }
    setAddingOptionFor(null);
  };

  const filtered = search.trim()
    ? groups.filter((g) => g.title.toLowerCase().includes(search.trim().toLowerCase()))
    : groups;

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 px-4 py-4 border-b border-gray-200 bg-white">
        <div>
          <h2 className="text-xl font-bold text-gray-900">Addon Library</h2>
          <p className="text-sm text-gray-500 mt-0.5">
            Create reusable add-on groups (e.g. Toppings, Size) and attach them to menu items.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="text"
            placeholder="Search groups..."
            className="px-3 py-2 text-sm border border-gray-200 rounded-lg w-44 focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 transition-shadow"
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
            className="flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-lg bg-orange-500 text-white hover:bg-orange-600 shadow-sm transition-colors"
          >
            <Plus size={18} />
            New group
          </button>
        </div>
      </div>

      {/* Create / Edit form */}
      {(showForm || editingGroup) && (
        <div className="mx-4 mt-4 p-5 rounded-xl border border-orange-200 bg-gradient-to-b from-orange-50/80 to-white shadow-sm">
          <h3 className="text-base font-semibold text-gray-900 mb-4">
            {editingGroup ? "Edit group" : "New addon group"}
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Group name *</label>
              <input
                type="text"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20"
                value={formTitle}
                onChange={(e) => setFormTitle(e.target.value)}
                placeholder="e.g. Toppings, Size"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
              <input
                type="text"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20"
                value={formDescription}
                onChange={(e) => setFormDescription(e.target.value)}
                placeholder="Optional"
              />
            </div>
            <div className="flex flex-wrap items-center gap-4 sm:col-span-2">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={formRequired}
                  onChange={(e) => setFormRequired(e.target.checked)}
                  className="rounded border-gray-300 text-orange-500 focus:ring-orange-500"
                />
                <span className="text-sm text-gray-700">Customer must choose</span>
              </label>
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-600">Min</span>
                <input
                  type="number"
                  min={0}
                  className="w-14 px-2 py-1.5 border border-gray-200 rounded-lg text-sm"
                  value={formMin}
                  onChange={(e) => setFormMin(parseInt(e.target.value, 10) || 0)}
                />
                <span className="text-sm text-gray-600">Max</span>
                <input
                  type="number"
                  min={0}
                  className="w-14 px-2 py-1.5 border border-gray-200 rounded-lg text-sm"
                  value={formMax}
                  onChange={(e) => setFormMax(parseInt(e.target.value, 10) || 1)}
                />
              </div>
            </div>
          </div>
          {!editingGroup && (
            <div className="mt-4 pt-4 border-t border-orange-100">
              <label className="block text-sm font-medium text-gray-700 mb-2">Options (name + extra price) *</label>
              <div className="space-y-2">
                {inlineOptions.map((o, idx) => (
                  <div key={idx} className="flex flex-wrap items-center gap-2">
                    <input
                      type="text"
                      placeholder="e.g. Extra cheese"
                      className="flex-1 min-w-[140px] px-3 py-2 border border-gray-200 rounded-lg text-sm"
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
                      placeholder="+₹"
                      className="w-20 px-3 py-2 border border-gray-200 rounded-lg text-sm"
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
                      className="p-2 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                      title="Remove"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() => setInlineOptions((prev) => [...prev, { name: "", price: "" }])}
                  className="flex items-center gap-1.5 text-sm font-medium text-orange-600 hover:text-orange-700"
                >
                  <Plus size={16} /> Add another option
                </button>
              </div>
            </div>
          )}
          <div className="flex gap-2 mt-4">
            <button
              onClick={editingGroup ? handleUpdate : handleCreate}
              disabled={
                saving ||
                !formTitle.trim() ||
                (!editingGroup && inlineOptions.every((o) => !o.name.trim()))
              }
              className="px-4 py-2 rounded-lg font-semibold text-white bg-orange-500 hover:bg-orange-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {saving ? "Saving…" : editingGroup ? "Save" : "Create group"}
            </button>
            <button
              onClick={() => {
                setShowForm(false);
                setEditingGroup(null);
              }}
              className="px-4 py-2 rounded-lg font-semibold text-gray-600 bg-white border border-gray-200 hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Group list */}
      <div className="flex-1 min-h-0 overflow-auto p-4">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="text-gray-500 text-sm">Loading…</div>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 px-4 rounded-xl border-2 border-dashed border-gray-200 bg-gray-50/50">
            <Package className="w-12 h-12 text-gray-300 mb-3" />
            <p className="text-gray-600 font-medium">No addon groups yet</p>
            <p className="text-sm text-gray-500 mt-1 text-center max-w-sm">
              Create a group (e.g. Toppings), add options with prices, then link it to menu items from the item edit screen.
            </p>
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
              className="mt-4 flex items-center gap-2 px-4 py-2 rounded-lg font-semibold text-white bg-orange-500 hover:bg-orange-600"
            >
              <Plus size={18} /> New group
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map((g) => (
              <div
                key={g.id}
                className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden transition-shadow hover:shadow-md"
              >
                <button
                  type="button"
                  onClick={() => toggleExpand(g)}
                  className="w-full flex items-center justify-between p-4 text-left hover:bg-gray-50/50 transition-colors"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className={`flex-shrink-0 p-1.5 rounded-lg ${expandedId === g.id ? "bg-orange-100 text-orange-600" : "bg-gray-100 text-gray-500"}`}
                    >
                      {expandedId === g.id ? (
                        <ChevronDown size={18} />
                      ) : (
                        <ChevronRight size={18} />
                      )}
                    </div>
                    <div className="min-w-0">
                      <div className="font-semibold text-gray-900 truncate">{g.title}</div>
                      <div className="text-xs text-gray-500 mt-0.5">
                        {g.options_count} option{g.options_count !== 1 ? "s" : ""}
                        {g.used_in_items_count > 0 && ` · Used in ${g.used_in_items_count} item${g.used_in_items_count !== 1 ? "s" : ""}`}
                        {g.is_required && " · Required"}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                    <button
                      type="button"
                      onClick={() => openEdit(g)}
                      className="p-2 rounded-lg text-gray-500 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                      title="Edit group"
                    >
                      <Edit2 size={16} />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(g)}
                      className="p-2 rounded-lg text-gray-500 hover:text-red-600 hover:bg-red-50 transition-colors"
                      title="Delete group"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </button>

                {expandedId === g.id && (
                  <div className="border-t border-gray-100 bg-gray-50/50 p-4">
                    <div className="flex flex-wrap items-end gap-2 mb-4">
                      <div className="flex-1 min-w-[160px]">
                        <label className="block text-xs font-medium text-gray-600 mb-1">Option name</label>
                        <input
                          type="text"
                          placeholder="e.g. Extra cheese"
                          className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20"
                          value={optionFormName}
                          onChange={(e) => setOptionFormName(e.target.value)}
                          onKeyDown={(e) => e.key === "Enter" && handleAddOption(g.id)}
                        />
                      </div>
                      <div className="w-24">
                        <label className="block text-xs font-medium text-gray-600 mb-1">+₹</label>
                        <input
                          type="number"
                          min={0}
                          step={0.01}
                          placeholder="0"
                          className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20"
                          value={optionFormPrice}
                          onChange={(e) => setOptionFormPrice(e.target.value)}
                          onKeyDown={(e) => e.key === "Enter" && handleAddOption(g.id)}
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => handleAddOption(g.id)}
                        disabled={addingOptionFor === g.id || !optionFormName.trim()}
                        className="px-4 py-2 rounded-lg bg-orange-500 text-white text-sm font-semibold hover:bg-orange-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                      >
                        {addingOptionFor === g.id ? "Adding…" : "Add option"}
                      </button>
                    </div>
                    {optionsLoading[g.id] ? (
                      <div className="text-sm text-gray-500 py-2">Loading options…</div>
                    ) : (
                      <ul className="space-y-1">
                        {(options[g.id] || []).map((o) => (
                          <li
                            key={o.id}
                            className="flex items-center justify-between py-2 px-3 rounded-lg bg-white border border-gray-100 text-sm"
                          >
                            <span className="font-medium text-gray-900">{o.name}</span>
                            <span className="text-orange-600 font-medium">+₹{Number(o.price_delta).toFixed(2)}</span>
                          </li>
                        ))}
                        {(options[g.id] || []).length === 0 && !optionsLoading[g.id] && (
                          <li className="text-sm text-gray-500 py-3">No options yet. Add one above.</li>
                        )}
                      </ul>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
