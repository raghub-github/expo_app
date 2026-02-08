"use client";

import { useState, useEffect } from "react";

const SERVICE_OPTIONS = [
  { value: "", label: "— Not specified" },
  { value: "food", label: "Food" },
  { value: "parcel", label: "Parcel" },
  { value: "person_ride", label: "Person Ride" },
] as const;

interface AddAmountModalProps {
  riderId: number;
  riderLabel?: string;
  open: boolean;
  onClose: () => void;
  onSuccess: (requestId?: number) => void;
  /** When set, request is order-linked (read-only in UI) */
  orderId?: number;
  /** Pre-fill service when opened from order context; still editable unless you want read-only */
  serviceType?: "food" | "parcel" | "person_ride";
}

function generateIdempotencyKey(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `add-amt-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function AddAmountModal({
  riderId,
  riderLabel,
  open,
  onClose,
  onSuccess,
  orderId,
  serviceType,
}: AddAmountModalProps) {
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [serviceTypeLocal, setServiceTypeLocal] = useState<string>(serviceType ?? "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) setServiceTypeLocal(serviceType ?? "");
  }, [open, serviceType]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const amt = parseFloat(amount);
    if (!(amt > 0)) {
      setError("Amount must be positive");
      return;
    }
    if (!reason.trim()) {
      setError("Reason is required");
      return;
    }
    setLoading(true);
    try {
      const idempotencyKey = generateIdempotencyKey();
      const body: {
        amount: number;
        reason: string;
        orderId?: number;
        serviceType?: string;
        idempotencyKey: string;
      } = {
        amount: amt,
        reason: reason.trim(),
        idempotencyKey,
      };
      if (orderId != null) body.orderId = orderId;
      const st = serviceTypeLocal && serviceTypeLocal.trim() ? serviceTypeLocal.trim() : undefined;
      if (st && ["food", "parcel", "person_ride"].includes(st)) body.serviceType = st;

      const res = await fetch(`/api/riders/${riderId}/wallet-credit-requests`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || "Failed to create wallet credit request");
      }
      setAmount("");
      setReason("");
      onSuccess(json.data?.id);
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to create request");
    } finally {
      setLoading(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={onClose}>
      <div
        className="bg-white rounded-xl shadow-lg max-w-md w-full p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-lg font-bold text-gray-900 mb-1">Add Amount (Wallet Credit Request)</h3>
        {riderLabel && <p className="text-sm text-gray-500 mb-4">{riderLabel}</p>}
        <p className="text-sm text-gray-600 mb-4">
          A request will be created for approval. The rider&apos;s wallet will be credited only after an approver approves it.
        </p>
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          )}
          {orderId != null && (
            <div className="rounded-lg bg-gray-50 border border-gray-200 px-3 py-2 text-sm text-gray-700">
              <span className="font-medium text-gray-900">Order ID:</span> {orderId}
              {serviceType && (
                <span className="ml-2">
                  <span className="font-medium text-gray-900">Service:</span> {serviceType.replace("_", " ")}
                </span>
              )}
            </div>
          )}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Service (optional)</label>
            <select
              value={serviceTypeLocal}
              onChange={(e) => setServiceTypeLocal(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900 bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              {SERVICE_OPTIONS.map((o) => (
                <option key={o.value || "none"} value={o.value} className="text-gray-900 bg-white">{o.label}</option>
              ))}
            </select>
            <p className="mt-0.5 text-xs text-gray-500">For which service this credit applies (e.g. Food, Parcel, Person Ride)</p>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Amount (₹) *</label>
            <input
              type="number"
              step="0.01"
              min="0.01"
              required
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900 bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              placeholder="e.g. 100"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Reason *</label>
            <textarea
              rows={3}
              required
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900 bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 placeholder:text-gray-500"
              placeholder="e.g. Goodwill credit for order delay"
            />
          </div>
          <div className="flex gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-3 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 px-3 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-lg"
            >
              {loading ? "Submitting..." : "Submit request"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
