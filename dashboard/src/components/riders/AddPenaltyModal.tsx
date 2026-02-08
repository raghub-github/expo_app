"use client";

import { useState } from "react";

interface AddPenaltyModalProps {
  riderId: number;
  riderLabel: string;
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

const SERVICE_TYPES = [
  { value: "", label: "— Not specified" },
  { value: "food", label: "Food" },
  { value: "parcel", label: "Parcel" },
  { value: "person_ride", label: "Person Ride" },
] as const;

const PENALTY_TYPES = [
  { value: "order_mistake", label: "Order mistake" },
  { value: "late_delivery", label: "Late delivery" },
  { value: "customer_complaint", label: "Customer complaint" },
  { value: "other", label: "Other" },
] as const;

export function AddPenaltyModal({
  riderId,
  riderLabel,
  open,
  onClose,
  onSuccess,
}: AddPenaltyModalProps) {
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [serviceType, setServiceType] = useState<string>("");
  const [penaltyType, setPenaltyType] = useState<string>("other");
  const [orderId, setOrderId] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
      const res = await fetch(`/api/riders/${riderId}/penalties`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount: amt,
          reason: reason.trim(),
          serviceType: serviceType && ["food", "parcel", "person_ride"].includes(serviceType) ? serviceType : null,
          penaltyType,
          orderId: orderId.trim() ? parseInt(orderId, 10) : undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || "Failed to add penalty");
      }
      setAmount("");
      setReason("");
      setOrderId("");
      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err?.message || "Failed to add penalty");
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
        <h3 className="text-lg font-bold text-gray-900 mb-1">Add Penalty</h3>
        <p className="text-sm text-gray-500 mb-4">{riderLabel}</p>
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          )}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Amount (₹) *</label>
            <input
              type="number"
              step="0.01"
              min="0"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500 text-sm text-gray-900 bg-white"
              required
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Reason *</label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={2}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500 text-sm text-gray-900 bg-white placeholder:text-gray-500"
              placeholder="e.g. Order mistake, wrong delivery, customer complaint"
              required
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Service (optional)</label>
            <select
              value={serviceType}
              onChange={(e) => setServiceType(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500 text-sm text-gray-900 bg-white"
            >
              {SERVICE_TYPES.map((s) => (
                <option key={s.value || "none"} value={s.value} className="text-gray-900 bg-white">{s.label}</option>
              ))}
            </select>
            <p className="mt-0.5 text-xs text-gray-500">Food, Parcel, or Person Ride — leave unspecified if not tied to a service</p>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Type</label>
            <select
              value={penaltyType}
              onChange={(e) => setPenaltyType(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500 text-sm text-gray-900 bg-white"
            >
              {PENALTY_TYPES.map((p) => (
                <option key={p.value} value={p.value} className="text-gray-900 bg-white">{p.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Order ID (optional)</label>
            <input
              type="number"
              value={orderId}
              onChange={(e) => setOrderId(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500 text-sm text-gray-900 bg-white placeholder:text-gray-500"
              placeholder="If related to an order"
            />
          </div>
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 px-4 py-2 bg-amber-600 text-white rounded-lg text-sm font-medium hover:bg-amber-700 disabled:opacity-50"
            >
              {loading ? "Adding..." : "Add Penalty"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
