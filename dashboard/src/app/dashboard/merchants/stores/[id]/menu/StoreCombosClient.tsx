"use client";

import { useEffect, useState } from "react";
import { Plus, Edit2, Trash2, X } from "lucide-react";
import { useToast } from "@/context/ToastContext";

type Combo = {
  id: number;
  combo_name: string;
  description: string | null;
  combo_price: string;
  image_url: string | null;
  is_active: boolean;
  display_order: number;
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

  const base = `/api/merchant/stores/${storeId}/menu/combos`;

  const load = async () => {
    setLoading(true);
    try {
      const r = await fetch(base);
      const j = await r.json().catch(() => ({}));
      if (r.ok && j?.combos) setCombos(j.combos);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [storeId]);

  const handleSubmit = async () => {
    const p = parseFloat(price);
    if (!name.trim() || !Number.isFinite(p) || p < 0) {
      toast("Name and valid price required");
      return;
    }
    setSaving(true);
    try {
      const url = editing ? `${base}/${editing.id}` : base;
      const method = editing ? "PUT" : "POST";
      const r = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          combo_name: name.trim(),
          description: description.trim() || null,
          combo_price: p,
        }),
      });
      if (!r.ok) throw new Error("Failed to save");
      toast(editing ? "Combo updated." : "Combo created.");
      setShowForm(false);
      setEditing(null);
      setName("");
      setDescription("");
      setPrice("");
      load();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Failed to save");
    }
    setSaving(false);
  };

  const handleDelete = async (c: Combo) => {
    if (!confirm(`Delete combo "${c.combo_name}"?`)) return;
    try {
      const r = await fetch(`${base}/${c.id}`, { method: "DELETE" });
      if (!r.ok) throw new Error("Failed to delete");
      toast("Combo deleted.");
      load();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Failed to delete");
    }
  };

  const openEdit = (c: Combo) => {
    setEditing(c);
    setName(c.combo_name);
    setDescription(c.description ?? "");
    setPrice(c.combo_price ?? "");
    setShowForm(true);
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
              <label className="block text-xs font-medium text-gray-600 mb-1">Price (₹) *</label>
              <input type="number" min={0} step={0.01} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="0" />
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
              <div key={c.id} className="flex items-center justify-between p-4 rounded-xl border border-gray-200 bg-white shadow-sm hover:border-orange-200 transition-colors">
                <div>
                  <div className="font-semibold text-gray-900">{c.combo_name}</div>
                  <div className="text-sm text-orange-600 font-medium mt-0.5">₹{Number(c.combo_price).toFixed(0)}</div>
                </div>
                <div className="flex items-center gap-2">
                  <button type="button" onClick={() => openEdit(c)} className="p-2 rounded-lg text-blue-600 hover:bg-blue-50">
                    <Edit2 size={16} />
                  </button>
                  <button type="button" onClick={() => handleDelete(c)} className="p-2 rounded-lg text-red-600 hover:bg-red-50">
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            ))}
            {combos.length === 0 && !loading && <div className="text-gray-500 text-sm py-8 text-center">No combos yet. Create one to bundle items.</div>}
          </div>
        )}
      </div>
    </div>
  );
}
