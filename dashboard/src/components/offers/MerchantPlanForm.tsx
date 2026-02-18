"use client";

import { useState, useEffect } from "react";
import { X } from "lucide-react";
import type { MerchantPlan } from "@/hooks/queries/useMerchantPlansQuery";
import { useCreateMerchantPlan, useUpdateMerchantPlan } from "@/hooks/queries/useMerchantPlansQuery";

interface MerchantPlanFormProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  editPlan: MerchantPlan | null;
}

const BILLING_CYCLES = ["MONTHLY", "QUARTERLY", "YEARLY"] as const;

export function MerchantPlanForm({ isOpen, onClose, onSuccess, editPlan }: MerchantPlanFormProps) {
  const createMutation = useCreateMerchantPlan();
  const updateMutation = useUpdateMerchantPlan();

  const [planName, setPlanName] = useState("");
  const [planCode, setPlanCode] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("");
  const [billingCycle, setBillingCycle] = useState<"MONTHLY" | "QUARTERLY" | "YEARLY">("MONTHLY");
  const [maxMenuItems, setMaxMenuItems] = useState("");
  const [maxCuisines, setMaxCuisines] = useState("");
  const [maxMenuCategories, setMaxMenuCategories] = useState("");
  const [imageUploadAllowed, setImageUploadAllowed] = useState(false);
  const [maxImageUploads, setMaxImageUploads] = useState("");
  const [analyticsAccess, setAnalyticsAccess] = useState(false);
  const [advancedAnalytics, setAdvancedAnalytics] = useState(false);
  const [prioritySupport, setPrioritySupport] = useState(false);
  const [marketingAutomation, setMarketingAutomation] = useState(false);
  const [customApiIntegrations, setCustomApiIntegrations] = useState(false);
  const [dedicatedAccountManager, setDedicatedAccountManager] = useState(false);
  const [displayOrder, setDisplayOrder] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [isPopular, setIsPopular] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isEditing = !!editPlan;

  useEffect(() => {
    if (!isOpen) return;
    setError(null);
    if (editPlan) {
      setPlanName(editPlan.planName);
      setPlanCode(editPlan.planCode);
      setDescription(editPlan.description ?? "");
      setPrice(String(editPlan.price));
      setBillingCycle((editPlan.billingCycle as "MONTHLY" | "QUARTERLY" | "YEARLY") || "MONTHLY");
      setMaxMenuItems(editPlan.maxMenuItems != null ? String(editPlan.maxMenuItems) : "");
      setMaxCuisines(editPlan.maxCuisines != null ? String(editPlan.maxCuisines) : "");
      setMaxMenuCategories(editPlan.maxMenuCategories != null ? String(editPlan.maxMenuCategories) : "");
      setImageUploadAllowed(editPlan.imageUploadAllowed);
      setMaxImageUploads(editPlan.maxImageUploads != null ? String(editPlan.maxImageUploads) : "");
      setAnalyticsAccess(editPlan.analyticsAccess);
      setAdvancedAnalytics(editPlan.advancedAnalytics);
      setPrioritySupport(editPlan.prioritySupport);
      setMarketingAutomation(editPlan.marketingAutomation);
      setCustomApiIntegrations(editPlan.customApiIntegrations);
      setDedicatedAccountManager(editPlan.dedicatedAccountManager);
      setDisplayOrder(editPlan.displayOrder != null ? String(editPlan.displayOrder) : "");
      setIsActive(editPlan.isActive);
      setIsPopular(editPlan.isPopular);
    } else {
      setPlanName("");
      setPlanCode("");
      setDescription("");
      setPrice("0");
      setBillingCycle("MONTHLY");
      setMaxMenuItems("");
      setMaxCuisines("");
      setMaxMenuCategories("");
      setImageUploadAllowed(false);
      setMaxImageUploads("0");
      setAnalyticsAccess(false);
      setAdvancedAnalytics(false);
      setPrioritySupport(false);
      setMarketingAutomation(false);
      setCustomApiIntegrations(false);
      setDedicatedAccountManager(false);
      setDisplayOrder("");
      setIsActive(true);
      setIsPopular(false);
    }
  }, [isOpen, editPlan]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!planName.trim()) {
      setError("Plan name is required");
      return;
    }
    if (!planCode.trim()) {
      setError("Plan code is required");
      return;
    }
    const priceNum = parseFloat(price);
    if (isNaN(priceNum) || priceNum < 0) {
      setError("Price must be 0 or greater");
      return;
    }

    const payload = {
      planName: planName.trim(),
      planCode: planCode.trim().toUpperCase().replace(/\s+/g, "_"),
      description: description.trim() || null,
      price: priceNum,
      billingCycle,
      maxMenuItems: maxMenuItems ? parseInt(maxMenuItems, 10) : null,
      maxCuisines: maxCuisines ? parseInt(maxCuisines, 10) : null,
      maxMenuCategories: maxMenuCategories ? parseInt(maxMenuCategories, 10) : null,
      imageUploadAllowed,
      maxImageUploads: maxImageUploads ? parseInt(maxImageUploads, 10) : null,
      analyticsAccess,
      advancedAnalytics,
      prioritySupport,
      marketingAutomation,
      customApiIntegrations,
      dedicatedAccountManager,
      displayOrder: displayOrder ? parseInt(displayOrder, 10) : null,
      isActive,
      isPopular,
    };

    try {
      if (isEditing && editPlan) {
        await updateMutation.mutateAsync({ id: editPlan.id, ...payload });
      } else {
        await createMutation.mutateAsync(payload);
      }
      onSuccess();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    }
  };

  if (!isOpen) return null;

  const isLoading = createMutation.isPending || updateMutation.isPending;

  const inputCls = "w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500";
  const labelCls = "block text-sm font-medium text-gray-700 mb-1";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 overflow-y-auto" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[95vh] overflow-hidden flex flex-col my-8"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 shrink-0">
          <h2 className="text-lg font-semibold text-gray-900">{isEditing ? "Edit Plan" : "Add New Plan"}</h2>
          <button type="button" onClick={onClose} className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 hover:text-gray-700">
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-6">
          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
          )}

          <div>
            <h3 className="text-sm font-semibold text-gray-800 mb-3">Basic Info</h3>
            <div className="space-y-4">
              <div>
                <label className={labelCls}>Plan Name *</label>
                <input type="text" value={planName} onChange={(e) => setPlanName(e.target.value)} className={inputCls} placeholder="e.g. Starter" />
              </div>
              <div>
                <label className={labelCls}>Plan Code *</label>
                <input
                  type="text"
                  value={planCode}
                  onChange={(e) => setPlanCode(e.target.value.toUpperCase())}
                  className={inputCls}
                  placeholder="e.g. STARTER"
                  disabled={isEditing}
                />
                {isEditing && <p className="text-xs text-gray-500 mt-0.5">Plan code cannot be changed</p>}
              </div>
              <div>
                <label className={labelCls}>Description</label>
                <textarea value={description} onChange={(e) => setDescription(e.target.value)} className={inputCls} rows={2} placeholder="Brief description" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={labelCls}>Price (₹)</label>
                  <input type="number" step="0.01" min="0" value={price} onChange={(e) => setPrice(e.target.value)} className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>Billing Cycle</label>
                  <select value={billingCycle} onChange={(e) => setBillingCycle(e.target.value as "MONTHLY" | "QUARTERLY" | "YEARLY")} className={inputCls}>
                    {BILLING_CYCLES.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          </div>

          <div>
            <h3 className="text-sm font-semibold text-gray-800 mb-3">Menu Limits</h3>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className={labelCls}>Max Menu Items</label>
                <input type="number" min="0" value={maxMenuItems} onChange={(e) => setMaxMenuItems(e.target.value)} className={inputCls} placeholder="—" />
              </div>
              <div>
                <label className={labelCls}>Max Cuisines</label>
                <input type="number" min="0" value={maxCuisines} onChange={(e) => setMaxCuisines(e.target.value)} className={inputCls} placeholder="—" />
              </div>
              <div>
                <label className={labelCls}>Max Menu Categories</label>
                <input type="number" min="0" value={maxMenuCategories} onChange={(e) => setMaxMenuCategories(e.target.value)} className={inputCls} placeholder="—" />
              </div>
            </div>
          </div>

          <div>
            <h3 className="text-sm font-semibold text-gray-800 mb-3">Image Uploads</h3>
            <div className="flex items-center gap-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={imageUploadAllowed} onChange={(e) => setImageUploadAllowed(e.target.checked)} className="rounded border-gray-300 text-blue-600" />
                <span className="text-sm text-gray-700">Image upload allowed</span>
              </label>
              {imageUploadAllowed && (
                <div className="flex-1 max-w-[120px]">
                  <input type="number" min="0" value={maxImageUploads} onChange={(e) => setMaxImageUploads(e.target.value)} className={inputCls} placeholder="Max" />
                </div>
              )}
            </div>
          </div>

          <div>
            <h3 className="text-sm font-semibold text-gray-800 mb-3">Features</h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {[
                { key: "analyticsAccess", label: "Analytics Access", val: analyticsAccess, set: setAnalyticsAccess },
                { key: "advancedAnalytics", label: "Advanced Analytics", val: advancedAnalytics, set: setAdvancedAnalytics },
                { key: "prioritySupport", label: "Priority Support", val: prioritySupport, set: setPrioritySupport },
                { key: "marketingAutomation", label: "Marketing Automation", val: marketingAutomation, set: setMarketingAutomation },
                { key: "customApiIntegrations", label: "Custom API", val: customApiIntegrations, set: setCustomApiIntegrations },
                { key: "dedicatedAccountManager", label: "Dedicated Account Manager", val: dedicatedAccountManager, set: setDedicatedAccountManager },
              ].map(({ key, label, val, set }) => (
                <label key={key} className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={val} onChange={(e) => set(e.target.checked)} className="rounded border-gray-300 text-blue-600" />
                  <span className="text-sm text-gray-700">{label}</span>
                </label>
              ))}
            </div>
          </div>

          <div>
            <h3 className="text-sm font-semibold text-gray-800 mb-3">Display</h3>
            <div className="flex flex-wrap items-center gap-4">
              <div>
                <label className={labelCls}>Display Order</label>
                <input type="number" min="0" value={displayOrder} onChange={(e) => setDisplayOrder(e.target.value)} className={`${inputCls} w-24`} placeholder="0" />
              </div>
              <label className="flex items-center gap-2 cursor-pointer pt-6">
                <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} className="rounded border-gray-300 text-blue-600" />
                <span className="text-sm text-gray-700">Active</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer pt-6">
                <input type="checkbox" checked={isPopular} onChange={(e) => setIsPopular(e.target.checked)} className="rounded border-gray-300 text-blue-600" />
                <span className="text-sm text-gray-700">Popular</span>
              </label>
            </div>
          </div>
        </form>

        <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-200 bg-gray-50 shrink-0">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50">
            Cancel
          </button>
          <button
            type="submit"
            onClick={handleSubmit}
            disabled={isLoading}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50"
          >
            {isLoading ? "Saving…" : isEditing ? "Update" : "Add Plan"}
          </button>
        </div>
      </div>
    </div>
  );
}
