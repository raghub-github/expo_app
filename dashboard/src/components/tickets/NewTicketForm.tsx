"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Ticket, ArrowLeft, Loader2 } from "lucide-react";
import { useTicketsReferenceDataQuery } from "@/hooks/tickets/useTicketsReferenceDataQuery";

const CATEGORY_OPTIONS = [
  { value: "order_related", label: "Order related" },
  { value: "non_order", label: "Non-order" },
  { value: "other", label: "Other" },
];

export function NewTicketForm() {
  const router = useRouter();
  const { data: refData, isLoading: loading, isError, error: queryError } = useTicketsReferenceDataQuery();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState({
    serviceType: "food",
    ticketCategory: "order_related",
    ticketSection: "customer",
    sourceRole: "customer",
    subject: "",
    description: "",
    priority: "medium",
    orderId: "",
    orderServiceType: "",
    is3plOrder: false,
    isHighValueOrder: false,
  });

  const loadError = isError ? (queryError instanceof Error ? queryError.message : "Failed to load") : null;
  const displayError = loadError ?? error;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const body: Record<string, unknown> = {
        serviceType: form.serviceType,
        ticketCategory: form.ticketCategory,
        ticketSection: form.ticketSection,
        sourceRole: form.sourceRole,
        subject: form.subject.trim(),
        description: form.description.trim(),
        priority: form.priority,
        is3plOrder: form.is3plOrder,
        isHighValueOrder: form.isHighValueOrder,
      };
      if (form.orderId?.trim()) {
        const oid = parseInt(form.orderId.trim(), 10);
        if (!Number.isNaN(oid)) body.orderId = oid;
      }
      if (form.orderServiceType?.trim()) body.orderServiceType = form.orderServiceType.trim();

      const res = await fetch("/api/tickets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "Failed to create ticket");
      const ticketId = json?.data?.ticket?.id;
      if (ticketId) router.push(`/dashboard/tickets/${ticketId}`);
      else router.push("/dashboard/tickets");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-[400px] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-6 flex items-center gap-3">
        <Link
          href="/dashboard/tickets"
          className="flex items-center gap-1.5 text-sm font-medium text-gray-600 hover:text-gray-900"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to tickets
        </Link>
      </div>
      <div className="rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden">
        <div className="border-b border-gray-200 bg-gradient-to-r from-amber-50 to-orange-50 px-6 py-5">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-amber-100 text-amber-700">
              <Ticket className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-xl font-semibold text-gray-900">Create new ticket</h1>
              <p className="text-sm text-gray-600 mt-0.5">Add a support ticket for a customer, rider, or merchant.</p>
            </div>
          </div>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {displayError && (
            <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-800 border border-red-200">
              {displayError}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Service type</label>
              <select
                value={form.serviceType}
                onChange={(e) => setForm((f) => ({ ...f, serviceType: e.target.value }))}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-amber-500 focus:ring-1 focus:ring-amber-500"
              >
                {(refData?.services ?? []).map((s) => (
                  <option key={s.value} value={s.value}>{s.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Category</label>
              <select
                value={form.ticketCategory}
                onChange={(e) => setForm((f) => ({ ...f, ticketCategory: e.target.value }))}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-amber-500 focus:ring-1 focus:ring-amber-500"
              >
                {CATEGORY_OPTIONS.map((c) => (
                  <option key={c.value} value={c.value}>{c.label}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Section</label>
              <select
                value={form.ticketSection}
                onChange={(e) => setForm((f) => ({ ...f, ticketSection: e.target.value }))}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-amber-500 focus:ring-1 focus:ring-amber-500"
              >
                <option value="customer">Customer</option>
                <option value="rider">Rider</option>
                <option value="merchant">Merchant</option>
                <option value="system">System</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Source</label>
              <select
                value={form.sourceRole}
                onChange={(e) => setForm((f) => ({ ...f, sourceRole: e.target.value }))}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-amber-500 focus:ring-1 focus:ring-amber-500"
              >
                {(refData?.sources ?? []).map((s) => (
                  <option key={s.value} value={s.value}>{s.label}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Subject *</label>
            <input
              type="text"
              value={form.subject}
              onChange={(e) => setForm((f) => ({ ...f, subject: e.target.value }))}
              placeholder="Brief summary of the issue"
              required
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-amber-500 focus:ring-1 focus:ring-amber-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Description *</label>
            <textarea
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              placeholder="Detailed description of the issue..."
              required
              rows={5}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-amber-500 focus:ring-1 focus:ring-amber-500 resize-y"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Priority</label>
              <select
                value={form.priority}
                onChange={(e) => setForm((f) => ({ ...f, priority: e.target.value }))}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-amber-500 focus:ring-1 focus:ring-amber-500"
              >
                {(refData?.priorities ?? []).map((p) => (
                  <option key={p.value} value={p.value}>{p.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Order ID (optional)</label>
              <input
                type="text"
                value={form.orderId}
                onChange={(e) => setForm((f) => ({ ...f, orderId: e.target.value }))}
                placeholder="e.g. 12345"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-amber-500 focus:ring-1 focus:ring-amber-500"
              />
            </div>
          </div>

          <div className="flex flex-wrap gap-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={form.is3plOrder}
                onChange={(e) => setForm((f) => ({ ...f, is3plOrder: e.target.checked }))}
                className="h-4 w-4 rounded border-gray-300 text-amber-600 focus:ring-amber-500"
              />
              <span className="text-sm text-gray-700">3PL order</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={form.isHighValueOrder}
                onChange={(e) => setForm((f) => ({ ...f, isHighValueOrder: e.target.checked }))}
                className="h-4 w-4 rounded border-gray-300 text-amber-600 focus:ring-amber-500"
              />
              <span className="text-sm text-gray-700">High value order</span>
            </label>
          </div>

          <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-gray-200">
            <button
              type="submit"
              disabled={submitting || !form.subject.trim() || !form.description.trim()}
              className="inline-flex items-center gap-2 rounded-xl bg-amber-600 px-5 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-amber-700 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Creating...
                </>
              ) : (
                "Create ticket"
              )}
            </button>
            <Link
              href="/dashboard/tickets"
              className="rounded-xl border border-gray-300 bg-white px-5 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Cancel
            </Link>
          </div>
        </form>
      </div>
    </div>
  );
}
