"use client";

import React, { useEffect, useLayoutEffect, useState, useRef, useMemo, useCallback } from "react";
import { MXLayoutWhite } from "@/components/MXLayoutWhite";
import { PartnerPageHeader } from "@/context/PartnerShellHeaderContext";
import { R2Image } from "@/components/R2Image";
import { fetchRestaurantById as fetchStoreById, updateStoreInfo } from "@/lib/database";
import { MerchantStore } from "@/lib/merchantStore";
import {
  getOnboardingAssetsBannerPath,
  getOnboardingAssetsGalleryPath,
  getMerchantStoreMediaPath,
} from "@/lib/r2-paths";
import { normalizeMerchantStoreMediaUrl, normalizeR2ObjectKey, toStoredDocumentUrl } from "@/lib/r2";
import { LegalDocumentCard } from "@/components/LegalDocumentCard";
import { LicenseExpiredModal } from "@/components/LicenseExpiredModal";
import {
  evaluateMerchantLicenseCompliance,
  PROFILE_LEGAL_DOC_CONFIG,
  type MerchantDocumentPrefix,
} from "@/lib/merchantLicenseExpiry";
import { fetchStoreDocumentsViaApi } from "@/lib/merchant-profile-cache";
import { partnerDocumentPreviewHref } from "@/lib/partnerDocumentPreview";

const GALLERY_SLOT_COUNT = 5;

/** Fixed slots 0–4 for gallery UI (empty slots stay empty when another image is removed). */
function galleryToSlots(images: string[] | null | undefined): (string | null)[] {
  const slots: (string | null)[] = Array.from({ length: GALLERY_SLOT_COUNT }, () => null);
  if (!Array.isArray(images)) return slots;
  for (let i = 0; i < GALLERY_SLOT_COUNT; i++) {
    const u = images[i];
    if (typeof u === "string" && u.trim()) slots[i] = u.trim();
  }
  return slots;
}

/** Persist slot positions (holes as "") so removing slot 2 does not move slot 4 into slot 2. */
function slotsToStoredGallery(slots: (string | null)[]): string[] {
  const out = slots
    .slice(0, GALLERY_SLOT_COUNT)
    .map((u) => (typeof u === "string" && u.trim() ? u.trim() : ""));
  while (out.length > 0 && out[out.length - 1] === "") out.pop();
  return out;
}

function countFilledGallerySlots(slots: (string | null)[]): number {
  return slots.filter((u) => typeof u === "string" && u.trim().length > 0).length;
}

/** Bank/UPI attachment link that never expires: store keys use proxy?key=; full R2 URLs use proxy?url= so old signed URLs are served via proxy. */
function bankAttachmentHref(value: string | null | undefined): string | null {
  if (!value || typeof value !== "string") return null;
  const t = value.trim();
  if (!t) return null;
  if (t.includes("://")) return `/api/attachments/proxy?url=${encodeURIComponent(t)}`;
  return toStoredDocumentUrl(t) ?? t;
}
import { toast } from "sonner";
import { 
  Building, 
  MapPin, 
  Clock, 
  Phone, 
  Mail, 
  User, 
  CheckCircle,
  Shield,
  Package,
  Star,
  FileText,
  Edit2,
  Upload,
  DollarSign,
  Hash,
  Tag,
  Calendar,
  Activity,
  Banknote,
  Map,
  Lock,
  Globe,
  Image as ImageIcon,
  FileCheck,
  Download,
  ExternalLink,
} from "lucide-react";
import { PageSkeletonProfile } from "@/components/PageSkeleton";
import { readPartnerSelectedStoreId, PARTNER_SELECTED_STORE_CHANGED } from "@/lib/partner-selected-store";
import {
  normalizeProfileStore,
  readCachedMerchantProfile,
  writeCachedMerchantProfile,
} from "@/lib/merchant-profile-cache";

function readProfileCacheForStore(storeId: string | null) {
  if (!storeId) return null;
  return readCachedMerchantProfile(storeId);
}

class ProfileErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean }> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  componentDidCatch(error: any, info: any) {
    // Optionally log error
    // console.error(error, info);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: 40, textAlign: 'center', color: '#b91c1c', background: '#fff0f0' }}>
          <h2>Something went wrong.</h2>
          <p>Please refresh the page or contact support if this continues.</p>
        </div>
      );
    }
    return this.props.children;
  }
}

// ================= OPERATING DAYS CARD =================
/** Uses hours from parent profile load (`fetchStoreOperatingHoursViaApi` → service role). */
function OperatingDaysCard({ hours, className = "" }: { hours: any[]; className?: string }) {
  const totalMinutes = useMemo(
    () => hours.reduce((sum: number, d: any) => sum + (d.total_duration_minutes || 0), 0),
    [hours]
  );

  function formatSlot(start: string, end: string) {
    if (!start || !end) return null;
    return `${start}–${end}`;
  }

  function minutesToHours(minutes: number) {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return m > 0 ? `${h}h ${m}m` : `${h}h`;
  }

  function abbreviateDayLabel(dayLabel: string): string {
    const abbreviations: Record<string, string> = {
      Monday: "Mon",
      Tuesday: "Tue",
      Wednesday: "Wed",
      Thursday: "Thu",
      Friday: "Fri",
      Saturday: "Sat",
      Sunday: "Sun",
    };
    return abbreviations[dayLabel] || dayLabel.slice(0, 3);
  }

  return (
    <div
      className={`bg-gray-50 rounded-lg p-3 border border-gray-200 w-full min-w-0 h-full min-h-0 flex flex-col ${className}`}
    >
      <div className="flex items-center justify-between gap-2 mb-1.5 shrink-0">
        <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2 m-0">
          <Clock size={16} className="text-blue-600 shrink-0" />
          Operating Days
        </h3>
        {totalMinutes > 0 && (
          <span className="text-xs font-semibold text-blue-800 bg-blue-100 border border-blue-200/80 px-2 py-0.5 rounded-md shrink-0">
            {minutesToHours(totalMinutes)} / week
          </span>
        )}
      </div>
      {hours.length === 0 ? (
        <div className="flex-1 min-h-0 flex items-center justify-center py-6">
          <p className="text-sm text-gray-500">No operating hours configured</p>
        </div>
      ) : (
        <div className="flex-1 min-h-0 overflow-y-auto pr-0.5">
          <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
            <div className="grid grid-cols-[3.5rem_4.5rem_1fr_3.5rem] gap-x-3 px-3 py-2 bg-gray-50/90 border-b border-gray-200 text-[10px] font-semibold uppercase tracking-wide text-gray-500">
              <span>Day</span>
              <span>Status</span>
              <span>Hours</span>
              <span className="text-right">Total</span>
            </div>
            <div className="divide-y divide-gray-100">
          {hours.map((day: any) => {
            const slot1 = formatSlot(day.slot1_start, day.slot1_end);
            const slot2 = formatSlot(day.slot2_start, day.slot2_end);
            const hoursText =
              day.open && (slot1 || slot2)
                ? [slot1, slot2].filter(Boolean).join("  ·  ")
                : null;
            const dayTotal =
              day.open && day.total_duration_minutes > 0
                ? minutesToHours(day.total_duration_minutes)
                : null;
            return (
              <div
                key={day.day_label}
                className="grid grid-cols-[3.5rem_4.5rem_1fr_3.5rem] gap-x-3 items-center px-3 py-2.5 hover:bg-gray-50/80 transition-colors"
              >
                <span className="text-xs font-medium text-gray-700">
                  {abbreviateDayLabel(day.day_label)}
                </span>
                <span
                  className={`text-xs font-semibold ${
                    day.open ? "text-green-700" : "text-red-600"
                  }`}
                >
                  {day.open ? "Open" : "Closed"}
                </span>
                <span
                  className={`text-sm font-medium truncate ${
                    hoursText ? "text-gray-900" : "text-gray-400"
                  }`}
                  title={hoursText ?? undefined}
                >
                  {hoursText ?? "—"}
                </span>
                <span
                  className={`text-xs text-right ${
                    dayTotal ? "text-gray-600 font-medium" : "text-gray-300"
                  }`}
                >
                  {dayTotal ?? "—"}
                </span>
              </div>
            );
          })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function ProfilePage() {
  const [hydrated, setHydrated] = useState(false);
  const [store, setStore] = useState<MerchantStore | null>(null);
  const [editData, setEditData] = useState<MerchantStore | null>(null);
  const [storeId, setStoreId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [storeCuisines, setStoreCuisines] = useState<string[]>([]);
  const [showAllCuisines, setShowAllCuisines] = useState(false);
  const [cuisineEditMode, setCuisineEditMode] = useState(false);
  const [cuisineDetailRows, setCuisineDetailRows] = useState<
    Array<{ id: number; name: string; is_system_defined: boolean }>
  >([]);
  const [cuisineCatalogRows, setCuisineCatalogRows] = useState<
    Array<{ id: number; name: string; is_system_defined: boolean }>
  >([]);
  const [cuisineSearch, setCuisineSearch] = useState("");
  const [cuisineMutating, setCuisineMutating] = useState(false);
  const [editingField, setEditingField] = useState<string | null>(null);
  const [savingField, setSavingField] = useState<string | null>(null);
  const [uploadingImages, setUploadingImages] = useState<string[]>([]);
  const [uploadingGallerySlot, setUploadingGallerySlot] = useState<{ index: number; preview: string } | null>(null);
  const [bankVerification, setBankVerification] = useState<{
    verified: boolean;
    canTryVerify: boolean;
    attemptsToday: number;
    maxAttemptsPerDay: number;
  } | null>(null);
  const [bankVerifying, setBankVerifying] = useState(false);
  const [operatingHours, setOperatingHours] = useState<any[]>([]);
  const [storeDocuments, setStoreDocuments] = useState<any>(null);
  const [licenseModalOpen, setLicenseModalOpen] = useState(false);
  const [licenseUploadPrefix, setLicenseUploadPrefix] = useState<MerchantDocumentPrefix | null>(null);
  const storeInternalIdRef = useRef<number | null>(null);

  const licenseEvaluation = useMemo(
    () => (storeDocuments ? evaluateMerchantLicenseCompliance(storeDocuments as Record<string, unknown>) : null),
    [storeDocuments]
  );
  const [bankAccounts, setBankAccounts] = useState<any[]>([]);
  const [showAllBankAccounts, setShowAllBankAccounts] = useState(false);
  const [areaManager, setAreaManager] = useState<{ id?: number | null; name: string; email: string; mobile: string } | null>(null);
  const [loadingAreaManager, setLoadingAreaManager] = useState(false);
  const [agreement, setAgreement] = useState<{
    contract_pdf_url: string | null;
    signer_name: string;
    accepted_at: string;
    commission_first_month_pct: number | null;
    commission_from_second_month_pct: number | null;
    agreement_effective_from: string | null;
    agreement_effective_to: string | null;
  } | null>(null);
  const [agreementLoading, setAgreementLoading] = useState(false);
  const agreementContractHref = useMemo(
    () =>
      agreement?.contract_pdf_url
        ? partnerDocumentPreviewHref(agreement.contract_pdf_url)
        : null,
    [agreement?.contract_pdf_url]
  );
  const bannerInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const gallerySlotInputRef = useRef<HTMLInputElement>(null);
  const gallerySlotIndexRef = useRef<number | null>(null);

  /** Hydrate from session cache before paint — avoids SSR/client hydration mismatch. */
  useLayoutEffect(() => {
    const id = readPartnerSelectedStoreId();
    setStoreId(id);
    if (id) {
      const cached = readCachedMerchantProfile(id);
      if (cached) {
        setStore(cached.store);
        setEditData(cached.store);
        setOperatingHours(cached.operatingHours);
        setStoreDocuments(cached.storeDocuments);
        setBankAccounts(cached.bankAccounts);
        setLoading(false);
      }
    }
    setHydrated(true);
  }, []);

  /* ===== GET STORE ID ===== */
  useEffect(() => {
    const syncStoreId = () => {
      const id = readPartnerSelectedStoreId();
      if (!id) {
        toast.error("Store ID not found");
        return;
      }
      setStoreId((prev) => {
        if (prev === id) return prev;
        const cached = readCachedMerchantProfile(id);
        if (cached) {
          setStore(cached.store);
          setEditData(cached.store);
          setOperatingHours(cached.operatingHours);
          setStoreDocuments(cached.storeDocuments);
          setBankAccounts(cached.bankAccounts);
          setAgreement(null);
          setLoading(false);
        } else {
          setLoading(true);
          setStore(null);
          setEditData(null);
          setStoreDocuments(null);
          setAgreement(null);
          setBankAccounts([]);
        }
        return id;
      });
    };
    syncStoreId();
    window.addEventListener(PARTNER_SELECTED_STORE_CHANGED, syncStoreId);
    return () => window.removeEventListener(PARTNER_SELECTED_STORE_CHANGED, syncStoreId);
  }, []);

  // Load cuisines configured for this store (distinct list from merchant_store_cuisines)
  useEffect(() => {
    if (!storeId) return;
    const loadCuisines = async () => {
      try {
        const res = await fetch(`/api/merchant/store-cuisines?storeId=${encodeURIComponent(storeId)}`, {
          credentials: "include",
        });
        if (!res.ok) {
          setStoreCuisines(Array.isArray(store?.cuisine_types) ? (store?.cuisine_types as string[]) : []);
          return;
        }
        const data = await res.json().catch(() => ({}));
        const fromApi = Array.isArray((data as any).cuisines)
          ? (data as any).cuisines.filter((c: unknown) => typeof c === "string")
          : [];
        setStoreCuisines(
          fromApi.length > 0
            ? fromApi
            : Array.isArray(store?.cuisine_types)
            ? (store?.cuisine_types as string[])
            : []
        );
      } catch {
        setStoreCuisines(Array.isArray(store?.cuisine_types) ? (store?.cuisine_types as string[]) : []);
      }
    };
    loadCuisines();
  }, [storeId, store?.cuisine_types]);

  const refreshCuisineManagerData = useCallback(async () => {
    if (!storeId) return;
    try {
      const res = await fetch(`/api/merchant/store-cuisines?storeId=${encodeURIComponent(storeId)}`, {
        credentials: "include",
      });
      if (!res.ok) return;
      const data = (await res.json().catch(() => ({}))) as {
        cuisines?: unknown;
        cuisineDetails?: unknown;
        catalog?: unknown;
      };
      const names = Array.isArray(data.cuisines)
        ? data.cuisines.filter((c: unknown): c is string => typeof c === "string")
        : [];
      setStoreCuisines(names.length > 0 ? names : Array.isArray(store?.cuisine_types) ? (store?.cuisine_types as string[]) : []);
      const det = Array.isArray(data.cuisineDetails) ? data.cuisineDetails : [];
      const cat = Array.isArray(data.catalog) ? data.catalog : [];
      setCuisineDetailRows(
        det
          .filter((r: unknown): r is { id: number; name: string; is_system_defined?: boolean } =>
            r != null &&
            typeof r === "object" &&
            typeof (r as { id?: unknown }).id === "number" &&
            typeof (r as { name?: unknown }).name === "string"
          )
          .map((r) => ({
            id: r.id,
            name: r.name,
            is_system_defined: Boolean(r.is_system_defined),
          }))
      );
      setCuisineCatalogRows(
        cat
          .filter((r: unknown): r is { id: number; name: string; is_system_defined?: boolean } =>
            r != null &&
            typeof r === "object" &&
            typeof (r as { id?: unknown }).id === "number" &&
            typeof (r as { name?: unknown }).name === "string"
          )
          .map((r) => ({
            id: r.id,
            name: r.name,
            is_system_defined: Boolean(r.is_system_defined),
          }))
      );
    } catch {
      // ignore
    }
  }, [storeId, store?.cuisine_types]);

  const enterCuisineEdit = useCallback(async () => {
    setCuisineEditMode(true);
    setCuisineSearch("");
    await refreshCuisineManagerData();
  }, [refreshCuisineManagerData]);

  const filteredCuisineCatalog = useMemo(() => {
    const q = cuisineSearch.trim().toLowerCase();
    if (!q) return cuisineCatalogRows;
    return cuisineCatalogRows.filter((c) => c.name.toLowerCase().includes(q));
  }, [cuisineCatalogRows, cuisineSearch]);

  const linkPartnerCuisine = async (cuisineId: number) => {
    if (!storeId || cuisineMutating) return;
    setCuisineMutating(true);
    try {
      const res = await fetch("/api/merchant/store-cuisines/link", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ storeId, cuisine_id: cuisineId }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(typeof j?.message === "string" ? j.message : typeof j?.error === "string" ? j.error : "Failed to add");
      }
      toast.success("Cuisine added to store");
      await refreshCuisineManagerData();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Could not add cuisine");
    } finally {
      setCuisineMutating(false);
    }
  };

  const unlinkPartnerCuisine = async (cuisineId: number) => {
    if (!storeId || cuisineMutating) return;
    setCuisineMutating(true);
    try {
      const res = await fetch("/api/merchant/store-cuisines/unlink", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ storeId, cuisine_id: cuisineId }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(typeof j?.message === "string" ? j.message : typeof j?.error === "string" ? j.error : "Failed to remove");
      }
      toast.success("Cuisine removed");
      await refreshCuisineManagerData();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Could not remove cuisine");
    } finally {
      setCuisineMutating(false);
    }
  };

  /* ===== FETCH AREA MANAGER (via API to bypass RLS / auth issues) ===== */
  useEffect(() => {
    if (!storeId) {
      setAreaManager(null);
      return;
    }

    const fetchAreaManager = async () => {
      try {
        setLoadingAreaManager(true);
        const res = await fetch(`/api/merchant/area-manager?storeId=${encodeURIComponent(storeId)}`);
        const data = await res.json();
        if (res.ok && data.success) {
          if (data.areaManager) {
            setAreaManager({
              id: data.areaManager.id,
              name: data.areaManager.name || 'Not set',
              email: data.areaManager.email || 'Not set',
              mobile: data.areaManager.mobile || 'Not set',
            });
          } else {
            setAreaManager(null);
          }
        } else {
          setAreaManager(null);
        }
      } catch (error) {
        console.error('Error fetching area manager:', error);
        setAreaManager(null);
      } finally {
        setLoadingAreaManager(false);
      }
    };

    fetchAreaManager();
  }, [storeId]);

  /* ===== FETCH AGREEMENT (signed contract from onboarding) ===== */
  useEffect(() => {
    if (!storeId) {
      setAgreement(null);
      return;
    }
    setAgreementLoading(true);
    setAgreement(null);
    fetch(`/api/merchant/agreement?storeId=${encodeURIComponent(storeId)}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.success && data.acceptance) {
          setAgreement({
            contract_pdf_url: data.acceptance.contract_pdf_url ?? null,
            signer_name: data.acceptance.signer_name ?? '—',
            accepted_at: data.acceptance.accepted_at ?? '',
            commission_first_month_pct: data.acceptance.commission_first_month_pct ?? null,
            commission_from_second_month_pct: data.acceptance.commission_from_second_month_pct ?? null,
            agreement_effective_from: data.acceptance.agreement_effective_from ?? null,
            agreement_effective_to: data.acceptance.agreement_effective_to ?? null,
          });
        } else {
          setAgreement(null);
        }
      })
      .catch(() => setAgreement(null))
      .finally(() => setAgreementLoading(false));
  }, [storeId]);
  
  /* ===== FETCH DATA ===== */
  useEffect(() => {
    if (!storeId) return;
    const hadCache = Boolean(readCachedMerchantProfile(storeId));
    if (!hadCache) setLoading(true);
    let cancelled = false;
    (async () => {
      try {
        const storeData = await fetchStoreById(storeId);
        if (cancelled) return;
        const internalId = storeData?.id;
        storeInternalIdRef.current = internalId ?? null;

        const [hoursData, { docs, banks }] = await Promise.all([
          internalId
            ? import("@/lib/database").then((m) => m.fetchStoreOperatingHoursViaApi(internalId))
            : Promise.resolve([]),
          (async () => {
            if (!storeId) {
              return { docs: null as any, banks: [] as any[] };
            }
            const mod = await import("@/lib/database");
            try {
              const [docsResult, banksResult] = await Promise.all([
                fetchStoreDocumentsViaApi(storeId).catch((err) => {
                  console.error('Error fetching documents:', err);
                  return null;
                }),
                internalId
                  ? mod.fetchStoreBankAccounts(internalId).catch((err) => {
                      console.error('Error fetching bank accounts:', err);
                      return [];
                    })
                  : Promise.resolve([]),
              ]);
              return { docs: docsResult, banks: banksResult };
            } catch {
              return { docs: null, banks: [] };
            }
          })(),
        ]);

        if (cancelled) return;

        const normalizedStore = storeData ? normalizeProfileStore(storeData as MerchantStore) : null;
        if (normalizedStore) {
          setStore(normalizedStore);
          setEditData(normalizedStore);
        }
        const hours = Array.isArray(hoursData) ? hoursData : [];
        setOperatingHours(hours);
        if (docs) setStoreDocuments(docs);
        const bankAccountsArray = Array.isArray(banks) ? banks : [];
        setBankAccounts(bankAccountsArray);

        if (normalizedStore) {
          writeCachedMerchantProfile(storeId, {
            store: normalizedStore,
            operatingHours: hours,
            storeDocuments: docs ?? null,
            bankAccounts: bankAccountsArray,
          });
        }
      } catch (error) {
        if (!cancelled) {
          console.error('Error loading profile:', error);
          if (!hadCache) toast.error("Failed to load profile");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [storeId]);

  /* ===== BANK VERIFICATION STATUS ===== */
  useEffect(() => {
    if (!storeId) return;
    fetch(`/api/merchant/bank-account/verify/status?storeId=${encodeURIComponent(storeId)}`, { credentials: "include" })
      .then((r) => r.json())
      .then((data) => {
        if (data.success && data.verified !== undefined) {
          setBankVerification({
            verified: data.verified,
            canTryVerify: data.canTryVerify !== false,
            attemptsToday: data.attemptsToday ?? 0,
            maxAttemptsPerDay: data.maxAttemptsPerDay ?? 3,
          });
        }
      })
      .catch(() => {});
  }, [storeId]);

  /* ===== REFRESH BANK ACCOUNTS WHEN STORE CHANGES ===== */
  useEffect(() => {
    if (!store?.id) return;
    import("@/lib/database").then(async (mod) => {
      try {
        const banks = await mod.fetchStoreBankAccounts(store.id);
        setBankAccounts(Array.isArray(banks) ? banks : []);
      } catch (error) {
        console.error('Error refreshing bank accounts:', error);
        setBankAccounts([]);
      }
    });
  }, [store?.id]);

  /* ===== STORE NAME LOGIC ===== */
  const storeInitial = store?.store_name?.charAt(0).toUpperCase() || "R";
  const isVerified = store?.approval_status === 'APPROVED';

  const revertFieldFromStore = useCallback(() => {
    if (store) setEditData({ ...store });
    setEditingField(null);
  }, [store]);

  const runBankVerificationIfNeeded = useCallback(async () => {
    if (!storeId || !editData) return;
    const hasBank =
      editData.bank_account_holder &&
      editData.bank_account_number &&
      editData.bank_ifsc &&
      editData.bank_name;
    if (
      !hasBank ||
      bankVerification?.verified ||
      !bankVerification?.canTryVerify ||
      bankVerifying
    ) {
      return;
    }
    setBankVerifying(true);
    try {
      const res = await fetch("/api/merchant/bank-account/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          storeId,
          bank: {
            account_holder_name: editData.bank_account_holder,
            account_number: editData.bank_account_number,
            ifsc_code: editData.bank_ifsc,
            bank_name: editData.bank_name,
          },
        }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success(data.message || "We sent ₹1 to verify your account. Check back in a few minutes.");
        setTimeout(() => {
          fetch(`/api/merchant/bank-account/verify/status?storeId=${encodeURIComponent(storeId)}`, {
            credentials: "include",
          })
            .then((r) => r.json())
            .then((d) => {
              if (d.success && d.verified !== undefined) {
                setBankVerification({
                  verified: d.verified,
                  canTryVerify: d.canTryVerify !== false,
                  attemptsToday: d.attemptsToday ?? 0,
                  maxAttemptsPerDay: d.maxAttemptsPerDay ?? 3,
                });
              }
            })
            .catch(() => {});
        }, 2000);
      } else {
        toast.error(data.error || "Verification request failed.");
        if (res.status === 429) {
          setBankVerification((prev) =>
            prev ? { ...prev, canTryVerify: false, attemptsToday: prev.maxAttemptsPerDay } : null
          );
        }
      }
    } catch {
      toast.error("Verification request failed. You can try again later.");
    } finally {
      setBankVerifying(false);
    }
  }, [storeId, editData, bankVerification, bankVerifying]);

  const persistProfileField = async (field: string) => {
    if (!storeId || !editData) return;
    setSavingField(field);
    try {
      const partial: Partial<MerchantStore> = {};
      switch (field) {
        case "store_name":
          partial.store_name = editData.store_name;
          break;
        case "store_email":
          partial.store_email = editData.store_email;
          break;
        case "store_phones":
          partial.store_phones = editData.store_phones;
          break;
        case "store_description":
          partial.store_description = editData.store_description;
          break;
        case "full_address":
          partial.full_address = editData.full_address;
          break;
        case "city":
          partial.city = editData.city;
          break;
        case "state":
          partial.state = editData.state;
          break;
        case "landmark":
          partial.landmark = editData.landmark;
          break;
        case "postal_code":
          partial.postal_code = editData.postal_code;
          break;
        case "latitude":
          partial.latitude = editData.latitude;
          break;
        case "longitude":
          partial.longitude = editData.longitude;
          break;
        case "bank_account_holder":
          partial.bank_account_holder = editData.bank_account_holder;
          break;
        case "bank_account_number":
          partial.bank_account_number = editData.bank_account_number;
          break;
        case "bank_ifsc":
          partial.bank_ifsc = editData.bank_ifsc;
          break;
        case "bank_name":
          partial.bank_name = editData.bank_name;
          break;
        default:
          toast.error("Cannot save this field here.");
          return;
      }
      const ok = await updateStoreInfo(storeId, partial);
      if (!ok) {
        toast.error("Failed to save");
        return;
      }
      setStore((prev) => (prev ? { ...prev, ...partial } : prev));
      setEditData((prev) => (prev ? { ...prev, ...partial } : prev));
      toast.success("Saved");
      setEditingField(null);
      if (
        field === "bank_account_holder" ||
        field === "bank_account_number" ||
        field === "bank_ifsc" ||
        field === "bank_name"
      ) {
        await runBankVerificationIfNeeded();
      }
    } catch {
      toast.error("Failed to save");
    } finally {
      setSavingField(null);
    }
  };

  /* ===== R2 UPLOAD (server-side, no Supabase Storage RLS) =====
   * Banner/gallery: docs/merchants/{parent_pk}/stores/{GMMC}/onboarding/assets/{banner|gallery}/...
   */
  const uploadStoreMediaToR2 = async (
    file: File,
    kind: "banner" | "gallery",
    gallerySlot?: number,
    galleryBatchTs?: number
  ): Promise<string | null> => {
    if (!storeId) return null;
    const parentPk = store?.parent_id;
    if (parentPk == null || String(parentPk).trim() === "") {
      throw new Error("Store parent is missing; cannot upload to the correct folder.");
    }
    const ext = file.name.split(".").pop() || "jpg";
    let parent: string;
    let filename: string;
    if (kind === "banner") {
      parent = getOnboardingAssetsBannerPath(parentPk, storeId);
      filename = `banner_${Date.now()}.${ext}`;
    } else if (kind === "gallery") {
      parent = getOnboardingAssetsGalleryPath(parentPk, storeId);
      const ts = galleryBatchTs ?? Date.now();
      filename = `gallery_${ts}_${gallerySlot ?? 0}.${ext}`;
    } else {
      const _exhaustive: never = kind;
      throw new Error(`Unsupported media kind: ${String(_exhaustive)}`);
    }
    const formData = new FormData();
    formData.append("file", file);
    formData.append("parent", parent);
    formData.append("filename", filename);
    const res = await fetch("/api/upload/r2", { method: "POST", body: formData });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data?.error || data?.details || "Upload failed");
    }
    const data = await res.json();
    const key = data?.key ?? data?.path;
    if (key && typeof key === "string") {
      const proxy = normalizeMerchantStoreMediaUrl(key);
      if (proxy) return proxy;
      return `/api/attachments/proxy?key=${encodeURIComponent(normalizeR2ObjectKey(key))}`;
    }
    const url = data?.url;
    if (url && typeof url === "string") {
      return normalizeMerchantStoreMediaUrl(url) ?? url;
    }
    return null;
  };

  /* ===== UPDATE STORE MEDIA VIA API (bypasses RLS, uses service role on server) ===== */
  const updateStoreMedia = async (updates: { banner_url?: string; gallery_images?: string[] }): Promise<boolean> => {
    if (!storeId) return false;
    const res = await fetch("/api/merchant/store-profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      cache: "no-store",
      body: JSON.stringify({ storeId, ...updates }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      const msg =
        (data?.error && String(data.error)) ||
        `Failed to save (HTTP ${res.status})`;
      const details =
        data?.details ? `\n${String(data.details)}` : data?.code ? `\n${String(data.code)}` : "";
      throw new Error(`${msg}${details}`);
    }
    return true;
  };

  /* ===== IMAGE UPLOAD HANDLERS ===== */
  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>, type: 'banner' | 'gallery') => {
    const files = Array.from(e.target.files || []);
    if (!files.length || !storeId) return;

    const gallerySlots = galleryToSlots(store?.gallery_images);
    const remainingSlots = Math.max(0, GALLERY_SLOT_COUNT - countFilledGallerySlots(gallerySlots));
    const effectiveFiles = type === "gallery" ? files.slice(0, remainingSlots) : files.slice(0, 1);

    setUploadingImages(effectiveFiles.map((file) => URL.createObjectURL(file)));
    e.target.value = "";

    try {
      if (type === 'banner') {
        const file = effectiveFiles[0];
        const url = await uploadStoreMediaToR2(file, "banner");
        if (!url) throw new Error("Banner upload failed");
        await updateStoreMedia({ banner_url: url });
        setStore(r => r ? { ...r, banner_url: url } : r);
        setEditData(r => r ? { ...r, banner_url: url } : r);
        toast.success("Store banner updated!");
      } else if (type === 'gallery') {
        if (effectiveFiles.length === 0) {
          toast.error("Gallery is full (max 5 images).");
          return;
        }
        const galleryBatch = Date.now();
        const slots = [...gallerySlots];
        let fileIdx = 0;
        for (let slot = 0; slot < GALLERY_SLOT_COUNT && fileIdx < effectiveFiles.length; slot++) {
          if (slots[slot]) continue;
          const url = await uploadStoreMediaToR2(
            effectiveFiles[fileIdx],
            "gallery",
            slot,
            galleryBatch
          );
          if (url) {
            slots[slot] = url;
            fileIdx++;
          }
        }
        const newGallery = slotsToStoredGallery(slots);
        await updateStoreMedia({ gallery_images: newGallery });
        setStore((r) => (r ? { ...r, gallery_images: newGallery } : r));
        setEditData((r) => (r ? { ...r, gallery_images: newGallery } : r));
        toast.success("Gallery images updated!");
      }

      setUploadingImages([]);
    } catch (error) {
      console.error("Image upload error:", error);
      toast.error(error instanceof Error ? error.message : "Image upload failed");
      setUploadingImages([]);
    }
  };

  const openGallerySlotPicker = (index: number) => {
    if (!storeId) return;
    gallerySlotIndexRef.current = index;
    gallerySlotInputRef.current?.click();
  };

  const handleGallerySlotUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !storeId) return;

    const slots = galleryToSlots(store?.gallery_images);
    const targetIndex = gallerySlotIndexRef.current ?? 0;
    if (targetIndex < 0 || targetIndex >= GALLERY_SLOT_COUNT) return;

    if (!slots[targetIndex] && countFilledGallerySlots(slots) >= GALLERY_SLOT_COUNT) {
      toast.error("Gallery is full (max 5 images).");
      return;
    }

    const preview = URL.createObjectURL(file);
    setUploadingGallerySlot({ index: targetIndex, preview });

    try {
      const galleryBatch = Date.now();
      const url = await uploadStoreMediaToR2(file, "gallery", targetIndex, galleryBatch);
      if (!url) throw new Error("Gallery upload failed");

      const next = [...slots];
      next[targetIndex] = url;
      const newGallery = slotsToStoredGallery(next);

      await updateStoreMedia({ gallery_images: newGallery });
      setStore((r) => (r ? { ...r, gallery_images: newGallery } : r));
      setEditData((r) => (r ? { ...r, gallery_images: newGallery } : r));
      toast.success("Gallery image updated!");
    } catch (err) {
      console.error("Gallery slot upload error:", err);
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploadingGallerySlot(null);
    }
  };

  /* ===== REMOVE GALLERY IMAGE ===== */
  const handleRemoveGalleryImage = async (slotIndex: number) => {
    if (!storeId) return;

    const slots = galleryToSlots(store?.gallery_images);
    if (!slots[slotIndex]) return;

    const nextSlots = [...slots];
    nextSlots[slotIndex] = null;
    const newGallery = slotsToStoredGallery(nextSlots);

    try {
      await updateStoreMedia({ gallery_images: newGallery });
      setStore((r) => (r ? { ...r, gallery_images: newGallery } : r));
      setEditData((r) => (r ? { ...r, gallery_images: newGallery } : r));
      toast.success("Image removed!");
    } catch (error) {
      console.error("Gallery remove error:", error);
      toast.error(error instanceof Error ? error.message : "Failed to remove image");
    }
  };

  /* ===== FORMATTING FUNCTIONS ===== */
  const formatTime = (timeString?: string) => {
    if (!timeString) return "—";
    try {
      const [hours, minutes] = timeString.split(':');
      const date = new Date();
      date.setHours(parseInt(hours), parseInt(minutes));
      return date.toLocaleTimeString('en-IN', { 
        hour: '2-digit', 
        minute: '2-digit',
        hour12: true 
      });
    } catch {
      return timeString;
    }
  };

  // Today's slots from merchant_store_operating_hours (matches OperatingDaysCard day_label)
  const formatOperatingHours = () => {
    if (!operatingHours || operatingHours.length === 0) return "—";
    const dayLabels = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    const todayLabel = dayLabels[new Date().getDay()];
    const row = operatingHours.find((d: any) => d.day_label === todayLabel);
    if (!row) return "—";
    if (!row.open) return "Closed";
    const parts: string[] = [];
    if (row.slot1_start && row.slot1_end) {
      parts.push(`${formatTime(row.slot1_start)} – ${formatTime(row.slot1_end)}`);
    }
    if (row.slot2_start && row.slot2_end) {
      parts.push(`${formatTime(row.slot2_start)} – ${formatTime(row.slot2_end)}`);
    }
    return parts.length > 0 ? parts.join(" · ") : "—";
  };

  const formatDate = (dateString?: string) => {
    if (!dateString) return "—";
    return new Date(dateString).toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    });
  };

  const formatArray = (arr?: string[]) => {
    if (!arr || arr.length === 0) return "—";
    return arr.join(', ');
  };

  const startEditing = (fieldName: string) => {
    setEditingField(fieldName);
  };

  const stopEditing = () => {
    setEditingField(null);
  };

  if (!hydrated || (loading && !store)) {
    return (
      <MXLayoutWhite restaurantName={editData?.store_name || ''} restaurantId={storeId || ''}>
        <PageSkeletonProfile />
      </MXLayoutWhite>
    );
  }

  if (!store || !editData) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-red-500">Profile not found</div>
      </div>
    );
  }

  return (
    <ProfileErrorBoundary>
      <MXLayoutWhite
        restaurantName={store.store_name}
        restaurantId={store.store_id}
      >
        <PartnerPageHeader title="Merchant Profile" subtitle="Manage your restaurant details" />
        <div className="bg-gray-50 flex-1 flex flex-col min-h-0 overflow-hidden">
          {/* MAIN CONTENT — no duplicate strip under shell header (avoids large white gap) */}
          <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden hide-scrollbar" style={{ scrollBehavior: 'smooth' }}>
            <div className="px-4 pt-2 pb-3">
              <div className="w-full">

                {/* MAIN CARD */}
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 mb-2">
                  {/* STORE HEADER - Card layout on small screens, wide on desktop */}
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
                          <div className="flex items-center gap-2 flex-wrap">
                            <h2 className="text-base font-bold text-gray-900 truncate">
                              {store?.store_name || '—'}
                            </h2>
                          </div>
                          <div className="flex items-center gap-2.5 text-xs text-gray-600 mt-0.5">
                            <span className="flex items-center gap-1 shrink-0">
                              <MapPin size={10} />
                              {store?.city || '—'}, {store?.state || '—'}
                            </span>
                            <span className="flex items-center gap-1 shrink-0">
                              <Clock size={10} />
                              {formatOperatingHours()}
                            </span>
                          </div>
                        </div>
                      </div>
                      
                      {/* QUICK STATS - Card layout on small screens */}
                      <div className="grid grid-cols-2 sm:grid-cols-3 md:flex md:flex-wrap gap-2 shrink-0">
                        <div className="text-center px-2 py-1 bg-white rounded-lg border border-gray-200 min-w-[70px]">
                          <div className="text-xs font-bold text-gray-900">{store?.min_order_amount || 0}</div>
                          <div className="text-[10px] text-gray-500">Min Order</div>
                        </div>
                        <div className="text-center px-2 py-1 bg-white rounded-lg border border-gray-200 min-w-[70px]">
                          <div className="text-xs font-bold text-gray-900">{(store?.avg_preparation_time_minutes ?? store?.avg_delivery_time_minutes) || 0}m</div>
                          <div className="text-[10px] text-gray-500">Prep Time</div>
                        </div>
                        <div className="text-center px-2 py-1 bg-white rounded-lg border border-gray-200 min-w-[70px]">
                          <div className="text-xs font-bold text-gray-900">{store?.delivery_radius_km ?? '—'}</div>
                          <div className="text-[10px] text-gray-500">Delivery Radius</div>
                        </div>
                        <div className="text-center px-2 py-1 bg-white rounded-lg border border-gray-200 min-w-[100px]">
                          <div className="text-xs font-bold text-gray-900 truncate">{store?.parent_merchant_id || '—'}</div>
                          <div className="text-[10px] text-gray-500">Parent Merchant ID</div>
                        </div>
                        <div className="text-center px-2 py-1 bg-white rounded-lg border border-gray-200 min-w-[70px]">
                          <div className="text-xs font-bold text-gray-900">
                            {store?.approval_status === 'APPROVED' ? 'Verified' : 'Pending'}
                          </div>
                          <div className="text-[10px] text-gray-500">Status</div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* CONTENT GRID - Compact */}
                  <div className="p-3">
                    <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.65fr)_minmax(0,1fr)] gap-3 lg:gap-4 lg:items-stretch">
                      
                      {/* Left: row1 Store Details | Operating Days; row2 Location (full); row3 Area Manager | Store Info (50/50) */}
                      <div className="min-w-0 flex flex-col gap-3 lg:gap-4">
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 lg:gap-4 lg:items-stretch">
                        <div className="min-w-0 flex min-h-0 lg:h-full">
                        <div className="bg-gray-50 rounded-lg p-3 border border-gray-200 flex flex-col min-h-0 h-full w-full min-w-0">
                          <div className="flex items-center justify-between mb-1.5 shrink-0">
                            <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2 m-0">
                              <Building size={16} className="text-blue-600" />
                              Store Details
                            </h3>
                            <label className="inline-flex items-center cursor-pointer ml-2">
                              <span className="text-xs font-medium text-gray-700 mr-2">Pure Veg</span>
                              <input
                                type="checkbox"
                                checked={!!editData?.is_pure_veg}
                                onChange={async (e) => {
                                  if (!storeId || !editData) return;
                                  const newValue = e.target.checked;
                                  const oldValue = editData.is_pure_veg;
                                  // Optimistic update
                                  setEditData({ ...editData, is_pure_veg: newValue });
                                  if (store) setStore({ ...store, is_pure_veg: newValue });
                                  try {
                                    await updateStoreInfo(storeId, { is_pure_veg: newValue });
                                    toast.success(`Store marked as ${newValue ? 'Pure Veg' : 'Not Pure Veg'}`);
                                  } catch (err: any) {
                                    // Revert on error
                                    setEditData({ ...editData, is_pure_veg: oldValue });
                                    if (store) setStore({ ...store, is_pure_veg: oldValue });
                                    toast.error(err?.message || 'Failed to update Pure Veg status');
                                  }
                                }}
                                className="sr-only peer"
                              />
                              <div className="w-9 h-5 bg-gray-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-blue-500 rounded-full peer peer-checked:bg-green-500 transition-all relative">
                                <div className={`absolute left-1 top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${editData?.is_pure_veg ? 'translate-x-4' : ''}`}></div>
                              </div>
                            </label>
                          </div>
                          <div className="space-y-1.5 text-sm flex-1 min-h-0 overflow-y-auto pr-0.5">
                            <CompactEditableRow
                              label="Store Name"
                              value={editData?.store_name || ''}
                              isEditing={editingField === 'store_name'}
                              onEdit={() => startEditing('store_name')}
                              onSave={stopEditing}
                              onChange={(v) => setEditData({ ...editData, store_name: v })}
                              onPersist={() => persistProfileField('store_name')}
                              onCancel={revertFieldFromStore}
                              isSaving={savingField === 'store_name'}
                            />
                            <CompactLockedRow
                              label="Store Display Name"
                              value={store.store_display_name || '—'}
                            />
                            {/* Cuisine types: plain text by default; Edit → chips + search + master list */}
                            <div>
                              <div className="flex items-center justify-between mb-1 gap-2">
                                <span className="text-xs font-medium text-gray-600">Cuisine Types</span>
                                <button
                                  type="button"
                                  onClick={() => {
                                    if (cuisineEditMode) {
                                      setCuisineEditMode(false);
                                      setCuisineSearch("");
                                    } else {
                                      void enterCuisineEdit();
                                    }
                                  }}
                                  className="inline-flex items-center gap-1 rounded-md border border-gray-200 bg-white px-2 py-0.5 text-[11px] font-semibold text-gray-800 hover:bg-gray-50"
                                >
                                  {cuisineEditMode ? (
                                    <>
                                      <CheckCircle size={12} className="text-green-600" />
                                      Done
                                    </>
                                  ) : (
                                    <>
                                      <Edit2 size={12} className="text-blue-600" />
                                      Edit
                                    </>
                                  )}
                                </button>
                              </div>
                              {!cuisineEditMode ? (
                                storeCuisines.length === 0 ? (
                                  <div className="text-sm text-gray-400">—</div>
                                ) : (
                                  <div className="text-sm text-gray-900 font-medium leading-relaxed">
                                    <span>
                                      {(showAllCuisines ? storeCuisines : storeCuisines.slice(0, 8)).join(", ")}
                                    </span>
                                    {storeCuisines.length > 8 && (
                                      <button
                                        type="button"
                                        onClick={() => setShowAllCuisines((v) => !v)}
                                        className="ml-1 text-xs font-semibold text-blue-600 hover:text-blue-800 hover:underline"
                                      >
                                        {showAllCuisines ? "Show less" : `+${storeCuisines.length - 8} more`}
                                      </button>
                                    )}
                                  </div>
                                )
                              ) : (
                                <div className="space-y-2 rounded-lg border border-blue-100 bg-white p-2">
                                  {cuisineDetailRows.length > 0 ? (
                                    <div className="flex flex-wrap gap-1.5">
                                      <span className="text-[10px] text-gray-500 w-full">Linked to store:</span>
                                      {cuisineDetailRows.map((c) => (
                                        <span
                                          key={c.id}
                                          className="inline-flex items-center gap-1 rounded-full bg-gray-100 border border-gray-200 px-2 py-0.5 text-xs text-gray-800"
                                        >
                                          {c.name}
                                          <button
                                            type="button"
                                            disabled={cuisineMutating}
                                            className="text-red-600 hover:text-red-800 font-bold"
                                            onClick={() => void unlinkPartnerCuisine(c.id)}
                                          >
                                            ×
                                          </button>
                                        </span>
                                      ))}
                                    </div>
                                  ) : (
                                    <p className="text-[11px] text-amber-800">No cuisines linked. Search below to add from the master list.</p>
                                  )}
                                  <div>
                                    <label className="block text-[10px] font-medium text-gray-600 mb-0.5">Search cuisine master</label>
                                    <input
                                      type="search"
                                      value={cuisineSearch}
                                      onChange={(e) => setCuisineSearch(e.target.value)}
                                      placeholder="Type to filter…"
                                      className="w-full px-2 py-1.5 border border-gray-300 rounded-lg text-xs"
                                    />
                                    {filteredCuisineCatalog.length > 0 ? (
                                      <ul className="mt-1 max-h-32 overflow-y-auto rounded border border-gray-100 divide-y divide-gray-100 bg-gray-50/80">
                                        {filteredCuisineCatalog.map((c) => (
                                          <li key={c.id}>
                                            <button
                                              type="button"
                                              disabled={cuisineMutating}
                                              onClick={() => void linkPartnerCuisine(c.id)}
                                              className="w-full text-left px-2 py-1.5 text-xs hover:bg-blue-50 disabled:opacity-50"
                                            >
                                              + {c.name}
                                            </button>
                                          </li>
                                        ))}
                                      </ul>
                                    ) : cuisineCatalogRows.length > 0 ? (
                                      <p className="text-[10px] text-gray-500 mt-1">No matches — try another search.</p>
                                    ) : cuisineDetailRows.length > 0 ? (
                                      <p className="text-[10px] text-gray-500 mt-1">All master cuisines are linked.</p>
                                    ) : null}
                                  </div>
                                </div>
                              )}
                            </div>
                            <CompactEditableRow
                              label="Store Email"
                              value={editData.store_email}
                              isEditing={editingField === 'store_email'}
                              onEdit={() => startEditing('store_email')}
                              onSave={stopEditing}
                              onChange={(v) => setEditData({ ...editData, store_email: v })}
                              onPersist={() => persistProfileField('store_email')}
                              onCancel={revertFieldFromStore}
                              isSaving={savingField === 'store_email'}
                            />
                            <CompactEditableRow
                              label="Store Phones"
                              value={formatArray(editData.store_phones)}
                              isEditing={editingField === 'store_phones'}
                              onEdit={() => startEditing('store_phones')}
                              onSave={stopEditing}
                              onChange={(v) => setEditData({ ...editData, store_phones: v.split(',').map(s => s.trim()) })}
                              onPersist={() => persistProfileField('store_phones')}
                              onCancel={revertFieldFromStore}
                              isSaving={savingField === 'store_phones'}
                            />
                            <CompactEditableRow
                              label="Description"
                              value={editData.store_description}
                              isEditing={editingField === 'store_description'}
                              onEdit={() => startEditing('store_description')}
                              onSave={stopEditing}
                              onChange={(v) => setEditData({ ...editData, store_description: v })}
                              multiline
                              onPersist={() => persistProfileField('store_description')}
                              onCancel={revertFieldFromStore}
                              isSaving={savingField === 'store_description'}
                            />
                          </div>
                        </div>
                        </div>

                        <div className="min-w-0 flex min-h-0 lg:h-full">
                          <OperatingDaysCard hours={operatingHours} />
                        </div>
                        </div>

                        <div className="min-w-0 w-full">
                        <div className="bg-gray-50 rounded-lg p-3 border border-gray-200 flex flex-col min-h-0 w-full min-w-0">
                          <h3 className="text-sm font-semibold text-gray-900 mb-1.5 flex items-center gap-2 shrink-0">
                            <MapPin size={16} className="text-blue-600" />
                            Location
                          </h3>
                          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-4 gap-y-1.5 flex-1 min-h-0 overflow-y-auto content-start">
                            <div className="sm:col-span-2 lg:col-span-3 min-w-0">
                              <CompactEditableRow
                                dense
                                label="Full Address"
                                value={editData?.full_address || ''}
                                isEditing={editingField === 'full_address'}
                                onEdit={() => startEditing('full_address')}
                                onSave={stopEditing}
                                onChange={(v) => editData && setEditData({ ...editData, full_address: v })}
                                multiline
                                onPersist={() => persistProfileField('full_address')}
                                onCancel={revertFieldFromStore}
                                isSaving={savingField === 'full_address'}
                              />
                            </div>
                            <CompactEditableRow
                              dense
                              label="City"
                              value={editData?.city || ''}
                              isEditing={editingField === 'city'}
                              onEdit={() => startEditing('city')}
                              onSave={stopEditing}
                              onChange={(v) => editData && setEditData({ ...editData, city: v })}
                              onPersist={() => persistProfileField('city')}
                              onCancel={revertFieldFromStore}
                              isSaving={savingField === 'city'}
                            />
                            <CompactEditableRow
                              dense
                              label="State"
                              value={editData?.state || ''}
                              isEditing={editingField === 'state'}
                              onEdit={() => startEditing('state')}
                              onSave={stopEditing}
                              onChange={(v) => editData && setEditData({ ...editData, state: v })}
                              onPersist={() => persistProfileField('state')}
                              onCancel={revertFieldFromStore}
                              isSaving={savingField === 'state'}
                            />
                            <CompactEditableRow
                              dense
                              label="Landmark"
                              value={editData.landmark}
                              isEditing={editingField === 'landmark'}
                              onEdit={() => startEditing('landmark')}
                              onSave={stopEditing}
                              onChange={(v) => setEditData({ ...editData, landmark: v })}
                              onPersist={() => persistProfileField('landmark')}
                              onCancel={revertFieldFromStore}
                              isSaving={savingField === 'landmark'}
                            />
                            <CompactEditableRow
                              dense
                              label="Postal Code"
                              value={editData.postal_code}
                              isEditing={editingField === 'postal_code'}
                              onEdit={() => startEditing('postal_code')}
                              onSave={stopEditing}
                              onChange={(v) => setEditData({ ...editData, postal_code: v })}
                              onPersist={() => persistProfileField('postal_code')}
                              onCancel={revertFieldFromStore}
                              isSaving={savingField === 'postal_code'}
                            />
                            <div className="sm:col-span-2 lg:col-span-3 grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1.5">
                              <CompactEditableRow
                                dense
                                label="Latitude"
                                value={editData.latitude}
                                isEditing={editingField === 'latitude'}
                                onEdit={() => startEditing('latitude')}
                                onSave={stopEditing}
                                onChange={(v) => setEditData({ ...editData, latitude: parseFloat(v) })}
                                onPersist={() => persistProfileField('latitude')}
                                onCancel={revertFieldFromStore}
                                isSaving={savingField === 'latitude'}
                              />
                              <CompactEditableRow
                                dense
                                label="Longitude"
                                value={editData.longitude}
                                isEditing={editingField === 'longitude'}
                                onEdit={() => startEditing('longitude')}
                                onSave={stopEditing}
                                onChange={(v) => setEditData({ ...editData, longitude: parseFloat(v) })}
                                onPersist={() => persistProfileField('longitude')}
                                onCancel={revertFieldFromStore}
                                isSaving={savingField === 'longitude'}
                              />
                            </div>
                          </div>
                        </div>
                        </div>

                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 lg:gap-4 lg:items-stretch">
                        <div className="min-w-0 flex min-h-0 lg:h-full">
                        <div className="bg-gray-50 rounded-lg p-3 border border-gray-200 w-full min-w-0 h-full flex flex-col min-h-0">
                          <h3 className="text-sm font-semibold text-gray-900 mb-1.5 flex items-center gap-2 shrink-0">
                            <User size={16} className="text-blue-600" />
                            Area Manager
                          </h3>
                          {loadingAreaManager ? (
                            <div className="flex-1 min-h-0 flex flex-col items-center justify-center py-3">
                              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600 mx-auto"></div>
                              <p className="text-xs text-gray-500 mt-2">Loading...</p>
                            </div>
                          ) : areaManager ? (
                            <div className="space-y-1.5 flex-1 min-h-0 overflow-y-auto">
                              {areaManager.id != null && (
                                <div className="flex flex-col">
                                  <label className="text-[10px] font-medium text-gray-600 mb-0.5">AM ID</label>
                                  <span className="text-xs text-gray-900">{areaManager.id}</span>
                                </div>
                              )}
                              <div className="flex flex-col">
                                <label className="text-[10px] font-medium text-gray-600 mb-0.5">AM Name</label>
                                <span className="text-xs text-gray-900 truncate" title={areaManager.name || undefined}>
                                  {areaManager.name || 'Not set'}
                                </span>
                              </div>
                              <div className="flex flex-col">
                                <label className="text-[10px] font-medium text-gray-600 mb-0.5">AM Mobile</label>
                                <span className="text-xs text-gray-900">{areaManager.mobile || 'Not set'}</span>
                              </div>
                              <div className="flex flex-col">
                                <label className="text-[10px] font-medium text-gray-600 mb-0.5">AM Email</label>
                                <span className="text-xs text-gray-900 truncate" title={areaManager.email || undefined}>
                                  {areaManager.email || 'Not set'}
                                </span>
                              </div>
                            </div>
                          ) : (
                            <p className="text-xs text-gray-500 flex-1 flex items-center">No area manager assigned</p>
                          )}
                        </div>
                        </div>

                        <div className="min-w-0 flex min-h-0 lg:h-full">
                        <div className="bg-gray-50 rounded-lg p-3 border border-gray-200 w-full min-w-0 h-full flex flex-col min-h-0">
                          <h3 className="text-sm font-semibold text-gray-900 mb-1.5 flex items-center gap-2 shrink-0">
                            <Activity size={16} className="text-blue-600" />
                            Store Info
                          </h3>
                          <div className="space-y-1.5 flex-1 min-h-0 overflow-y-auto text-xs">
                            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 min-w-0">
                              <Clock size={12} className="text-gray-500 shrink-0" />
                              <span className="text-gray-800">Today&apos;s hours:</span>
                              <span className="font-semibold text-gray-900 break-words">{formatOperatingHours()}</span>
                            </div>
                            <div className="flex items-center gap-2 min-w-0">
                              <Hash size={12} className="text-gray-500 shrink-0" />
                              <span className="text-gray-800 shrink-0">Store ID:</span>
                              <span className="font-semibold text-gray-900 truncate">{store?.store_id || '—'}</span>
                            </div>
                            <div className="flex items-center gap-2 min-w-0">
                              <Calendar size={12} className="text-gray-500 shrink-0" />
                              <span className="text-gray-800 shrink-0">Created:</span>
                              <span className="font-semibold text-gray-900">{store?.created_at ? formatDate(store.created_at) : '—'}</span>
                            </div>
                            <div className="flex items-center gap-2 min-w-0">
                              <Activity size={12} className="text-gray-500 shrink-0" />
                              <span className="text-gray-800 shrink-0">Status:</span>
                              <span className={`font-semibold truncate ${
                                store?.approval_status === 'APPROVED' ? 'text-green-600' :
                                store?.approval_status === 'REJECTED' ? 'text-red-600' :
                                'text-yellow-600'
                              }`}>
                                {store?.approval_status || 'SUBMITTED'}
                              </span>
                            </div>
                            <div className="flex items-center gap-2 min-w-0">
                              <Activity size={12} className="text-gray-500 shrink-0" />
                              <span className="text-gray-800 shrink-0">Active:</span>
                              <label className="inline-flex items-center cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={!!editData && editData.status === 'ACTIVE'}
                                  onChange={async (e) => {
                                    if (!editData || !store || !storeId) return;
                                    const prevStatus = editData.status;
                                    const prevOperational = editData.operational_status;
                                    const newStatus = e.target.checked ? 'ACTIVE' : 'INACTIVE';
                                    const newOperational = e.target.checked ? 'OPEN' : 'CLOSED';
                                    setEditData({ ...editData, status: newStatus, operational_status: newOperational });
                                    setStore({ ...store, status: newStatus, operational_status: newOperational });
                                    try {
                                      const ok = await updateStoreInfo(storeId, { status: newStatus, operational_status: newOperational });
                                      if (!ok) throw new Error('Update failed');
                                      toast.success(`Store is now ${newStatus} (${newOperational})`);
                                    } catch (err) {
                                      setEditData({ ...editData, status: prevStatus, operational_status: prevOperational });
                                      setStore({ ...store, status: prevStatus, operational_status: prevOperational });
                                      toast.error('Failed to update store status');
                                    }
                                  }}
                                  className="sr-only peer"
                                />
                                <div className="w-9 h-5 bg-gray-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-blue-500 rounded-full peer peer-checked:bg-green-500 transition-all relative">
                                  <div className={`absolute left-1 top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${editData?.status === 'ACTIVE' ? 'translate-x-4' : ''}`}></div>
                                </div>
                              </label>
                            </div>
                          </div>
                        </div>
                        </div>
                        </div>
                      </div>

                      {/* COLUMN 2: DOCUMENTS & IMAGES */}
                      <div className="space-y-3 min-w-0">
                        <div className="bg-gray-50 rounded-lg p-3 border border-gray-200">
                          <h3 className="text-sm font-semibold text-gray-900 mb-2 flex items-center gap-2">
                            <Shield size={16} className="text-blue-600" />
                            Legal Documents
                          </h3>
                          <div className="space-y-2">
                            {storeDocuments ? (
                              <>
                                {PROFILE_LEGAL_DOC_CONFIG.map((cfg) => {
                                  if (!storeId) return null;
                                  const doc = storeDocuments as Record<string, unknown>;
                                  const num = doc[cfg.numberKey];
                                  if (!num || String(num).trim() === "") return null;
                                  const label =
                                    cfg.typeKey && doc[cfg.typeKey]
                                      ? String(doc[cfg.typeKey])
                                      : cfg.label;
                                  const meta = doc[cfg.metaKey];
                                  const renewalPending: boolean =
                                    meta != null &&
                                    typeof meta === "object" &&
                                    (meta as { renewal_pending?: boolean }).renewal_pending === true;
                                  const verifiedRaw = doc[cfg.verifiedKey];
                                  const expiredRaw = doc[cfg.expiredKey];
                                  const isVerified =
                                    typeof verifiedRaw === "boolean" ? verifiedRaw : null;
                                  const isExpiredFlag =
                                    typeof expiredRaw === "boolean" ? expiredRaw : null;
                                  return (
                                    <LegalDocumentCard
                                      key={cfg.prefix}
                                      storeId={storeId}
                                      label={label}
                                      prefix={cfg.prefix}
                                      documentNumber={String(num)}
                                      holderName={
                                        cfg.holderKey ? (doc[cfg.holderKey] as string | null) : null
                                      }
                                      expiryDate={(doc[cfg.expiryKey] as string | null) ?? null}
                                      documentUrl={(doc[cfg.urlKey] as string | null) ?? null}
                                      isVerified={isVerified}
                                      isExpiredFlag={isExpiredFlag}
                                      renewalPending={renewalPending}
                                      onRenew={(p) => {
                                        setLicenseUploadPrefix(p);
                                        setLicenseModalOpen(true);
                                      }}
                                    />
                                  );
                                })}
                              </>
                            ) : (
                              <p className="text-xs text-gray-500 text-center py-2">No documents found</p>
                            )}
                          </div>
                        </div>

                        {/* Agreement contract (signed during onboarding) */}
                        <div className="bg-gray-50 rounded-lg p-3 border border-gray-200">
                          <h3 className="text-sm font-semibold text-gray-900 mb-2 flex items-center gap-2">
                            <FileCheck size={16} className="text-blue-600" />
                            Agreement contract
                          </h3>
                          <p className="text-xs text-gray-600 mb-3">Partner agreement signed during onboarding. You can view or download the signed contract below.</p>
                          {agreementLoading ? (
                            <div className="flex items-center justify-center py-4">
                              <div className="animate-spin rounded-full h-5 w-5 border-2 border-blue-600 border-t-transparent"></div>
                              <span className="ml-2 text-xs text-gray-500">Loading...</span>
                            </div>
                          ) : agreement ? (
                            <div className="space-y-3">
                              <div className="bg-white rounded p-2 border border-gray-200 text-xs">
                                <div className="flex justify-between gap-2">
                                  <span className="text-gray-600">Signed by</span>
                                  <span className="font-medium text-gray-900">{agreement.signer_name}</span>
                                </div>
                                <div className="flex justify-between gap-2 mt-1">
                                  <span className="text-gray-600">Accepted on</span>
                                  <span className="text-gray-900">{agreement.accepted_at ? new Date(agreement.accepted_at).toLocaleDateString('en-IN', { dateStyle: 'medium' }) : '—'}</span>
                                </div>
                              </div>
                              {agreementContractHref ? (
                                <div className="flex flex-wrap gap-2">
                                  <a
                                    href={agreementContractHref}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-medium hover:bg-blue-700"
                                  >
                                    <ExternalLink size={14} />
                                    View contract
                                  </a>
                                  <a
                                    href={agreementContractHref}
                                    download="partner-agreement-signed.pdf"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-300 bg-white text-gray-700 text-xs font-medium hover:bg-gray-50"
                                  >
                                    <Download size={14} />
                                    Download
                                  </a>
                                </div>
                              ) : agreement.contract_pdf_url ? (
                                <p className="text-xs text-amber-600">PDF not available. Contact support if you need a copy.</p>
                              ) : null}
                            </div>
                          ) : (
                            <p className="text-xs text-gray-500">No agreement record found for this store.</p>
                          )}
                        </div>

                        {/* Bank Details Card - Dynamically show UI data or bank_accounts table data */}
                        <div className="bg-gray-50 rounded-lg p-2 border border-gray-200">
                          <div className="flex items-center justify-between mb-2">
                            <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
                              <Banknote size={16} className="text-blue-600" />
                              Bank Details
                              {bankVerification?.verified && (
                                <span className="inline-flex items-center gap-1 text-xs font-medium text-green-700 bg-green-100 px-2 py-0.5 rounded">
                                  <CheckCircle size={12} />
                                  Verified
                                </span>
                              )}
                              {bankVerifying && (
                                <span className="text-xs text-amber-700 bg-amber-100 px-2 py-0.5 rounded">
                                  Verifying…
                                </span>
                              )}
                              {loading && (
                                <span className="text-xs text-blue-700 bg-blue-100 px-2 py-0.5 rounded">
                                  Loading…
                                </span>
                              )}
                            </h3>
                            <button
                              onClick={async () => {
                                if (!store?.id) return;
                                try {
                                  const mod = await import("@/lib/database");
                                  const banks = await mod.fetchStoreBankAccounts(store.id);
                                  const bankAccountsArray = Array.isArray(banks) ? banks : [];
                                  setBankAccounts(bankAccountsArray);
                                  if (bankAccountsArray.length > 0) {
                                    toast.success(`Loaded ${bankAccountsArray.length} bank account(s)`);
                                  } else {
                                    toast.info('No bank accounts found in database');
                                  }
                                } catch (error) {
                                  console.error('Manual refresh error:', error);
                                  toast.error('Failed to refresh bank accounts');
                                }
                              }}
                              className="text-xs text-blue-600 hover:text-blue-800 px-2 py-1 rounded hover:bg-blue-50"
                              title="Refresh bank accounts"
                            >
                              🔄 Refresh
                            </button>
                          </div>
                          {/* Priority: Show bank_accounts table data if available, otherwise show UI (store table) data */}
                          {bankAccounts && Array.isArray(bankAccounts) && bankAccounts.length > 0 ? (
                            // Show data from merchant_store_bank_accounts table: primary first; rest behind "Show all"
                            <div className="space-y-2">
                              {(showAllBankAccounts ? bankAccounts : bankAccounts.slice(0, 1)).map((bank, idx) => (
                                <div key={bank.id || idx} className="bg-white rounded p-2 border border-gray-200">
                                  {bank.is_primary && (
                                    <span className="text-xs font-medium text-blue-700 bg-blue-100 px-2 py-0.5 rounded mb-1 inline-block">Primary</span>
                                  )}
                                  <div className="space-y-1 text-xs">
                                    <div className="flex justify-between">
                                      <span className="text-gray-600">Account Holder:</span>
                                      <span className="font-semibold text-gray-900">{bank.account_holder_name || '—'}</span>
                                    </div>
                                    <div className="flex justify-between">
                                      <span className="text-gray-600">Account Number:</span>
                                      <span className="font-semibold text-gray-900">{bank.account_number ? `****${bank.account_number.slice(-4)}` : '—'}</span>
                                    </div>
                                    <div className="flex justify-between">
                                      <span className="text-gray-600">IFSC:</span>
                                      <span className="font-semibold text-gray-900">{bank.ifsc_code || '—'}</span>
                                    </div>
                                    <div className="flex justify-between">
                                      <span className="text-gray-600">Bank:</span>
                                      <span className="font-semibold text-gray-900">{bank.bank_name || '—'}</span>
                                    </div>
                                    {bank.branch_name && (
                                      <div className="flex justify-between">
                                        <span className="text-gray-600">Branch:</span>
                                        <span className="font-semibold text-gray-900">{bank.branch_name}</span>
                                      </div>
                                    )}
                                    {bank.account_type && (
                                      <div className="flex justify-between">
                                        <span className="text-gray-600">Account Type:</span>
                                        <span className="font-semibold text-gray-900">{bank.account_type}</span>
                                      </div>
                                    )}
                                    <div className="flex justify-between">
                                      <span className="text-gray-600">Verified:</span>
                                      <span className={`font-semibold ${bank.is_verified ? 'text-green-600' : 'text-red-600'}`}>
                                        {bank.is_verified ? 'Yes' : 'No'}
                                      </span>
                                    </div>
                                    {bank.upi_id && (
                                      <div className="flex justify-between">
                                        <span className="text-gray-600">UPI ID:</span>
                                        <span className="font-semibold text-gray-900">{bank.upi_id}</span>
                                      </div>
                                    )}
                                    {bank.payout_method && (
                                      <div className="flex justify-between">
                                        <span className="text-gray-600">Payout Method:</span>
                                        <span className="font-semibold text-gray-900">{bank.payout_method}</span>
                                      </div>
                                    )}
                                    {/* Attachments uploaded during onboarding or dashboard update */}
                                    {bank.bank_proof_file_url && (
                                      <div className="flex justify-between items-center">
                                        <span className="text-gray-600">Bank proof:</span>
                                        <a
                                          href={bankAttachmentHref(bank.bank_proof_file_url) ?? bank.bank_proof_file_url}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          className="text-blue-600 hover:text-blue-800 underline font-medium"
                                        >
                                          View document
                                        </a>
                                      </div>
                                    )}
                                    {bank.upi_qr_screenshot_url && (
                                      <div className="flex justify-between items-center">
                                        <span className="text-gray-600">UPI QR:</span>
                                        <a
                                          href={bankAttachmentHref(bank.upi_qr_screenshot_url) ?? bank.upi_qr_screenshot_url}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          className="text-blue-600 hover:text-blue-800 underline font-medium"
                                        >
                                          View QR
                                        </a>
                                      </div>
                                    )}
                                  </div>
                                </div>
                              ))}
                              {!showAllBankAccounts && bankAccounts.length > 1 && (
                                <button
                                  type="button"
                                  onClick={() => setShowAllBankAccounts(true)}
                                  className="w-full text-sm font-medium text-blue-600 hover:text-blue-800 py-2 rounded border border-gray-200 bg-gray-50 hover:bg-gray-100"
                                >
                                  Show all ({bankAccounts.length} accounts)
                                </button>
                              )}
                              {showAllBankAccounts && bankAccounts.length > 1 && (
                                <button
                                  type="button"
                                  onClick={() => setShowAllBankAccounts(false)}
                                  className="w-full text-sm font-medium text-gray-600 hover:text-gray-800 py-2 rounded border border-gray-200 bg-gray-50 hover:bg-gray-100"
                                >
                                  Show less
                                </button>
                              )}
                            </div>
                          ) : (
                            // Show UI data from store table if bank_accounts table is empty
                            (store?.bank_account_holder || store?.bank_account_number || store?.bank_ifsc || store?.bank_name) ? (
                              bankVerification?.verified ? (
                                <div className="space-y-1 text-sm">
                                  <CompactLockedRow
                                    label="Account Holder"
                                    value={store?.bank_account_holder || '—'}
                                  />
                                  <CompactLockedRow
                                    label="Account Number"
                                    value={store?.bank_account_number || '—'}
                                  />
                                  <CompactLockedRow
                                    label="IFSC Code"
                                    value={store?.bank_ifsc || '—'}
                                  />
                                  <CompactLockedRow
                                    label="Bank Name"
                                    value={store?.bank_name || '—'}
                                  />
                                </div>
                              ) : (
                                <div className="space-y-1 text-sm">
                                  <p className="text-xs text-gray-500 mb-1">
                                    Account holder name must match store or owner name. We will send ₹1 to verify (max 3 attempts per day).
                                  </p>
                                  <CompactEditableRow
                                    label="Account Holder"
                                    value={editData?.bank_account_holder || ''}
                                    isEditing={editingField === "bank_account_holder"}
                                    onEdit={() => setEditingField("bank_account_holder")}
                                    onSave={() => setEditingField(null)}
                                    onChange={(v) => setEditData((d) => (d ? { ...d, bank_account_holder: v } : d))}
                                    onPersist={() => persistProfileField("bank_account_holder")}
                                    onCancel={revertFieldFromStore}
                                    isSaving={savingField === "bank_account_holder"}
                                  />
                                  <CompactEditableRow
                                    label="Account Number"
                                    value={editData?.bank_account_number || ''}
                                    isEditing={editingField === "bank_account_number"}
                                    onEdit={() => setEditingField("bank_account_number")}
                                    onSave={() => setEditingField(null)}
                                    onChange={(v) => setEditData((d) => (d ? { ...d, bank_account_number: v } : d))}
                                    onPersist={() => persistProfileField("bank_account_number")}
                                    onCancel={revertFieldFromStore}
                                    isSaving={savingField === "bank_account_number"}
                                  />
                                  <CompactEditableRow
                                    label="IFSC Code"
                                    value={editData?.bank_ifsc || ''}
                                    isEditing={editingField === "bank_ifsc"}
                                    onEdit={() => setEditingField("bank_ifsc")}
                                    onSave={() => setEditingField(null)}
                                    onChange={(v) => setEditData((d) => (d ? { ...d, bank_ifsc: v } : d))}
                                    onPersist={() => persistProfileField("bank_ifsc")}
                                    onCancel={revertFieldFromStore}
                                    isSaving={savingField === "bank_ifsc"}
                                  />
                                  <CompactEditableRow
                                    label="Bank Name"
                                    value={editData?.bank_name || ''}
                                    isEditing={editingField === "bank_name"}
                                    onEdit={() => setEditingField("bank_name")}
                                    onSave={() => setEditingField(null)}
                                    onChange={(v) => setEditData((d) => (d ? { ...d, bank_name: v } : d))}
                                    onPersist={() => persistProfileField("bank_name")}
                                    onCancel={revertFieldFromStore}
                                    isSaving={savingField === "bank_name"}
                                  />
                                  {bankVerification && !bankVerification.canTryVerify && (
                                    <p className="text-xs text-amber-700 mt-1">
                                      Verification limit reached today ({bankVerification.attemptsToday}/{bankVerification.maxAttemptsPerDay}). Try again tomorrow.
                                    </p>
                                  )}
                                </div>
                              )
                            ) : (
                              <div className="space-y-1 text-sm">
                                <p className="text-xs text-gray-500 mb-1">
                                  Account holder name must match store or owner name. We will send ₹1 to verify (max 3 attempts per day).
                                </p>
                                <CompactEditableRow
                                  label="Account Holder"
                                  value={editData?.bank_account_holder || ''}
                                  isEditing={editingField === "bank_account_holder"}
                                  onEdit={() => setEditingField("bank_account_holder")}
                                  onSave={() => setEditingField(null)}
                                  onChange={(v) => setEditData((d) => (d ? { ...d, bank_account_holder: v } : d))}
                                  onPersist={() => persistProfileField("bank_account_holder")}
                                  onCancel={revertFieldFromStore}
                                  isSaving={savingField === "bank_account_holder"}
                                />
                                <CompactEditableRow
                                  label="Account Number"
                                  value={editData?.bank_account_number || ''}
                                  isEditing={editingField === "bank_account_number"}
                                  onEdit={() => setEditingField("bank_account_number")}
                                  onSave={() => setEditingField(null)}
                                  onChange={(v) => setEditData((d) => (d ? { ...d, bank_account_number: v } : d))}
                                  onPersist={() => persistProfileField("bank_account_number")}
                                  onCancel={revertFieldFromStore}
                                  isSaving={savingField === "bank_account_number"}
                                />
                                <CompactEditableRow
                                  label="IFSC Code"
                                  value={editData?.bank_ifsc || ''}
                                  isEditing={editingField === "bank_ifsc"}
                                  onEdit={() => setEditingField("bank_ifsc")}
                                  onSave={() => setEditingField(null)}
                                  onChange={(v) => setEditData((d) => (d ? { ...d, bank_ifsc: v } : d))}
                                  onPersist={() => persistProfileField("bank_ifsc")}
                                  onCancel={revertFieldFromStore}
                                  isSaving={savingField === "bank_ifsc"}
                                />
                                <CompactEditableRow
                                  label="Bank Name"
                                  value={editData?.bank_name || ''}
                                  isEditing={editingField === "bank_name"}
                                  onEdit={() => setEditingField("bank_name")}
                                  onSave={() => setEditingField(null)}
                                  onChange={(v) => setEditData((d) => (d ? { ...d, bank_name: v } : d))}
                                  onPersist={() => persistProfileField("bank_name")}
                                  onCancel={revertFieldFromStore}
                                  isSaving={savingField === "bank_name"}
                                />
                                {bankVerification && !bankVerification.canTryVerify && (
                                  <p className="text-xs text-amber-700 mt-1">
                                    Verification limit reached today ({bankVerification.attemptsToday}/{bankVerification.maxAttemptsPerDay}). Try again tomorrow.
                                  </p>
                                )}
                              </div>
                            )
                          )}
                        </div>
                      </div>
                    </div>

                    {/* IMAGE CARDS - HORIZONTAL LAYOUT */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mt-5">
                      {/* STORE BANNER CARD */}
                      <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-lg p-4 border border-blue-100">
                        <div className="flex items-center justify-between mb-3">
                          <div>
                            <h3 className="text-sm font-semibold text-gray-900 mb-1">
                              Store Banner
                            </h3>
                            <p className="text-xs text-gray-600">
                              Upload your store banner image
                            </p>
                          </div>
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
                            style={{ display: "none" }}
                            onChange={(e) => handleImageUpload(e, 'banner')}
                          />
                        </div>
                        {store.banner_url ? (
                          <R2Image
                            src={store.banner_url}
                            alt="Store Banner"
                            className="mt-2 rounded-lg w-full h-48 object-cover"
                            lazy={false}
                          />
                        ) : (
                          <div className="mt-2 h-48 bg-gray-100 rounded-lg flex items-center justify-center">
                            <div className="text-center">
                              <ImageIcon size={24} className="text-gray-400 mx-auto mb-2" />
                              <p className="text-xs text-gray-500">No banner uploaded</p>
                            </div>
                          </div>
                        )}
                      </div>

                      {/* GALLERY IMAGES CARD - loads from gallery_images column */}
                      <div className="bg-gradient-to-r from-green-50 to-emerald-50 rounded-lg p-4 border border-green-100">
                        <div className="flex items-center justify-between mb-3">
                          <div>
                            <h3 className="text-sm font-semibold text-gray-900 mb-1">
                              Gallery Images ({countFilledGallerySlots(galleryToSlots(store.gallery_images))}/5)
                            </h3>
                            <p className="text-xs text-gray-600">
                              Upload up to 5 promotional images
                            </p>
                          </div>
                          <button
                            type="button"
                            className="flex items-center gap-1.5 bg-green-600 hover:bg-green-700 text-white px-3 py-1.5 rounded-lg text-xs font-medium"
                            onClick={() => galleryInputRef.current?.click()}
                            disabled={countFilledGallerySlots(galleryToSlots(store.gallery_images)) >= GALLERY_SLOT_COUNT}
                          >
                            <Upload size={12} />
                            Upload
                          </button>
                          <input
                            type="file"
                            accept="image/*"
                            multiple
                            ref={galleryInputRef}
                            style={{ display: "none" }}
                            onChange={(e) => handleImageUpload(e, 'gallery')}
                          />
                          <input
                            type="file"
                            accept="image/*"
                            ref={gallerySlotInputRef}
                            style={{ display: "none" }}
                            onChange={handleGallerySlotUpload}
                          />
                        </div>
                        
                        <div className="grid grid-cols-5 gap-2 mt-3">
                          {galleryToSlots(store.gallery_images).map((img, index) => {
                            const gallerySlots = galleryToSlots(store.gallery_images);
                            const filledCount = countFilledGallerySlots(gallerySlots);
                            const emptySlotIndexes = gallerySlots
                              .map((s, i) => (s ? -1 : i))
                              .filter((i) => i >= 0);
                            const bulkUploadSlotPos = emptySlotIndexes.indexOf(index);
                            const isBulkUploading =
                              bulkUploadSlotPos >= 0 && bulkUploadSlotPos < uploadingImages.length;
                            const uploadingPreview = isBulkUploading ? uploadingImages[bulkUploadSlotPos] : null;
                            const slotUploading = uploadingGallerySlot?.index === index ? uploadingGallerySlot : null;
                            const canPickSlot = !img && filledCount < GALLERY_SLOT_COUNT;
                            return (
                              <div
                                key={`gallery-slot-${index}`}
                                className={`relative group aspect-square min-h-[80px] bg-gray-100 rounded-lg border border-gray-200 overflow-hidden flex items-center justify-center ${
                                  canPickSlot ? "cursor-pointer hover:ring-2 hover:ring-green-300" : ""
                                }`}
                                role={canPickSlot ? "button" : undefined}
                                tabIndex={canPickSlot ? 0 : undefined}
                                onClick={() => {
                                  if (canPickSlot) openGallerySlotPicker(index);
                                }}
                                onKeyDown={(ev) => {
                                  if ((ev.key === "Enter" || ev.key === " ") && canPickSlot) {
                                    openGallerySlotPicker(index);
                                  }
                                }}
                              >
                                {img ? (
                                  <>
                                    <R2Image
                                      src={img}
                                      alt={`Gallery ${index + 1}`}
                                      className="w-full h-full object-cover"
                                      lazy={false}
                                    />
                                    <button
                                      type="button"
                                      aria-label={`Remove gallery image slot ${index + 1}`}
                                      onClick={(ev) => {
                                        ev.preventDefault();
                                        ev.stopPropagation();
                                        void handleRemoveGalleryImage(index);
                                      }}
                                      className="absolute top-1 right-1 z-10 bg-red-500 hover:bg-red-600 text-white w-6 h-6 rounded-full flex items-center justify-center text-base shadow-md opacity-95 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity"
                                    >
                                      ×
                                    </button>
                                  </>
                                ) : slotUploading ? (
                                  <div className="relative w-full h-full">
                                    <img
                                      src={slotUploading.preview}
                                      alt="Uploading..."
                                      className="w-full h-full object-cover opacity-60"
                                    />
                                    <div className="absolute inset-0 flex items-center justify-center bg-black/20">
                                      <div className="animate-spin rounded-full h-6 w-6 border-2 border-white border-t-transparent" />
                                    </div>
                                  </div>
                                ) : uploadingPreview ? (
                                  <div className="relative w-full h-full">
                                    <img
                                      src={uploadingPreview}
                                      alt="Uploading..."
                                      className="w-full h-full object-cover opacity-60"
                                    />
                                    <div className="absolute inset-0 flex items-center justify-center bg-black/20">
                                      <div className="animate-spin rounded-full h-6 w-6 border-2 border-white border-t-transparent" />
                                    </div>
                                  </div>
                                ) : (
                                  <div className="text-center p-2">
                                    <ImageIcon size={20} className="text-gray-400 mx-auto mb-1" />
                                    <p className="text-[10px] text-gray-500">Slot {index + 1}</p>
                                    <p className="text-[10px] text-gray-400 mt-0.5">Tap to upload</p>
                                  </div>
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
              {/* Minimal bottom padding - only 5-10px, no extra space */}
              <div className="pb-2"></div>
            </div>
          </div>
        </div>

        <LicenseExpiredModal
          storeId={store.store_id}
          open={licenseModalOpen}
          expired={licenseEvaluation?.expired ?? []}
          pendingVerification={licenseEvaluation?.pending_verification ?? []}
          initialStepPrefix={licenseUploadPrefix}
          onClose={() => {
            setLicenseModalOpen(false);
            setLicenseUploadPrefix(null);
          }}
          onUploaded={async () => {
            if (storeId) {
              const docs = await fetchStoreDocumentsViaApi(storeId);
              setStoreDocuments(docs);
            }
          }}
        />
      </MXLayoutWhite>
    </ProfileErrorBoundary>
  );
}

/* ================= COMPACT COMPONENTS ================= */

function CompactEditableRow({
  label,
  value,
  isEditing,
  onEdit,
  onSave,
  onChange,
  multiline = false,
  prefix = "",
  onPersist,
  onCancel,
  isSaving = false,
  /** Tighter spacing and smaller type (e.g. Location card). */
  dense = false,
}: {
  label: string;
  value?: any;
  isEditing: boolean;
  onEdit: () => void;
  onSave: () => void;
  onChange: (value: string) => void;
  multiline?: boolean;
  prefix?: string;
  /** When set, Save persists via API then closes; blur does not auto-close. */
  onPersist?: () => Promise<void>;
  /** Revert draft and close editor (Escape). */
  onCancel?: () => void;
  isSaving?: boolean;
  dense?: boolean;
}) {
  const handleCommit = async () => {
    if (isSaving) return;
    if (onPersist) {
      await onPersist();
      return;
    }
    onSave();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !multiline) {
      e.preventDefault();
      void handleCommit();
    }
    if (e.key === "Escape") {
      (onCancel ?? onSave)();
    }
  };

  const blurHandler = onPersist ? undefined : onSave;

  const labelCls = dense ? "text-[10px] font-medium text-gray-600" : "text-xs font-medium text-gray-600";
  const valCls = dense ? "text-xs text-gray-900 font-medium" : "text-sm text-gray-900 font-medium";
  const fieldPad = dense ? "px-2 py-0.5 text-xs" : "px-2 py-1 text-sm";

  return (
    <div className="group min-w-0">
      <div className={`flex items-center justify-between ${dense ? "mb-0.5" : "mb-1"}`}>
        <span className={labelCls}>{label}</span>
        {!isEditing ? (
          <button
            type="button"
            onClick={onEdit}
            className="text-blue-600 hover:text-blue-800 opacity-0 group-hover:opacity-100 transition-all"
          >
            <Edit2 size={12} />
          </button>
        ) : (
          <div className="flex items-center gap-1.5 shrink-0">
            {onPersist && onCancel ? (
              <button
                type="button"
                onClick={onCancel}
                disabled={isSaving}
                className="text-xs text-gray-600 hover:text-gray-800 disabled:opacity-50"
              >
                Cancel
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => void handleCommit()}
              disabled={isSaving}
              className="text-green-600 hover:text-green-800 text-xs font-semibold disabled:opacity-50"
            >
              {isSaving ? "Saving…" : "Save"}
            </button>
          </div>
        )}
      </div>
      {isEditing ? (
        multiline ? (
          <textarea
            value={value ?? ""}
            onChange={(e) => onChange(e.target.value)}
            onBlur={blurHandler}
            onKeyDown={handleKeyDown}
            className={`w-full border border-blue-300 rounded bg-white focus:ring-1 focus:ring-blue-500 focus:border-transparent ${fieldPad} text-gray-900`}
            rows={dense ? 2 : 2}
            autoFocus
            disabled={isSaving}
          />
        ) : (
          <input
            type={label.toLowerCase().includes("time") ? "time" : "text"}
            value={value !== undefined && value !== null ? String(value) : ""}
            onChange={(e) => onChange(e.target.value)}
            onBlur={blurHandler}
            onKeyDown={handleKeyDown}
            className={`w-full border border-blue-300 rounded bg-white focus:ring-1 focus:ring-blue-500 focus:border-transparent ${fieldPad} text-gray-900`}
            autoFocus
            disabled={isSaving}
          />
        )
      ) : (
        <div
          className={`${valCls} ${
            multiline && dense ? "line-clamp-2 whitespace-normal break-words" : "truncate"
          }`}
        >
          {prefix && <span className="text-gray-600">{prefix}</span>}
          {value !== undefined && value !== null && value !== "" ? (
            String(value)
          ) : (
            <span className="text-gray-400">Not set</span>
          )}
        </div>
      )}
    </div>
  );
}

function CompactLockedRow({
  label,
  value,
}: {
  label: string;
  value?: any;
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs font-medium text-gray-600">{label}</span>
        <span className="text-xs text-red-500 bg-red-50 px-1.5 py-0.5 rounded">
          Read Only
        </span>
      </div>
      <div className="text-sm text-gray-900 font-medium">
        {value || <span className="text-gray-400">—</span>}
      </div>
    </div>
  );
}