"use client";

import Link from "next/link";
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
} from "lucide-react";
import type { StoreProfile } from "@/hooks/useStore";
import { OperatingDaysCard } from "./OperatingDaysCard";
import { CompactEditableRow, CompactLockedRow } from "./CompactProfileRows";
import { StoreCuisineManagerSection } from "./StoreCuisineManagerSection";
import { ProfileLegalDocumentCard } from "./ProfileLegalDocumentCard";
import { PROFILE_LEGAL_DOC_CONFIG } from "./profileLegalDocConfig";
import { BankAccountsSection } from "./BankAccountsSection";

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

function formatTime(timeString?: string | null): string {
  if (!timeString) return "—";
  try {
    const [hours, minutes] = timeString.split(":");
    const date = new Date();
    date.setHours(parseInt(hours, 10), parseInt(minutes, 10));
    return date.toLocaleTimeString("en-IN", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    });
  } catch {
    return timeString;
  }
}

function formatOperatingHoursToday(operatingHours: Record<string, unknown> | null): string {
  if (!operatingHours) return "—";
  const dayLabels = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const todayLabel = dayLabels[new Date().getDay()];
  const key = todayLabel.toLowerCase();
  const open = Boolean(operatingHours[`${key}_open`]);
  if (!open) return "Closed";
  const parts: string[] = [];
  const s1s = operatingHours[`${key}_slot1_start`] as string | undefined;
  const s1e = operatingHours[`${key}_slot1_end`] as string | undefined;
  const s2s = operatingHours[`${key}_slot2_start`] as string | undefined;
  const s2e = operatingHours[`${key}_slot2_end`] as string | undefined;
  if (s1s && s1e) parts.push(`${formatTime(s1s)} – ${formatTime(s1e)}`);
  if (s2s && s2e) parts.push(`${formatTime(s2s)} – ${formatTime(s2e)}`);
  return parts.length > 0 ? parts.join(" · ") : "—";
}

export type ProfilePageContentProps = {
  storeId: string;
  displayStore: StoreProfile;
  editData: Partial<StoreProfile>;
  documents: Record<string, unknown> | null;
  operatingHours: Record<string, unknown> | null;
  agreement: Record<string, unknown>;
  areaManager: { name: string; mobile: string; email: string; id?: number } | null;
  bankAccounts: unknown[];
  profileLoading: boolean;
  isVerified: boolean;
  isDelisted: boolean;
  editingField: string | null;
  savingField: string | null;
  startEditing: (field: string) => void;
  stopEditing: () => void;
  setEditData: React.Dispatch<React.SetStateAction<Partial<StoreProfile> | null>>;
  handleSaveField: (field: string) => Promise<void>;
  revertAlternatePhone: () => void;
  canStoreVerify: boolean;
  /** Store management / banner / address / phone edits */
  canEditProfile?: boolean;
  /** Bank account create/update */
  canEditBank?: boolean;
  /**
   * View-only viewer on a store not linked to their Area Manager —
   * blur legal docs + agreement (API already redacts payloads).
   */
  legalDocsRestricted?: boolean;
  openDocumentsVerification: () => void;
  openBankVerification: () => void;
  openProfileMediaVerification: () => void;
  onChangeAddress: () => void;
  bannerInputRef: React.RefObject<HTMLInputElement | null>;
  galleryInputRef: React.RefObject<HTMLInputElement | null>;
  onBannerUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onGalleryUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onRemoveGalleryImage: (index: number) => void;
  uploadingImages: string[];
};

export function ProfilePageContent(props: ProfilePageContentProps) {
  const {
    storeId,
    displayStore,
    editData,
    documents,
    operatingHours,
    agreement,
    areaManager,
    bankAccounts,
    profileLoading,
    isVerified,
    isDelisted,
    editingField,
    savingField,
    startEditing,
    stopEditing,
    setEditData,
    handleSaveField,
    revertAlternatePhone,
    canStoreVerify,
    canEditProfile = false,
    canEditBank = false,
    legalDocsRestricted = false,
    openDocumentsVerification,
    openBankVerification,
    openProfileMediaVerification,
    onChangeAddress,
    bannerInputRef,
    galleryInputRef,
    onBannerUpload,
    onGalleryUpload,
    onRemoveGalleryImage,
    uploadingImages,
  } = props;

  const storeInitial = displayStore.store_name?.charAt(0).toUpperCase() || "S";
  const doc = (documents ?? {}) as Record<string, unknown>;
  const parentMerchantId =
    (displayStore as StoreProfile & { parent_merchant_id?: string | null }).parent_merchant_id ??
    null;
  const todayHours = formatOperatingHoursToday(operatingHours);
  const gallery = (editData?.gallery_images ?? displayStore.gallery_images ?? []) as string[];

  return (
    <div className="bg-gray-50 flex-1 flex flex-col overflow-hidden">
      <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden">
        <div className="px-4 pt-2 pb-3">
          <div className="w-full">
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 mb-2">
              <div className="bg-gradient-to-r from-blue-50 to-indigo-50 px-4 py-2 border-b border-gray-200">
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
                      <div className="flex items-center gap-2.5 text-xs text-gray-600 mt-0.5 flex-wrap">
                        <span className="flex items-center gap-1 shrink-0">
                          <MapPin size={10} />
                          {displayStore.city ?? "—"}, {displayStore.state ?? "—"}
                        </span>
                        <span className="flex items-center gap-1 shrink-0">
                          <Clock size={10} />
                          {todayHours}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:flex md:flex-wrap gap-2 shrink-0">
                    <div className="text-center px-2 py-1 bg-white rounded-lg border border-gray-200 min-w-[70px]">
                      <div className="text-xs font-bold text-gray-900">
                        {displayStore.min_order_amount ?? 0}
                      </div>
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
                    {parentMerchantId ? (
                      <div className="text-center px-2 py-1 bg-white rounded-lg border border-gray-200 min-w-[100px]">
                        <div className="text-xs font-bold text-gray-900 truncate">
                          {parentMerchantId}
                        </div>
                        <div className="text-[10px] text-gray-500">Parent Merchant ID</div>
                      </div>
                    ) : null}
                    <div className="text-center px-2 py-1 bg-white rounded-lg border border-gray-200 min-w-[70px]">
                      <div className="text-xs font-bold text-gray-900">
                        {isDelisted
                          ? "Delisted"
                          : displayStore.approval_status === "APPROVED"
                            ? "Verified"
                            : "Pending"}
                      </div>
                      <div className="text-[10px] text-gray-500">Status</div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="p-3">
                <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.65fr)_minmax(0,1fr)] gap-3 lg:gap-4 lg:items-stretch">
                  <div className="min-w-0 grid grid-cols-1 lg:grid-cols-2 gap-3 lg:gap-4 lg:items-stretch">
                    {/* Store Details */}
                    <div className="min-w-0 flex min-h-0 lg:h-full">
                      <div className="bg-gray-50 rounded-lg p-3 border border-gray-200 flex flex-col min-h-0 h-full w-full min-w-0">
                        <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2 mb-1.5 shrink-0">
                          <Building size={16} className="text-blue-600" />
                          Store Details
                        </h3>
                        <div className="space-y-1.5 text-sm flex-1 min-h-0 overflow-y-auto pr-0.5">
                          <CompactLockedRow label="Store Name" value={displayStore.store_name ?? null} />
                          <CompactLockedRow
                            label="Store Display Name"
                            value={displayStore.store_display_name ?? null}
                          />
                          <div className="space-y-1.5 pt-0.5">
                            <div className="text-[10px] text-gray-500">
                              Cuisine types
                            </div>
                            <StoreCuisineManagerSection storeId={storeId} readOnly={!canEditProfile} />
                          </div>
                          <CompactLockedRow label="Store Email" value={displayStore.store_email ?? null} />
                          <CompactLockedRow
                            label="Primary Store Phone"
                            value={displayStore.store_phones?.[0] ?? null}
                          />
                          {canEditProfile ? (
                            <CompactEditableRow
                              label="Alternate Store Phone"
                              value={editData?.store_phones?.[1] ?? ""}
                              isEditing={editingField === "store_phones_alternate"}
                              onEdit={() => startEditing("store_phones_alternate")}
                              onSave={stopEditing}
                              onCancel={revertAlternatePhone}
                              onChange={(v) => {
                                const primary = displayStore.store_phones?.[0];
                                const next = v.trim()
                                  ? primary
                                    ? [primary, v.trim()]
                                    : [v.trim()]
                                  : primary
                                    ? [primary]
                                    : [];
                                setEditData((d) => (d ? { ...d, store_phones: next } : d));
                              }}
                              onSaveClick={() => handleSaveField("store_phones_alternate")}
                              saving={savingField === "store_phones_alternate"}
                            />
                          ) : (
                            <CompactLockedRow
                              label="Alternate Store Phone"
                              value={displayStore.store_phones?.[1] ?? null}
                            />
                          )}
                          <CompactLockedRow
                            label="Description"
                            value={displayStore.store_description ?? null}
                            dense
                          />
                        </div>
                      </div>
                    </div>

                    {/* Operating Days */}
                    <div className="min-w-0 flex min-h-0 lg:h-full">
                      <OperatingDaysCard operatingHours={operatingHours} loading={profileLoading} />
                    </div>

                    {/* Location */}
                    <div className="min-w-0 flex min-h-0 lg:h-full">
                      <div className="bg-gray-50 rounded-lg p-2.5 border border-gray-200 flex flex-col min-h-0 h-full w-full min-w-0">
                        <div className="flex items-center justify-between mb-1.5 shrink-0">
                          <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2 m-0">
                            <MapPin size={16} className="text-blue-600" />
                            Location
                          </h3>
                          {canEditProfile ? (
                            <button
                              type="button"
                              onClick={onChangeAddress}
                              className="inline-flex items-center gap-1 rounded-md border border-gray-200 bg-white px-2 py-0.5 text-[11px] font-semibold text-gray-800 hover:bg-gray-50"
                            >
                              <MapPin size={12} />
                              Change
                            </button>
                          ) : null}
                        </div>
                        <div className="grid grid-cols-2 gap-x-2 gap-y-1 flex-1 min-h-0 overflow-y-auto content-start">
                          <div className="col-span-2 min-w-0">
                            <CompactLockedRow label="Full Address" value={displayStore.full_address ?? null} dense />
                          </div>
                          <CompactLockedRow label="City" value={displayStore.city ?? null} dense />
                          <CompactLockedRow label="State" value={displayStore.state ?? null} dense />
                          <CompactLockedRow label="Landmark" value={displayStore.landmark ?? null} dense />
                          <CompactLockedRow label="Postal Code" value={displayStore.postal_code ?? null} dense />
                          <div className="col-span-2 grid grid-cols-2 gap-x-2 gap-y-1">
                            <CompactLockedRow
                              label="Latitude"
                              value={
                                displayStore.latitude != null ? String(displayStore.latitude) : null
                              }
                              dense
                            />
                            <CompactLockedRow
                              label="Longitude"
                              value={
                                displayStore.longitude != null ? String(displayStore.longitude) : null
                              }
                              dense
                            />
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Area Manager */}
                    <div className="min-w-0 flex min-h-0 lg:h-full">
                      <div className="bg-gray-50 rounded-lg p-2.5 border border-gray-200 w-full min-w-0 h-full flex flex-col min-h-0">
                        <h3 className="text-sm font-semibold text-gray-900 mb-1.5 flex items-center gap-2 shrink-0">
                          <User size={16} className="text-blue-600" />
                          Area Manager
                        </h3>
                        {areaManager ? (
                          <div className="space-y-1.5 flex-1 min-h-0 overflow-y-auto">
                            {areaManager.id != null && (
                              <div className="flex flex-col">
                                <label className="text-[10px] font-medium text-gray-600 mb-0.5">AM ID</label>
                                <span className="text-xs text-gray-900">{areaManager.id}</span>
                              </div>
                            )}
                            <div className="flex flex-col">
                              <label className="text-[10px] font-medium text-gray-600 mb-0.5">AM Name</label>
                              <span className="text-xs text-gray-900 truncate">{areaManager.name}</span>
                            </div>
                            <div className="flex flex-col">
                              <label className="text-[10px] font-medium text-gray-600 mb-0.5">AM Mobile</label>
                              <span className="text-xs text-gray-900">{areaManager.mobile}</span>
                            </div>
                            <div className="flex flex-col">
                              <label className="text-[10px] font-medium text-gray-600 mb-0.5">AM Email</label>
                              <span className="text-xs text-gray-900 truncate">{areaManager.email}</span>
                            </div>
                          </div>
                        ) : (
                          <p className="text-xs text-gray-500 flex-1 flex items-center">No area manager assigned</p>
                        )}
                      </div>
                    </div>

                    {/* Store Info */}
                    <div className="lg:col-span-2 bg-gray-50 rounded-lg p-2.5 border border-gray-200 w-full min-w-0">
                      <h3 className="text-sm font-semibold text-gray-900 mb-1.5 flex items-center gap-2">
                        <Activity size={16} className="text-blue-600" />
                        Store Info
                      </h3>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
                        <div className="sm:col-span-2 flex flex-wrap items-center gap-x-2 gap-y-0.5 min-w-0">
                          <Clock size={12} className="text-gray-500 shrink-0" />
                          <span className="text-gray-800">Today&apos;s hours:</span>
                          <span className="font-semibold text-gray-900 break-words">{todayHours}</span>
                        </div>
                        <div className="flex items-center gap-2 min-w-0">
                          <Hash size={12} className="text-gray-500 shrink-0" />
                          <span className="text-gray-800 shrink-0">Store ID:</span>
                          <span className="font-semibold text-gray-900 truncate">{displayStore.store_id ?? "—"}</span>
                        </div>
                        <div className="flex items-center gap-2 min-w-0">
                          <Calendar size={12} className="text-gray-500 shrink-0" />
                          <span className="text-gray-800 shrink-0">Created:</span>
                          <span className="font-semibold text-gray-900">
                            {formatDate(displayStore.created_at ?? null)}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 min-w-0">
                          <Activity size={12} className="text-gray-500 shrink-0" />
                          <span className="text-gray-800 shrink-0">Status:</span>
                          <span
                            className={`font-semibold truncate ${
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
                        <div className="flex items-center gap-2 min-w-0 sm:col-span-2">
                          <History size={12} className="text-gray-500 shrink-0" />
                          <Link
                            href={`/dashboard/merchants/stores/${storeId}/activity`}
                            className="text-blue-600 hover:text-blue-800 font-medium"
                          >
                            View audit log
                          </Link>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Right column */}
                  <div className="space-y-3 min-w-0">
                    <div className="relative bg-gray-50 rounded-lg p-3 border border-gray-200 overflow-hidden">
                      <h3 className="text-sm font-semibold text-gray-900 mb-2 flex items-center gap-2">
                        <Shield size={16} className="text-blue-600" />
                        Legal Documents
                      </h3>
                      <div
                        className={`space-y-2 ${legalDocsRestricted ? "select-none blur-[6px] pointer-events-none" : ""}`}
                        aria-hidden={legalDocsRestricted || undefined}
                      >
                        {PROFILE_LEGAL_DOC_CONFIG.map((cfg) => {
                          const num = doc[cfg.numberKey];
                          if (!num || String(num).trim() === "") return null;
                          const label =
                            "typeKey" in cfg && cfg.typeKey && doc[cfg.typeKey]
                              ? String(doc[cfg.typeKey])
                              : cfg.label;
                          const flagRaw = doc[cfg.verifiedKey];
                          const flagVerified =
                            flagRaw === true ||
                            flagRaw === "t" ||
                            flagRaw === "true" ||
                            flagRaw === 1;
                          // Approved/active stores already passed documents verification —
                          // don't show Pending/Verify for docs that are present on profile.
                          const docVerified = flagVerified || isVerified;
                          return (
                            <ProfileLegalDocumentCard
                              key={cfg.prefix}
                              label={label}
                              documentNumber={String(num)}
                              holderName={
                                "holderKey" in cfg && cfg.holderKey
                                  ? (doc[cfg.holderKey] as string | null)
                                  : null
                              }
                              expiryDate={(doc[cfg.expiryKey] as string | null) ?? null}
                              documentUrl={
                                legalDocsRestricted
                                  ? null
                                  : ((doc[cfg.urlKey] as string | null) ?? null)
                              }
                              isVerified={docVerified}
                              onVerify={openDocumentsVerification}
                              canVerify={!legalDocsRestricted && canStoreVerify && !isVerified}
                            />
                          );
                        })}
                        {!PROFILE_LEGAL_DOC_CONFIG.some((cfg) => {
                          const num = doc[cfg.numberKey];
                          return num && String(num).trim() !== "";
                        }) && (
                          <p className="text-xs text-gray-500 text-center py-2">No documents found</p>
                        )}
                      </div>
                      {legalDocsRestricted ? (
                        <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/55 px-3">
                          <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-center text-[11px] font-medium text-amber-900 shadow-sm">
                            Legal documents are visible only for stores assigned to you as Area Manager.
                          </p>
                        </div>
                      ) : null}
                    </div>

                    <div className="relative bg-gray-50 rounded-lg p-3 border border-gray-200 overflow-hidden">
                      <h3 className="text-sm font-semibold text-gray-900 mb-2 flex items-center gap-2">
                        <FileCheck size={16} className="text-blue-600" />
                        Agreement contract
                      </h3>
                      <div
                        className={legalDocsRestricted ? "select-none blur-[6px] pointer-events-none" : ""}
                        aria-hidden={legalDocsRestricted || undefined}
                      >
                        <p className="text-xs text-gray-600 mb-3">
                          Partner agreement signed during onboarding.
                        </p>
                        {agreement.signer_name || agreement.accepted_at ? (
                          <div className="space-y-3">
                            <div className="bg-white rounded p-2 border border-gray-200 text-xs">
                              <div className="flex justify-between gap-2">
                                <span className="text-gray-600">Signed by</span>
                                <span className="font-medium text-gray-900">
                                  {String(agreement.signer_name ?? "—")}
                                </span>
                              </div>
                              <div className="flex justify-between gap-2 mt-1">
                                <span className="text-gray-600">Accepted on</span>
                                <span className="text-gray-900">
                                  {agreement.accepted_at
                                    ? formatDate(String(agreement.accepted_at))
                                    : "—"}
                                </span>
                              </div>
                            </div>
                            {!legalDocsRestricted && agreement.contract_pdf_url ? (
                              <div className="flex flex-wrap gap-2">
                                <a
                                  href={String(agreement.contract_pdf_url)}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-medium hover:bg-blue-700"
                                >
                                  <ExternalLink size={14} />
                                  View contract
                                </a>
                                <a
                                  href={String(agreement.contract_pdf_url)}
                                  download="partner-agreement-signed.pdf"
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-300 bg-white text-gray-700 text-xs font-medium hover:bg-gray-50"
                                >
                                  <Download size={14} />
                                  Download
                                </a>
                              </div>
                            ) : !legalDocsRestricted ? (
                              <p className="text-xs text-amber-600">PDF not available.</p>
                            ) : (
                              <div className="flex flex-wrap gap-2 opacity-70">
                                <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-medium">
                                  <ExternalLink size={14} />
                                  View contract
                                </span>
                                <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-300 bg-white text-gray-700 text-xs font-medium">
                                  <Download size={14} />
                                  Download
                                </span>
                              </div>
                            )}
                          </div>
                        ) : (
                          <p className="text-xs text-gray-500">No agreement record found for this store.</p>
                        )}
                      </div>
                      {legalDocsRestricted ? (
                        <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/55 px-3">
                          <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-center text-[11px] font-medium text-amber-900 shadow-sm">
                            Agreement is visible only for stores assigned to you as Area Manager.
                          </p>
                        </div>
                      ) : null}
                    </div>

                    <div className="relative bg-gray-50 rounded-lg p-2 border border-gray-200 overflow-hidden">
                      <div
                        className={
                          legalDocsRestricted ? "select-none blur-[6px] pointer-events-none" : ""
                        }
                        aria-hidden={legalDocsRestricted || undefined}
                      >
                        <BankAccountsSection
                          storeId={storeId}
                          initialAccounts={bankAccounts}
                          onVerify={openBankVerification}
                          canStoreVerify={!legalDocsRestricted && canStoreVerify}
                          canEditBank={!legalDocsRestricted && canEditBank}
                          readOnlyRestricted={legalDocsRestricted}
                          storeName={
                            (displayStore.store_display_name as string | undefined) ||
                            (displayStore.store_name as string | undefined) ||
                            (displayStore.owner_full_name as string | undefined) ||
                            null
                          }
                        />
                      </div>
                      {legalDocsRestricted ? (
                        <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/55 px-3">
                          <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-center text-[11px] font-medium text-amber-900 shadow-sm">
                            Bank details are visible only for stores assigned to you as Area Manager.
                          </p>
                        </div>
                      ) : null}
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mt-5">
                  <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-lg p-4 border border-blue-100">
                    <div className="flex items-center justify-between mb-3">
                      <div>
                        <h3 className="text-sm font-semibold text-gray-900 mb-1">Store Banner</h3>
                        <p className="text-xs text-gray-600">Upload your store banner image</p>
                      </div>
                      {canEditProfile ? (
                        <>
                          <button
                            type="button"
                            className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded-lg text-xs font-medium"
                            onClick={() => bannerInputRef.current?.click()}
                          >
                            <Upload size={12} />
                            Upload Banner
                          </button>
                          <input
                            type="file"
                            accept="image/*"
                            ref={bannerInputRef}
                            className="hidden"
                            onChange={onBannerUpload}
                          />
                        </>
                      ) : null}
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

                  <div className="bg-gradient-to-r from-green-50 to-emerald-50 rounded-lg p-4 border border-green-100">
                    <div className="flex items-center justify-between mb-3">
                      <div>
                        <h3 className="text-sm font-semibold text-gray-900 mb-1">
                          Gallery ({gallery.length}/5)
                        </h3>
                        <p className="text-xs text-gray-600">Up to 5 images</p>
                        {canStoreVerify && !isVerified && (
                          <button
                            type="button"
                            onClick={openProfileMediaVerification}
                            className="mt-1 text-[10px] font-semibold text-indigo-600 hover:text-indigo-800"
                          >
                            Review banner &amp; gallery
                          </button>
                        )}
                      </div>
                      {canEditProfile ? (
                        <>
                          <button
                            type="button"
                            className="flex items-center gap-1.5 bg-green-600 hover:bg-green-700 text-white px-3 py-1.5 rounded-lg text-xs font-medium disabled:opacity-50"
                            onClick={() => galleryInputRef.current?.click()}
                            disabled={gallery.length >= 5}
                          >
                            <Upload size={12} />
                            Upload
                          </button>
                          <input
                            type="file"
                            accept="image/*"
                            multiple
                            ref={galleryInputRef}
                            className="hidden"
                            onChange={onGalleryUpload}
                          />
                        </>
                      ) : null}
                    </div>
                    <div className="grid grid-cols-5 gap-2 mt-3">
                      {Array.from({ length: 5 }).map((_, index) => {
                        const img = gallery[index];
                        const isUploading =
                          uploadingImages.length > 0 &&
                          index >= gallery.length &&
                          index < gallery.length + uploadingImages.length;
                        const preview = isUploading
                          ? uploadingImages[index - gallery.length]
                          : null;
                        return (
                          <div
                            key={index}
                            className="relative group aspect-square min-h-[80px] bg-gray-100 rounded-lg border border-gray-200 overflow-hidden flex items-center justify-center"
                          >
                            {img ? (
                              <>
                                <img
                                  src={img}
                                  alt={`Gallery ${index + 1}`}
                                  className="w-full h-full object-cover"
                                />
                                {canEditProfile ? (
                                  <button
                                    type="button"
                                    onClick={() => onRemoveGalleryImage(index)}
                                    className="absolute top-1 right-1 bg-red-500 hover:bg-red-600 text-white w-5 h-5 rounded-full flex items-center justify-center text-sm opacity-0 group-hover:opacity-100 transition-opacity"
                                  >
                                    ×
                                  </button>
                                ) : null}
                              </>
                            ) : preview ? (
                              <div className="relative w-full h-full">
                                <img
                                  src={preview}
                                  alt="Uploading"
                                  className="w-full h-full object-cover opacity-60"
                                />
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
    </div>
  );
}
