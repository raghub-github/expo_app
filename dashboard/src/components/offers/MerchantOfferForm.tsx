"use client";

import { useState, useEffect } from "react";
import { X } from "lucide-react";
import type { MerchantOffer } from "@/hooks/queries/useMerchantOffersQuery";
import { useCreateMerchantOffer, useUpdateMerchantOffer, useOffersStores } from "@/hooks/queries/useMerchantOffersQuery";

interface MerchantOfferFormProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  editOffer: MerchantOffer | null;
}

export function MerchantOfferForm({ isOpen, onClose, onSuccess, editOffer }: MerchantOfferFormProps) {
  const createMutation = useCreateMerchantOffer();
  const updateMutation = useUpdateMerchantOffer();
  const { data: stores = [] } = useOffersStores();

  const [title, setTitle] = useState("");
  const [offerCode, setOfferCode] = useState("");
  const [discountType, setDiscountType] = useState<"FLAT" | "PERCENTAGE">("PERCENTAGE");
  const [discountValue, setDiscountValue] = useState("");
  const [minOrderAmount, setMinOrderAmount] = useState("");
  const [validFrom, setValidFrom] = useState("");
  const [validTill, setValidTill] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [storeId, setStoreId] = useState<string>("");
  const [error, setError] = useState<string | null>(null);

  const isEditing = !!editOffer;

  useEffect(() => {
    if (!isOpen) return;
    setError(null);
    if (editOffer) {
      setTitle(editOffer.title);
      setOfferCode(editOffer.offerCode);
      setDiscountType(editOffer.discountType);
      setDiscountValue(String(editOffer.discountValue));
      setMinOrderAmount(editOffer.minOrderAmount != null ? String(editOffer.minOrderAmount) : "");
      setValidFrom(editOffer.validFrom.slice(0, 16));
      setValidTill(editOffer.validTill.slice(0, 16));
      setIsActive(editOffer.isActive);
      setStoreId(editOffer.storeId != null ? String(editOffer.storeId) : stores[0]?.id != null ? String(stores[0].id) : "");
    } else {
      setTitle("");
      setOfferCode("");
      setDiscountType("PERCENTAGE");
      setDiscountValue("");
      setMinOrderAmount("");
      const now = new Date();
      const nextMonth = new Date(now);
      nextMonth.setMonth(nextMonth.getMonth() + 1);
      setValidFrom(now.toISOString().slice(0, 16));
      setValidTill(nextMonth.toISOString().slice(0, 16));
      setIsActive(true);
      setStoreId(stores[0]?.id != null ? String(stores[0].id) : "");
    }
  }, [isOpen, editOffer, stores]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const dv = parseFloat(discountValue);
    if (isNaN(dv) || dv <= 0) {
      setError("Discount value must be a positive number");
      return;
    }
    if (discountType === "PERCENTAGE" && dv > 100) {
      setError("Percentage discount cannot exceed 100");
      return;
    }
    if (!title.trim()) {
      setError("Offer name is required");
      return;
    }
    if (!offerCode.trim()) {
      setError("Offer code is required");
      return;
    }
    if (!validFrom || !validTill) {
      setError("Valid from and valid till are required");
      return;
    }
    if (!storeId) {
      setError("Store is required");
      return;
    }
    if (new Date(validFrom) >= new Date(validTill)) {
      setError("Valid till must be after valid from");
      return;
    }

    try {
      if (isEditing && editOffer) {
        await updateMutation.mutateAsync({
          id: editOffer.id,
          title: title.trim(),
          offerCode: offerCode.trim().toUpperCase(),
          discountType,
          discountValue: dv,
          minOrderAmount: minOrderAmount ? parseFloat(minOrderAmount) : null,
          validFrom,
          validTill,
          isActive,
          storeId: storeId ? parseInt(storeId, 10) : null,
        });
      } else {
        await createMutation.mutateAsync({
          title: title.trim(),
          offerCode: offerCode.trim().toUpperCase(),
          discountType,
          discountValue: dv,
          minOrderAmount: minOrderAmount ? parseFloat(minOrderAmount) : null,
          validFrom,
          validTill,
          isActive,
          storeId: storeId ? parseInt(storeId, 10) : null,
        });
      }
      onSuccess();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    }
  };

  if (!isOpen) return null;

  const isLoading = createMutation.isPending || updateMutation.isPending;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[95vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">
            {isEditing ? "Edit Offer" : "Add New Offer"}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 hover:text-gray-700"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-5">
          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Offer Name *</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              placeholder="e.g. Summer Sale"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Offer Code *</label>
            <input
              type="text"
              value={offerCode}
              onChange={(e) => setOfferCode(e.target.value.toUpperCase())}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              placeholder="e.g. SUMMER20"
              disabled={isEditing}
            />
            {isEditing && <p className="text-xs text-gray-500 mt-0.5">Offer code cannot be changed</p>}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Discount Type *</label>
              <select
                value={discountType}
                onChange={(e) => setDiscountType(e.target.value as "FLAT" | "PERCENTAGE")}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500"
              >
                <option value="PERCENTAGE">Percentage</option>
                <option value="FLAT">Flat</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Discount Value * {discountType === "PERCENTAGE" ? "(%)" : "(₹)"}
              </label>
              <input
                type="number"
                step={discountType === "PERCENTAGE" ? "0.01" : "1"}
                min="0"
                value={discountValue}
                onChange={(e) => setDiscountValue(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500"
                placeholder={discountType === "PERCENTAGE" ? "20" : "50"}
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Minimum Order Amount (₹)</label>
            <input
              type="number"
              step="1"
              min="0"
              value={minOrderAmount}
              onChange={(e) => setMinOrderAmount(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500"
              placeholder="0"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Store {!isEditing && "*"}</label>
            <select
              value={storeId}
              onChange={(e) => setStoreId(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500"
            >
              <option value="">— Select Store —</option>
              {stores.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Valid From *</label>
              <input
                type="datetime-local"
                value={validFrom}
                onChange={(e) => setValidFrom(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Valid Till *</label>
              <input
                type="datetime-local"
                value={validTill}
                onChange={(e) => setValidTill(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="isActive"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
              className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            <label htmlFor="isActive" className="text-sm text-gray-700">Active</label>
          </div>
        </form>

        <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-200 bg-gray-50">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            onClick={handleSubmit}
            disabled={isLoading}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50"
          >
            {isLoading ? "Saving…" : isEditing ? "Update" : "Add Offer"}
          </button>
        </div>
      </div>
    </div>
  );
}
