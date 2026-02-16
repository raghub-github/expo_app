"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { ChevronLeft, AlertCircle, Loader2, ChevronRight, Save, CheckCircle } from "lucide-react";
import { usePermission } from "@/hooks/usePermission";

interface StoreDetail {
  id: number;
  storeId: string;
  name: string;
  storeName: string;
  storeDisplayName: string | null;
  storeDescription: string | null;
  storeEmail: string | null;
  storePhones: string[] | null;
  fullAddress: string | null;
  landmark: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  country: string | null;
  latitude: number | null;
  longitude: number | null;
  logoUrl: string | null;
  bannerUrl: string | null;
  galleryImages: string[] | null;
  cuisineTypes: string[] | null;
  foodCategories: string[] | null;
  avgPreparationTimeMinutes: number | null;
  minOrderAmount: number | null;
  deliveryRadiusKm: number | null;
  isPureVeg: boolean | null;
  acceptsOnlinePayment: boolean | null;
  acceptsCash: boolean | null;
  ownerPhone: string;
  status: string;
  approvalStatus: string;
  approvalReason: string | null;
  approvedBy: number | null;
  approvedAt: Date | null;
  rejectedReason: string | null;
  currentOnboardingStep: number | null;
  onboardingCompleted: boolean | null;
  onboardingCompletedAt: Date | null;
  isActive: boolean | null;
  isAcceptingOrders: boolean | null;
  isAvailable: boolean | null;
  lastActivityAt: Date | null;
  storeType: string | null;
  operationalStatus: string | null;
  localityCode: string | null;
  areaCode: string | null;
  parentStoreId: number | null;
  createdAt: Date | string;
  updatedAt: Date | string;
  createdBy: number | null;
  updatedBy: number | null;
  childStores?: Array<{ id: number; storeId: string; name: string; status: string }>;
  parent?: {
    id: number;
    parent_merchant_id: string;
    parent_name: string;
  };
}

type FormStep = 1 | 2 | 3 | 4 | 5;

export function AreaManagerStoreDetailClient({ storeId }: { storeId: string }) {
  const { canPerformAction, isSuperAdmin } = usePermission();
  const [store, setStore] = useState<StoreDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [updating, setUpdating] = useState(false);
  const [currentStep, setCurrentStep] = useState<FormStep>(1);
  const [formData, setFormData] = useState<Partial<StoreDetail>>({});
  const [saveSuccess, setSaveSuccess] = useState(false);

  const canUpdate = isSuperAdmin || canPerformAction("AREA_MANAGER", "UPDATE", { access_point_group: "AREA_MANAGER_MERCHANT" });

  useEffect(() => {
    const id = parseInt(storeId, 10);
    if (isNaN(id)) {
      setError("Invalid store id");
      setLoading(false);
      return;
    }
    (async () => {
      try {
        const res = await fetch(`/api/area-manager/stores/${id}`, {
          credentials: "include",
        });
        if (!res.ok) {
          if (res.status === 404) setError("Store not found");
          else setError("Failed to load store");
          return;
        }
        const json = await res.json();
        setStore(json.data);
        setFormData(json.data);
      } catch {
        setError("Something went wrong");
      } finally {
        setLoading(false);
      }
    })();
  }, [storeId]);

  const handleSave = async () => {
    if (!store || !canUpdate) return;
    setUpdating(true);
    setSaveSuccess(false);
    try {
      const res = await fetch(`/api/area-manager/stores/${store.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          name: formData.storeDisplayName ?? formData.storeName,
          status: formData.status,
          storeDescription: formData.storeDescription,
          storeEmail: formData.storeEmail,
          storePhones: formData.storePhones,
          fullAddress: formData.fullAddress,
          landmark: formData.landmark,
          city: formData.city,
          state: formData.state,
          postalCode: formData.postalCode,
          latitude: formData.latitude,
          longitude: formData.longitude,
          avgPreparationTimeMinutes: formData.avgPreparationTimeMinutes,
          minOrderAmount: formData.minOrderAmount,
          deliveryRadiusKm: formData.deliveryRadiusKm,
          isPureVeg: formData.isPureVeg,
          acceptsOnlinePayment: formData.acceptsOnlinePayment,
          acceptsCash: formData.acceptsCash,
          isActive: formData.isActive,
          isAcceptingOrders: formData.isAcceptingOrders,
          isAvailable: formData.isAvailable,
        }),
      });
      if (!res.ok) throw new Error("Update failed");
      const json = await res.json();
      setStore(json.data);
      setFormData(json.data);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch {
      setError("Failed to update store");
    } finally {
      setUpdating(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
      </div>
    );
  }

  if (error || !store) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 flex items-center gap-2 text-red-800">
        <AlertCircle className="h-5 w-5 flex-shrink-0" />
        {error ?? "Store not found"}
        <Link
          href="/dashboard/area-managers/stores"
          className="ml-auto text-sm font-medium text-red-700 underline"
        >
          Back to stores
        </Link>
      </div>
    );
  }

  const steps: { number: FormStep; title: string }[] = [
    { number: 1, title: "Basic Information" },
    { number: 2, title: "Contact & Location" },
    { number: 3, title: "Store Details" },
    { number: 4, title: "Status & Approval" },
    { number: 5, title: "Additional Info" },
  ];

  return (
    <div className="space-y-6">
      <Link
        href="/dashboard/area-managers/stores"
        className="inline-flex items-center gap-1 text-sm font-medium text-gray-600 hover:text-gray-900"
      >
        <ChevronLeft className="h-4 w-4" />
        Back to stores
      </Link>

      <div className="rounded-lg border border-gray-200 bg-white shadow-sm">
        {/* Step Indicator */}
        <div className="border-b border-gray-200 px-6 py-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold text-gray-900">{store.storeDisplayName ?? store.storeName}</h2>
            {saveSuccess && (
              <div className="flex items-center gap-2 text-green-600 text-sm">
                <CheckCircle className="h-4 w-4" />
                Saved successfully
              </div>
            )}
          </div>
          <div className="mt-4 flex items-center gap-2">
            {steps.map((step, idx) => (
              <div key={step.number} className="flex items-center">
                <button
                  type="button"
                  onClick={() => setCurrentStep(step.number)}
                  className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
                    currentStep === step.number
                      ? "bg-blue-600 text-white"
                      : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                  }`}
                >
                  {step.number}. {step.title}
                </button>
                {idx < steps.length - 1 && (
                  <ChevronRight className="h-4 w-4 text-gray-400 mx-1" />
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Form Content */}
        <div className="p-6">
          {currentStep === 1 && (
            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Basic Information</h3>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Store ID</label>
                  <input
                    type="text"
                    value={store.storeId}
                    disabled
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-500 bg-gray-50"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Store Name</label>
                  <input
                    type="text"
                    value={formData.storeName ?? ""}
                    disabled
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-500 bg-gray-50"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Display Name</label>
                  <input
                    type="text"
                    value={formData.storeDisplayName ?? ""}
                    onChange={(e) => setFormData({ ...formData, storeDisplayName: e.target.value })}
                    disabled={!canUpdate}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 disabled:bg-gray-50 disabled:text-gray-500"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                  <textarea
                    value={formData.storeDescription ?? ""}
                    onChange={(e) => setFormData({ ...formData, storeDescription: e.target.value })}
                    disabled={!canUpdate}
                    rows={3}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 disabled:bg-gray-50 disabled:text-gray-500"
                  />
                </div>
                {store.parent && (
                  <div className="sm:col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-1">Parent Store</label>
                    <div className="text-sm text-gray-900">
                      {store.parent.parent_name} ({store.parent.parent_merchant_id})
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {currentStep === 2 && (
            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Contact & Location</h3>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                  <input
                    type="email"
                    value={formData.storeEmail ?? ""}
                    onChange={(e) => setFormData({ ...formData, storeEmail: e.target.value })}
                    disabled={!canUpdate}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 disabled:bg-gray-50 disabled:text-gray-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
                  <input
                    type="text"
                    value={formData.storePhones?.[0] ?? ""}
                    onChange={(e) => setFormData({ ...formData, storePhones: [e.target.value] })}
                    disabled={!canUpdate}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 disabled:bg-gray-50 disabled:text-gray-500"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Full Address</label>
                  <textarea
                    value={formData.fullAddress ?? ""}
                    onChange={(e) => setFormData({ ...formData, fullAddress: e.target.value })}
                    disabled={!canUpdate}
                    rows={2}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 disabled:bg-gray-50 disabled:text-gray-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Landmark</label>
                  <input
                    type="text"
                    value={formData.landmark ?? ""}
                    onChange={(e) => setFormData({ ...formData, landmark: e.target.value })}
                    disabled={!canUpdate}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 disabled:bg-gray-50 disabled:text-gray-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">City</label>
                  <input
                    type="text"
                    value={formData.city ?? ""}
                    onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                    disabled={!canUpdate}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 disabled:bg-gray-50 disabled:text-gray-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">State</label>
                  <input
                    type="text"
                    value={formData.state ?? ""}
                    onChange={(e) => setFormData({ ...formData, state: e.target.value })}
                    disabled={!canUpdate}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 disabled:bg-gray-50 disabled:text-gray-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Postal Code</label>
                  <input
                    type="text"
                    value={formData.postalCode ?? ""}
                    onChange={(e) => setFormData({ ...formData, postalCode: e.target.value })}
                    disabled={!canUpdate}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 disabled:bg-gray-50 disabled:text-gray-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Latitude</label>
                  <input
                    type="number"
                    step="any"
                    value={formData.latitude ?? ""}
                    onChange={(e) => setFormData({ ...formData, latitude: e.target.value ? parseFloat(e.target.value) : null })}
                    disabled={!canUpdate}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 disabled:bg-gray-50 disabled:text-gray-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Longitude</label>
                  <input
                    type="number"
                    step="any"
                    value={formData.longitude ?? ""}
                    onChange={(e) => setFormData({ ...formData, longitude: e.target.value ? parseFloat(e.target.value) : null })}
                    disabled={!canUpdate}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 disabled:bg-gray-50 disabled:text-gray-500"
                  />
                </div>
              </div>
            </div>
          )}

          {currentStep === 3 && (
            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Store Details</h3>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Average Preparation Time (minutes)</label>
                  <input
                    type="number"
                    value={formData.avgPreparationTimeMinutes ?? ""}
                    onChange={(e) => setFormData({ ...formData, avgPreparationTimeMinutes: e.target.value ? parseInt(e.target.value) : null })}
                    disabled={!canUpdate}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 disabled:bg-gray-50 disabled:text-gray-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Min Order Amount</label>
                  <input
                    type="number"
                    step="0.01"
                    value={formData.minOrderAmount ?? ""}
                    onChange={(e) => setFormData({ ...formData, minOrderAmount: e.target.value ? parseFloat(e.target.value) : null })}
                    disabled={!canUpdate}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 disabled:bg-gray-50 disabled:text-gray-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Delivery Radius (km)</label>
                  <input
                    type="number"
                    step="0.1"
                    value={formData.deliveryRadiusKm ?? ""}
                    onChange={(e) => setFormData({ ...formData, deliveryRadiusKm: e.target.value ? parseFloat(e.target.value) : null })}
                    disabled={!canUpdate}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 disabled:bg-gray-50 disabled:text-gray-500"
                  />
                </div>
                <div className="sm:col-span-2">
                  <div className="flex items-center gap-4">
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={formData.isPureVeg ?? false}
                        onChange={(e) => setFormData({ ...formData, isPureVeg: e.target.checked })}
                        disabled={!canUpdate}
                        className="rounded border-gray-300 text-blue-600 disabled:opacity-50"
                      />
                      <span className="text-sm text-gray-700">Pure Vegetarian</span>
                    </label>
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={formData.acceptsOnlinePayment ?? false}
                        onChange={(e) => setFormData({ ...formData, acceptsOnlinePayment: e.target.checked })}
                        disabled={!canUpdate}
                        className="rounded border-gray-300 text-blue-600 disabled:opacity-50"
                      />
                      <span className="text-sm text-gray-700">Accepts Online Payment</span>
                    </label>
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={formData.acceptsCash ?? false}
                        onChange={(e) => setFormData({ ...formData, acceptsCash: e.target.checked })}
                        disabled={!canUpdate}
                        className="rounded border-gray-300 text-blue-600 disabled:opacity-50"
                      />
                      <span className="text-sm text-gray-700">Accepts Cash</span>
                    </label>
                  </div>
                </div>
              </div>
            </div>
          )}

          {currentStep === 4 && (
            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Status & Approval</h3>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Approval Status</label>
                  <select
                    value={formData.status ?? "PENDING"}
                    onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                    disabled={!canUpdate}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 disabled:bg-gray-50 disabled:text-gray-500"
                  >
                    <option value="PENDING">Pending</option>
                    <option value="VERIFIED">Verified</option>
                    <option value="REJECTED">Rejected</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Operational Status</label>
                  <input
                    type="text"
                    value={formData.operationalStatus ?? ""}
                    disabled
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-500 bg-gray-50"
                  />
                </div>
                <div>
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={formData.isActive ?? false}
                      onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
                      disabled={!canUpdate}
                      className="rounded border-gray-300 text-blue-600 disabled:opacity-50"
                    />
                    <span className="text-sm text-gray-700">Is Active</span>
                  </label>
                </div>
                <div>
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={formData.isAcceptingOrders ?? false}
                      onChange={(e) => setFormData({ ...formData, isAcceptingOrders: e.target.checked })}
                      disabled={!canUpdate}
                      className="rounded border-gray-300 text-blue-600 disabled:opacity-50"
                    />
                    <span className="text-sm text-gray-700">Is Accepting Orders</span>
                  </label>
                </div>
                <div>
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={formData.isAvailable ?? false}
                      onChange={(e) => setFormData({ ...formData, isAvailable: e.target.checked })}
                      disabled={!canUpdate}
                      className="rounded border-gray-300 text-blue-600 disabled:opacity-50"
                    />
                    <span className="text-sm text-gray-700">Is Available</span>
                  </label>
                </div>
                {formData.approvalReason && (
                  <div className="sm:col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-1">Approval Reason</label>
                    <div className="text-sm text-gray-900">{formData.approvalReason}</div>
                  </div>
                )}
                {formData.rejectedReason && (
                  <div className="sm:col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-1">Rejection Reason</label>
                    <div className="text-sm text-gray-900">{formData.rejectedReason}</div>
                  </div>
                )}
              </div>
            </div>
          )}

          {currentStep === 5 && (
            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Additional Information</h3>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Store Type</label>
                  <input
                    type="text"
                    value={formData.storeType ?? ""}
                    disabled
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-500 bg-gray-50"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Onboarding Step</label>
                  <input
                    type="number"
                    value={formData.currentOnboardingStep ?? ""}
                    disabled
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-500 bg-gray-50"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Created At</label>
                  <div className="text-sm text-gray-900">
                    {new Date(store.createdAt).toLocaleString()}
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Updated At</label>
                  <div className="text-sm text-gray-900">
                    {new Date(store.updatedAt).toLocaleString()}
                  </div>
                </div>
                {store.childStores && store.childStores.length > 0 && (
                  <div className="sm:col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-2">Child Stores</label>
                    <div className="space-y-1">
                      {store.childStores.map((c) => (
                        <Link
                          key={c.id}
                          href={`/dashboard/area-managers/stores/${c.id}`}
                          className="block text-sm text-blue-600 hover:underline"
                        >
                          {c.name} ({c.storeId}) - {c.status}
                        </Link>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Navigation and Save */}
          <div className="mt-6 flex items-center justify-between border-t border-gray-200 pt-4">
            <div className="flex gap-2">
              {currentStep > 1 && (
                <button
                  type="button"
                  onClick={() => setCurrentStep((currentStep - 1) as FormStep)}
                  className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  <ChevronLeft className="h-4 w-4" />
                  Previous
                </button>
              )}
              {currentStep < 5 && (
                <button
                  type="button"
                  onClick={() => setCurrentStep((currentStep + 1) as FormStep)}
                  className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
                >
                  Next
                  <ChevronRight className="h-4 w-4" />
                </button>
              )}
            </div>
            {canUpdate && (
              <button
                type="button"
                onClick={handleSave}
                disabled={updating}
                className="inline-flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
              >
                <Save className="h-4 w-4" />
                {updating ? "Saving..." : "Save Changes"}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
