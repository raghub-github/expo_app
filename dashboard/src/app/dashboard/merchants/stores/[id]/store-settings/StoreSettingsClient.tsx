"use client";

import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { useSearchParams } from "next/navigation";
import {
  Clock,
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
} from "lucide-react";
import { Toaster, toast } from "sonner";
import { SettingsNavBar } from "./SettingsSidebar";
import { useStoreContext } from "../StoreContext";
import { useStore } from "@/hooks/useStore";

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

type DayType = "monday" | "tuesday" | "wednesday" | "thursday" | "friday" | "saturday" | "sunday";
const DAYS: DayType[] = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];

type SelfDeliveryRider = {
  id: number;
  rider_name: string;
  rider_mobile: string;
  rider_email: string | null;
  vehicle_number: string | null;
  is_primary: boolean;
  is_active: boolean;
};

type DaySlots = { open: boolean; slot1_start: string; slot1_end: string; slot2_start: string; slot2_end: string };
function defaultDaySlots(): Record<DayType, DaySlots> {
  return DAYS.reduce((acc, day) => {
    acc[day] = { open: false, slot1_start: "", slot1_end: "", slot2_start: "", slot2_end: "" };
    return acc;
  }, {} as Record<DayType, DaySlots>);
}
function parseTime(v: unknown): string {
  if (v == null || v === "") return "";
  if (typeof v === "string") return v.slice(0, 5);
  if (v instanceof Date) return v.toTimeString().slice(0, 5);
  return String(v).slice(0, 5);
}

function timeToMinutes(s: string): number {
  if (!s || s.length < 5) return 0;
  const [h, m] = s.split(":").map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return 0;
  return h * 60 + m;
}

/** Slot duration in minutes; supports overnight (end < start => end is next day). */
function slotDurationMinutes(start: string, end: string): number {
  if (!start || !end) return 0;
  const sm = timeToMinutes(start);
  const em = timeToMinutes(end);
  if (em > sm) return em - sm;
  if (em <= sm) return 24 * 60 - sm + em; // overnight: e.g. 17:00–00:00 = 7h
  return 0;
}

function dayHasCustomSlots(s: DaySlots): boolean {
  const slot1Default = s.slot1_start === "00:00" && s.slot1_end === "23:59";
  const slot2Set = !!(s.slot2_start && s.slot2_end);
  return (s.slot1_start && s.slot1_end && !slot1Default) || slot2Set;
}

function dayDurationMinutes(
  day: DayType,
  slots: Record<DayType, DaySlots>,
  is24: boolean,
  sameForAll: boolean
): number {
  const s = sameForAll ? slots.monday : slots[day];
  if (!s.open) return 0;
  if (is24 && !dayHasCustomSlots(s)) return 24 * 60;
  let total = 0;
  if (s.slot1_start && s.slot1_end) total += slotDurationMinutes(s.slot1_start, s.slot1_end);
  if (s.slot2_start && s.slot2_end) total += slotDurationMinutes(s.slot2_start, s.slot2_end);
  return total;
}

function formatDuration(minutes: number): string {
  if (minutes <= 0) return "—";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

function Toggle({
  checked,
  onChange,
  disabled,
}: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
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

function getPlanBenefits(plan: {
  max_menu_items?: number | null;
  max_cuisines?: number | null;
  max_menu_categories?: number | null;
  image_upload_allowed?: boolean;
  max_image_uploads?: number | null;
  analytics_access?: boolean;
  advanced_analytics?: boolean;
  priority_support?: boolean;
  marketing_automation?: boolean;
  custom_api_integrations?: boolean;
  dedicated_account_manager?: boolean;
}): string[] {
  const b: string[] = [];
  if (plan.max_menu_items != null) b.push(`${plan.max_menu_items} menu items`);
  if (plan.max_cuisines != null) b.push(`${plan.max_cuisines} cuisines`);
  if (plan.max_menu_categories != null) b.push(`${plan.max_menu_categories} categories`);
  if (plan.image_upload_allowed && plan.max_image_uploads != null) b.push(`${plan.max_image_uploads} image uploads`);
  else if (plan.image_upload_allowed) b.push("Image uploads");
  if (plan.analytics_access) b.push("Analytics");
  if (plan.advanced_analytics) b.push("Advanced analytics");
  if (plan.priority_support) b.push("Priority support");
  if (plan.marketing_automation) b.push("Marketing automation");
  if (plan.custom_api_integrations) b.push("API integrations");
  if (plan.dedicated_account_manager) b.push("Dedicated manager");
  return b;
}

export function StoreSettingsClient({ storeId }: { storeId: string }) {
  const searchParams = useSearchParams();
  const { store: layoutStore } = useStoreContext();
  const { store: queryStore } = useStore(storeId);
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
  const [operatingHours, setOperatingHours] = useState<Record<string, unknown> | null>(null);
  const [storeOperations, setStoreOperations] = useState<{
    operational_status?: string;
    manual_close_until?: string | null;
    block_auto_open?: boolean;
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

  const [schedule, setSchedule] = useState<Record<string, unknown>>({});
  const [daySlots, setDaySlots] = useState<Record<DayType, DaySlots>>(defaultDaySlots());
  const [closedDays, setClosedDays] = useState<string[]>([]);
  const [applyMondayToAll, setApplyMondayToAll] = useState(false);
  const [force24Hours, setForce24Hours] = useState(false);
  const lastSavedTimingsRef = useRef<string | null>(null);
  const [savingDay, setSavingDay] = useState<DayType | null>(null);
  const [isStoreOpen, setIsStoreOpen] = useState(true);
  const [manualActivationLock, setManualActivationLock] = useState(false);
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

  const lastSavedTimings = useMemo(() => {
    try {
      return lastSavedTimingsRef.current != null
        ? (JSON.parse(lastSavedTimingsRef.current) as { daySlots: Record<DayType, DaySlots> })
        : null;
    } catch {
      return null;
    }
  }, [daySlots, savingDay]);

  /** Row is dirty only when slot times changed (not when only Open toggle changed). */
  const isRowDirty = useCallback(
    (day: DayType) => {
      if (!lastSavedTimings) return false;
      const current = applyMondayToAll ? daySlots.monday : daySlots[day];
      const saved = applyMondayToAll ? lastSavedTimings.daySlots.monday : lastSavedTimings.daySlots[day];
      return (
        current.slot1_start !== saved.slot1_start ||
        current.slot1_end !== saved.slot1_end ||
        current.slot2_start !== saved.slot2_start ||
        current.slot2_end !== saved.slot2_end
      );
    },
    [applyMondayToAll, daySlots, lastSavedTimings]
  );

  const weeklyOperatingSummary = useMemo(() => {
    if (force24Hours) {
      const openCount = DAYS.filter((d) => daySlots[d].open).length;
      return openCount === 0 ? "Closed" : openCount === 7 ? "24 hours (all days)" : "24 hours (selected days)";
    }
    const openDays = DAYS.filter((d) => daySlots[d].open);
    if (openDays.length === 0) return "Closed";
    if (applyMondayToAll && daySlots.monday.open) {
      const s = daySlots.monday;
      const range = s.slot1_start && s.slot1_end ? `${s.slot1_start}–${s.slot1_end}` : "—";
      return `Daily ${range}`;
    }
    const parts: string[] = [];
    for (const d of DAYS) {
      if (!daySlots[d].open) continue;
      const s = daySlots[d];
      const range = s.slot1_start && s.slot1_end ? `${s.slot1_start}–${s.slot1_end}` : "—";
      const label = d.slice(0, 2);
      parts.push(`${label} ${range}`);
    }
    return parts.length <= 3 ? parts.join(", ") : `${parts.length} days set`;
  }, [force24Hours, applyMondayToAll, daySlots]);

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

  const loadOperatingHours = useCallback(async (signal?: AbortSignal): Promise<void> => {
    try {
      const res = await fetch(`${base}/operating-hours`, { signal });
      if (!res.ok) return;
      const d = await res.json().catch(() => ({}));
      if (d.success) {
        setOperatingHours(d);
        setApplyMondayToAll(!!d.same_for_all_days);
        setForce24Hours(!!d.is_24_hours);
        setSchedule(d);
        setClosedDays(Array.isArray(d.closed_days) ? d.closed_days : []);
        const slots = defaultDaySlots();
        for (const day of DAYS) {
          slots[day] = {
            open: !!d[`${day}_open`],
            slot1_start: parseTime(d[`${day}_slot1_start`]),
            slot1_end: parseTime(d[`${day}_slot1_end`]),
            slot2_start: parseTime(d[`${day}_slot2_start`]),
            slot2_end: parseTime(d[`${day}_slot2_end`]),
          };
        }
        setDaySlots(slots);
        const closed = Array.isArray(d.closed_days) ? d.closed_days.slice().sort() : [];
        lastSavedTimingsRef.current = JSON.stringify({
          applyMondayToAll: !!d.same_for_all_days,
          force24Hours: !!d.is_24_hours,
          closedDays: closed,
          daySlots: DAYS.reduce((acc, day) => {
            acc[day] = slots[day];
            return acc;
          }, {} as Record<DayType, DaySlots>),
        });
      }
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") return;
      if (typeof window !== "undefined" && process.env.NODE_ENV === "development") {
        console.warn("[StoreSettings] loadOperatingHours failed:", err);
      }
    }
  }, [base]);

  const loadStoreOperations = useCallback(async (signal?: AbortSignal): Promise<void> => {
    try {
      const res = await fetch(`${base}/store-operations`, { signal });
      if (!res.ok) return;
      const d = await res.json().catch(() => ({}));
      if (d.success) {
        setStoreOperations(d);
        setIsStoreOpen(d.operational_status === "OPEN");
        setManualActivationLock(d.block_auto_open === true);
      }
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") return;
      if (typeof window !== "undefined" && process.env.NODE_ENV === "development") {
        console.warn("[StoreSettings] loadStoreOperations failed:", err);
      }
    }
  }, [base]);

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
      loadOperatingHours(ac.signal),
      loadStoreOperations(ac.signal),
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
  }, [storeId, hasCachedStore, loadStore, loadSettings, loadOperatingHours, loadStoreOperations, loadPlans]);

  const handleSaveOperations = async () => {
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

  const buildTimingsPayload = useCallback(
    (override?: {
      same_for_all_days?: boolean;
      is_24_hours?: boolean;
      closed_days?: string[];
      daySlots?: Record<DayType, DaySlots>;
    }) => {
      const same = override?.same_for_all_days ?? applyMondayToAll;
      const hours24 = override?.is_24_hours ?? force24Hours;
      const closed = override?.closed_days ?? closedDays;
      const slots = override?.daySlots ?? daySlots;
      const payload: Record<string, unknown> = {
        same_for_all_days: same,
        is_24_hours: hours24,
        closed_days: closed,
      };
      const source = same ? { ...slots.monday } : null;
      for (const day of DAYS) {
        const s = source ?? slots[day];
        payload[`${day}_open`] = s.open;
        if (!s.open) {
          payload[`${day}_slot1_start`] = s.slot1_start || null;
          payload[`${day}_slot1_end`] = s.slot1_end || null;
          payload[`${day}_slot2_start`] = s.slot2_start || null;
          payload[`${day}_slot2_end`] = s.slot2_end || null;
        } else if (hours24) {
          payload[`${day}_slot1_start`] = s.slot1_start || "00:00";
          payload[`${day}_slot1_end`] = s.slot1_end || "23:59";
          payload[`${day}_slot2_start`] = s.slot2_start || null;
          payload[`${day}_slot2_end`] = s.slot2_end || null;
        } else {
          payload[`${day}_slot1_start`] = s.slot1_start || null;
          payload[`${day}_slot1_end`] = s.slot1_end || null;
          payload[`${day}_slot2_start`] = s.slot2_start || null;
          payload[`${day}_slot2_end`] = s.slot2_end || null;
        }
      }
      return { payload, same, hours24, closed, slots };
    },
    [applyMondayToAll, force24Hours, closedDays, daySlots]
  );

  const saveTimingsToServer = useCallback(
    async (override?: {
      same_for_all_days?: boolean;
      is_24_hours?: boolean;
      closed_days?: string[];
      daySlots?: Record<DayType, DaySlots>;
    }) => {
      const { payload, same, hours24, closed, slots } = buildTimingsPayload(override);
      const res = await fetch(`${base}/operating-hours`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.success) {
        lastSavedTimingsRef.current = JSON.stringify({
          applyMondayToAll: same,
          force24Hours: hours24,
          closedDays: closed.slice().sort(),
          daySlots: DAYS.reduce((acc, day) => {
            acc[day] = slots[day];
            return acc;
          }, {} as Record<DayType, DaySlots>),
        });
        toast.success("Saved");
        loadOperatingHours();
      } else {
        toast.error(data.error || "Failed to save.");
      }
    },
    [base, buildTimingsPayload, loadOperatingHours]
  );

  const effectiveStore = (store ?? layoutStore ?? queryStore) as StoreDetail | null;
  const isDelisted = (effectiveStore?.approval_status || "").toUpperCase() === "DELISTED";

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
      await Promise.all([loadStore(), loadStoreOperations()]);
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

  const handleStoreToggle = async () => {
    if (isDelisted) {
      toast.error("This store is delisted. Relist the store before opening it.");
      return;
    }
    const action = isStoreOpen ? "manual_close" : "manual_open";
    const res = await fetch(`${base}/store-operations`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok && data.success) {
      setIsStoreOpen(!isStoreOpen);
      toast.success(isStoreOpen ? "Store closed temporarily." : "Store opened.");
      loadStoreOperations();
    } else {
      toast.error(data.error || "Failed to update.");
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
              loadOperatingHours(),
              loadStoreOperations(),
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
      <Toaster position="top-right" richColors />
      <SettingsNavBar activeTab={activeTab} onTabChange={setActiveTab} />
      <div className="flex-1 min-w-0 pt-4">
        <div className="rounded-xl border border-gray-200 bg-white p-4 sm:p-6 space-y-6">

          {activeTab === "timings" && (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                <h2 className="text-base font-semibold text-gray-900 flex items-center gap-2">
                  <Clock className="h-4 w-4 text-gray-800" />
                  Outlet timings
                </h2>
                <p className="text-sm text-gray-600 font-medium" title="Weekly operating hours">
                  {weeklyOperatingSummary}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-3 mb-3">
                <div className="flex items-center gap-2">
                  <Toggle
                    checked={applyMondayToAll}
                    onChange={(v) => {
                      if (v) {
                        const newSlots = DAYS.reduce((acc, day) => {
                          acc[day] = { ...daySlots.monday };
                          return acc;
                        }, {} as Record<DayType, DaySlots>);
                        setApplyMondayToAll(true);
                        setDaySlots(newSlots);
                        const newClosed = daySlots.monday.open ? [] : closedDays;
                        setClosedDays(newClosed);
                        saveTimingsToServer({ same_for_all_days: true, daySlots: newSlots, closed_days: newClosed });
                      } else {
                        setApplyMondayToAll(false);
                        saveTimingsToServer({ same_for_all_days: false });
                      }
                    }}
                  />
                  <span className="text-sm font-medium text-gray-900">Same for all days</span>
                </div>
                <div className="flex items-center gap-2">
                  <Toggle
                    checked={force24Hours}
                    onChange={(v) => {
                      setForce24Hours(v);
                      if (v) {
                        const newSlots = { ...daySlots };
                        for (const day of DAYS) {
                          if (newSlots[day].open) {
                            newSlots[day] = {
                              ...newSlots[day],
                              slot1_start: "00:00",
                              slot1_end: "23:59",
                              slot2_start: "",
                              slot2_end: "",
                            };
                          }
                        }
                        setDaySlots(newSlots);
                        saveTimingsToServer({ is_24_hours: true, daySlots: newSlots });
                      } else {
                        saveTimingsToServer({ is_24_hours: false });
                      }
                    }}
                  />
                  <span className="text-sm font-medium text-gray-900">Open 24 hours</span>
                </div>
              </div>
              {force24Hours && (
                <p className="text-sm text-gray-600 mb-2">Slot 1 set to 00:00–23:59 for open days. Toggle states unchanged.</p>
              )}
              <div className="overflow-x-auto rounded-lg border border-gray-200">
                <table className="w-full min-w-[680px] text-sm">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-200">
                      <th className="text-left py-1.5 px-2 font-medium text-gray-900">Day</th>
                      <th className="text-left py-1.5 px-2 font-medium text-gray-900">Open</th>
                      <th className="text-left py-1.5 px-2 font-medium text-gray-900">Slot 1 start</th>
                      <th className="text-left py-1.5 px-2 font-medium text-gray-900">Slot 1 end</th>
                      <th className="text-left py-1.5 px-2 font-medium text-gray-900">Slot 2 start</th>
                      <th className="text-left py-1.5 px-2 font-medium text-gray-900">Slot 2 end</th>
                      <th className="text-left py-1.5 px-2 font-medium text-gray-900">Duration</th>
                      <th className="text-left py-1.5 px-2 font-medium text-gray-900">Save</th>
                    </tr>
                  </thead>
                  <tbody>
                    {DAYS.map((day) => {
                        const d = day as DayType;
                        const s = applyMondayToAll ? daySlots.monday : daySlots[d];
                        const setSlot = (field: keyof DaySlots, value: string | boolean) => {
                          if (applyMondayToAll) {
                            setDaySlots((prev) => {
                              const newMonday = { ...prev.monday, [field]: value };
                              const next = { ...prev };
                              DAYS.forEach((dd) => { next[dd] = { ...newMonday }; });
                              return next;
                            });
                          } else {
                            setDaySlots((prev) => ({ ...prev, [d]: { ...prev[d], [field]: value } }));
                          }
                        };
                        const rowOpen = s.open;
                        return (
                          <tr
                            key={day}
                            className={`border-b border-gray-100 last:border-0 ${rowOpen ? "text-gray-900" : "text-gray-600"}`}
                          >
                            <td className="py-1.5 px-2 font-medium capitalize">{day}</td>
                            <td className="py-1.5 px-2">
                              <Toggle
                                checked={s.open}
                                onChange={(v) => {
                                  if (applyMondayToAll && !v) {
                                    setApplyMondayToAll(false);
                                    const newSlots = { ...daySlots };
                                    newSlots[d] = { ...newSlots[d], open: false };
                                    const newClosed = closedDays.includes(d) ? closedDays : [...closedDays, d];
                                    setClosedDays(newClosed);
                                    setDaySlots(newSlots);
                                    const turnOff24h = force24Hours && newClosed.length >= 3;
                                    if (turnOff24h) setForce24Hours(false);
                                    saveTimingsToServer({
                                      same_for_all_days: false,
                                      daySlots: newSlots,
                                      closed_days: newClosed,
                                      ...(turnOff24h ? { is_24_hours: false } : {}),
                                    });
                                    return;
                                  }
                                  setSlot("open", v);
                                  const newSlots = applyMondayToAll
                                    ? DAYS.reduce((acc, day) => {
                                        acc[day] = { ...daySlots.monday, open: v };
                                        return acc;
                                      }, {} as Record<DayType, DaySlots>)
                                    : { ...daySlots, [d]: { ...daySlots[d], open: v } };
                                  const newClosed = v
                                    ? closedDays.filter((x) => x !== d)
                                    : (closedDays.includes(d) ? closedDays : [...closedDays, d]);
                                  setClosedDays(newClosed);
                                  const turnOff24h = force24Hours && newClosed.length >= 3;
                                  if (turnOff24h) setForce24Hours(false);
                                  saveTimingsToServer({
                                    daySlots: newSlots,
                                    closed_days: newClosed,
                                    ...(turnOff24h ? { is_24_hours: false } : {}),
                                  });
                                }}
                              />
                            </td>
                            <td className="py-1.5 px-2">
                              <input
                                type="time"
                                value={s.slot1_start}
                                onChange={(e) => setSlot("slot1_start", e.target.value)}
                                className={`rounded border px-1.5 py-0.5 w-24 text-sm ${rowOpen ? "border-gray-300 text-gray-900 bg-white" : "border-gray-200 text-gray-600 bg-gray-50"}`}
                              />
                            </td>
                            <td className="py-1.5 px-2">
                              <input
                                type="time"
                                value={s.slot1_end}
                                onChange={(e) => setSlot("slot1_end", e.target.value)}
                                className={`rounded border px-1.5 py-0.5 w-24 text-sm ${rowOpen ? "border-gray-300 text-gray-900 bg-white" : "border-gray-200 text-gray-600 bg-gray-50"}`}
                              />
                            </td>
                            <td className="py-1.5 px-2">
                              <input
                                type="time"
                                value={s.slot2_start}
                                onChange={(e) => setSlot("slot2_start", e.target.value)}
                                className={`rounded border px-1.5 py-0.5 w-24 text-sm ${rowOpen ? "border-gray-300 text-gray-900 bg-white" : "border-gray-200 text-gray-600 bg-gray-50"}`}
                              />
                            </td>
                            <td className="py-1.5 px-2">
                              <input
                                type="time"
                                value={s.slot2_end}
                                onChange={(e) => setSlot("slot2_end", e.target.value)}
                                className={`rounded border px-1.5 py-0.5 w-24 text-sm ${rowOpen ? "border-gray-300 text-gray-900 bg-white" : "border-gray-200 text-gray-600 bg-gray-50"}`}
                              />
                            </td>
                            <td className="py-1.5 px-2 text-gray-700 tabular-nums">
                              {formatDuration(dayDurationMinutes(d, daySlots, force24Hours, applyMondayToAll))}
                            </td>
                            <td className="py-1.5 px-2">
                              <button
                                type="button"
                                onClick={async () => {
                                  setSavingDay(d);
                                  try {
                                    await saveTimingsToServer();
                                  } finally {
                                    setSavingDay(null);
                                  }
                                }}
                                disabled={savingDay !== null || !isRowDirty(d)}
                                className="rounded bg-gradient-to-r from-emerald-500 to-blue-500 px-2 py-1 text-xs font-medium text-white shadow-sm hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed min-w-[52px]"
                              >
                                {savingDay === d ? (
                                  <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                                ) : (
                                  "Save"
                                )}
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              <div className="mt-3">
                <p className="text-sm font-medium text-gray-900 mb-1.5">Closed days (no service)</p>
                <div className="flex flex-wrap gap-3">
                  {DAYS.map((day) => (
                    <div key={day} className="flex items-center gap-2">
                      <Toggle
                        checked={closedDays.includes(day)}
                        onChange={(on) => {
                          const d = day as DayType;
                          if (on && applyMondayToAll) {
                            setApplyMondayToAll(false);
                          }
                          const newClosed = on
                            ? (closedDays.includes(d) ? closedDays : [...closedDays, d])
                            : closedDays.filter((x) => x !== d);
                          setClosedDays(newClosed);
                          const newSlots = { ...daySlots };
                          if (on) {
                            newSlots[d] = { ...newSlots[d], open: false };
                          } else {
                            newSlots[d] = { ...newSlots[d], open: true };
                          }
                          setDaySlots(newSlots);
                          const turnOff24h = on && force24Hours && newClosed.length >= 3;
                          if (turnOff24h) setForce24Hours(false);
                          saveTimingsToServer({
                            same_for_all_days: on && applyMondayToAll ? false : undefined,
                            closed_days: newClosed,
                            daySlots: newSlots,
                            ...(turnOff24h ? { is_24_hours: false } : {}),
                          });
                        }}
                      />
                      <span className="text-sm capitalize text-gray-900">{day}</span>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}

          {activeTab === "operations" && (
            <>
              <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                <Power className="h-5 w-5" />
                Store operations
              </h2>
              <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
                {/* Left: status & basic operations card */}
                <div className="rounded-lg border border-gray-200 bg-gray-50/60 p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <h3 className="text-sm font-semibold text-gray-900">Store status & operations</h3>
                      <p className="mt-0.5 text-xs text-gray-500">
                        Open or close the store and control basic order handling.
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-2">
                      <span
                        className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ${
                          isStoreOpen ? "bg-emerald-100 text-emerald-800" : "bg-red-100 text-red-800"
                        }`}
                      >
                        {isStoreOpen ? <CheckCircle className="h-3.5 w-3.5" /> : <XCircle className="h-3.5 w-3.5" />}
                        {isStoreOpen ? "OPEN" : "CLOSED"}
                      </span>
                      <button
                        type="button"
                        onClick={handleStoreToggle}
                        className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-indigo-700"
                      >
                        {isStoreOpen ? "Close store" : "Open store"}
                      </button>
                    </div>
                  </div>

                  <div className="mt-4 space-y-3 border-t border-gray-200 pt-3">
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={autoAcceptOrders}
                        onChange={(e) => setAutoAcceptOrders(e.target.checked)}
                        className="rounded border-gray-300"
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
                          className="w-24 rounded-lg border border-gray-300 px-3 py-1.5 text-sm"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={handleSaveOperations}
                        disabled={isSaving}
                        className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
                      >
                        <Save className="h-4 w-4" />
                        {isSaving ? "Saving..." : "Save changes"}
                      </button>
                    </div>
                  </div>
                </div>

                {/* Right: Delist / Relist card (depends on status) */}
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
              </div>

              {/* Relist store modal */}
              {relistModalOpen && (
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
                      onChange={(on) => {
                        if (on) {
                          setPendingDeliveryMode({ gatimitra: true, self: false });
                          setDeliveryModeWarningOpen(true);
                        } else {
                          setPendingDeliveryMode({ gatimitra: false, self: true });
                          setDeliveryModeWarningOpen(true);
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
                  <div className="mt-auto pt-2 border-t border-gray-100">
                    <Toggle
                      checked={selfDelivery}
                      onChange={(on) => {
                        if (on) {
                          setPendingDeliveryMode({ gatimitra: false, self: true });
                          setDeliveryModeWarningOpen(true);
                        } else {
                          setPendingDeliveryMode({ gatimitra: true, self: false });
                          setDeliveryModeWarningOpen(true);
                        }
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
                        onChange={(e) => {
                          const v = e.target.value === "" ? "" : Number(e.target.value);
                          if (v === "") setDeliveryRadiusKm(5);
                          else if (!Number.isNaN(v)) setDeliveryRadiusKm(v);
                        }}
                        onBlur={() => {
                          const n = Number(deliveryRadiusKm);
                          if (Number.isNaN(n) || n < 1) setDeliveryRadiusKm(1);
                          else if (n > 50) {
                            setDeliveryRadiusKm(50);
                            toast.error("Delivery radius must be between 1 and 50 km.");
                          }
                        }}
                        className="w-20 rounded-lg border border-gray-300 px-2 py-1.5 text-sm focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                      />
                    </div>
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
              <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                <Crown className="h-5 w-5" />
                Plans & Subscription
              </h2>
              {plansLoading ? (
                <div className="flex items-center justify-center py-12">
                  <div className="h-8 w-8 animate-spin rounded-full border-2 border-indigo-600 border-t-transparent" />
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {effectivePlans.map((plan) => {
                    const isFreePlan =
                      plan.price === 0 || String(plan.plan_code || "").toLowerCase().includes("free");
                    const isActive =
                      currentSubscription != null
                        ? currentSubscription.plan_id === plan.id
                        : isFreePlan;
                    const activeFrom = currentSubscription?.active_from;
                    const expiryDate = currentSubscription?.expiry_date;
                    const benefits = getPlanBenefits(plan);
                    return (
                      <div
                        key={plan.id}
                        className={`relative rounded-xl border-2 p-3 sm:p-4 flex flex-col transition-all duration-200 ${
                          isActive
                            ? "border-amber-400 bg-gradient-to-b from-amber-50/90 to-white shadow-md shadow-amber-500/15 ring-2 ring-amber-400 ring-offset-2"
                            : "border-gray-200 bg-white hover:border-gray-300 hover:shadow shadow-sm"
                        }`}
                      >
                        {plan.is_popular && !isActive && (
                          <div className="absolute -top-2 left-1/2 -translate-x-1/2">
                            <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-800 border border-amber-200">
                              Popular
                            </span>
                          </div>
                        )}
                        <div className="flex items-start justify-between gap-2 mb-1.5">
                          <div>
                            <h3 className="font-bold text-gray-900 text-base">{plan.plan_name}</h3>
                            <p className="text-[10px] text-gray-500 uppercase tracking-wide">{plan.plan_code}</p>
                          </div>
                          {isActive && (
                            <span className="shrink-0 inline-flex items-center rounded-full bg-amber-500 px-2 py-0.5 text-[10px] font-semibold text-white">
                              Active
                            </span>
                          )}
                        </div>
                        {plan.description && (
                          <p className="text-xs text-gray-600 mb-2 line-clamp-2">{plan.description}</p>
                        )}
                        <p className="text-lg font-bold text-gray-900 mb-2">
                          ₹{Number(plan.price).toFixed(2)}
                          <span className="text-xs font-normal text-gray-500"> / {plan.billing_cycle?.toLowerCase() ?? "month"}</span>
                        </p>
                        <div className="mt-2 pt-2 border-t border-gray-100">
                          <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                            {benefits.length} benefit{benefits.length !== 1 ? "s" : ""}
                          </p>
                          <ul className="space-y-1 text-xs text-gray-600">
                            {benefits.map((label, i) => (
                              <li key={i} className="flex items-center gap-1.5">
                                <CheckCircle className={`h-3.5 w-3.5 shrink-0 ${isActive ? "text-amber-600" : "text-gray-400"}`} />
                                <span>{label}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                        {isActive && (activeFrom || expiryDate) && (
                          <div className="mt-2 pt-2 border-t border-amber-100 text-[11px] text-gray-600 space-y-0.5">
                            {activeFrom && (
                              <p>
                                Active from:{" "}
                                {new Date(activeFrom).toLocaleDateString("en-IN", {
                                  day: "2-digit",
                                  month: "short",
                                  year: "numeric",
                                })}
                              </p>
                            )}
                            {expiryDate ? (
                              <p>
                                Expires:{" "}
                                {new Date(expiryDate).toLocaleDateString("en-IN", {
                                  day: "2-digit",
                                  month: "short",
                                  year: "numeric",
                                })}
                              </p>
                            ) : (
                              <p>Expires: —</p>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
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
      </div>
    </div>
  );
}
