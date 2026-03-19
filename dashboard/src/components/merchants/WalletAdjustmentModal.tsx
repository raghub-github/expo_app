"use client";

import { useState } from "react";
import { X, Plus, Loader2, Wallet } from "lucide-react";
import { useToast } from "@/context/ToastContext";

type OrderInfo = {
  id: number;
  order_id: number;
  formatted_order_id?: string | null;
};

export function WalletAdjustmentModal({
  storeId,
  order,
  onClose,
  onSuccess,
}: {
  storeId: string;
  order: OrderInfo | null;
  onClose: () => void;
  onSuccess?: () => void;
}) {
  const { toast } = useToast();
  const [direction, setDirection] = useState<"CREDIT" | "DEBIT">("CREDIT");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);

  if (!order) return null;

  const handleSubmit = async () => {
    const amt = parseFloat(amount);
    const r = reason.trim();
    if (isNaN(amt) || amt <= 0) {
      toast("Enter a valid amount (min ₹0.01)");
      return;
    }
    if (r.length < 5) {
      toast("Reason must be at least 5 characters");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch(`/api/merchant/stores/${storeId}/wallet-requests`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          direction,
          amount: amt,
          reason: r,
          order_id: order.order_id,
        }),
      });
      const data = await res.json();
      if (data.success) {
        toast("Request submitted");
        onSuccess?.();
        onClose();
      } else {
        toast(data.error || "Failed to create request");
      }
    } catch {
      toast("Failed to create request");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-xl max-w-md w-full max-h-[90vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex-shrink-0 bg-gradient-to-r from-indigo-500 to-indigo-600 p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Wallet className="text-white" size={24} />
            <div>
              <h2 className="text-lg font-bold text-white">Add or deduct amount</h2>
              <p className="text-indigo-100 text-sm">
                Order {order.formatted_order_id || `#${order.order_id}`}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-white hover:bg-white/20 p-2 rounded-lg transition-colors"
            aria-label="Close"
          >
            <X size={20} />
          </button>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-4">
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setDirection("CREDIT")}
              className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium ${
                direction === "CREDIT"
                  ? "bg-emerald-600 text-white"
                  : "bg-gray-200 text-gray-700"
              }`}
            >
              Add (Credit)
            </button>
            <button
              type="button"
              onClick={() => setDirection("DEBIT")}
              className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium ${
                direction === "DEBIT"
                  ? "bg-red-600 text-white"
                  : "bg-gray-200 text-gray-700"
              }`}
            >
              Deduct (Debit)
            </button>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Amount (₹) *</label>
            <input
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
              min={0}
              step={0.01}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Reason *</label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Describe why this adjustment is needed (min 5 chars)"
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
            />
          </div>
          <p className="text-xs text-gray-500">
            Order ID #{order.order_id} will be linked to this request automatically.
          </p>
        </div>
        <div className="flex-shrink-0 bg-gray-50 px-4 py-4 flex gap-3 border-t border-gray-200">
          <button
            onClick={onClose}
            disabled={submitting}
            className="flex-1 py-2.5 text-gray-700 border border-gray-300 rounded-xl hover:bg-gray-100 font-medium disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={submitting || !amount || !reason.trim() || parseFloat(amount) <= 0}
            className="flex-1 py-2.5 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 font-medium disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {submitting ? (
              <Loader2 size={18} className="animate-spin" />
            ) : (
              <Plus size={18} />
            )}
            Submit request
          </button>
        </div>
      </div>
    </div>
  );
}
