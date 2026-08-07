"use client";

import { useState } from "react";
import { Save } from "lucide-react";

interface NewContactFormProps {
  variant?: "page" | "sidesheet";
  onClose?: () => void;
}

export function NewContactForm({ variant = "page", onClose }: NewContactFormProps) {
  const isSideSheet = variant === "sidesheet";
  const [form, setForm] = useState({ name: "", email: "", phone: "", company: "", notes: "" });
  const [saving, setSaving] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    window.setTimeout(() => {
      setSaving(false);
      onClose?.();
    }, 500);
  };

  return (
    <form onSubmit={handleSubmit} className={isSideSheet ? "space-y-4" : "p-6 space-y-4"}>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1.5">Name *</label>
        <input
          type="text"
          value={form.name}
          onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          placeholder="Full name"
          required
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
        />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">Email *</label>
          <input
            type="email"
            value={form.email}
            onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
            placeholder="email@example.com"
            required
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">Phone</label>
          <input
            type="tel"
            value={form.phone}
            onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
            placeholder="+1 234 567 8900"
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
          />
        </div>
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1.5">Company</label>
        <input
          type="text"
          value={form.company}
          onChange={(e) => setForm((f) => ({ ...f, company: e.target.value }))}
          placeholder="Company name"
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1.5">Notes</label>
        <textarea
          value={form.notes}
          onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
          placeholder="Optional notes"
          rows={3}
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 resize-y"
        />
      </div>
      <div className={`flex flex-wrap items-center gap-3 ${isSideSheet ? "pt-1" : "pt-2 border-t border-gray-200"}`}>
        <button
          type="submit"
          disabled={saving || !form.name.trim() || !form.email.trim()}
          className="inline-flex items-center gap-2 rounded-lg bg-[#121212] px-4 py-2 text-sm font-medium text-white hover:bg-black disabled:opacity-50"
        >
          {saving ? (
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
          ) : (
            <Save className="h-4 w-4" />
          )}
          {saving ? "Saving..." : "Save contact"}
        </button>
        {isSideSheet ? (
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Cancel
          </button>
        ) : null}
      </div>
    </form>
  );
}
