"use client";

import React, { useState, useEffect, useRef } from "react";
import {
  Building,
  MapPin,
  Clock,
  User,
  CheckCircle,
  Shield,
  Banknote,
  Hash,
  Activity,
  Calendar,
  FileCheck,
  Upload,
  Image as ImageIcon,
  Download,
  ExternalLink,
  History,
  AlertTriangle,
} from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { STORE_KEY } from "@/hooks/useStore";
import { useToast } from "@/context/ToastContext";
import { useStoreMutation, type StoreProfile } from "@/hooks/useStore";
import { useStoreProfileFull, STORE_PROFILE_FULL_KEY } from "@/hooks/useStoreProfileFull";
import { useStoreVerificationData } from "@/hooks/useStoreVerificationData";
import { OperatingDaysCard } from "./OperatingDaysCard";
import { CompactEditableRow, CompactLockedRow } from "./CompactProfileRows";
import { ChangeAddressModal } from "./ChangeAddressModal";
import { StoreProfileSkeleton } from "./StoreProfileSkeleton";

function formatArray(arr: string[] | undefined | null): string {
  if (!arr || arr.length === 0) return "—";
  return arr.join(", ");
}

function formatDate(dateString: string | undefined | null): string {
  if (!dateString) return "—";
  return new Date(dateString).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function StoreProfileClient({ storeId }: { storeId: string }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const router = useRouter();
  const {
    store: displayStoreFromApi,
    documents,
    operatingHours,
    agreementAcceptance,
    bankAccounts,
    areaManager,
    isLoading: profileLoading,
  } = useStoreProfileFull(storeId);
  const { agreementAcceptance: verificationAgreement } = useStoreVerificationData(storeId);
  const updateStore = useStoreMutation(storeId);

  const [editData, setEditData] = useState<Partial<StoreProfile> | null>(null);
  const [editingField, setEditingField] = useState<string | null>(null);
  const [savingField, setSavingField] = useState<string | null>(null);
  const [uploadingImages, setUploadingImages] = useState<string[]>([]);
  const [addressModalOpen, setAddressModalOpen] = useState(false);
  const bannerInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);

  const displayStore = displayStoreFromApi as StoreProfile | null;

  // Defer "Store not found" until after the profile request has settled on the client,
  // so server and first client paint both show skeleton and hydration matches.
  const [hasSettled, setHasSettled] = useState(false);
  useEffect(() => {
    if (!profileLoading) setHasSettled(true);
  }, [profileLoading]);

  useEffect(() => {
    if (displayStore) {
      setEditData({
        ...displayStore,
        store_phones: displayStore.store_phones ?? undefined,
      });
    }
  }, [displayStore?.id, displayStore?.updated_at]);

  const startEditing = (field: string) => setEditingField(field);
  const stopEditing = () => setEditingField(null);

  const handleSaveField = async (field: string) => {
    if (!storeId || !editData) return;
    setSavingField(field);
    try {
      let payload: Partial<StoreProfile> = {};
      if (field === "store_phones_alternate") {
        const primary = displayStore?.store_phones?.[0];
        const alt = editData.store_phones?.[1];
        payload.store_phones = alt ? (primary ? [primary, alt] : [alt]) : (primary ? [primary] : []);
      } else {
        (payload as Record<string, unknown>)[field] = (editData as Record<string, unknown>)[field];
      }
      await updateStore.mutateAsync(payload);
      toast?.("Saved successfully", { type: "success" });
      setEditingField(null);
      queryClient.invalidateQueries({ queryKey: STORE_KEY(storeId) });
      queryClient.invalidateQueries({ queryKey: STORE_PROFILE_FULL_KEY(storeId) });
      router.refresh();
    } catch (e) {
      toast?.(e instanceof Error ? e.message : "Failed to save", { type: "error" });
    } finally {
      setSavingField(null);
    }
  };

  const uploadImage = async (file: File, type: "banner" | "gallery"): Promise<string | null> => {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("type", type);
    const res = await fetch(`/api/merchant/stores/${storeId}/profile-media`, {
      method: "POST",
      body: formData,
      credentials: "include",
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data?.error ?? "Upload failed");
    return data?.url ? String(data.url) : null;
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>, type: "banner" | "gallery") => {
    const files = Array.from(e.target.files || []);
    if (!files.length || !storeId || !editData) return;
    e.target.value = "";
    setUploadingImages(files.map((f) => URL.createObjectURL(f)));
    try {
      if (type === "banner") {
        const url = await uploadImage(files[0]!, "banner");
        if (!url) throw new Error("Banner upload failed");
        const next = { ...editData, banner_url: url };
        setEditData(next);
        await updateStore.mutateAsync(next);
        toast?.("Banner updated", { type: "success" });
        queryClient.invalidateQueries({ queryKey: STORE_KEY(storeId) });
        queryClient.invalidateQueries({ queryKey: STORE_PROFILE_FULL_KEY(storeId) });
        router.refresh();
      } else {
        const urls = await Promise.all(
          files.map((f) => uploadImage(f, "gallery"))
        );
        const valid = urls.filter(Boolean) as string[];
        const current = (editData.gallery_images ?? []) as string[];
        const newGallery = [...current, ...valid].slice(0, 5);
        const next = { ...editData, gallery_images: newGallery };
        setEditData(next);
        await updateStore.mutateAsync(next);
        toast?.("Gallery updated", { type: "success" });
        queryClient.invalidateQueries({ queryKey: STORE_KEY(storeId) });
        queryClient.invalidateQueries({ queryKey: STORE_PROFILE_FULL_KEY(storeId) });
        router.refresh();
      }
    } catch (err) {
      toast?.(err instanceof Error ? err.message : "Upload failed", { type: "error" });
    } finally {
      setUploadingImages([]);
    }
  };

  const handleRemoveGalleryImage = async (index: number) => {
    if (!editData?.gallery_images) return;
    const next = [...(editData.gallery_images as string[])];
    next.splice(index, 1);
    const nextData = { ...editData, gallery_images: next };
    setEditData(nextData);
    try {
      await updateStore.mutateAsync(nextData);
      toast?.("Image removed", { type: "success" });
      queryClient.invalidateQueries({ queryKey: STORE_KEY(storeId) });
      queryClient.invalidateQueries({ queryKey: STORE_PROFILE_FULL_KEY(storeId) });
      router.refresh();
    } catch {
      toast?.("Failed to remove image", { type: "error" });
    }
  };

  // Show skeleton until we have data or the request has settled (avoids hydration mismatch:
  // server and first client paint both show skeleton; "Store not found" only after hasSettled).
  if (!hasSettled || (profileLoading && !displayStore)) {
    return <StoreProfileSkeleton />;
  }

  if (!displayStore) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-6 text-center text-gray-500">
        Store not found.
      </div>
    );
  }

  const storeInitial = displayStore.store_name?.charAt(0).toUpperCase() || "S";
  const statusUpper = (displayStore.approval_status || "").toUpperCase();
  const isVerified = statusUpper === "APPROVED";
  const isDelisted = statusUpper === "DELISTED";
  const doc = (documents ?? {}) as Record<string, unknown>;
  const agreement = (verificationAgreement ?? agreementAcceptance ?? {}) as Record<string, unknown>;

  return (
    <div className="bg-gray-50 flex-1 flex flex-col overflow-hidden">
      <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden">
        <div className="p-4">
          <div className="max-w-7xl mx-auto w-full">
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 mb-4">
              <div className="bg-gradient-to-r from-blue-50 to-indigo-50 px-4 py-3 border-b border-gray-200">
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                  <div className="flex items-center gap-2.5 flex-1 min-w-0">
                    <div className="relative shrink-0">
                      <div className="w-10 h-10 bg-blue-600 text-white rounded-lg flex items-center justify-center text-base font-bold">
                        {storeInitial}
                      </div>
                      {isVerified && (
                        <div className="absolute -bottom-0.5 -right-0.5 bg-green-500 text-white p-0.5 rounded-full">
                          <CheckCircle size={10} />
                        </div>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <h2 className="text-base font-bold text-gray-900 truncate">
                        {displayStore.store_name ?? "—"}
                      </h2>
                      {(displayStore.cuisine_types?.length ?? 0) > 0 && (
                        <span className="text-[10px] text-gray-600">
                          • {formatArray(displayStore.cuisine_types ?? [])}
                        </span>
                      )}
                      <div className="flex items-center gap-2.5 text-xs text-gray-600 mt-0.5">
                        <span className="flex items-center gap-1">
                          <MapPin size={10} />
                          {displayStore.city ?? "—"}, {displayStore.state ?? "—"}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:flex md:flex-wrap gap-2 shrink-0">
                    <div className="text-center px-2 py-1 bg-white rounded-lg border border-gray-200 min-w-[70px]">
                      <div className="text-xs font-bold text-gray-900">{displayStore.min_order_amount ?? 0}</div>
                      <div className="text-[10px] text-gray-500">Min Order</div>
                    </div>
                    <div className="text-center px-2 py-1 bg-white rounded-lg border border-gray-200 min-w-[70px]">
                      <div className="text-xs font-bold text-gray-900">
                        {displayStore.avg_preparation_time_minutes ?? 0}m
                      </div>
                      <div className="text-[10px] text-gray-500">Prep Time</div>
                    </div>
                    <div className="text-center px-2 py-1 bg-white rounded-lg border border-gray-200 min-w-[70px]">
                      <div className="text-xs font-bold text-gray-900">
                        {displayStore.delivery_radius_km ?? "—"}
                      </div>
                      <div className="text-[10px] text-gray-500">Delivery Radius</div>
                    </div>
                    <div className="text-center px-2 py-1 bg-white rounded-lg border border-gray-200 min-w-[70px]">
                      <div className="text-xs font-bold text-gray-900">
                        {isDelisted ? "Delisted" : displayStore.approval_status === "APPROVED" ? "Verified" : "Pending"}
                      </div>
                      <div className="text-[10px] text-gray-500">Status</div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="p-4">
                {/* First row: Store Details, Location, Operating Days + Legal Documents */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                  {/* Card 1: Store Details */}
                  <div className="bg-gray-50 rounded-lg p-3 border border-gray-200">
                    <h3 className="text-sm font-semibold text-gray-900 mb-2 flex items-center gap-2">
                      <Building size={16} className="text-blue-600" />
                      Store Details
                    </h3>
                    <div className="space-y-1.5 text-sm">
                      <CompactLockedRow
                        label="Store Name"
                        value={displayStore.store_name ?? null}
                      />
                      <CompactLockedRow
                        label="Store Display Name"
                        value={displayStore.store_display_name ?? null}
                      />
                      <CompactLockedRow
                        label="Cuisine Types"
                        value={formatArray(displayStore.cuisine_types ?? [])}
                      />
                      <CompactLockedRow
                        label="Store Email"
                        value={displayStore.store_email ?? null}
                      />
                      <CompactLockedRow
                        label="Primary Store Phone"
                        value={displayStore.store_phones?.[0] ?? null}
                      />
                      <CompactEditableRow
                        label="Alternate Store Phone"
                        value={editData?.store_phones?.[1] ?? ""}
                        isEditing={editingField === "store_phones_alternate"}
                        onEdit={() => startEditing("store_phones_alternate")}
                        onSave={stopEditing}
                        onCancel={() =>
                          setEditData((d) =>
                            d ? { ...d, store_phones: displayStore?.store_phones ?? d.store_phones } : d
                          )
                        }
                        onChange={(v) => {
                          const primary = displayStore.store_phones?.[0];
                          const next = v.trim() ? (primary ? [primary, v.trim()] : [v.trim()]) : (primary ? [primary] : []);
                          setEditData((d) => (d ? { ...d, store_phones: next } : d));
                        }}
                        onSaveClick={() => handleSaveField("store_phones_alternate")}
                        saving={savingField === "store_phones_alternate"}
                      />
                      <CompactLockedRow
                        label="Description"
                        value={displayStore.store_description ?? null}
                      />
                    </div>
                  </div>

                  {/* Card 2: Location */}
                  <div className="bg-gray-50 rounded-lg p-3 border border-gray-200">
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
                        <MapPin size={16} className="text-blue-600" />
                        Location
                      </h3>
                      <button
                        type="button"
                        onClick={() => setAddressModalOpen(true)}
                        className="inline-flex items-center gap-1.5 rounded-md bg-blue-600 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-blue-700"
                      >
                        <MapPin size={12} />
                        Change Address
                      </button>
                    </div>
                    <div className="space-y-1.5">
                      <CompactLockedRow label="Full Address" value={displayStore?.full_address ?? null} />
                      <CompactLockedRow label="City" value={displayStore?.city ?? null} />
                      <CompactLockedRow label="State" value={displayStore?.state ?? null} />
                      <CompactLockedRow label="Landmark" value={displayStore?.landmark ?? null} />
                      <CompactLockedRow label="Postal Code" value={displayStore?.postal_code ?? null} />
                      <div className="grid grid-cols-2 gap-2 pt-0.5">
                        <CompactLockedRow
                          label="Latitude"
                          value={displayStore?.latitude != null ? String(displayStore.latitude) : null}
                        />
                        <CompactLockedRow
                          label="Longitude"
                          value={displayStore?.longitude != null ? String(displayStore.longitude) : null}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Card 3: Operating Days + Legal Documents */}
                  <div className="space-y-3">
                    <OperatingDaysCard operatingHours={operatingHours} loading={false} />

                    <div className="bg-gray-50 rounded-lg p-3 border border-gray-200">
                      <h3 className="text-sm font-semibold text-gray-900 mb-2 flex items-center gap-2">
                        <Shield size={16} className="text-blue-600" />
                        Legal Documents
                      </h3>
                      {doc.pan_document_number || doc.gst_document_number || doc.fssai_document_number ? (
                        <div className="space-y-2 text-xs">
                          {doc.pan_document_number && (
                            <div className="bg-white rounded p-2 border border-gray-200">
                              <span className="font-semibold text-gray-900">PAN</span>
                              <span className={`ml-2 text-[10px] px-1.5 py-0.5 rounded ${doc.pan_is_verified ? "bg-green-100 text-green-700" : "bg-yellow-100 text-yellow-700"}`}>
                                {doc.pan_is_verified ? "Verified" : "Pending"}
                              </span>
                              <div className="text-xs mt-1"><span className="text-gray-600">Number:</span> <span className="text-gray-900">{String(doc.pan_document_number)}</span></div>
                              {doc.pan_document_url && (
                                <a href={String(doc.pan_document_url)} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 mt-1.5 text-blue-600 text-[11px] font-medium hover:text-blue-800">
                                  <ExternalLink size={12} /> View document
                                </a>
                              )}
                            </div>
                          )}
                          {doc.gst_document_number && (
                            <div className="bg-white rounded p-2 border border-gray-200">
                              <span className="font-semibold text-gray-900">GST</span>
                              <span className={`ml-2 text-[10px] px-1.5 py-0.5 rounded ${doc.gst_is_verified ? "bg-green-100 text-green-700" : "bg-yellow-100 text-yellow-700"}`}>
                                {doc.gst_is_verified ? "Verified" : "Pending"}
                              </span>
                              <div className="text-xs mt-1"><span className="text-gray-600">Number:</span> <span className="text-gray-900">{String(doc.gst_document_number)}</span></div>
                              {doc.gst_document_url && (
                                <a href={String(doc.gst_document_url)} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 mt-1.5 text-blue-600 text-[11px] font-medium hover:text-blue-800">
                                  <ExternalLink size={12} /> View document
                                </a>
                              )}
                            </div>
                          )}
                          {doc.fssai_document_number && (
                            <div className="bg-white rounded p-2 border border-gray-200">
                              <span className="font-semibold text-gray-900">FSSAI</span>
                              <span className={`ml-2 text-[10px] px-1.5 py-0.5 rounded ${doc.fssai_is_verified ? "bg-green-100 text-green-700" : "bg-yellow-100 text-yellow-700"}`}>
                                {doc.fssai_is_verified ? "Verified" : "Pending"}
                              </span>
                              <div className="text-xs mt-1"><span className="text-gray-600">Number:</span> <span className="text-gray-900">{String(doc.fssai_document_number)}</span></div>
                              {doc.fssai_document_url && (
                                <a href={String(doc.fssai_document_url)} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 mt-1.5 text-blue-600 text-[11px] font-medium hover:text-blue-800">
                                  <ExternalLink size={12} /> View document
                                </a>
                              )}
                            </div>
                          )}
                        </div>
                      ) : (
                        <p className="text-xs text-gray-500">No documents found</p>
                      )}
                    </div>
                  </div>
                </div>

                {/* Second row: Area Manager + Bank, Store Info + Agreement, Legal Documents + Audit */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mt-4">
                  {/* Column 1: Area Manager + Bank Details (stacked) */}
                  <div className="space-y-3">
                    <div className="bg-gray-50 rounded-lg p-3 border border-gray-200">
                      <h3 className="text-sm font-semibold text-gray-900 mb-2 flex items-center gap-2">
                        <User size={16} className="text-blue-600" />
                        Area Manager
                      </h3>
                      {areaManager ? (
                        <div className="space-y-2 text-xs">
                          <div><span className="text-gray-600">Name:</span> <span className="font-medium text-gray-900">{areaManager.name}</span></div>
                          <div><span className="text-gray-600">Mobile:</span> <span className="font-medium text-gray-900">{areaManager.mobile}</span></div>
                          <div><span className="text-gray-600">Email:</span> <span className="font-medium text-gray-900 truncate block">{areaManager.email}</span></div>
                        </div>
                      ) : (
                        <p className="text-xs text-gray-500">No area manager assigned</p>
                      )}
                    </div>

                    {/* Bank Details directly under Area Manager */}
                    <div className="bg-gray-50 rounded-lg p-3 border border-gray-200">
                      <h3 className="text-sm font-semibold text-gray-900 mb-2 flex items-center gap-2">
                        <Banknote size={16} className="text-blue-600" />
                        Bank Details
                      </h3>
                      {bankAccounts.length > 0 ? (
                        <div className="space-y-2">
                          {bankAccounts.map((bank, idx) => (
                            <div key={bank.id ?? idx} className="bg-white rounded p-2 border border-gray-200 text-xs">
                              <div className="flex items-center gap-2 flex-wrap mb-1.5">
                                {bank.is_primary && <span className="text-blue-700 bg-blue-100 px-2 py-0.5 rounded text-[10px] font-medium">Primary</span>}
                                {bank.is_verified && <span className="text-green-700 bg-green-100 px-2 py-0.5 rounded text-[10px] font-medium">Verified</span>}
                              </div>
                              <div className="space-y-1">
                                <div><span className="text-gray-600">Holder:</span> <span className="font-semibold text-gray-900">{bank.account_holder_name}</span></div>
                                <div><span className="text-gray-600">Account:</span> <span className="font-semibold text-gray-900">{bank.account_number_masked ?? "****"}</span></div>
                                <div><span className="text-gray-600">IFSC:</span> <span className="font-semibold text-gray-900">{bank.ifsc_code}</span></div>
                                <div><span className="text-gray-600">Bank:</span> <span className="font-semibold text-gray-900">{bank.bank_name}</span></div>
                                {bank.branch_name && <div><span className="text-gray-600">Branch:</span> <span className="text-gray-900">{bank.branch_name}</span></div>}
                                {bank.account_type && <div><span className="text-gray-600">Type:</span> <span className="text-gray-900">{bank.account_type}</span></div>}
                                {bank.payout_method && <div><span className="text-gray-600">Payout:</span> <span className="text-gray-900">{bank.payout_method}</span></div>}
                                {bank.upi_id && <div><span className="text-gray-600">UPI ID:</span> <span className="text-gray-900">{bank.upi_id}</span></div>}
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-xs text-gray-500">No bank accounts</p>
                      )}
                    </div>
                  </div>

                  {/* Column 2: Store Info + Agreement (stacked) */}
                  <div className="space-y-3">
                    <div className="bg-gray-50 rounded-lg p-3 border border-gray-200">
                      <h3 className="text-sm font-semibold text-gray-900 mb-2 flex items-center gap-2">
                        <Activity size={16} className="text-blue-600" />
                        Store Info
                      </h3>
                      <div className="space-y-2 text-xs">
                        <div className="flex items-center gap-2">
                          <Hash size={12} className="text-gray-500" />
                          <span className="text-gray-600">Store ID:</span>
                          <span className="font-semibold text-gray-900">{displayStore.store_id ?? "—"}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Calendar size={12} className="text-gray-500" />
                          <span className="text-gray-600">Created:</span>
                          <span className="font-semibold text-gray-900">{formatDate(displayStore.created_at ?? null)}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-gray-600">Status:</span>
                          <span
                            className={`font-semibold ${
                          isDelisted
                            ? "text-red-600"
                            : displayStore.approval_status === "APPROVED"
                            ? "text-green-600"
                            : displayStore.approval_status === "REJECTED"
                            ? "text-red-600"
                            : "text-yellow-600"
                            }`}
                          >
                            {displayStore.approval_status ?? "SUBMITTED"}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Agreement directly under Store Info */}
                    <div className="bg-gray-50 rounded-lg p-3 border border-gray-200">
                      <div className="flex items-center justify-between mb-2">
                        <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
                          <FileCheck size={16} className="text-blue-600" />
                          Agreement
                        </h3>
                        {agreement.contract_pdf_url && (
                          <a
                            href={String(agreement.contract_pdf_url)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-800"
                          >
                            <ExternalLink size={12} /> View
                          </a>
                        )}
                      </div>
                      {agreement.signer_name || agreement.accepted_at ? (
                        <div className="space-y-2 text-xs">
                          <div className="flex justify-between">
                            <span className="text-gray-600">Signed by</span>
                            <span className="font-medium text-gray-900">{String(agreement.signer_name ?? "—")}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-gray-600">Accepted</span>
                            <span className="font-medium text-gray-900">
                              {agreement.accepted_at ? formatDate(String(agreement.accepted_at)) : "—"}
                            </span>
                          </div>
                          {agreement.contract_pdf_url && (
                            <div className="flex gap-2 mt-2">
                              <a
                                href={String(agreement.contract_pdf_url)}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 text-blue-600 text-xs font-medium"
                              >
                                <ExternalLink size={12} /> View
                              </a>
                              <a
                                href={String(agreement.contract_pdf_url)}
                                download
                                className="inline-flex items-center gap-1 text-gray-600 text-xs font-medium"
                              >
                                <Download size={12} /> Download
                              </a>
                            </div>
                          )}
                        </div>
                      ) : (
                        <p className="text-xs text-gray-500">No agreement record</p>
                      )}
                    </div>
                  </div>

                  {/* Column 3: Legal Documents + Audit */}
                  <div className="space-y-3">
                    <div className="bg-gray-50 rounded-lg p-3 border border-gray-200">
                      <h3 className="text-sm font-semibold text-gray-900 mb-2 flex items-center gap-2">
                        <Shield size={16} className="text-blue-600" />
                        Legal Documents
                      </h3>
                      {doc.pan_document_number || doc.gst_document_number || doc.fssai_document_number ? (
                        <div className="space-y-2 text-xs">
                          {doc.pan_document_number && (
                            <div className="bg-white rounded p-2 border border-gray-200">
                              <span className="font-semibold text-gray-900">PAN</span>
                              <span className={`ml-2 text-[10px] px-1.5 py-0.5 rounded ${doc.pan_is_verified ? "bg-green-100 text-green-700" : "bg-yellow-100 text-yellow-700"}`}>
                                {doc.pan_is_verified ? "Verified" : "Pending"}
                              </span>
                              <div className="text-xs mt-1"><span className="text-gray-600">Number:</span> <span className="text-gray-900">{String(doc.pan_document_number)}</span></div>
                              {doc.pan_document_url && (
                                <a href={String(doc.pan_document_url)} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 mt-1.5 text-blue-600 text-[11px] font-medium hover:text-blue-800">
                                  <ExternalLink size={12} /> View document
                                </a>
                              )}
                            </div>
                          )}
                          {doc.gst_document_number && (
                            <div className="bg-white rounded p-2 border border-gray-200">
                              <span className="font-semibold text-gray-900">GST</span>
                              <span className={`ml-2 text-[10px] px-1.5 py-0.5 rounded ${doc.gst_is_verified ? "bg-green-100 text-green-700" : "bg-yellow-100 text-yellow-700"}`}>
                                {doc.gst_is_verified ? "Verified" : "Pending"}
                              </span>
                              <div className="text-xs mt-1"><span className="text-gray-600">Number:</span> <span className="text-gray-900">{String(doc.gst_document_number)}</span></div>
                              {doc.gst_document_url && (
                                <a href={String(doc.gst_document_url)} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 mt-1.5 text-blue-600 text-[11px] font-medium hover:text-blue-800">
                                  <ExternalLink size={12} /> View document
                                </a>
                              )}
                            </div>
                          )}
                          {doc.fssai_document_number && (
                            <div className="bg-white rounded p-2 border border-gray-200">
                              <span className="font-semibold text-gray-900">FSSAI</span>
                              <span className={`ml-2 text-[10px] px-1.5 py-0.5 rounded ${doc.fssai_is_verified ? "bg-green-100 text-green-700" : "bg-yellow-100 text-yellow-700"}`}>
                                {doc.fssai_is_verified ? "Verified" : "Pending"}
                              </span>
                              <div className="text-xs mt-1"><span className="text-gray-600">Number:</span> <span className="text-gray-900">{String(doc.fssai_document_number)}</span></div>
                              {doc.fssai_document_url && (
                                <a href={String(doc.fssai_document_url)} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 mt-1.5 text-blue-600 text-[11px] font-medium hover:text-blue-800">
                                  <ExternalLink size={12} /> View document
                                </a>
                              )}
                            </div>
                          )}
                        </div>
                      ) : (
                        <p className="text-xs text-gray-500">No documents found</p>
                      )}
                    </div>

                    <div className="bg-gray-50 rounded-lg p-3 border border-gray-200">
                      <Link
                        href={`/dashboard/merchants/stores/${storeId}/activity`}
                        className="text-xs font-medium text-blue-600 hover:text-blue-800 flex items-center gap-1.5"
                      >
                        <History size={14} />
                        View audit log
                      </Link>
                    </div>
                  </div>
                </div>

                {/* Last row: Logo + Banner + Gallery */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 mt-5">
                  {/* Store Logo card */}
                  <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-lg p-4 border border-blue-100">
                    <div className="flex items-center justify-between mb-3">
                      <div>
                        <h3 className="text-sm font-semibold text-gray-900">Store Logo</h3>
                        <p className="text-xs text-gray-600">Primary logo shown in apps and dashboard</p>
                      </div>
                    </div>
                    {displayStore.logo_url ? (
                      <div className="mt-2 flex items-center gap-4">
                        <div className="h-24 w-24 rounded-xl bg-white shadow-sm border border-gray-200 flex items-center justify-center overflow-hidden">
                          <img
                            src={String(displayStore.logo_url)}
                            alt="Store logo"
                            className="h-full w-full object-contain"
                          />
                        </div>
                        <div className="text-xs text-gray-600 max-w-xs">
                          This logo is managed from the onboarding and verification flow. Contact support if you need to
                          change it.
                        </div>
                      </div>
                    ) : (
                      <div className="mt-2 h-24 bg-gray-100 rounded-lg flex items-center justify-center">
                        <ImageIcon size={20} className="text-gray-400" />
                        <span className="text-xs text-gray-500 ml-2">No logo available</span>
                      </div>
                    )}
                  </div>

                  {/* Store Banner card */}
                  <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-lg p-4 border border-blue-100">
                    <div className="flex items-center justify-between mb-3">
                      <div>
                        <h3 className="text-sm font-semibold text-gray-900">Store Banner</h3>
                        <p className="text-xs text-gray-600">Upload your store banner</p>
                      </div>
                      <button
                        type="button"
                        className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded-lg text-xs font-medium"
                        onClick={() => bannerInputRef.current?.click()}
                      >
                        <Upload size={12} /> Upload
                      </button>
                      <input
                        type="file"
                        accept="image/*"
                        ref={bannerInputRef}
                        className="hidden"
                        onChange={(e) => handleImageUpload(e, "banner")}
                      />
                    </div>
                    {(editData?.banner_url ?? displayStore.banner_url) ? (
                      <img
                        src={(editData?.banner_url ?? displayStore.banner_url) as string}
                        alt="Banner"
                        className="mt-2 rounded-lg w-full h-40 object-cover"
                      />
                    ) : (
                      <div className="mt-2 h-40 bg-gray-100 rounded-lg flex items-center justify-center">
                        <ImageIcon size={24} className="text-gray-400" />
                        <span className="text-xs text-gray-500 ml-2">No banner</span>
                      </div>
                    )}
                  </div>

                  {/* Gallery card */}
                  <div className="bg-gradient-to-r from-green-50 to-emerald-50 rounded-lg p-4 border border-green-100">
                    <div className="flex items-center justify-between mb-3">
                      <div>
                        <h3 className="text-sm font-semibold text-gray-900">
                          Gallery ({(editData?.gallery_images ?? displayStore.gallery_images ?? [])?.length ?? 0}/5)
                        </h3>
                        <p className="text-xs text-gray-600">Up to 5 images</p>
                      </div>
                      <button
                        type="button"
                        className="flex items-center gap-1.5 bg-green-600 hover:bg-green-700 text-white px-3 py-1.5 rounded-lg text-xs font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                        onClick={() => galleryInputRef.current?.click()}
                        disabled={((editData?.gallery_images ?? displayStore.gallery_images)?.length ?? 0) >= 5}
                      >
                        <Upload size={12} /> Upload
                      </button>
                      <input
                        type="file"
                        accept="image/*"
                        multiple
                        ref={galleryInputRef}
                        className="hidden"
                        onChange={(e) => handleImageUpload(e, "gallery")}
                      />
                    </div>
                    <div className="grid grid-cols-5 gap-2 mt-3">
                      {Array.from({ length: 5 }).map((_, index) => {
                        const gallery = (editData?.gallery_images ?? displayStore.gallery_images ?? []) as string[];
                        const img = gallery[index];
                        const isUploading = uploadingImages.length > 0 && index >= gallery.length && index < gallery.length + uploadingImages.length;
                        const preview = isUploading ? uploadingImages[index - gallery.length] : null;
                        return (
                          <div
                            key={index}
                            className="relative group aspect-square min-h-[80px] bg-gray-100 rounded-lg border border-gray-200 overflow-hidden flex items-center justify-center"
                          >
                            {img ? (
                              <>
                                <img src={img} alt={`Gallery ${index + 1}`} className="w-full h-full object-cover" />
                                <button
                                  type="button"
                                  onClick={() => handleRemoveGalleryImage(index)}
                                  className="absolute top-1 right-1 bg-red-500 hover:bg-red-600 text-white w-5 h-5 rounded-full flex items-center justify-center text-sm opacity-0 group-hover:opacity-100 transition-opacity"
                                >
                                  ×
                                </button>
                              </>
                            ) : preview ? (
                              <div className="relative w-full h-full">
                                <img src={preview} alt="Uploading" className="w-full h-full object-cover opacity-60" />
                                <div className="absolute inset-0 flex items-center justify-center bg-black/20">
                                  <div className="animate-spin rounded-full h-6 w-6 border-2 border-white border-t-transparent" />
                                </div>
                              </div>
                            ) : (
                              <span className="text-[10px] text-gray-500">Slot {index + 1}</span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <ChangeAddressModal
        open={addressModalOpen}
        onClose={() => setAddressModalOpen(false)}
        storeId={storeId}
        initialAddress={
          displayStore
            ? {
                full_address: displayStore.full_address ?? "",
                landmark: displayStore.landmark ?? "",
                city: displayStore.city ?? "",
                state: displayStore.state ?? "",
                postal_code: displayStore.postal_code ?? "",
                latitude: displayStore.latitude ?? null,
                longitude: displayStore.longitude ?? null,
              }
            : null
        }
        onSaved={() => {
          queryClient.invalidateQueries({ queryKey: STORE_KEY(storeId) });
          queryClient.invalidateQueries({ queryKey: STORE_PROFILE_FULL_KEY(storeId) });
          router.refresh();
          toast?.("Address updated successfully", { type: "success" });
        }}
      />
    </div>
  );
}
