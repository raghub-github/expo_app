"use client";

import { useState } from "react";
import Link from "next/link";
import { Building2, ArrowLeft, Save } from "lucide-react";

export default function NewCompanyPage() {
  const [form, setForm] = useState({
    name: "",
    website: "",
    industry: "",
    address: "",
    notes: "",
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    // Placeholder: in production would POST to /api/companies
    setTimeout(() => {
      setSaving(false);
      setSaved(true);
    }, 600);
  };

  if (saved) {
    return (
      <div className="min-h-full bg-gray-50/80 p-4 sm:p-6">
        <div className="mx-auto max-w-xl">
          <div className="rounded-2xl border border-gray-200 bg-white shadow-sm p-8 text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-violet-100 text-violet-600 mb-4">
              <Building2 className="h-7 w-7" />
            </div>
            <h2 className="text-lg font-semibold text-gray-900">Company saved</h2>
            <p className="mt-2 text-sm text-gray-600">
              Connect this form to your companies API to persist data.
            </p>
            <div className="mt-6 flex flex-wrap justify-center gap-3">
              <button
                type="button"
                onClick={() => { setSaved(false); setForm({ name: "", website: "", industry: "", address: "", notes: "" }); }}
                className="rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-violet-700"
              >
                Add another
              </button>
              <Link
                href="/dashboard"
                className="rounded-xl border border-gray-300 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Back to dashboard
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-full bg-gray-50/80 p-4 sm:p-6">
      <div className="mx-auto max-w-2xl">
        <div className="mb-6">
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-600 hover:text-gray-900"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to dashboard
          </Link>
        </div>
        <div className="rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden">
          <div className="border-b border-gray-200 bg-gradient-to-r from-violet-50 to-purple-50 px-6 py-5">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-violet-100 text-violet-700">
                <Building2 className="h-6 w-6" />
              </div>
              <div>
                <h1 className="text-xl font-semibold text-gray-900">New company</h1>
                <p className="text-sm text-gray-600 mt-0.5">Add a company for support or CRM.</p>
              </div>
            </div>
          </div>
          <form onSubmit={handleSubmit} className="p-6 space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Company name *</label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="Acme Inc."
                required
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-violet-500 focus:ring-1 focus:ring-violet-500"
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Website</label>
                <input
                  type="url"
                  value={form.website}
                  onChange={(e) => setForm((f) => ({ ...f, website: e.target.value }))}
                  placeholder="https://example.com"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-violet-500 focus:ring-1 focus:ring-violet-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Industry</label>
                <input
                  type="text"
                  value={form.industry}
                  onChange={(e) => setForm((f) => ({ ...f, industry: e.target.value }))}
                  placeholder="e.g. Technology, Retail"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-violet-500 focus:ring-1 focus:ring-violet-500"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Address</label>
              <input
                type="text"
                value={form.address}
                onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
                placeholder="Street, city, country"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-violet-500 focus:ring-1 focus:ring-violet-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Notes</label>
              <textarea
                value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                placeholder="Optional notes"
                rows={3}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-violet-500 focus:ring-1 focus:ring-violet-500 resize-y"
              />
            </div>
            <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-gray-200">
              <button
                type="submit"
                disabled={saving || !form.name.trim()}
                className="inline-flex items-center gap-2 rounded-xl bg-violet-600 px-5 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-violet-700 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {saving ? (
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                ) : (
                  <Save className="h-4 w-4" />
                )}
                {saving ? "Saving..." : "Save company"}
              </button>
              <Link
                href="/dashboard"
                className="rounded-xl border border-gray-300 bg-white px-5 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </Link>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
