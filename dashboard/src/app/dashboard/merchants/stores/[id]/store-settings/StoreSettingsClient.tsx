"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { useAppSearchParams } from "@/hooks/useAppSearchParams";
import {
  Power,
  Package,
  Save,
  Crown,
  ChefHat,
  Users,
  Smartphone,
  CheckCircle,
  XCircle,
  Truck,
  User,
  Phone,
  Mail,
  Bike,
  Star,
  AlertTriangle,
  Loader2,
  Layers,
  Image as ImageIcon,
  BarChart2,
  BarChart3,
  Headphones,
  UserCheck,
} from "lucide-react";
import { toast } from "sonner";
import { UI_STRINGS } from "@/lib/localStoreStatusEngineStore";
import {
  MERCHANT_PORTAL_CLOSE_REASONS,
  merchantPortalCloseReasonWithSuffix,
} from "@/lib/merchantPortalCloseReasons";
import { useMerchantStoreOperations } from "@/hooks/useMerchantStoreOperations";
import { MerchantStoreStatusCard } from "@/components/merchant/MerchantStoreStatusCard";
import { SubscriptionHistory } from "@/components/merchants/SubscriptionHistory";
import { useStoreStatusCardModel, type StoreOperationsSnapshot } from "@/hooks/useStoreStatusCardModel";
import { useInvalidateMerchantStoreQueries } from "@/hooks/queries/useMerchantStoreQueries";
import { SettingsNavBar } from "./SettingsSidebar";
import { OutletTimingsPanel } from "./OutletTimingsPanel";
import { useStoreContext } from "../StoreContext";
import { useStore } from "@/hooks/useStore";
import { useMerchantDashboardAccess } from "@/hooks/useMerchantDashboardAccess";
import { billingCycleLabel, billingCycleSuffix } from "@/lib/billingCycleLabel";

type StoreDetail = {
  id: number;
  store_id?: string;
  name?: string;
  store_name?: string;
  store_display_name?: string;
  city?: string | null;
  full_address?: string | null;
  landmark?: string | null;
  state?: string | null;
  postal_code?: string | null;
  store_email?: string | null;
  store_phones?: string[] | null;
  approval_status?: string;
  onboarding_completed?: boolean;
  delivery_radius_km?: number | null;
  latitude?: number | null;
  longitude?: number | null;
  avg_preparation_time_minutes?: number | null;
  [key: string]: unknown;
};

type SelfDeliveryRider = {
  id: number;
  rider_name: string;
  rider_mobile: string;
  rider_email: string | null;
  vehicle_number: string | null;
  is_primary: boolean;
  is_active: boolean;
};

function Toggle({
  checked,
  onChange,
  disabled,
  title,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
  title?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      title={title}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:ring-offset-1 disabled:opacity-50 ${
        checked
          ? "bg-gradient-to-r from-emerald-500 to-blue-500 shadow-sm"
          : "bg-gray-200"
      }`}
    >
      <span
        className={`pointer-events-none inline-block h-4 w-4 shrink-0 transform rounded-full bg-white shadow ring-0 transition-all duration-200 ${
          checked ? "translate-x-4" : "translate-x-0.5"
        }`}
      />
    </button>
  );
}

const VALID_TABS = [
  "plans", "timings", "operations", "menu-capacity", "delivery", "riders", "pos",
];

/** Fallback so we always show 3 plan cards even if API returns empty (e.g. merchant_plans not seeded). */
const FALLBACK_PLANS = [
  { id: 1, plan_name: "Free Plan", plan_code: "FREE", description: "Perfect for getting started", price: 0, billing_cycle: "MONTHLY", max_menu_items: 15, max_cuisines: 10, max_menu_categories: 10, image_upload_allowed: false, max_image_uploads: 0, is_popular: false, analytics_access: true, priority_support: false, advanced_analytics: false, marketing_automation: false, custom_api_integrations: false, dedicated_account_manager: false },
  { id: 2, plan_name: "Growth Plan", plan_code: "PREMIUM", description: "For growing businesses", price: 149, billing_cycle: "MONTHLY", max_menu_items: 40, max_cuisines: 25, max_menu_categories: 15, image_upload_allowed: true, max_image_uploads: 30, is_popular: true, analytics_access: true, priority_support: true, advanced_analytics: true, marketing_automation: false, custom_api_integrations: false, dedicated_account_manager: false },
  { id: 3, plan_name: "Pro Plan", plan_code: "ENTERPRISE", description: "For established businesses", price: 299, billing_cycle: "MONTHLY", max_menu_items: 70, max_cuisines: 35, max_menu_categories: 25, image_upload_allowed: true, max_image_uploads: 60, is_popular: false, analytics_access: true, priority_support: true, advanced_analytics: true, marketing_automation: true, custom_api_integrations: true, dedicated_account_manager: true },
];

type PlanCardTier = "free" | "premium" | "enterprise";

function resolvePlanCardTier(plan: { plan_code?: string | null; price?: number | null }): PlanCardTier {
  const planCode = String(plan.plan_code || "").toUpperCase();
  const isEnterprise = planCode === "ENTERPRISE" || planCode === "PRO";
  const isPremium =
    planCode === "PREMIUM" ||
    planCode === "GROWTH" ||
    (Number(plan.price ?? 0) > 0 && !isEnterprise);
  return isEnterprise ? "enterprise" : isPremium ? "premium" : "free";
}

const PLAN_CARD_STYLES: Record<
  PlanCardTier,
  {
    wrapper: string;
    headerBg: string;
    badge: string | null;
    priceColor: string;
    featureValue: string;
  }
> = {
  free: {
    wrapper:
      "rounded-2xl border-2 bg-white border-gray-200 shadow-sm hover:shadow-md hover:border-gray-300 hover:-translate-y-0.5 transition-all duration-300 overflow-hidden",
    headerBg: "bg-gradient-to-r from-slate-700 to-slate-600",
    badge: null,
    priceColor: "text-white",
    featureValue: "text-gray-700 font-semibold",
  },
  premium: {
    wrapper:
      "rounded-2xl border-2 bg-white border-orange-300 shadow-md hover:shadow-lg hover:border-orange-400 hover:-translate-y-0.5 transition-all duration-300 overflow-hidden relative lg:-mt-3 lg:scale-[1.03] z-[1]",
    headerBg: "bg-gradient-to-r from-orange-600 to-amber-500",
    badge:
      "inline-flex items-center px-3 py-1 rounded-full text-[10px] font-extrabold tracking-wide bg-white/20 text-white ring-1 ring-white/35 backdrop-blur-sm",
    priceColor: "text-white",
    featureValue: "text-orange-700 font-semibold",
  },
  enterprise: {
    wrapper:
      "rounded-2xl border-2 bg-white border-purple-300 shadow-sm hover:shadow-md hover:border-purple-400 hover:-translate-y-0.5 transition-all duration-300 overflow-hidden relative",
    headerBg: "bg-gradient-to-r from-indigo-700 to-purple-700",
    badge:
      "inline-flex items-center px-3 py-1 rounded-full text-[10px] font-extrabold tracking-wide bg-white/20 text-white ring-1 ring-white/35 backdrop-blur-sm",
    priceColor: "text-white",
    featureValue: "text-purple-700 font-semibold",
  },
};

export function StoreSettingsClient({ storeId }: { storeId: string }) {
  const searchParams = useAppSearchParams();
  const { store: layoutStore } = useStoreContext();
  const { store: queryStore } = useStore(storeId);
  const { canOperateStore, canManageStore, isViewOnly } = useMerchantDashboardAccess();
  const canEditSettings = !isViewOnly && (canOperateStore || canManageStore);
  const [loading, setLoading] = useState(() => !(layoutStore as StoreDetail));
  const [store, setStore] = useState<StoreDetail | null>(() => (layoutStore as StoreDetail) ?? null);
  const [activeTab, setActiveTab] = useState<string>(() => {
    const t = searchParams?.get("tab") || "plans";
    return VALID_TABS.includes(t) ? t : "plans";
  });

  const [settings, setSettings] = useState<{
    platform_delivery?: boolean;
    self_delivery?: boolean;
    delivery_radius_km?: number;
    auto_accept_orders?: boolean;
    preparation_buffer_minutes?: number;
    address?: Record<string, unknown>;
  } | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const [gatimitraDelivery, setGatimitraDelivery] = useState(true);
  const [selfDelivery, setSelfDelivery] = useState(false);
  const [deliveryRadiusKm, setDeliveryRadiusKm] = useState(5);
  const [savedDeliveryRadiusKm, setSavedDeliveryRadiusKm] = useState(5);
  const [selfDeliveryRiders, setSelfDeliveryRiders] = useState<SelfDeliveryRider[]>([]);
  const [ridersLoading, setRidersLoading] = useState(false);
  const [deliveryModeWarningOpen, setDeliveryModeWarningOpen] = useState(false);
  const [pendingDeliveryMode, setPendingDeliveryMode] = useState<{ gatimitra: boolean; self: boolean } | null>(null);
  const [savingDeliveryMode, setSavingDeliveryMode] = useState(false);
  const [autoAcceptOrders, setAutoAcceptOrders] = useState(false);
  const [preparationBufferMin, setPreparationBufferMin] = useState(15);
  const [fullAddress, setFullAddress] = useState("");
  const [addressLandmark, setAddressLandmark] = useState("");
  const [addressCity, setAddressCity] = useState("");
  const [addressState, setAddressState] = useState("");
  const [addressPostalCode, setAddressPostalCode] = useState("");
  const [addressLat, setAddressLat] = useState("");
  const [addressLng, setAddressLng] = useState("");

  const [delistReasonCategory, setDelistReasonCategory] = useState("");
  const [delistType, setDelistType] = useState<"temporary_delisted" | "permanently_delisted" | "compliance_hold" | null>(
    null
  );
  const [delistRemarks, setDelistRemarks] = useState("");
  const [delistConfirmed, setDelistConfirmed] = useState(false);
  const [delistLoading, setDelistLoading] = useState(false);
  const [relistLoading, setRelistLoading] = useState(false);
  const [relistModalOpen, setRelistModalOpen] = useState(false);
  const [relistReason, setRelistReason] = useState("");

  const [plans, setPlans] = useState<
    Array<{
      id: number;
      plan_name: string;
      plan_code: string;
      description: string | null;
      price: number;
      billing_cycle: string;
      max_menu_items: number | null;
      max_cuisines: number | null;
      max_menu_categories?: number | null;
      image_upload_allowed?: boolean;
      max_image_uploads?: number | null;
      is_popular?: boolean;
      analytics_access?: boolean;
      priority_support?: boolean;
      advanced_analytics?: boolean;
      marketing_automation?: boolean;
      custom_api_integrations?: boolean;
      dedicated_account_manager?: boolean;
    }>
  >([]);
  const [currentSubscription, setCurrentSubscription] = useState<{
    plan_id: number;
    plan_name: string;
    plan_code: string;
    active_from: string;
    expiry_date: string | null;
  } | null>(null);
  const [plansLoading, setPlansLoading] = useState(true);

  /** Plans to use for display and logic; fallback to FALLBACK_PLANS when API returns empty so Free Plan is always available. */
  const effectivePlans = useMemo(
    () => (plans.length > 0 ? plans : FALLBACK_PLANS),
    [plans]
  );

  const freePlan = useMemo(
    () =>
      effectivePlans.find(
        (p) =>
          p.price === 0 ||
          (p.plan_code && String(p.plan_code).toLowerCase().includes("free"))
      ) ?? effectivePlans[0] ?? null,
    [effectivePlans]
  );

  /** When no subscription exists, Free Plan is automatically the active plan. */
  const activePlan = useMemo(() => {
    if (currentSubscription) {
      return effectivePlans.find((p) => p.id === currentSubscription.plan_id) ?? null;
    }
    return freePlan;
  }, [effectivePlans, currentSubscription, freePlan]);

  const base = `/api/merchant/stores/${storeId}`;

  useEffect(() => {
    if (layoutStore && !store) setStore(layoutStore as StoreDetail);
  }, [layoutStore, store]);
  useEffect(() => {
    if (queryStore && !store) setStore(queryStore as StoreDetail);
  }, [queryStore, store]);

  useEffect(() => {
    const t = searchParams?.get("tab") || "plans";
    if (VALID_TABS.includes(t) && t !== activeTab) setActiveTab(t);
  }, [searchParams]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    if ((params.get("tab") || "plans") !== activeTab) {
      params.set("tab", activeTab);
      window.history.replaceState({}, "", `${window.location.pathname}?${params.toString()}`);
    }
  }, [activeTab]);

  const loadStore = useCallback(async (signal?: AbortSignal): Promise<StoreDetail | null> => {
    try {
      const res = await fetch(`${base}?verification=1`, { signal });
      if (!res.ok) return null;
      const d = await res.json().catch(() => null);
      if (d?.success && d.store) {
        setStore(d.store);
        return d.store;
      }
      return null;
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") return null;
      if (typeof window !== "undefined" && process.env.NODE_ENV === "development") {
        console.warn("[StoreSettings] loadStore failed:", err);
      }
      return null;
    }
  }, [base]);

  const loadSettings = useCallback(async (signal?: AbortSignal): Promise<void> => {
    try {
      const res = await fetch(`${base}/store-settings`, { signal });
      if (!res.ok) return;
      const d = await res.json().catch(() => ({}));
      if (d.success) {
        setSettings(d);
        const selfOn = d.self_delivery === true;
        setSelfDelivery(selfOn);
        setGatimitraDelivery(!selfOn);
        const radius = typeof d.delivery_radius_km === "number" ? d.delivery_radius_km : 5;
        setDeliveryRadiusKm(radius);
        setSavedDeliveryRadiusKm(radius);
        setAutoAcceptOrders(d.auto_accept_orders === true);
        setPreparationBufferMin(d.preparation_buffer_minutes ?? 15);
        const addr = d.address;
        if (addr) {
          setFullAddress(addr.full_address ?? "");
          setAddressLandmark(addr.landmark ?? "");
          setAddressCity(addr.city ?? "");
          setAddressState(addr.state ?? "");
          setAddressPostalCode(addr.postal_code ?? "");
          setAddressLat(addr.latitude != null ? String(addr.latitude) : "");
          setAddressLng(addr.longitude != null ? String(addr.longitude) : "");
        }
      }
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") return;
      if (typeof window !== "undefined" && process.env.NODE_ENV === "development") {
        console.warn("[StoreSettings] loadSettings failed:", err);
      }
    }
  }, [base]);

  const handleDelistCancel = () => {
    if (delistLoading) return;
    setDelistReasonCategory("");
    setDelistType(null);
    setDelistRemarks("");
    setDelistConfirmed(false);
  };

  const handleDelistSubmit = async () => {
    if (!canEditSettings) {
      toast.error("View-only access — cannot delist store.");
      return;
    }
    if (!storeId || !delistType || !delistReasonCategory || delistRemarks.trim().length < 10 || !delistConfirmed) {
      toast.error("Please fill all delist fields, add a clear remark, and confirm the action.");
      return;
    }
    setDelistLoading(true);
    try {
      const res = await fetch(`/api/merchant/stores/${storeId}/delist`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "delist",
          delist_type: delistType,
          reason_category: delistReasonCategory,
          reason_description: delistRemarks.trim(),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.success) {
        toast.error(data?.error || "Failed to delist store");
        return;
      }
      toast.success("Store delisted successfully.");
      handleDelistCancel();
      void loadStore();
    } catch {
      toast.error("Failed to delist store");
    } finally {
      setDelistLoading(false);
    }
  };

  const loadSelfDeliveryRiders = useCallback(async (signal?: AbortSignal): Promise<void> => {
    try {
      setRidersLoading(true);
      const res = await fetch(`${base}/self-delivery-riders`, { signal });
      if (!res.ok) return;
      const d = await res.json().catch(() => ({}));
      if (d.success && Array.isArray(d.riders)) {
        setSelfDeliveryRiders(d.riders);
      } else {
        setSelfDeliveryRiders([]);
      }
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") return;
      setSelfDeliveryRiders([]);
    } finally {
      setRidersLoading(false);
    }
  }, [base]);

  useEffect(() => {
    if (activeTab === "delivery" && selfDelivery) {
      const ac = new AbortController();
      loadSelfDeliveryRiders(ac.signal);
      return () => ac.abort();
    }
    if (activeTab !== "delivery" || !selfDelivery) setSelfDeliveryRiders([]);
  }, [activeTab, selfDelivery, loadSelfDeliveryRiders]);

  const loadPlans = useCallback(async (signal?: AbortSignal): Promise<void> => {
    setPlansLoading(true);
    try {
      const res = await fetch(`${base}/plans`, { signal });
      const d = await res.json().catch(() => ({}));
      if (d.success) {
        setPlans(d.plans ?? []);
        setCurrentSubscription(d.currentSubscription ?? null);
      }
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") return;
      if (typeof window !== "undefined" && process.env.NODE_ENV === "development") {
        console.warn("[StoreSettings] loadPlans failed:", err);
      }
    } finally {
      setPlansLoading(false);
    }
  }, [base]);

  const hasCachedStore = !!(layoutStore || queryStore);
  useEffect(() => {
    if (hasCachedStore) setLoading(false);
    const ac = new AbortController();
    let cancelled = false;
    if (!hasCachedStore) setLoading(true);
    Promise.all([
      loadStore(ac.signal),
      loadSettings(ac.signal),
      loadPlans(ac.signal),
    ]).catch(() => {
      // All loaders swallow errors; this catches any unexpected rejection
    }).finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => {
      cancelled = true;
      ac.abort();
    };
  }, [storeId, hasCachedStore, loadStore, loadSettings, loadPlans]);

  const handleSaveOperations = async () => {
    if (!canEditSettings) {
      toast.error("View-only access — cannot update store settings.");
      return;
    }
    setIsSaving(true);
    try {
      const res = await fetch(`${base}/store-settings`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          auto_accept_orders: autoAcceptOrders,
          preparation_buffer_minutes: preparationBufferMin,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.success) {
        toast.success("Store operations saved.");
        loadSettings();
      } else {
        toast.error(data.error || "Failed to save.");
      }
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveDelivery = async () => {
    if (!canEditSettings) {
      toast.error("View-only access — cannot update store settings.");
      return;
    }
    const radiusNum = Number(deliveryRadiusKm);
    if (Number.isNaN(radiusNum) || radiusNum < 1 || radiusNum > 50) {
      toast.error("Delivery radius must be between 1 and 50 km.");
      return;
    }
    setIsSaving(true);
    try {
      const res = await fetch(`${base}/store-settings`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          platform_delivery: gatimitraDelivery,
          self_delivery: selfDelivery,
          delivery_radius_km: radiusNum,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.success) {
        toast.success("Delivery settings saved.");
        setSavedDeliveryRadiusKm(radiusNum);
        setDeliveryRadiusKm(radiusNum);
        loadSettings();
        if (selfDelivery) loadSelfDeliveryRiders();
      } else {
        toast.error(data.error || "Failed to save.");
      }
    } finally {
      setIsSaving(false);
    }
  };

  const handleConfirmDeliveryModeWarning = async () => {
    if (!canEditSettings) {
      setDeliveryModeWarningOpen(false);
      setPendingDeliveryMode(null);
      toast.error("View-only access — cannot update delivery mode.");
      return;
    }
    if (pendingDeliveryMode == null) {
      setDeliveryModeWarningOpen(false);
      setPendingDeliveryMode(null);
      return;
    }
    setSavingDeliveryMode(true);
    try {
      setGatimitraDelivery(pendingDeliveryMode.gatimitra);
      setSelfDelivery(pendingDeliveryMode.self);
      const res = await fetch(`${base}/store-settings`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          platform_delivery: pendingDeliveryMode.gatimitra,
          self_delivery: pendingDeliveryMode.self,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.success) {
        toast.success("Delivery mode updated.");
        loadSettings();
        if (pendingDeliveryMode.self) loadSelfDeliveryRiders();
      } else {
        toast.error(data.error || "Failed to update.");
      }
    } finally {
      setSavingDeliveryMode(false);
      setDeliveryModeWarningOpen(false);
      setPendingDeliveryMode(null);
    }
  };

  const handleSaveAddress = async () => {
    setIsSaving(true);
    try {
      const lat = addressLat ? parseFloat(addressLat) : undefined;
      const lng = addressLng ? parseFloat(addressLng) : undefined;
      const res = await fetch(`${base}/store-settings`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          address: {
            full_address: fullAddress.trim() || undefined,
            landmark: addressLandmark.trim() || undefined,
            city: addressCity.trim() || undefined,
            state: addressState.trim() || undefined,
            postal_code: addressPostalCode.trim() || undefined,
            latitude: lat != null && !Number.isNaN(lat) ? lat : undefined,
            longitude: lng != null && !Number.isNaN(lng) ? lng : undefined,
          },
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.success) {
        toast.success("Address saved.");
        loadSettings();
        loadStore();
      } else {
        toast.error(data.error || "Failed to save.");
      }
    } finally {
      setIsSaving(false);
    }
  };

  const effectiveStore = (store ?? layoutStore ?? queryStore) as StoreDetail | null;
  const isDelisted = (effectiveStore?.approval_status || "").toUpperCase() === "DELISTED";

  const {
    isStoreOpen,
    manualActivationLock,
    showClosePopup,
    closeConfirmLoading,
    toggleClosureType,
    setToggleClosureType,
    closureDate,
    setClosureDate,
    closureTime,
    setClosureTime,
    closeReason,
    setCloseReason,
    closeReasonOther,
    setCloseReasonOther,
    showToggleOnWarning,
    setShowToggleOnWarning,
    toggleOnLoading,
    handleStoreToggle,
    handleConfirmToggleOn,
    handleClosePopupConfirm,
    handleCancelClosePopup,
    refreshOperations,
    saveManualActivationLock,
    engine,
    operationsQuery,
  } = useMerchantStoreOperations({
    storeId,
    poll: activeTab === "operations",
    syncEngine: true,
  });

  const invalidateStoreQueries = useInvalidateMerchantStoreQueries();
  const statusCard = useStoreStatusCardModel(operationsQuery.data as StoreOperationsSnapshot | undefined, {
    storeTimezone: typeof effectiveStore?.timezone === "string" ? effectiveStore.timezone : null,
    storeIdLabel: effectiveStore?.store_id ?? null,
    onCountdownExpired: () => invalidateStoreQueries(storeId),
  });

  const handleRelistSubmit = async () => {
    if (!storeId) return;
    setRelistLoading(true);
    try {
      const res = await fetch(`/api/merchant/stores/${storeId}/delist`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "relist",
          reason_description: relistReason.trim() || undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.success) {
        toast.error(data?.error || "Failed to relist store");
        return;
      }
      toast.success("Store relisted. It will remain CLOSED until you open it from Store operations.");
      setRelistModalOpen(false);
      setRelistReason("");
      await Promise.all([loadStore(), refreshOperations()]);
    } catch {
      toast.error("Failed to relist store");
    } finally {
      setRelistLoading(false);
    }
  };

  const openRelistModal = () => setRelistModalOpen(true);
  const closeRelistModal = () => {
    if (!relistLoading) {
      setRelistModalOpen(false);
      setRelistReason("");
    }
  };

  if (loading && !effectiveStore) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="h-9 w-9 animate-spin rounded-full border-2 border-indigo-600 border-t-transparent" />
      </div>
    );
  }

  if (!effectiveStore && !loading) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-6">
        <p className="text-gray-500 mb-3">Store could not be loaded. Check your connection and try again.</p>
        <button
          type="button"
          onClick={() => {
            setLoading(true);
            Promise.all([
              loadStore(),
              loadSettings(),
              refreshOperations(),
              loadPlans(),
            ]).catch(() => {}).finally(() => setLoading(false));
          }}
          className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-0 w-full">
      {engine.scheduleEndModalOpen && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl border border-gray-200">
            <p className="text-base font-bold text-gray-900">{UI_STRINGS.scheduleEndTitle}</p>
            <p className="mt-2 text-sm text-gray-700">{UI_STRINGS.scheduleEndBody}</p>
            <div className="mt-5 flex items-center justify-end gap-2">
              <button
                type="button"
                className="px-4 py-2 rounded-lg text-sm font-semibold text-gray-700 hover:bg-gray-100"
                onClick={() => engine.scheduleEndRespond("stay_online")}
              >
                Stay Online
              </button>
              <button
                type="button"
                className="px-4 py-2 rounded-lg text-sm font-semibold text-white bg-red-600 hover:bg-red-700"
                onClick={() => engine.scheduleEndRespond("go_offline")}
              >
                Go Offline
              </button>
            </div>
          </div>
        </div>
      )}
      {showClosePopup && (
        <div
          className="fixed inset-0 z-[120] flex items-center justify-center bg-black/50 backdrop-blur-md p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="dashboard-close-store-title"
          onClick={handleCancelClosePopup}
        >
          <div
            className="mx-auto w-full max-w-md rounded-2xl border border-gray-200 bg-white p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="dashboard-close-store-title" className="mb-4 text-lg font-bold text-gray-900">
              How would you like to close your store?
            </h2>
            <div className="space-y-3">
              <label
                className={`flex cursor-pointer items-center gap-3 rounded-lg border-2 p-3 ${
                  toggleClosureType === "temporary"
                    ? "border-orange-400 bg-orange-50"
                    : "border-gray-200 hover:border-orange-200"
                }`}
              >
                <input
                  type="radio"
                  name="closureType"
                  checked={toggleClosureType === "temporary"}
                  onChange={() => setToggleClosureType("temporary")}
                  className="h-4 w-4"
                />
                <div className="flex-1">
                  <p className="text-sm font-semibold text-gray-900">Temporary Closed</p>
                  <p className="text-xs text-gray-600">
                    Close until a specific date and time. Reopens automatically then, or turn ON manually anytime.
                  </p>
                </div>
              </label>
              {toggleClosureType === "temporary" && (
                <div className="ml-7 space-y-3 rounded-lg border border-orange-200 bg-orange-50/50 p-3">
                  <p className="text-xs font-semibold text-gray-700">Reopen on (date and time):</p>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="mb-1 block text-[10px] font-medium text-gray-500">Date</label>
                      <input
                        type="date"
                        value={closureDate}
                        onChange={(e) => setClosureDate(e.target.value)}
                        min={(() => {
                          const n = new Date();
                          return `${n.getFullYear()}-${(n.getMonth() + 1).toString().padStart(2, "0")}-${n.getDate().toString().padStart(2, "0")}`;
                        })()}
                        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-[10px] font-medium text-gray-500">Time</label>
                      <input
                        type="time"
                        value={closureTime}
                        onChange={(e) => setClosureTime(e.target.value)}
                        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900"
                      />
                    </div>
                  </div>
                  <p className="text-[10px] text-gray-600">
                    Store stays closed until this date and time, or until you turn it ON manually.
                  </p>
                </div>
              )}
              <label
                className={`flex cursor-pointer items-center gap-3 rounded-lg border-2 p-3 ${
                  toggleClosureType === "today" ? "border-red-400 bg-red-50" : "border-gray-200 hover:border-red-200"
                }`}
              >
                <input
                  type="radio"
                  name="closureType"
                  checked={toggleClosureType === "today"}
                  onChange={() => setToggleClosureType("today")}
                  className="h-4 w-4"
                />
                <div className="flex-1">
                  <p className="text-sm font-semibold text-gray-900">Close for Today</p>
                  <p className="text-xs text-gray-600">
                    Closed until end of today (India time). Schedule can resume tomorrow.
                  </p>
                </div>
              </label>
              <label
                className={`flex cursor-pointer items-center gap-3 rounded-lg border-2 p-3 ${
                  toggleClosureType === "manual_hold"
                    ? "border-amber-400 bg-amber-50"
                    : "border-gray-200 hover:border-amber-200"
                }`}
              >
                <input
                  type="radio"
                  name="closureType"
                  checked={toggleClosureType === "manual_hold"}
                  onChange={() => setToggleClosureType("manual_hold")}
                  className="h-4 w-4"
                />
                <div className="flex-1">
                  <p className="text-sm font-semibold text-gray-900">Until I manually turn it ON</p>
                  <p className="text-xs text-gray-600">
                    Store stays OFF even during operating hours until you turn it ON
                  </p>
                </div>
              </label>
            </div>
            <div className="mt-4 space-y-2">
              <label className="block text-xs font-semibold text-gray-700">
                Reason for closing <span className="text-red-500">*</span>
              </label>
              <select
                value={closeReason}
                onChange={(e) => setCloseReason(e.target.value)}
                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900"
              >
                <option value="">Select reason</option>
                {MERCHANT_PORTAL_CLOSE_REASONS.map((r) => (
                  <option key={r} value={r}>
                    {merchantPortalCloseReasonWithSuffix(r)}
                  </option>
                ))}
              </select>
              {closeReason === "Other" && (
                <input
                  type="text"
                  value={closeReasonOther}
                  onChange={(e) => setCloseReasonOther(e.target.value)}
                  placeholder="Enter reason"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900"
                />
              )}
            </div>
            <div className="mt-5 flex gap-3">
              <button
                type="button"
                onClick={handleCancelClosePopup}
                disabled={closeConfirmLoading}
                className="flex-1 rounded-xl border border-gray-300 px-4 py-2.5 font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleClosePopupConfirm}
                disabled={
                  !toggleClosureType ||
                  !closeReason?.trim() ||
                  (closeReason === "Other" && !closeReasonOther?.trim()) ||
                  (toggleClosureType === "temporary" && (!closureDate || !closureTime)) ||
                  closeConfirmLoading
                }
                className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-red-600 px-4 py-2.5 font-medium text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {closeConfirmLoading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Confirming...
                  </>
                ) : (
                  "Confirm"
                )}
              </button>
            </div>
          </div>
        </div>
      )}
      {showToggleOnWarning && (
        <div
          className="fixed inset-0 z-[120] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-sm rounded-2xl border-2 border-emerald-200 bg-white p-6 shadow-2xl">
            <h3 className="text-center text-lg font-bold text-gray-900">Turn Store ON?</h3>
            <p className="mt-2 text-center text-sm text-gray-600">
              Your store will be OPEN and customers can place orders. Make sure you&apos;re ready to accept orders!
            </p>
            <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50/70 p-3">
              <p className="text-xs font-medium text-amber-800">
                Orders will start coming immediately. Be prepared to receive and process them.
              </p>
            </div>
            <div className="mt-5 flex gap-3">
              <button
                type="button"
                onClick={() => !toggleOnLoading && setShowToggleOnWarning(false)}
                disabled={toggleOnLoading}
                className="flex-1 rounded-lg border-2 border-gray-300 px-4 py-2.5 text-sm font-semibold text-gray-700"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handleConfirmToggleOn({ isDelisted })}
                disabled={toggleOnLoading}
                className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
              >
                {toggleOnLoading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Turning ON...
                  </>
                ) : (
                  "Yes, Turn ON"
                )}
              </button>
            </div>
          </div>
        </div>
      )}
      <SettingsNavBar activeTab={activeTab} onTabChange={setActiveTab} />
      {/* flex-1 + min-h-0 lets this child shrink inside the flex column, and
          overflow-y-auto makes THIS the scroll container (tab bar stays fixed
          above). Without overflow-y-auto, content added below the fold (e.g.
          the Subscription history block on the Plans tab) is unreachable
          because the outer page has no scroll. */}
      <div className="flex-1 min-h-0 min-w-0 overflow-y-auto pt-4">
        {activeTab === "timings" ? (
          <OutletTimingsPanel
            apiBase={base}
            active
            readOnly={!canEditSettings}
            storeId={storeId}
            storeTimezone={
              typeof effectiveStore?.timezone === "string" ? effectiveStore.timezone : null
            }
          />
        ) : (
        <div className="rounded-xl border border-gray-200 bg-white p-4 sm:p-6 space-y-6">

          {activeTab === "operations" && (
            <>
              <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                <Power className="h-5 w-5" />
                Store operations
              </h2>
              <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
                <div className="lg:col-span-2">
                  <MerchantStoreStatusCard
                    isStoreOpen={statusCard.isStoreOpen}
                    restrictionType={statusCard.restrictionType}
                    storeStatusBadge={statusCard.storeStatusBadge}
                    cardDisplaySlots={statusCard.cardDisplaySlots}
                    cardBreakGapLabel={statusCard.cardBreakGapLabel}
                    scheduledTimeOffs={statusCard.scheduledTimeOffs}
                    activeRush={statusCard.activeRush}
                    formatScheduledTimeOffWindow={statusCard.formatScheduledTimeOffWindow}
                    isTodayScheduledClosed={statusCard.isTodayScheduledClosed}
                    scheduleStatusLabel={statusCard.scheduleStatusLabel}
                    schedulePhase={statusCard.schedulePhase}
                    showScheduleCountdown={statusCard.showScheduleCountdown}
                    activeCountdownAt={statusCard.activeCountdownAt}
                    countdownTick={statusCard.countdownTick}
                    opensCountdownLabel={statusCard.opensCountdownLabel}
                    countdownKind={statusCard.countdownKind}
                    countdownSubtitleWallLabel={statusCard.countdownSubtitleWallLabel}
                    closeReasonDisplay={statusCard.closeReasonDisplay}
                    lastToggledByName={statusCard.lastToggledByName}
                    lastToggleBy={statusCard.lastToggleBy}
                    lastToggleType={statusCard.lastToggleType}
                    lastToggledAt={statusCard.lastToggledAt}
                    storeIdLabel={effectiveStore?.store_id ?? null}
                    manualActivationLock={statusCard.manualActivationLock}
                    showScheduledOffStartsCountdown={statusCard.showScheduledOffStartsCountdown}
                    scheduledOffStartsInMs={statusCard.scheduledOffStartsInMs}
                    canToggleStore={canEditSettings && canOperateStore}
                    onStoreToggle={() => handleStoreToggle({ isDelisted })}
                    onManualLockChange={(enabled) => {
                      statusCard.setManualActivationLock(enabled);
                      void saveManualActivationLock(enabled);
                    }}
                    storeInternalId={storeId}
                    onOperationsRefresh={() => refreshOperations()}
                  />
                </div>
                <div className="rounded-lg border border-gray-200 bg-gray-50/60 p-4">
                  <h3 className="text-sm font-semibold text-gray-900">Order handling</h3>
                  <p className="mt-0.5 text-xs text-gray-500 mb-3">Auto-accept and preparation buffer.</p>
                  <div className="space-y-3">
                    <label className={`flex items-center gap-2 ${!canEditSettings ? "opacity-60" : ""}`}>
                      <input
                        type="checkbox"
                        checked={autoAcceptOrders}
                        onChange={(e) => setAutoAcceptOrders(e.target.checked)}
                        disabled={!canEditSettings}
                        className="rounded border-gray-300 disabled:cursor-not-allowed"
                      />
                      <span className="text-sm font-medium text-gray-900">Auto-accept orders</span>
                    </label>
                    <div className="flex flex-wrap items-end gap-3">
                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">
                          Preparation buffer (minutes)
                        </label>
                        <input
                          type="number"
                          min={0}
                          value={preparationBufferMin}
                          onChange={(e) => setPreparationBufferMin(Number(e.target.value) || 0)}
                          disabled={!canEditSettings}
                          className="w-24 rounded-lg border border-gray-300 px-3 py-1.5 text-sm disabled:bg-gray-50 disabled:cursor-not-allowed"
                        />
                      </div>
                      {canEditSettings ? (
                      <button
                        type="button"
                        onClick={handleSaveOperations}
                        disabled={isSaving}
                        className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
                      >
                        <Save className="h-4 w-4" />
                        {isSaving ? "Saving..." : "Save changes"}
                      </button>
                      ) : null}
                    </div>
                  </div>
                </div>
{/* Right: Delist / Relist card (depends on status) */}
                {canEditSettings ? (
                <div className="rounded-lg border border-red-200 bg-red-50 p-4">
                  <div className="flex items-start gap-2">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-red-100 text-red-700">
                      <AlertTriangle className="h-4 w-4" />
                    </div>
                    <div className="flex-1">
                      {isDelisted ? (
                        <>
                          <h3 className="text-sm font-semibold text-red-900">Relist store</h3>
                          <p className="mt-0.5 text-xs text-red-700">
                            This store is currently delisted. Relisting will make it visible again but keep it{" "}
                            <span className="font-semibold">closed</span> until you manually open it from Store
                            operations.
                          </p>
                          <div className="mt-3 flex items-center justify-end gap-2">
                            <button
                              type="button"
                              className="rounded bg-red-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-red-700 disabled:opacity-60 disabled:cursor-not-allowed"
                              onClick={openRelistModal}
                              disabled={relistLoading}
                            >
                              {relistLoading ? "Relisting..." : "Relist store"}
                            </button>
                          </div>
                        </>
                      ) : (
                        <>
                          <h3 className="text-sm font-semibold text-red-900">Delist store</h3>
                          <p className="mt-0.5 text-xs text-red-700">
                            Delisting hides the store from customers and stops new orders immediately.
                          </p>

                          <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-3">
                            <div className="space-y-1">
                              <label className="text-xs font-medium text-red-900">Delisting reason</label>
                              <select
                                className="w-full rounded border border-red-200 bg-white px-2 py-1.5 text-xs text-gray-900 focus:outline-none focus:ring-1 focus:ring-red-500"
                                value={delistReasonCategory}
                                onChange={(e) => setDelistReasonCategory(e.target.value)}
                              >
                                <option value="">Select reason</option>
                                <option value="Operational issues">Operational issues</option>
                                <option value="Compliance / legal">Compliance / legal</option>
                                <option value="Quality / customer complaints">Quality / customer complaints</option>
                                <option value="Duplicate / test store">Duplicate / test store</option>
                                <option value="Other">Other</option>
                              </select>
                            </div>

                            <div className="space-y-1">
                              <label className="text-xs font-medium text-red-900">Delist type</label>
                              <div className="flex flex-wrap gap-2">
                                {[
                                  { key: "temporary_delisted", label: "Temporary" },
                                  { key: "permanently_delisted", label: "Permanent" },
                                  { key: "compliance_hold", label: "Compliance hold" },
                                ].map((opt) => (
                                  <button
                                    key={opt.key}
                                    type="button"
                                    onClick={() =>
                                      setDelistType(
                                        opt.key as "temporary_delisted" | "permanently_delisted" | "compliance_hold"
                                      )
                                    }
                                    className={`px-2.5 py-1 text-xs rounded-full border ${
                                      delistType === opt.key
                                        ? "border-red-600 bg-red-600 text-white"
                                        : "border-red-200 bg-white text-red-800 hover:border-red-400"
                                    }`}
                                  >
                                    {opt.label}
                                  </button>
                                ))}
                              </div>
                            </div>

                            <div className="space-y-1">
                              <label className="text-xs font-medium text-red-900">Confirmation</label>
                              <div className="mt-1 flex items-start gap-2">
                                <input
                                  id="confirm-delist-settings"
                                  type="checkbox"
                                  checked={delistConfirmed}
                                  onChange={(e) => setDelistConfirmed(e.target.checked)}
                                  className="mt-0.5 h-3.5 w-3.5 rounded border-red-400 text-red-600 focus:ring-red-500"
                                />
                                <label htmlFor="confirm-delist-settings" className="text-xs text-red-800">
                                  I confirm this action and understand its impact.
                                </label>
                              </div>
                            </div>
                          </div>

                          <div className="mt-3">
                            <label className="text-xs font-medium text-red-900">
                              Detailed reason / remarks <span className="text-red-600">*</span>
                            </label>
                            <textarea
                              className="mt-1 w-full rounded border border-red-200 bg-white px-2 py-1.5 text-xs text-gray-900 focus:outline-none focus:ring-1 focus:ring-red-500"
                              rows={3}
                              maxLength={1000}
                              placeholder="Add clear, specific reason and any context that may help during review or reactivation."
                              value={delistRemarks}
                              onChange={(e) => setDelistRemarks(e.target.value)}
                            />
                          </div>

                          <div className="mt-3 flex items-center justify-end gap-2">
                            <button
                              type="button"
                              className="rounded border border-red-200 bg-white px-3 py-1.5 text-xs font-medium text-red-800 hover:bg-red-50"
                              onClick={handleDelistCancel}
                              disabled={delistLoading}
                            >
                              Cancel
                            </button>
                            <button
                              type="button"
                              className="rounded bg-red-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-red-700 disabled:opacity-60 disabled:cursor-not-allowed"
                              onClick={handleDelistSubmit}
                              disabled={
                                delistLoading ||
                                !delistConfirmed ||
                                !delistType ||
                                !delistReasonCategory ||
                                delistRemarks.trim().length < 10
                              }
                            >
                              {delistLoading ? "Delisting..." : "Delist store"}
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                </div>
                ) : null}
              </div>

              {/* Relist store modal */}
              {relistModalOpen && canEditSettings && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                  <div
                    className="absolute inset-0 bg-black/50"
                    aria-hidden
                    onClick={closeRelistModal}
                  />
                  <div
                    className="relative w-full max-w-md rounded-xl border border-gray-200 bg-white shadow-xl"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className="flex items-center gap-2 border-b border-gray-200 px-4 py-3">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-amber-100">
                        <AlertTriangle className="h-4 w-4 text-amber-700" />
                      </div>
                      <h3 className="text-sm font-semibold text-gray-900">Relist store</h3>
                    </div>
                    <div className="px-4 py-3">
                      <p className="text-xs text-gray-600 mb-3">
                        Relisting will make this store visible again. It will stay <span className="font-medium">closed</span> until
                        you open it from Store operations.
                      </p>
                      <label className="block text-xs font-medium text-gray-700 mb-1">
                        Relist reason <span className="text-gray-400">(optional)</span>
                      </label>
                      <textarea
                        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                        rows={3}
                        maxLength={500}
                        placeholder="e.g. Issue resolved, store ready to go live"
                        value={relistReason}
                        onChange={(e) => setRelistReason(e.target.value)}
                        disabled={relistLoading}
                      />
                    </div>
                    <div className="flex justify-end gap-2 border-t border-gray-200 px-4 py-3">
                      <button
                        type="button"
                        className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                        onClick={closeRelistModal}
                        disabled={relistLoading}
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        className="rounded-lg bg-red-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-60 disabled:cursor-not-allowed"
                        onClick={handleRelistSubmit}
                        disabled={relistLoading}
                      >
                        {relistLoading ? "Relisting..." : "Relist store"}
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}

          {activeTab === "delivery" && (
            <>
              <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2 mb-6">
                <Package className="h-5 w-5" />
                Delivery settings
              </h2>

              {/* Centered warning modal when delivery mode is toggled */}
              {deliveryModeWarningOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                  <div className="absolute inset-0 bg-black/50" onClick={() => { if (!savingDeliveryMode) { setDeliveryModeWarningOpen(false); setPendingDeliveryMode(null); } }} aria-hidden />
                  <div className="relative rounded-xl border-2 border-amber-200 bg-white p-6 shadow-xl max-w-md w-full" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center gap-3 mb-4">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-700">
                        <AlertTriangle className="h-5 w-5" />
                      </div>
                      <h3 className="font-semibold text-gray-900">Delivery mode change</h3>
                    </div>
                    <p className="text-sm text-gray-600 mb-6">
                      If you are changing the delivery mode on behalf of the merchant, you will be responsible for this action.
                    </p>
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        disabled={savingDeliveryMode}
                        onClick={() => { setDeliveryModeWarningOpen(false); setPendingDeliveryMode(null); }}
                        className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        disabled={savingDeliveryMode}
                        onClick={handleConfirmDeliveryModeWarning}
                        className="inline-flex items-center gap-2 rounded-lg bg-amber-600 px-3 py-2 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-50"
                      >
                        {savingDeliveryMode ? (
                          <>
                            <Loader2 className="h-4 w-4 animate-spin" />
                            Saving...
                          </>
                        ) : (
                          "I understand, continue"
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {/* GatiMitra delivery card */}
                <div
                  className={`relative rounded-xl border-2 p-4 flex flex-col transition-all duration-200 ${
                    gatimitraDelivery
                      ? "border-emerald-500 bg-gradient-to-b from-emerald-50/80 to-white shadow-md shadow-emerald-500/10 ring-2 ring-emerald-500 ring-offset-2"
                      : "border-gray-200 bg-white hover:border-gray-300 hover:shadow shadow-sm"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-500 to-blue-600 text-white shadow">
                        <Truck className="h-5 w-5" />
                      </div>
                      <div>
                        <h3 className="font-bold text-gray-900 text-base">GatiMitra delivery</h3>
                        <p className="text-[10px] text-gray-500 uppercase tracking-wide">Platform riders</p>
                      </div>
                    </div>
                    {gatimitraDelivery && (
                      <span className="shrink-0 inline-flex items-center rounded-full bg-emerald-600 px-2 py-0.5 text-[10px] font-semibold text-white">
                        Active
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-gray-600 mb-3 line-clamp-2">Platform riders deliver your orders.</p>
                  <div className="mt-auto pt-2 border-t border-gray-100">
                    <Toggle
                      checked={gatimitraDelivery}
                      disabled={!canEditSettings}
                      title={
                        !canEditSettings
                          ? "View-only access — delivery mode locked"
                          : undefined
                      }
                      onChange={(on) => {
                        if (!canEditSettings) return;
                        if (on) {
                          setPendingDeliveryMode({ gatimitra: true, self: false });
                          setDeliveryModeWarningOpen(true);
                        } else {
                          toast.error(
                            "Self delivery cannot be turned on from the merchant portal. Contact support if you need it enabled."
                          );
                        }
                      }}
                    />
                    <span className="ml-2 text-xs text-gray-500">Use GatiMitra</span>
                  </div>
                </div>

                {/* Self delivery card */}
                <div
                  className={`relative rounded-xl border-2 p-4 flex flex-col transition-all duration-200 ${
                    selfDelivery
                      ? "border-emerald-500 bg-gradient-to-b from-emerald-50/80 to-white shadow-md shadow-emerald-500/10 ring-2 ring-emerald-500 ring-offset-2"
                      : "border-gray-200 bg-white hover:border-gray-300 hover:shadow shadow-sm"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow">
                        <Bike className="h-5 w-5" />
                      </div>
                      <div>
                        <h3 className="font-bold text-gray-900 text-base">Self delivery</h3>
                        <p className="text-[10px] text-gray-500 uppercase tracking-wide">Your own riders</p>
                      </div>
                    </div>
                    {selfDelivery && (
                      <span className="shrink-0 inline-flex items-center rounded-full bg-emerald-600 px-2 py-0.5 text-[10px] font-semibold text-white">
                        Active
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-gray-600 mb-3 line-clamp-2">Your own riders deliver orders. Turn off to use GatiMitra.</p>
                  {!selfDelivery && (
                    <p className="text-[11px] text-amber-800 bg-amber-50/80 border border-amber-200/80 rounded-lg px-2 py-1.5 mb-2">
                      Self delivery cannot be turned back on from settings once disabled. Contact support to enable it again.
                    </p>
                  )}
                  <div className="mt-auto pt-2 border-t border-gray-100">
                    <Toggle
                      checked={selfDelivery}
                      disabled={!canEditSettings || !selfDelivery}
                      title={
                        !canEditSettings
                          ? "View-only access — delivery mode locked"
                          : selfDelivery
                            ? "Turn off self delivery to use GatiMitra riders"
                            : "Self delivery cannot be enabled from the merchant portal"
                      }
                      onChange={(on) => {
                        if (!canEditSettings) return;
                        if (on) {
                          toast.error(
                            "Self delivery cannot be turned on from the merchant portal. Contact support if you need it enabled."
                          );
                          return;
                        }
                        setPendingDeliveryMode({ gatimitra: true, self: false });
                        setDeliveryModeWarningOpen(true);
                      }}
                    />
                    <span className="ml-2 text-xs text-gray-500">Use own riders</span>
                  </div>
                </div>

                {/* Delivery radius card - active when radius edited, Save button here */}
                <div
                  className={`relative rounded-xl border-2 p-4 flex flex-col transition-all duration-200 ${
                    deliveryRadiusKm !== savedDeliveryRadiusKm
                      ? "border-emerald-500 bg-gradient-to-b from-emerald-50/80 to-white shadow-md shadow-emerald-500/10 ring-2 ring-emerald-500 ring-offset-2"
                      : "border-gray-200 bg-white hover:border-gray-300 hover:shadow shadow-sm"
                  }`}
                >
                  <div className="flex items-center gap-3 mb-2">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-gray-100 text-gray-600">
                      <Package className="h-5 w-5" />
                    </div>
                    <div>
                      <h3 className="font-bold text-gray-900 text-base">Delivery radius</h3>
                      <p className="text-[10px] text-gray-500 uppercase tracking-wide">In kilometres</p>
                    </div>
                  </div>
                  <p className="text-xs text-gray-600 mb-3">Max distance for delivery (1–50 km).</p>
                  <div className="mt-auto pt-2 border-t border-gray-100 space-y-3">
                    <div>
                      <label className="block text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-1">Radius (km)</label>
                      <input
                        type="number"
                        min={1}
                        max={50}
                        value={deliveryRadiusKm}
                        disabled={!canEditSettings}
                        title={
                          !canEditSettings
                            ? "View-only access — delivery radius locked"
                            : undefined
                        }
                        onChange={(e) => {
                          if (!canEditSettings) return;
                          const v = e.target.value === "" ? "" : Number(e.target.value);
                          if (v === "") setDeliveryRadiusKm(5);
                          else if (!Number.isNaN(v)) setDeliveryRadiusKm(v);
                        }}
                        onBlur={() => {
                          if (!canEditSettings) return;
                          const n = Number(deliveryRadiusKm);
                          if (Number.isNaN(n) || n < 1) setDeliveryRadiusKm(1);
                          else if (n > 50) {
                            setDeliveryRadiusKm(50);
                            toast.error("Delivery radius must be between 1 and 50 km.");
                          }
                        }}
                        className="w-20 rounded-lg border border-gray-300 px-2 py-1.5 text-sm focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 disabled:cursor-not-allowed disabled:bg-gray-50 disabled:opacity-60"
                      />
                    </div>
                    {canEditSettings ? (
                      <button
                        type="button"
                        onClick={handleSaveDelivery}
                        disabled={
                          isSaving ||
                          deliveryRadiusKm === savedDeliveryRadiusKm ||
                          (() => {
                            const n = Number(deliveryRadiusKm);
                            return Number.isNaN(n) || n < 1 || n > 50;
                          })()
                        }
                        className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-emerald-500 to-teal-600 px-3 py-2 text-sm font-medium text-white shadow-sm hover:from-emerald-600 hover:to-teal-700 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {isSaving ? (
                          <>
                            <Loader2 className="h-4 w-4 animate-spin" />
                            Saving...
                          </>
                        ) : (
                          <>
                            <Save className="h-4 w-4" />
                            Save
                          </>
                        )}
                      </button>
                    ) : null}
                  </div>
                </div>
              </div>

              {/* Self-delivery riders card - only when self delivery is on */}
              {selfDelivery && (
                <div className="mt-4 rounded-xl border-2 border-gray-200 bg-white p-4 shadow-sm sm:mt-6">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700">
                      <Users className="h-5 w-5" />
                    </div>
                    <div>
                      <h3 className="font-bold text-gray-900 text-base">Self-delivery riders</h3>
                      <p className="text-[10px] text-gray-500 uppercase tracking-wide">Riders linked to this store</p>
                    </div>
                  </div>
                  {ridersLoading ? (
                    <div className="flex items-center justify-center py-8">
                      <div className="h-8 w-8 animate-spin rounded-full border-2 border-emerald-500 border-t-transparent" />
                    </div>
                  ) : selfDeliveryRiders.length === 0 ? (
                    <p className="text-sm text-gray-500 py-4">No riders added yet. Add riders from the &quot;Self-Delivery Riders&quot; tab.</p>
                  ) : (
                    <div className="space-y-2">
                      {selfDeliveryRiders.map((r) => (
                        <div
                          key={r.id}
                          className="flex flex-row flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border border-gray-200 bg-gray-50/50 px-4 py-3"
                        >
                          <div className="flex min-w-0 shrink-0 items-center gap-2">
                            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
                              <User className="h-4 w-4" />
                            </div>
                            <div className="min-w-0">
                              <span className="font-medium text-gray-900">{r.rider_name}</span>
                              {r.is_primary && (
                                <span className="ml-2 inline-flex items-center gap-0.5 rounded-full bg-amber-100 px-1.5 py-0.5 text-xs font-medium text-amber-800">
                                  <Star className="h-3 w-3" /> Primary
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-4 gap-y-1 text-sm text-gray-600">
                            <span className="inline-flex items-center gap-1.5">
                              <Phone className="h-3.5 w-3 shrink-0 text-gray-400" />
                              <a href={`tel:${r.rider_mobile}`} className="hover:text-emerald-600">{r.rider_mobile}</a>
                            </span>
                            {r.rider_email && (
                              <span className="inline-flex items-center gap-1.5">
                                <Mail className="h-3.5 w-3 shrink-0 text-gray-400" />
                                <a href={`mailto:${r.rider_email}`} className="hover:text-emerald-600 truncate max-w-[180px]">{r.rider_email}</a>
                              </span>
                            )}
                            {r.vehicle_number && (
                              <span className="inline-flex items-center gap-1.5">
                                <Bike className="h-3.5 w-3 shrink-0 text-gray-400" />
                                {r.vehicle_number}
                              </span>
                            )}
                          </div>
                          <div className="shrink-0">
                            {r.is_active ? (
                              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-1 text-xs font-medium text-emerald-700">
                                <CheckCircle className="h-3 w-3" /> Active
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-1 text-xs text-gray-600">
                                <XCircle className="h-3 w-3" /> Inactive
                              </span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </>
          )}

          {activeTab === "plans" && (
            <>
              <div className="bg-white rounded-xl border border-gray-200 p-4 sm:p-6 shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-2 mb-4 sm:mb-6">
                  <h2 className="text-lg sm:text-xl font-bold text-gray-900 flex items-center gap-2">
                    <Crown className="h-5 w-5" />
                    Available Plans
                  </h2>
                </div>
              {plansLoading ? (
                <div className="flex items-center justify-center py-12">
                  <div className="h-8 w-8 animate-spin rounded-full border-2 border-orange-500 border-t-transparent" />
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
                  {effectivePlans.map((plan) => {
                    const isFreePlan =
                      plan.price === 0 || String(plan.plan_code || "").toLowerCase().includes("free");
                    const isActive =
                      currentSubscription != null
                        ? currentSubscription.plan_id === plan.id
                        : isFreePlan;
                    const activeFrom = currentSubscription?.active_from;
                    const expiryDate = currentSubscription?.expiry_date;
                    const tier = resolvePlanCardTier(plan);
                    const style = PLAN_CARD_STYLES[tier];
                    const imageCount =
                      plan.max_image_uploads != null
                        ? plan.max_image_uploads
                        : plan.image_upload_allowed
                          ? "∞"
                          : 0;
                    const activeRing = isActive
                      ? tier === "premium"
                        ? " ring-2 ring-orange-500 ring-offset-2"
                        : tier === "enterprise"
                          ? " ring-2 ring-purple-500 ring-offset-2"
                          : " ring-2 ring-gray-500 ring-offset-2"
                      : "";
                    return (
                      <div
                        key={plan.id}
                        className={`relative ${style.wrapper}${activeRing}`}
                      >
                        <div className={`relative px-4 pt-4 pb-10 sm:pb-11 ${style.headerBg}`}>
                          <div className="absolute inset-x-0 bottom-0 h-10 bg-white rounded-t-[2.25rem]" />
                          <div className="relative mb-2 flex flex-wrap items-center justify-between gap-2 min-h-6">
                            {style.badge ? (
                              <span className={style.badge}>
                                {tier === "premium" ? "⭐ MOST POPULAR" : "🚀 ENTERPRISE"}
                              </span>
                            ) : (
                              <span aria-hidden="true" className="h-0" />
                            )}
                            {isActive ? (
                              <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[10px] font-extrabold tracking-wide bg-white/20 text-white ring-1 ring-white/35 backdrop-blur-sm">
                                ACTIVE
                              </span>
                            ) : null}
                          </div>
                          <div className="relative flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <h4 className="text-base font-extrabold tracking-tight text-white truncate">
                                {plan.plan_name}
                              </h4>
                              <div className="mt-1.5 flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5">
                                <span
                                  className={`text-2xl sm:text-[28px] leading-tight font-extrabold tracking-tight whitespace-nowrap ${style.priceColor}`}
                                >
                                  ₹{plan.price ?? 0}
                                </span>
                                <span className="text-[11px] text-white/85 font-semibold leading-tight whitespace-nowrap">
                                  /{billingCycleSuffix(plan.billing_cycle)} ·{" "}
                                  {billingCycleLabel(plan.billing_cycle)}
                                </span>
                              </div>
                              {plan.description ? (
                                <p className="mt-1.5 text-[11px] text-white/80 line-clamp-2">
                                  {plan.description}
                                </p>
                              ) : null}
                            </div>
                          </div>
                        </div>

                        <div className="px-4 pb-4 pt-1">
                          <div className="space-y-2 text-xs mb-4">
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex items-center gap-1.5 min-w-0">
                                <Layers className="w-3.5 h-3.5 text-gray-500 shrink-0" />
                                <span className="text-gray-600 truncate">Menu items</span>
                              </div>
                              <span className={style.featureValue}>
                                {plan.max_menu_items != null ? plan.max_menu_items : "∞"}
                              </span>
                            </div>
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex items-center gap-1.5 min-w-0">
                                <ChefHat className="w-3.5 h-3.5 text-gray-500 shrink-0" />
                                <span className="text-gray-600 truncate">Cuisines</span>
                              </div>
                              <span className={style.featureValue}>
                                {plan.max_cuisines != null ? plan.max_cuisines : "∞"}
                              </span>
                            </div>
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex items-center gap-1.5 min-w-0">
                                <Layers className="w-3.5 h-3.5 text-gray-500 shrink-0" />
                                <span className="text-gray-600 truncate">Menu categories</span>
                              </div>
                              <span className={style.featureValue}>
                                {plan.max_menu_categories != null ? plan.max_menu_categories : "∞"}
                              </span>
                            </div>
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex items-center gap-1.5 min-w-0">
                                <ImageIcon className="w-3.5 h-3.5 text-gray-500 shrink-0" />
                                <span className="text-gray-600 truncate">Images</span>
                              </div>
                              <span
                                className={`font-semibold ${
                                  (plan.max_image_uploads ?? 0) > 0 || plan.image_upload_allowed
                                    ? "text-green-600"
                                    : "text-gray-500"
                                }`}
                              >
                                {imageCount}
                              </span>
                            </div>
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex items-center gap-1.5 min-w-0">
                                <BarChart2 className="w-3.5 h-3.5 text-gray-500 shrink-0" />
                                <span className="text-gray-600 truncate">Analytics</span>
                              </div>
                              {plan.analytics_access ? (
                                <CheckCircle className="w-3.5 h-3.5 text-green-500 shrink-0" />
                              ) : (
                                <XCircle className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                              )}
                            </div>
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex items-center gap-1.5 min-w-0">
                                <BarChart3 className="w-3.5 h-3.5 text-gray-500 shrink-0" />
                                <span className="text-gray-600 truncate">Advanced Analytics</span>
                              </div>
                              {plan.advanced_analytics ? (
                                <CheckCircle className="w-3.5 h-3.5 text-green-500 shrink-0" />
                              ) : (
                                <XCircle className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                              )}
                            </div>
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex items-center gap-1.5 min-w-0">
                                <Headphones className="w-3.5 h-3.5 text-gray-500 shrink-0" />
                                <span className="text-gray-600 truncate">Priority Support</span>
                              </div>
                              {plan.priority_support ? (
                                <CheckCircle className="w-3.5 h-3.5 text-green-500 shrink-0" />
                              ) : (
                                <XCircle className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                              )}
                            </div>
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex items-center gap-1.5 min-w-0">
                                <UserCheck className="w-3.5 h-3.5 text-gray-500 shrink-0" />
                                <span className="text-gray-600 truncate">Dedicated Manager</span>
                              </div>
                              {plan.dedicated_account_manager ? (
                                <CheckCircle className="w-3.5 h-3.5 text-green-500 shrink-0" />
                              ) : (
                                <XCircle className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                              )}
                            </div>
                          </div>

                          {isActive && (activeFrom || expiryDate) ? (
                            <div className="mb-3 rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-[11px] text-gray-600 space-y-0.5">
                              {activeFrom ? (
                                <p>
                                  Active from:{" "}
                                  {new Date(activeFrom).toLocaleDateString("en-IN", {
                                    day: "2-digit",
                                    month: "short",
                                    year: "numeric",
                                  })}
                                </p>
                              ) : null}
                              <p>
                                Expires:{" "}
                                {expiryDate
                                  ? new Date(expiryDate).toLocaleDateString("en-IN", {
                                      day: "2-digit",
                                      month: "short",
                                      year: "numeric",
                                    })
                                  : "—"}
                              </p>
                            </div>
                          ) : null}

                          <div
                            className={`w-full py-2.5 rounded-xl font-semibold text-xs sm:text-sm flex items-center justify-center gap-2 ${
                              isActive
                                ? "bg-gray-100 text-gray-700 border border-gray-300"
                                : tier === "premium"
                                  ? "bg-gradient-to-r from-orange-600 to-amber-600 text-white"
                                  : tier === "enterprise"
                                    ? "bg-gradient-to-r from-indigo-700 to-purple-700 text-white"
                                    : "bg-slate-100 text-slate-700 border border-slate-300"
                            }`}
                          >
                            {isActive ? "Current Plan" : "Available"}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
              </div>

              <div className="mt-6">
                <SubscriptionHistory storeId={Number(storeId)} allowRefund={canEditSettings} />
              </div>
            </>
          )}

          {activeTab === "menu-capacity" && (
            <div className="space-y-4">
              <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                <ChefHat className="h-5 w-5" />
                Menu & Capacity
              </h2>
              {plansLoading ? (
                <div className="flex justify-center py-12">
                  <div className="h-8 w-8 animate-spin rounded-full border-2 border-indigo-600 border-t-transparent" />
                </div>
              ) : (() => {
                const displayPlan = activePlan ?? freePlan;
                const hasLimits =
                  displayPlan &&
                  (displayPlan.max_menu_items != null ||
                    displayPlan.max_cuisines != null ||
                    displayPlan.max_menu_categories != null);
                if (displayPlan && hasLimits) {
                  return (
                    <div className="rounded-xl border border-gray-200 bg-white p-6">
                      <p className="text-sm font-medium text-emerald-700 mb-3">
                        Active plan: {displayPlan.plan_name}
                      </p>
                      <ul className="space-y-2 text-sm text-gray-700">
                        {displayPlan.max_menu_items != null && (
                          <li className="flex items-center gap-2">
                            <CheckCircle className="h-4 w-4 text-emerald-500 shrink-0" />
                            Up to {displayPlan.max_menu_items} menu items
                          </li>
                        )}
                        {displayPlan.max_cuisines != null && (
                          <li className="flex items-center gap-2">
                            <CheckCircle className="h-4 w-4 text-emerald-500 shrink-0" />
                            Up to {displayPlan.max_cuisines} cuisines
                          </li>
                        )}
                        {displayPlan.max_menu_categories != null && (
                          <li className="flex items-center gap-2">
                            <CheckCircle className="h-4 w-4 text-emerald-500 shrink-0" />
                            Up to {displayPlan.max_menu_categories} menu categories
                          </li>
                        )}
                        {displayPlan.image_upload_allowed && displayPlan.max_image_uploads != null && (
                          <li className="flex items-center gap-2">
                            <CheckCircle className="h-4 w-4 text-emerald-500 shrink-0" />
                            {displayPlan.max_image_uploads} image uploads
                          </li>
                        )}
                        {displayPlan.analytics_access && (
                          <li className="flex items-center gap-2">
                            <CheckCircle className="h-4 w-4 text-emerald-500 shrink-0" />
                            Analytics
                          </li>
                        )}
                      </ul>
                    </div>
                  );
                }
                if (displayPlan) {
                  return (
                    <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-6 text-center">
                      <h3 className="text-base font-semibold text-amber-900">Menu & Capacity not in current plan</h3>
                      <p className="mt-1 text-sm text-amber-800">
                        Your plan &quot;{displayPlan.plan_name}&quot; doesn&apos;t include menu limits. Upgrade to a higher plan to manage menu items, cuisines, and categories.
                      </p>
                    </div>
                  );
                }
                return (
                  <div className="rounded-xl border border-gray-200 bg-gray-50 p-6 text-center">
                    <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-gray-200 text-gray-500">
                      <ChefHat className="h-6 w-6" />
                    </div>
                    <h3 className="mt-3 text-base font-semibold text-gray-900">No active plan</h3>
                    <p className="mt-1 text-sm text-gray-500">
                      Subscribe to a plan from the Plans & Subscription tab to access Menu & Capacity.
                    </p>
                  </div>
                );
              })()}
            </div>
          )}

          {["riders", "pos"].includes(activeTab) && (
            <div className="py-8 text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-gray-100 text-gray-400">
                {activeTab === "riders" && <Users className="h-6 w-6" />}
                {activeTab === "pos" && <Smartphone className="h-6 w-6" />}
              </div>
              <h3 className="mt-3 text-base font-semibold text-gray-900">
                {activeTab === "riders" && "Self-Delivery Riders"}
                {activeTab === "pos" && "POS Integration"}
              </h3>
              <p className="mt-1 text-sm text-gray-500">
                {activePlan ? `Your plan: ${activePlan.plan_name}. This section will be available soon.` : "This section will be available soon."}
              </p>
            </div>
          )}
        </div>
        )}
      </div>
    </div>
  );
}
