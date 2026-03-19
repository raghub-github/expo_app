"use client";

import { useEffect, useState, useCallback } from "react";
import { Plus, Edit2, Trash2, X, ChevronDown, ChevronUp, Package } from "lucide-react";
import { useToast } from "@/context/ToastContext";
import { R2Image } from "@/components/ui/R2Image";
import { ITEM_PLACEHOLDER_SVG } from "./menu-types";

type Combo = {
  id: number;
  combo_name: string;
  description: string | null;
  combo_price: string;
  image_url: string | null;
  is_active: boolean;
  display_order: number;
};

type ComboComponent = {
  id: number;
  menu_item_id: number;
  variant_id: number | null;
  quantity: number;
  display_order: number;
  item_name: string | null;
  variant_name: string | null;
  item_image_url?: string | null;
  item_price?: number | null;
  variant_price?: number | null;
};

type ComboDetail = Combo & {
  components: ComboComponent[];
};

export function StoreCombosClient({ storeId }: { storeId: string }) {
  const { toast } = useToast();
  const [combos, setCombos] = useState<Combo[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Combo | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("");
  const [saving, setSaving] = useState(false);

  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [detail, setDetail] = useState<ComboDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const [newItemId, setNewItemId] = useState("");
  const [newItemQty, setNewItemQty] = useState("1");
  const [addingItem, setAddingItem] = useState(false);
  const [removingComponentId, setRemovingComponentId] = useState<number | null>(null);

  const [deleteConfirm, setDeleteConfirm] = useState<Combo | null>(null);
  const [editConfirm, setEditConfirm] = useState<Combo | null>(null);

  const [menuItems, setMenuItems] = useState<
    { id: number; item_name: string; selling_price: number; item_image_url?: string | null }[]
  >([]);
  const [menuItemsLoading, setMenuItemsLoading] = useState(false);

  // Pre-fetched combo summaries so agents can see key items without expanding
  const [comboSummaries, setComboSummaries] = useState<Record<number, string[]>>({});

  const base = `/api/merchant/stores/${storeId}/menu/combos`;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(base);
      const j = await r.json().catch(() => ({}));
      if (r.ok && j?.combos) setCombos(j.combos);
    } finally {
      setLoading(false);
    }
  }, [base]);

  useEffect(() => {
    load();
  }, [storeId, load]);

  // Preload a lightweight summary of items in each combo for nicer collapsed cards.
  useEffect(() => {
    if (!combos.length) {
      setComboSummaries({});
      return;
    }
    let cancelled = false;
    (async () => {
      const next: Record<number, string[]> = {};
      for (const combo of combos) {
        try {
          const r = await fetch(`${base}/${combo.id}`);
          const j = await r.json().catch(() => ({}));
          if (!cancelled && r.ok && j?.combo?.components) {
            const components = j.combo.components as ComboComponent[];
            const lines = components.map((comp) => {
              const name = comp.item_name ?? `Item #${comp.menu_item_id}`;
              const qty = comp.quantity ?? 1;
              return `${name} × ${qty}`;
            });
            next[combo.id] = lines;
          }
        } catch {
          // ignore individual combo failures; summaries are just a nice-to-have
        }
      }
      if (!cancelled) {
        setComboSummaries(next);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [combos, base]);

  // Load all menu items for this store so agents can pick items to add to combos.
  useEffect(() => {
    let cancelled = false;
    const loadItems = async () => {
      setMenuItemsLoading(true);
      try {
        const r = await fetch(`/api/merchant/stores/${storeId}/menu`);
        const j = await r.json().catch(() => ({}));
        if (!cancelled && r.ok && j?.items) {
          setMenuItems(
            (j.items as any[]).map((it) => ({
              id: Number(it.id),
              item_name: String(it.item_name ?? ""),
              selling_price: Number(it.selling_price ?? 0),
              item_image_url: (it.item_image_url as string | null) ?? null,
            }))
          );
        }
      } finally {
        if (!cancelled) setMenuItemsLoading(false);
      }
    };
    void loadItems();
    return () => {
      cancelled = true;
    };
  }, [storeId]);

  const loadDetail = useCallback(
    async (comboId: number) => {
      if (expandedId === comboId && detail?.id === comboId) {
        setExpandedId(null);
        setDetail(null);
        return;
      }
      setDetailLoading(true);
      setDetail(null);
      setExpandedId(comboId);
      try {
        const r = await fetch(`${base}/${comboId}`);
        const j = await r.json().catch(() => ({}));
        if (r.ok && j?.combo) setDetail(j.combo);
        else toast("Failed to load combo details");
      } finally {
        setDetailLoading(false);
      }
    },
    [base, expandedId, detail?.id, toast]
  );

  const refreshDetail = useCallback(
    async (comboId: number) => {
      try {
        const r = await fetch(`${base}/${comboId}`);
        const j = await r.json().catch(() => ({}));
        if (r.ok && j?.combo) setDetail(j.combo);
        else toast("Failed to load combo details");
      } catch {
        toast("Failed to load combo details");
      }
    },
    [base, toast]
  );

  const handleSubmit = async () => {
    const p = parseFloat(price);
    if (!name.trim() || (!editing && (!Number.isFinite(p) || p < 0))) {
      toast(editing ? "Name is required" : "Name and valid price required");
      return;
    }
    setSaving(true);
    try {
      const url = editing ? `${base}/${editing.id}` : base;
      const method = editing ? "PUT" : "POST";
      const body: Record<string, unknown> = {
        combo_name: name.trim(),
        description: description.trim() || null,
      };
      if (!editing) {
        body.combo_price = p;
      }
      const r = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!r.ok) throw new Error("Failed to save");
      toast(editing ? "Combo updated." : "Combo created.");
      setShowForm(false);
      setEditing(null);
      setEditConfirm(null);
      setName("");
      setDescription("");
      setPrice("");
      load();
      if (expandedId !== null) setExpandedId(null);
      setDetail(null);
    } catch (e) {
      toast(e instanceof Error ? e.message : "Failed to save");
    }
    setSaving(false);
  };

  const handleDelete = async (c: Combo) => {
    if (!deleteConfirm || deleteConfirm.id !== c.id) return;
    setDeleteConfirm(null);
    try {
      const r = await fetch(`${base}/${c.id}`, { method: "DELETE" });
      if (!r.ok) throw new Error("Failed to delete");
      toast("Combo deleted.");
      load();
      if (expandedId === c.id) {
        setExpandedId(null);
        setDetail(null);
      }
    } catch (e) {
      toast(e instanceof Error ? e.message : "Failed to delete");
    }
  };

  const openEdit = (c: Combo) => {
    setEditing(c);
    setShowForm(true);
    setName(c.combo_name);
    setDescription(c.description ?? "");
    setPrice(c.combo_price ?? "");
    setEditConfirm(null);
  };

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-3 sm:px-4 py-3 border-b border-gray-200 bg-white">
        <h2 className="text-lg font-bold text-gray-900">Combos</h2>
        <button
          type="button"
          onClick={() => {
            setShowForm(true);
            setEditing(null);
            setEditConfirm(null);
            setName("");
            setDescription("");
            setPrice("");
          }}
          className="flex items-center gap-1.5 px-3 py-2 text-sm font-semibold rounded-lg bg-orange-500 text-white hover:bg-orange-600"
        >
          <Plus size={16} />
          New combo
        </button>
      </div>

      {(showForm || editing) && (
        <div className="mx-3 sm:mx-4 mt-3 p-4 rounded-xl border border-orange-200 bg-orange-50/50">
          <h3 className="font-semibold text-gray-900 mb-3">{editing ? "Edit combo" : "New combo"}</h3>
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Name *</label>
              <input type="text" className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Burger + Fries" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Description</label>
              <input type="text" className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Optional" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Price (₹) {editing && <span className="text-[11px] text-gray-500 font-normal">(auto-calculated from items; read-only)</span>}
              </label>
              <input
                type="number"
                min={0}
                step={0.01}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-gray-50"
                value={price}
                onChange={(e) => !editing && setPrice(e.target.value)}
                placeholder="0"
                readOnly={!!editing}
              />
            </div>
          </div>
          <div className="flex gap-2 mt-3">
            <button onClick={handleSubmit} disabled={saving || !name.trim()} className="px-4 py-2 rounded-lg font-semibold text-white bg-orange-500 hover:bg-orange-600 disabled:opacity-50">
              {saving ? "Saving..." : editing ? "Save" : "Create"}
            </button>
            <button onClick={() => { setShowForm(false); setEditing(null); }} className="px-4 py-2 rounded-lg font-semibold text-gray-600 bg-white border border-gray-300 hover:bg-gray-50">
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
            {combos.map((c) => (
              <div key={c.id} className="rounded-xl border border-gray-200 bg-white shadow-sm hover:border-orange-200 transition-colors overflow-hidden">
                <div
                  className="flex items-center justify-between p-4 cursor-pointer"
                  onClick={() => loadDetail(c.id)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => e.key === "Enter" && loadDetail(c.id)}
                  aria-expanded={expandedId === c.id}
                >
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    {expandedId === c.id ? <ChevronUp size={18} className="text-gray-500 shrink-0" /> : <ChevronDown size={18} className="text-gray-500 shrink-0" />}
                    <div className="min-w-0">
                      <div className="font-semibold text-gray-900">{c.combo_name}</div>
                      <div className="text-sm text-orange-600 font-semibold mt-0.5">
                        ₹{Number(c.combo_price).toFixed(0)}
                      </div>
                      {comboSummaries[c.id]?.length ? (
                        <div className="mt-0.5 text-[11px] text-gray-600">
                          <span className="font-medium text-gray-700">Includes:</span>{" "}
                          {(() => {
                            const lines = comboSummaries[c.id] || [];
                            const shown = lines.slice(0, 2);
                            const remaining = lines.length - shown.length;
                            return (
                              <>
                                {shown.join(", ")}
                                {remaining > 0 && (
                                  <span className="text-gray-500">
                                    {" "}
                                    +{remaining} more
                                  </span>
                                )}
                              </>
                            );
                          })()}
                        </div>
                      ) : (
                        <div className="mt-0.5 text-[11px] text-gray-400">
                          Tap to view combo items
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0" onClick={(e) => e.stopPropagation()}>
                    <button type="button" onClick={() => openEdit(c)} className="p-2 rounded-lg text-blue-600 hover:bg-blue-50" title="Edit combo">
                      <Edit2 size={16} />
                    </button>
                    <button type="button" onClick={() => setDeleteConfirm(c)} className="p-2 rounded-lg text-red-600 hover:bg-red-50" title="Delete combo">
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>

                {expandedId === c.id && (
                  <div className="border-t border-gray-100 bg-gray-50/80 px-4 py-3">
                    {detailLoading ? (
                      <div className="text-sm text-gray-500">Loading details...</div>
                    ) : detail?.id === c.id ? (
                      <div className="space-y-3">
                        {detail.description && <p className="text-sm text-gray-600">{detail.description}</p>}

                        {detail.components && detail.components.length > 0 && (
                          <>
                            <div className="text-xs font-semibold uppercase text-gray-500 mt-1">Top items in this combo</div>
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                              {([...detail.components]
                                .map((comp) => ({
                                  ...comp,
                                  value:
                                    (comp.variant_price ?? comp.item_price ?? 0) *
                                    (comp.quantity || 1),
                                }))
                                .sort((a, b) => b.value - a.value)
                                .slice(0, 3) as ComboComponent[]).map((comp) => (
                                <div
                                  key={comp.id}
                                  className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white p-2 shadow-xs"
                                >
                                  <div className="w-12 h-12 rounded-md overflow-hidden bg-gray-100 border border-gray-200 flex-shrink-0">
                                    <R2Image
                                      src={comp.item_image_url || ITEM_PLACEHOLDER_SVG}
                                      alt={comp.item_name || `Item #${comp.menu_item_id}`}
                                      className="w-full h-full object-cover"
                                      fallbackSrc={ITEM_PLACEHOLDER_SVG}
                                    />
                                  </div>
                                  <div className="min-w-0">
                                    <div className="text-xs font-semibold text-gray-900 truncate">
                                      {comp.item_name ?? `Item #${comp.menu_item_id}`}
                                    </div>
                                    {comp.variant_name && (
                                      <div className="text-[11px] text-gray-500 truncate">
                                        {comp.variant_name}
                                      </div>
                                    )}
                                    <div className="text-[11px] text-gray-600">
                                      Qty: {comp.quantity}
                                    </div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </>
                        )}

                        <div className="text-xs font-semibold uppercase text-gray-500 mt-2">
                          All items in this combo
                        </div>
                        {detail.components && detail.components.length > 0 ? (
                          <ul className="space-y-1.5">
                            {detail.components.map((comp) => {
                              const unitPrice =
                                comp.variant_price != null && !Number.isNaN(comp.variant_price)
                                  ? comp.variant_price
                                  : comp.item_price != null && !Number.isNaN(comp.item_price)
                                  ? comp.item_price
                                  : null;
                              const qty = comp.quantity ?? 1;
                              const lineTotal = unitPrice != null ? unitPrice * qty : null;
                              return (
                                <li key={comp.id} className="flex items-center gap-2 text-sm text-gray-800">
                                  <Package size={14} className="text-orange-500 shrink-0" />
                                  <span className="flex-1">
                                    #{comp.menu_item_id} ·{" "}
                                    {comp.item_name ?? `Item #${comp.menu_item_id}`}
                                    {comp.variant_name ? ` (${comp.variant_name})` : ""}
                                    <span className="text-gray-500 font-medium"> × {qty}</span>
                                    {unitPrice != null && (
                                      <span className="ml-2 text-xs text-gray-600">
                                        ₹{unitPrice.toFixed(2)}
                                        {lineTotal != null && qty > 1 && (
                                          <span className="text-gray-500">
                                            {" "}
                                            (total ₹{lineTotal.toFixed(2)})
                                          </span>
                                        )}
                                      </span>
                                    )}
                                  </span>
                                <button
                                  type="button"
                                  className="p-1.5 rounded text-red-600 hover:bg-red-50 text-xs"
                                  disabled={removingComponentId === comp.id}
                                  onClick={async () => {
                                    if (!detail?.id) return;
                                    setRemovingComponentId(comp.id);
                                    try {
                                      const r = await fetch(
                                        `/api/merchant/stores/${storeId}/menu/combos/${detail.id}/components/${comp.id}`,
                                        { method: "DELETE" }
                                      );
                                      if (!r.ok) {
                                        toast("Failed to remove item from combo");
                                      } else {
                                        await refreshDetail(detail.id);
                                      }
                                    } catch {
                                      toast("Failed to remove item from combo");
                                    } finally {
                                      setRemovingComponentId(null);
                                    }
                                  }}
                                >
                                  Remove
                                </button>
                              </li>
                              );
                            })}
                          </ul>
                        ) : (
                          <p className="text-sm text-gray-500">
                            No items added yet. Use the controls below to add items to this combo.
                          </p>
                        )}

                        {detail.id && (
                          <div className="mt-3 space-y-2">
                            <div className="flex items-center justify-between">
                              <h4 className="text-xs font-semibold text-gray-700">
                                Add item to combo
                              </h4>
                              {menuItemsLoading && (
                                <span className="text-[11px] text-gray-400">Loading items…</span>
                              )}
                            </div>
                            {menuItems.length === 0 ? (
                              <p className="text-xs text-gray-500">
                                No menu items available for this store. Add items first from the Menu Items tab.
                              </p>
                            ) : (
                              <div className="flex flex-wrap items-end gap-2">
                                <div>
                                  <label className="block text-xs font-medium text-gray-600 mb-1">
                                    Item
                                  </label>
                                  <select
                                    className="px-2 py-1.5 border border-gray-300 rounded text-sm min-w-[220px]"
                                    value={newItemId}
                                    onChange={(e) => setNewItemId(e.target.value)}
                                  >
                                    <option value="">Select item…</option>
                                    {menuItems
                                      .filter(
                                        (it) =>
                                          !detail.components?.some(
                                            (c) =>
                                              c.menu_item_id === it.id &&
                                              (c.variant_id ?? null) == null
                                          )
                                      )
                                      .map((it) => (
                                        <option key={it.id} value={it.id}>
                                          #{it.id} · {it.item_name} · ₹
                                          {it.selling_price.toFixed(2)}
                                        </option>
                                      ))}
                                  </select>
                                </div>
                                <div>
                                  <label className="block text-xs font-medium text-gray-600 mb-1">
                                    Qty
                                  </label>
                                  <input
                                    type="number"
                                    min={1}
                                    className="px-2 py-1.5 border border-gray-300 rounded text-sm w-20"
                                    value={newItemQty}
                                    onChange={(e) => setNewItemQty(e.target.value)}
                                  />
                                </div>
                                <button
                                  type="button"
                                  className="px-3 py-2 rounded-lg bg-orange-500 text-white text-sm font-semibold hover:bg-orange-600 disabled:opacity-50"
                                  disabled={addingItem || !newItemId || !detail?.id}
                                  onClick={async () => {
                                    if (!detail?.id) return;
                                    const menuItemId = Number(newItemId);
                                    const qty = Number(newItemQty) || 1;
                                    if (!Number.isFinite(menuItemId) || menuItemId <= 0) {
                                      toast("Select a valid item");
                                      return;
                                    }
                                    if (
                                      detail.components?.some(
                                        (c) =>
                                          c.menu_item_id === menuItemId &&
                                          (c.variant_id ?? null) == null
                                      )
                                    ) {
                                      toast("This item is already in the combo");
                                      return;
                                    }
                                    setAddingItem(true);
                                    try {
                                      const r = await fetch(
                                        `/api/merchant/stores/${storeId}/menu/combos/${detail.id}/components`,
                                        {
                                          method: "POST",
                                          headers: { "Content-Type": "application/json" },
                                          body: JSON.stringify({
                                            menu_item_id: menuItemId,
                                            quantity: qty,
                                          }),
                                        }
                                      );
                                      if (!r.ok) {
                                        toast("Failed to add item to combo");
                                      } else {
                                        await refreshDetail(detail.id);
                                        setNewItemId("");
                                        setNewItemQty("1");
                                      }
                                    } catch {
                                      toast("Failed to add item to combo");
                                    } finally {
                                      setAddingItem(false);
                                    }
                                  }}
                                >
                                  {addingItem ? "Adding..." : "Add item"}
                                </button>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    ) : null}
                  </div>
                )}
              </div>
            ))}
            {combos.length === 0 && !loading && <div className="text-gray-500 text-sm py-8 text-center">No combos yet. Create one to bundle items.</div>}
          </div>
        )}
      </div>

      {/* Delete confirmation modal */}
      {deleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" role="dialog" aria-modal="true" aria-labelledby="delete-combo-title">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-5">
            <h3 id="delete-combo-title" className="text-lg font-semibold text-gray-900">Delete combo?</h3>
            <p className="mt-2 text-sm text-gray-600">
              Are you sure you want to delete &quot;{deleteConfirm.combo_name}&quot;? This action cannot be undone.
            </p>
            <div className="flex gap-2 mt-4 justify-end">
              <button type="button" onClick={() => setDeleteConfirm(null)} className="px-4 py-2 rounded-lg font-medium text-gray-700 bg-gray-100 hover:bg-gray-200">
                Cancel
              </button>
              <button type="button" onClick={() => handleDelete(deleteConfirm)} className="px-4 py-2 rounded-lg font-medium text-white bg-red-600 hover:bg-red-700">
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
