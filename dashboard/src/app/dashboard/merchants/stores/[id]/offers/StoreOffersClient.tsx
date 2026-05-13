"use client";

import React, { useState, useEffect, useRef, useMemo } from "react";
import {
  Plus, Edit2, Trash2, Zap, X, Calendar, Percent, DollarSign,
  Tag, Gift, User, Clock, ShoppingBag, Copy, Search, Check,
  Sparkles, ChevronDown, Truck, Package, BarChart2,
} from "lucide-react";
import { createPortal } from "react-dom";
import { useToast } from "@/context/ToastContext";
import type { AllOfferTypes, Offer, MenuItemForOffer, OfferTier } from "./offers-types";

const DAYS = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"] as const;
type Day = typeof DAYS[number];
const DAY_LABELS: Record<Day, string> = {
  MON: "Mon", TUE: "Tue", WED: "Wed", THU: "Thu", FRI: "Fri", SAT: "Sat", SUN: "Sun",
};

interface OfferTypeMeta {
  type: AllOfferTypes;
  label: string;
  icon: React.ReactNode;
  badgeClass: string;
}

const ALL_OFFER_TYPES: OfferTypeMeta[] = [
  { type: "PERCENTAGE",     label: "% Off Items",                icon: <Percent size={14} className="text-green-600" />,   badgeClass: "bg-gradient-to-r from-emerald-500 to-green-600" },
  { type: "FLAT",           label: "Flat ₹ Off Items",           icon: <DollarSign size={14} className="text-blue-600" />, badgeClass: "bg-gradient-to-r from-blue-500 to-cyan-600" },
  { type: "CART_PERCENTAGE",label: "% Off Entire Cart",          icon: <Percent size={14} className="text-emerald-600" />, badgeClass: "bg-gradient-to-r from-teal-500 to-emerald-600" },
  { type: "CART_FLAT",      label: "Flat ₹ Off Entire Cart",     icon: <DollarSign size={14} className="text-cyan-600" />, badgeClass: "bg-gradient-to-r from-cyan-500 to-blue-600" },
  { type: "BUY_X_GET_Y",   label: "Buy X Get Y Free",           icon: <Gift size={14} className="text-purple-600" />,     badgeClass: "bg-gradient-to-r from-purple-500 to-violet-600" },
  { type: "BUY_N_GET_M",   label: "Buy N Get M Free",           icon: <Gift size={14} className="text-violet-600" />,     badgeClass: "bg-gradient-to-r from-violet-500 to-purple-600" },
  { type: "BOGO",           label: "Buy 1 Get 1 Free",           icon: <Gift size={14} className="text-fuchsia-600" />,    badgeClass: "bg-gradient-to-r from-fuchsia-500 to-pink-600" },
  { type: "FREE_ITEM",      label: "Free Item",                  icon: <User size={14} className="text-orange-600" />,     badgeClass: "bg-gradient-to-r from-amber-500 to-orange-600" },
  { type: "FREE_DELIVERY",  label: "Free Delivery",              icon: <Truck size={14} className="text-teal-600" />,      badgeClass: "bg-gradient-to-r from-teal-500 to-cyan-600" },
  { type: "BUNDLE",         label: "Bundle Deal",                icon: <Package size={14} className="text-indigo-600" />,  badgeClass: "bg-gradient-to-r from-indigo-500 to-blue-600" },
  { type: "TIERED",         label: "Tiered (Spend More Save More)", icon: <BarChart2 size={14} className="text-rose-600" />, badgeClass: "bg-gradient-to-r from-rose-500 to-red-600" },
  { type: "COUPON",         label: "Coupon Code",                icon: <Tag size={14} className="text-red-600" />,         badgeClass: "bg-gradient-to-r from-rose-500 to-pink-600" },
];

const OFFER_TYPE_MAP: Record<AllOfferTypes, OfferTypeMeta> = Object.fromEntries(
  ALL_OFFER_TYPES.map((o) => [o.type, o])
) as Record<AllOfferTypes, OfferTypeMeta>;

function getOfferBadgeClass(type: AllOfferTypes) {
  return OFFER_TYPE_MAP[type]?.badgeClass ?? "bg-gradient-to-r from-gray-500 to-gray-600";
}
function getOfferIcon(type: AllOfferTypes) {
  return OFFER_TYPE_MAP[type]?.icon ?? <Zap size={16} className="text-yellow-600" />;
}
function getOfferTypeLabel(type: AllOfferTypes) {
  return OFFER_TYPE_MAP[type]?.label ?? type;
}

function getOfferDisplayDescription(offer: Offer): string {
  switch (offer.offer_type) {
    case "PERCENTAGE":
    case "CART_PERCENTAGE":
      return `${offer.discount_percentage ?? offer.discount_value ?? ""}% OFF${offer.min_order_amount ? ` on orders above ₹${offer.min_order_amount}` : ""}`;
    case "FLAT":
    case "CART_FLAT":
      return `Flat ₹${offer.discount_value ?? ""} OFF${offer.min_order_amount ? ` on orders above ₹${offer.min_order_amount}` : ""}`;
    case "BUY_X_GET_Y":
    case "BUY_N_GET_M":
    case "BOGO":
      return `Buy ${offer.buy_quantity ?? 1} Get ${offer.get_quantity ?? 1} Free`;
    case "COUPON":
      return `Code: ${offer.coupon_code ?? "—"}${offer.discount_percentage ? ` — ${offer.discount_percentage}% OFF` : offer.discount_value ? ` — ₹${offer.discount_value} OFF` : ""}`;
    case "FREE_DELIVERY":
      return `Free Delivery${offer.min_order_amount ? ` on orders above ₹${offer.min_order_amount}` : ""}`;
    case "FREE_ITEM":
      return `Free Item${offer.min_order_amount ? ` on orders above ₹${offer.min_order_amount}` : ""}`;
    case "BUNDLE":
      return offer.offer_description ?? "Bundle Deal";
    case "TIERED":
      return "Tiered discount (spend more, save more)";
    default:
      return offer.offer_description ?? "";
  }
}

function getStatusColor(offer: Offer) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const vf = new Date(offer.valid_from);
  const vt = new Date(offer.valid_till);
  const validFrom = new Date(vf.getFullYear(), vf.getMonth(), vf.getDate());
  const validTill = new Date(vt.getFullYear(), vt.getMonth(), vt.getDate());
  if (validTill < today) return { bg: "bg-gray-100", text: "text-gray-700", label: "EXPIRED" };
  if (!offer.is_active) return { bg: "bg-yellow-50", text: "text-amber-700", label: "INACTIVE" };
  if (validFrom > today) return { bg: "bg-blue-50", text: "text-blue-700", label: "UPCOMING" };
  return { bg: "bg-green-50", text: "text-green-700", label: "ACTIVE" };
}

const defaultForm = {
  offer_title: "",
  offer_description: "",
  offer_type: "PERCENTAGE" as AllOfferTypes,
  offer_sub_type: "ALL_ORDERS" as Offer["offer_sub_type"],
  menu_item_ids: [] as string[],
  offer_image_aspect_ratio: null as number | null,
  discount_value: "",
  discount_percentage: "",
  max_discount_amount: "",
  min_order_amount: "",
  max_order_amount: "",
  buy_quantity: "",
  get_quantity: "",
  coupon_code: "",
  max_uses_total: "",
  max_uses_per_user: "",
  is_stackable: false,
  priority: "",
  first_order_only: false,
  new_user_only: false,
  applicable_time_start: "",
  applicable_time_end: "",
  valid_from: "",
  valid_till: "",
};

const emptyTier = (): OfferTier => ({ min_order: "", discount_pct: "", discount_flat: "" });

export function StoreOffersClient({ storeId }: { storeId: string }) {
  const { toast } = useToast();
  const [storeName, setStoreName] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [offers, setOffers] = useState<Offer[]>([]);
  const [menuItems, setMenuItems] = useState<MenuItemForOffer[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [expandedOfferItems, setExpandedOfferItems] = useState<Record<string, boolean>>({});
  const [isSaving, setIsSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<"basic" | "details" | "validity">("basic");
  const [formData, setFormData] = useState(defaultForm);
  const [tiers, setTiers] = useState<OfferTier[]>([emptyTier()]);
  const [applicableOnDays, setApplicableOnDays] = useState<Set<Day>>(new Set());
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [existingOfferImageUrl, setExistingOfferImageUrl] = useState<string | null>(null);
  const [showOfferTypeDropdown, setShowOfferTypeDropdown] = useState(false);
  const [showApplyToDropdown, setShowApplyToDropdown] = useState(false);
  const [menuItemSearch, setMenuItemSearch] = useState("");
  const [showMenuItemSuggestions, setShowMenuItemSuggestions] = useState(false);
  const [generatedCouponCode, setGeneratedCouponCode] = useState("");
  const [isGeneratingCoupon, setIsGeneratingCoupon] = useState(false);
  const offerTypeRef = useRef<HTMLDivElement>(null);
  const applyToRef = useRef<HTMLDivElement>(null);
  const menuItemSuggestionsRef = useRef<HTMLDivElement>(null);

  const filteredMenuItems = menuItemSearch.trim() === ""
    ? menuItems
    : menuItems.filter((item) => item.item_name.toLowerCase().includes(menuItemSearch.toLowerCase()));

  const offersByItemId = useMemo(() => {
    const now = new Date();
    const map = new Map<string, { totalCount: number; activeCount: number }>();
    offers.forEach((offer) => {
      if (offer.offer_sub_type !== "SPECIFIC_ITEM" || !offer.menu_item_ids?.length) return;
      const isWithinDates = new Date(offer.valid_from) <= now && now <= new Date(offer.valid_till);
      const isActive = Boolean(offer.is_active && isWithinDates);
      offer.menu_item_ids.forEach((itemId) => {
        const prev = map.get(itemId) ?? { totalCount: 0, activeCount: 0 };
        prev.totalCount += 1;
        if (isActive) prev.activeCount += 1;
        map.set(itemId, prev);
      });
    });
    return map;
  }, [offers]);

  const getItemPrice = (item: MenuItemForOffer): number | null => {
    const raw = item.selling_price ?? item.base_price ?? item.actual_price ?? null;
    const n = typeof raw === "string" ? Number(raw) : raw;
    return typeof n === "number" && Number.isFinite(n) ? n : null;
  };

  const isItemEligibleForCurrentOffer = (item: MenuItemForOffer): boolean => {
    if (formData.offer_type !== "FLAT") return true;
    const stats = offersByItemId.get(item.item_id);
    return !stats || stats.totalCount === 0;
  };

  useEffect(() => {
    if (!storeId) { setIsLoading(false); return; }
    let cancelled = false;
    setIsLoading(true);
    Promise.all([
      fetch(`/api/merchant/stores/${storeId}/offers`).then((r) => (r.ok ? r.json() : null)),
      fetch(`/api/merchant/stores/${storeId}/menu`).then((r) => (r.ok ? r.json() : null)),
    ])
      .then(([offersRes, menuRes]) => {
        if (cancelled) return;
        if (offersRes?.success && offersRes.offers) {
          setOffers(Array.isArray(offersRes.offers) ? offersRes.offers : []);
          if (offersRes.store_name) setStoreName(offersRes.store_name);
        } else {
          setOffers([]);
        }
        const items = menuRes?.items ?? menuRes?.data?.items ?? [];
        setMenuItems(Array.isArray(items) ? items : []);
      })
      .catch(() => { if (!cancelled) setOffers([]); })
      .finally(() => { if (!cancelled) setIsLoading(false); });
    return () => { cancelled = true; };
  }, [storeId]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (showOfferTypeDropdown && offerTypeRef.current && !offerTypeRef.current.contains(target)) setShowOfferTypeDropdown(false);
      if (showApplyToDropdown && applyToRef.current && !applyToRef.current.contains(target)) setShowApplyToDropdown(false);
      if (showMenuItemSuggestions && menuItemSuggestionsRef.current && !menuItemSuggestionsRef.current.contains(target)) setShowMenuItemSuggestions(false);
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showOfferTypeDropdown, showApplyToDropdown, showMenuItemSuggestions]);

  useEffect(() => {
    if (formData.offer_type === "COUPON" && !generatedCouponCode && !editingId) generateCoupon();
  }, [formData.offer_type]);

  function generateCoupon() {
    setIsGeneratingCoupon(true);
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    let coupon = "";
    for (let i = 0; i < 8; i++) coupon += chars.charAt(Math.floor(Math.random() * chars.length));
    coupon = coupon.slice(0, 4) + "-" + coupon.slice(4);
    const prefix = storeName ? storeName.substring(0, 3).toUpperCase() : "OFF";
    const finalCode = `${prefix}-${coupon}`;
    setTimeout(() => {
      setGeneratedCouponCode(finalCode);
      setIsGeneratingCoupon(false);
      toast("Coupon code generated!");
    }, 300);
  }

  const handleInputChange = (field: keyof typeof formData) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setFormData((prev) => ({ ...prev, [field]: e.target.value }));

  const handleNumberInputChange = (field: keyof typeof formData) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    if (value === "" || /^\d*\.?\d*$/.test(value)) setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleToggle = (field: "is_stackable" | "first_order_only" | "new_user_only") =>
    setFormData((prev) => ({ ...prev, [field]: !prev[field] }));

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImageFile(file);
    const reader = new FileReader();
    reader.onloadend = () => {
      const url = reader.result as string;
      setImagePreview(url);
      setFormData((prev) => ({ ...prev, offer_image_aspect_ratio: prev.offer_image_aspect_ratio ?? 2 }));
      const img = new window.Image();
      img.onload = () => {
        const w = img.naturalWidth;
        const h = img.naturalHeight;
        if (w > 0 && h > 0) setFormData((prev) => ({ ...prev, offer_image_aspect_ratio: Number((w / h).toFixed(4)) }));
      };
      img.src = url;
    };
    reader.readAsDataURL(file);
  };

  const handleOpenModal = (offer?: Offer) => {
    if (offer) {
      setEditingId((offer.id ?? parseInt(String(offer.offer_id), 10)) || null);
      const meta = (offer.offer_metadata as Record<string, unknown>) ?? {};
      setFormData({
        offer_title: offer.offer_title,
        offer_description: offer.offer_description || "",
        offer_type: offer.offer_type,
        offer_sub_type: offer.offer_sub_type,
        menu_item_ids: offer.menu_item_ids || [],
        offer_image_aspect_ratio: offer.offer_image_aspect_ratio ?? (offer.image_url ? 2 : null),
        discount_value: offer.discount_value?.toString() ?? "",
        discount_percentage: offer.discount_percentage?.toString() ?? "",
        max_discount_amount: offer.max_discount_amount?.toString() ?? "",
        min_order_amount: offer.min_order_amount?.toString() ?? "",
        max_order_amount: offer.max_order_amount?.toString() ?? "",
        buy_quantity: offer.buy_quantity?.toString() ?? "",
        get_quantity: offer.get_quantity?.toString() ?? "",
        coupon_code: offer.coupon_code ?? "",
        max_uses_total: offer.max_uses_total?.toString() ?? "",
        max_uses_per_user: offer.max_uses_per_user?.toString() ?? "",
        is_stackable: offer.is_stackable ?? false,
        priority: offer.priority?.toString() ?? "",
        first_order_only: offer.first_order_only ?? false,
        new_user_only: offer.new_user_only ?? false,
        applicable_time_start: offer.applicable_time_start ?? "",
        applicable_time_end: offer.applicable_time_end ?? "",
        valid_from: offer.valid_from.split("T")[0],
        valid_till: offer.valid_till.split("T")[0],
      });
      // Restore tiers
      const savedTiers = Array.isArray(meta.tiers) ? (meta.tiers as Array<{ min_order?: number; discount_pct?: number; discount_flat?: number }>) : [];
      setTiers(savedTiers.length > 0 ? savedTiers.map((t) => ({ min_order: String(t.min_order ?? ""), discount_pct: String(t.discount_pct ?? ""), discount_flat: String(t.discount_flat ?? "") })) : [emptyTier()]);
      // Restore applicable days
      const savedDays = Array.isArray(offer.applicable_on_days) ? offer.applicable_on_days : [];
      setApplicableOnDays(new Set(savedDays.filter((d): d is Day => DAYS.includes(d as Day))));
      setImagePreview(offer.image_url || null);
      setExistingOfferImageUrl(offer.image_url || null);
      if (offer.offer_type === "COUPON") setGeneratedCouponCode(offer.coupon_code || "");
    } else {
      setEditingId(null);
      setFormData(defaultForm);
      setTiers([emptyTier()]);
      setApplicableOnDays(new Set());
      setImagePreview(null);
      setExistingOfferImageUrl(null);
      setGeneratedCouponCode("");
    }
    setImageFile(null);
    setShowOfferTypeDropdown(false);
    setShowApplyToDropdown(false);
    setShowMenuItemSuggestions(false);
    setMenuItemSearch("");
    setShowModal(true);
    setActiveTab("basic");
  };

  const resetForm = () => {
    setFormData(defaultForm);
    setTiers([emptyTier()]);
    setApplicableOnDays(new Set());
    setImageFile(null);
    setImagePreview(null);
    setExistingOfferImageUrl(null);
    setEditingId(null);
    setActiveTab("basic");
    setShowOfferTypeDropdown(false);
    setShowApplyToDropdown(false);
    setMenuItemSearch("");
    setGeneratedCouponCode("");
  };

  const buildMetadata = (): Record<string, unknown> | null => {
    const meta: Record<string, unknown> = {};
    if (formData.offer_sub_type === "SPECIFIC_ITEM" && formData.menu_item_ids.length > 0) {
      meta.menu_item_ids = formData.menu_item_ids;
    }
    if (formData.offer_type === "TIERED") {
      const validTiers = tiers.filter((t) => t.min_order !== "" && (t.discount_pct !== "" || t.discount_flat !== "")).map((t) => ({
        min_order: Number(t.min_order),
        ...(t.discount_pct !== "" ? { discount_pct: Number(t.discount_pct) } : {}),
        ...(t.discount_flat !== "" ? { discount_flat: Number(t.discount_flat) } : {}),
      }));
      meta.tiers = validTiers;
    }
    return Object.keys(meta).length > 0 ? meta : null;
  };

  const handleSaveOffer = async () => {
    if (!storeId) { toast("Store context not loaded."); return; }
    if (!formData.offer_title.trim()) { toast("Offer title is required"); return; }
    if (!formData.valid_from || !formData.valid_till) { toast("Valid dates are required"); return; }
    const today = new Date(); today.setHours(0, 0, 0, 0);
    if (new Date(formData.valid_from) < today) { toast("Offer start date cannot be before today"); return; }
    if (new Date(formData.valid_till) < new Date(formData.valid_from)) { toast("End date must be after start date"); return; }
    if (formData.offer_sub_type === "SPECIFIC_ITEM" && formData.menu_item_ids.length === 0) {
      toast("Please select at least one menu item when applying to specific items"); return;
    }
    if (formData.offer_type === "COUPON" && !generatedCouponCode && !formData.coupon_code) {
      toast("Please generate or enter a coupon code"); return;
    }

    const isPercentageType = ["PERCENTAGE", "CART_PERCENTAGE"].includes(formData.offer_type);
    const meta = buildMetadata();

    const payload: Record<string, unknown> = {
      offer_title: formData.offer_title.trim(),
      offer_description: formData.offer_description || null,
      offer_type: formData.offer_type,
      offer_sub_type: formData.offer_sub_type,
      menu_item_ids: formData.offer_sub_type === "SPECIFIC_ITEM" && formData.menu_item_ids.length > 0 ? formData.menu_item_ids : null,
      ...(formData.offer_image_aspect_ratio != null ? { offer_image_aspect_ratio: formData.offer_image_aspect_ratio } : {}),
      discount_percentage: isPercentageType && formData.discount_percentage !== "" ? formData.discount_percentage
        : formData.offer_type === "COUPON" && formData.discount_percentage !== "" ? formData.discount_percentage
        : null,
      discount_value: !isPercentageType && formData.discount_value !== "" ? formData.discount_value : null,
      max_discount_amount: formData.max_discount_amount !== "" ? formData.max_discount_amount : null,
      min_order_amount: formData.min_order_amount !== "" ? formData.min_order_amount : null,
      max_order_amount: formData.max_order_amount !== "" ? formData.max_order_amount : null,
      buy_quantity: formData.buy_quantity ? parseInt(formData.buy_quantity, 10) : null,
      get_quantity: formData.get_quantity ? parseInt(formData.get_quantity, 10) : null,
      coupon_code: formData.offer_type === "COUPON" ? (generatedCouponCode || formData.coupon_code || null) : null,
      max_uses_total: formData.max_uses_total !== "" ? parseInt(formData.max_uses_total, 10) : null,
      max_uses_per_user: formData.max_uses_per_user !== "" ? parseInt(formData.max_uses_per_user, 10) : null,
      is_stackable: formData.is_stackable,
      priority: formData.priority !== "" ? parseInt(formData.priority, 10) : 0,
      first_order_only: formData.first_order_only,
      new_user_only: formData.new_user_only,
      applicable_on_days: applicableOnDays.size > 0 ? Array.from(applicableOnDays) : null,
      applicable_time_start: formData.applicable_time_start || null,
      applicable_time_end: formData.applicable_time_end || null,
      offer_metadata: meta,
      valid_from: new Date(formData.valid_from).toISOString(),
      valid_till: new Date(formData.valid_till).toISOString(),
      is_active: true,
    };

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "X-Source-Platform": "AGENT_DASHBOARD",
    };

    setIsSaving(true);
    try {
      if (editingId != null) {
        const res = await fetch(`/api/merchant/stores/${storeId}/offers/${editingId}`, {
          method: "PATCH", headers, body: JSON.stringify(payload),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) { toast(data?.error || "Failed to update offer"); return; }
        if (imageFile && data?.offer?.offer_id) {
          try {
            const form = new FormData();
            form.append("file", imageFile);
            form.append("offerId", String(data.offer.offer_id));
            if (existingOfferImageUrl) form.append("currentImageUrl", String(existingOfferImageUrl));
            const upRes = await fetch(`/api/merchant/stores/${storeId}/offers/upload-image`, { method: "POST", body: form });
            const up = await upRes.json().catch(() => ({}));
            if (upRes.ok && up?.url) {
              const patchRes = await fetch(`/api/merchant/stores/${storeId}/offers/${editingId}`, {
                method: "PATCH", headers, body: JSON.stringify({ offer_image_url: up.url }),
              });
              const patched = await patchRes.json().catch(() => ({}));
              if (patchRes.ok && patched?.offer) setOffers((prev) => prev.map((o) => (o.id === editingId ? { ...o, ...patched.offer } : o)));
            }
          } catch { /* best effort */ }
        }
        setOffers((prev) => prev.map((o) => (o.id === editingId ? { ...o, ...payload, ...data.offer } : o)));
        toast("Offer updated successfully!");
      } else {
        const res = await fetch(`/api/merchant/stores/${storeId}/offers`, {
          method: "POST", headers, body: JSON.stringify(payload),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) { toast(data?.error || "Failed to create offer"); return; }
        let created = data.offer ?? null;
        if (created && imageFile && created.offer_id) {
          try {
            const form = new FormData();
            form.append("file", imageFile);
            form.append("offerId", String(created.offer_id));
            const upRes = await fetch(`/api/merchant/stores/${storeId}/offers/upload-image`, { method: "POST", body: form });
            const up = await upRes.json().catch(() => ({}));
            if (upRes.ok && up?.url) {
              const patchRes = await fetch(`/api/merchant/stores/${storeId}/offers/${created.id}`, {
                method: "PATCH", headers, body: JSON.stringify({ offer_image_url: up.url }),
              });
              const patched = await patchRes.json().catch(() => ({}));
              if (patchRes.ok && patched?.offer) created = { ...created, ...patched.offer };
            }
          } catch { /* best effort */ }
        }
        if (created) setOffers((prev) => [{ ...created, id: created.id }, ...prev]);
        toast("Offer created successfully!");
      }
      setShowModal(false);
      resetForm();
    } catch {
      toast("Error saving offer");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteOffer = async (offer: Offer) => {
    const id = offer.id ?? parseInt(String(offer.offer_id), 10);
    if (!id || !window.confirm("Are you sure you want to delete this offer?")) return;
    try {
      const res = await fetch(`/api/merchant/stores/${storeId}/offers/${id}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { toast(data?.error || "Failed to delete offer"); return; }
      setOffers((prev) => prev.filter((o) => (o.id ?? parseInt(String(o.offer_id), 10)) !== id));
      toast("Offer deleted successfully!");
    } catch { toast("Error deleting offer"); }
  };

  const copyToClipboard = (text: string) => { navigator.clipboard.writeText(text); toast("Copied to clipboard!"); };
  const toggleMenuItemSelection = (itemId: string) => setFormData((prev) => {
    const isSelected = prev.menu_item_ids.includes(itemId);
    return { ...prev, menu_item_ids: isSelected ? prev.menu_item_ids.filter((id) => id !== itemId) : [...prev.menu_item_ids, itemId] };
  });
  const getMenuItemName = (itemId: string) => menuItems.find((m) => m.item_id === itemId)?.item_name ?? "Unknown Item";
  const toggleOfferItemsExpanded = (offerKey: string) => setExpandedOfferItems((prev) => ({ ...prev, [offerKey]: !prev[offerKey] }));

  const handleOfferTypeChange = (type: AllOfferTypes) => {
    setFormData((prev) => ({ ...prev, offer_type: type }));
    setShowOfferTypeDropdown(false);
    if (type !== "COUPON") setGeneratedCouponCode("");
    if (type === "TIERED" && tiers.length === 0) setTiers([emptyTier()]);
  };

  const toggleDay = (day: Day) => setApplicableOnDays((prev) => {
    const next = new Set(prev);
    if (next.has(day)) next.delete(day); else next.add(day);
    return next;
  });

  const updateTier = (index: number, field: keyof OfferTier, value: string) =>
    setTiers((prev) => prev.map((t, i) => i === index ? { ...t, [field]: value } : t));

  const addTier = () => setTiers((prev) => [...prev, emptyTier()]);
  const removeTier = (index: number) => setTiers((prev) => prev.filter((_, i) => i !== index));

  if (isLoading) return (
    <div className="flex items-center justify-center py-12">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-orange-600 border-t-transparent" />
    </div>
  );

  const needsBuyGet = ["BUY_X_GET_Y", "BUY_N_GET_M", "BOGO"].includes(formData.offer_type);
  const needsDiscountPct = ["PERCENTAGE", "CART_PERCENTAGE"].includes(formData.offer_type);
  const needsDiscountFlat = ["FLAT", "CART_FLAT"].includes(formData.offer_type);
  const needsCoupon = formData.offer_type === "COUPON";
  const needsTiers = formData.offer_type === "TIERED";
  const isFreeDelivery = formData.offer_type === "FREE_DELIVERY";

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
      <div className="bg-white border-b border-gray-200 shadow-sm px-4 md:px-6 py-4 md:py-5">
        <div className="flex items-center gap-3 md:gap-4">
          <div className="flex-1 min-w-0">
            <h1 className="text-xl sm:text-2xl md:text-3xl font-bold text-gray-900 bg-gradient-to-r from-orange-600 to-red-600 bg-clip-text text-transparent">
              Offers & Promotions
            </h1>
            <p className="text-gray-600 mt-1 text-sm md:text-base flex items-center gap-2">
              <ShoppingBag size={16} />
              Manage offers for <span className="font-semibold text-orange-600">{storeName || "your store"}</span>
            </p>
          </div>
          <button
            onClick={() => handleOpenModal()}
            className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-orange-500 to-red-500 text-white font-bold rounded-lg hover:from-orange-600 hover:to-red-600 transition-all text-sm shadow-lg hover:shadow-xl"
          >
            <Plus size={18} />Create Offer
          </button>
        </div>
      </div>

      <div className="px-4 md:px-6 py-6">
        {offers.length === 0 ? (
          <div className="bg-white rounded-2xl border-2 border-dashed border-gray-300 p-8 md:p-12 text-center max-w-2xl mx-auto">
            <div className="w-20 h-20 bg-gradient-to-br from-orange-100 to-red-100 rounded-full flex items-center justify-center mx-auto mb-6">
              <Zap size={32} className="text-orange-500" />
            </div>
            <h3 className="text-xl font-bold text-gray-900 mb-3">No offers created yet</h3>
            <p className="text-gray-600 mb-8 max-w-md mx-auto">Create your first offer to attract more customers and boost your sales</p>
            <button onClick={() => handleOpenModal()} className="px-6 py-3 bg-gradient-to-r from-orange-500 to-red-500 text-white rounded-xl hover:from-orange-600 hover:to-red-600 font-semibold shadow-lg hover:shadow-xl transition-all">
              Create First Offer
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {offers.map((offer) => {
              const now = new Date();
              const vf = new Date(offer.valid_from);
              const vt = new Date(offer.valid_till);
              const validFrom = new Date(vf.getFullYear(), vf.getMonth(), vf.getDate());
              const validTill = new Date(vt.getFullYear(), vt.getMonth(), vt.getDate());
              let statusLabel = "";
              if (now < validFrom) {
                const startsIn = Math.ceil((validFrom.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
                statusLabel = `Starts in ${startsIn}d`;
              } else if (now > validTill) {
                statusLabel = "Expired";
              } else {
                const daysLeft = Math.ceil((validTill.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
                statusLabel = `${daysLeft} day${daysLeft !== 1 ? "s" : ""} left`;
              }
              const status = getStatusColor(offer);
              const badgeClass = getOfferBadgeClass(offer.offer_type);
              const offerKey = String(offer.offer_id ?? offer.id ?? "");
              const itemNames = offer.offer_sub_type === "SPECIFIC_ITEM" && offer.menu_item_ids?.length
                ? offer.menu_item_ids.map((id) => getMenuItemName(id)) : [];
              const isExpanded = expandedOfferItems[offerKey] ?? false;
              const itemsToShow = isExpanded ? itemNames : itemNames.slice(0, 3);
              const imageAspectRatio = offer.offer_image_aspect_ratio != null && offer.offer_image_aspect_ratio > 0 ? offer.offer_image_aspect_ratio : 2;
              return (
                <div key={offer.offer_id} className={`bg-white rounded-xl shadow-sm border border-gray-200 hover:shadow-lg transition-all duration-300 hover:-translate-y-0.5 group relative overflow-hidden ${statusLabel === "Expired" ? "opacity-80" : ""}`} style={{ maxWidth: 340 }}>
                  <div className={`absolute top-0 left-0 right-0 h-1 ${badgeClass}`} />
                  <div className="p-2">
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1 mb-0.5">
                          {getOfferIcon(offer.offer_type)}
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${status.bg} ${status.text}`}>{status.label}</span>
                        </div>
                        <h3 className="font-bold text-gray-900 text-xs truncate group-hover:text-orange-600 transition-colors">{offer.offer_title}</h3>
                        <p className="text-[9px] text-gray-400 font-mono">{getOfferTypeLabel(offer.offer_type)}</p>
                      </div>
                      <div className="flex-shrink-0">
                        <span className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-[9px] font-semibold ${offer.offer_sub_type === "SPECIFIC_ITEM" ? "bg-indigo-50 text-indigo-700" : "bg-blue-50 text-blue-700"}`}>
                          {offer.offer_sub_type === "SPECIFIC_ITEM" ? `Items (${offer.menu_item_ids?.length ?? 0})` : "All Orders"}
                        </span>
                      </div>
                    </div>

                    {offer.offer_sub_type === "SPECIFIC_ITEM" && itemsToShow.length > 0 && (
                      <div className="mb-2">
                        {itemsToShow.map((name, idx) => (
                          <div key={`${offerKey}-${idx}`} className="text-[10px] text-gray-700 truncate">• {name}</div>
                        ))}
                        {!isExpanded && itemNames.length > 3 && (
                          <button type="button" onClick={() => toggleOfferItemsExpanded(offerKey)} className="text-[10px] font-semibold text-orange-600">View all ({itemNames.length})</button>
                        )}
                        {isExpanded && itemNames.length > 3 && (
                          <button type="button" onClick={() => toggleOfferItemsExpanded(offerKey)} className="text-[10px] font-semibold text-orange-600">View fewer</button>
                        )}
                      </div>
                    )}

                    {offer.offer_type === "COUPON" && offer.coupon_code && (
                      <div className="mb-2 flex items-center justify-between bg-gray-50 border border-gray-200 rounded-lg px-2 py-1.5">
                        <code className="text-xs font-bold text-gray-900 font-mono tracking-wider">{offer.coupon_code}</code>
                        <button type="button" onClick={() => copyToClipboard(offer.coupon_code!)} className="text-gray-400 hover:text-orange-600">
                          <Copy size={11} />
                        </button>
                      </div>
                    )}

                    <p className="text-xs font-bold text-gray-800 mb-1">{getOfferDisplayDescription(offer)}</p>
                    {offer.max_discount_amount && <p className="text-[10px] text-gray-500">Max discount: ₹{offer.max_discount_amount}</p>}
                    {offer.max_uses_total && <p className="text-[10px] text-gray-500">Uses: {offer.current_uses ?? 0}/{offer.max_uses_total}</p>}
                    {(offer.first_order_only || offer.new_user_only) && (
                      <span className="inline-block bg-amber-50 text-amber-700 text-[9px] font-semibold px-1.5 py-0.5 rounded-full">{offer.first_order_only ? "First order only" : "New users only"}</span>
                    )}

                    <div className="flex items-center justify-between text-[10px] text-gray-500 bg-gray-50 rounded-lg p-1.5 mt-1">
                      <span className="flex items-center gap-1"><Calendar size={11} />{new Date(offer.valid_from).toLocaleDateString("en-IN", { day: "numeric", month: "short" })} – {new Date(offer.valid_till).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}</span>
                      {statusLabel && statusLabel !== "Expired" && (
                        <span className="flex items-center gap-1 bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded-full font-bold"><Clock size={10} />{statusLabel}</span>
                      )}
                    </div>

                    {offer.image_url && (
                      <div className="mt-1 rounded-lg overflow-hidden border border-gray-200" style={{ aspectRatio: imageAspectRatio }}>
                        <img src={offer.image_url} alt={offer.offer_title} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                      </div>
                    )}

                    <div className="flex items-center justify-between pt-1.5 border-t border-gray-100 mt-1.5">
                      <span className="text-[9px] text-gray-400">{offer.created_source_platform ?? "MERCHANT_APP"} · {offer.created_by_role ?? "MERCHANT"}</span>
                      <div className="flex items-center gap-0.5">
                        <button type="button" onClick={() => handleOpenModal(offer)} className="p-1 rounded-lg bg-blue-50 text-blue-700 hover:bg-blue-100" title="Edit">
                          <Edit2 size={12} />
                        </button>
                        <button type="button" onClick={() => handleDeleteOffer(offer)} className="p-1 rounded-lg bg-red-50 text-red-700 hover:bg-red-100" title="Delete">
                          <Trash2 size={12} />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {showModal && typeof document !== "undefined" && createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-2 md:p-4 backdrop-blur-[2px]">
          <div className="bg-white w-full max-w-lg border border-gray-200 shadow-2xl flex flex-col max-h-[92vh] rounded-[20px] overflow-hidden">
            {/* Header */}
            <div className="flex-shrink-0 flex items-center justify-between px-5 py-4 border-b border-gray-100 bg-gradient-to-r from-gray-50 to-white">
              <div>
                <h2 className="text-lg font-bold text-gray-900">{editingId ? "Edit Offer" : "Create New Offer"}</h2>
                <p className="text-xs text-gray-500 mt-0.5">Platform: Agent Dashboard</p>
              </div>
              <button type="button" onClick={() => { setShowModal(false); resetForm(); }} className="p-2 hover:bg-gray-100 rounded-lg" aria-label="Close">
                <X size={20} className="text-gray-600" />
              </button>
            </div>

            {/* Tabs */}
            <div className="flex-shrink-0 border-b border-gray-200 bg-white">
              <div className="flex">
                {(["basic", "details", "validity"] as const).map((tab) => (
                  <button key={tab} type="button" onClick={() => setActiveTab(tab)}
                    className={`flex-1 px-3 py-3 text-xs font-semibold border-b-2 ${activeTab === tab ? "border-orange-500 text-orange-600" : "border-transparent text-gray-500"}`}>
                    {tab === "basic" ? "Basic Info" : tab === "details" ? "Offer Setup" : "Validity & Limits"}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex-1 overflow-y-auto">
              <form className="px-5 py-4 space-y-4" autoComplete="off" onSubmit={(e) => { e.preventDefault(); handleSaveOffer(); }}>

                {/* ── TAB: Basic Info ── */}
                {activeTab === "basic" && (
                  <>
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                      <p className="text-xs text-blue-700 font-semibold">Fill in the name, description and optional banner image.</p>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-gray-700 mb-1.5">Offer Title *</label>
                      <input type="text" value={formData.offer_title} onChange={handleInputChange("offer_title")} className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:border-orange-500 focus:ring-2 focus:ring-orange-100 text-sm" placeholder="e.g., Summer Special" required />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-gray-700 mb-1.5">Description (Optional)</label>
                      <textarea value={formData.offer_description} onChange={handleInputChange("offer_description")} className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:border-orange-500 focus:ring-2 focus:ring-orange-100 text-sm" rows={2} placeholder="Describe your offer..." />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-gray-700 mb-1.5">Offer Banner Image (Optional)</label>
                      <div className="flex items-center gap-3">
                        <label className="cursor-pointer">
                          <input type="file" accept="image/*" onChange={handleImageChange} className="hidden" />
                          <div className="px-4 py-2 bg-gradient-to-r from-orange-500 to-red-500 text-white text-xs font-bold rounded-lg hover:from-orange-600 hover:to-red-600 transition-all shadow-md">Choose Image</div>
                        </label>
                        {imagePreview && (
                          <div className="relative w-14 h-14 rounded-lg overflow-hidden border-2 border-gray-200">
                            <img src={imagePreview} alt="Preview" className="w-full h-full object-cover" />
                          </div>
                        )}
                      </div>
                      <p className="text-xs text-gray-400 mt-1.5">Recommended: 800×400 px</p>
                    </div>
                  </>
                )}

                {/* ── TAB: Offer Setup ── */}
                {activeTab === "details" && (
                  <>
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                      <p className="text-xs text-blue-700 font-semibold">Choose the offer type and configure its discount rules.</p>
                    </div>

                    {/* Offer type selector */}
                    <div ref={offerTypeRef} className="relative">
                      <label className="block text-xs font-bold text-gray-700 mb-1.5">Offer Type *</label>
                      <button type="button" onClick={() => { setShowOfferTypeDropdown(!showOfferTypeDropdown); setShowApplyToDropdown(false); setShowMenuItemSuggestions(false); }}
                        className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-left flex items-center justify-between bg-white hover:bg-gray-50">
                        <div className="flex items-center gap-2">
                          <div className="p-1.5 rounded-full bg-gray-100">{getOfferIcon(formData.offer_type)}</div>
                          <span className="text-sm font-medium text-gray-900">{getOfferTypeLabel(formData.offer_type)}</span>
                        </div>
                        <ChevronDown size={16} className={`text-gray-500 transition-transform ${showOfferTypeDropdown ? "rotate-180" : ""}`} />
                      </button>
                      {showOfferTypeDropdown && (
                        <div className="absolute left-0 right-0 z-50 mt-1 bg-white border border-gray-300 rounded-lg shadow-xl max-h-72 overflow-y-auto">
                          {ALL_OFFER_TYPES.map((opt) => (
                            <div key={opt.type} onClick={() => handleOfferTypeChange(opt.type)}
                              className={`flex items-center gap-3 px-3 py-2.5 hover:bg-gray-50 cursor-pointer border-b last:border-b-0 ${formData.offer_type === opt.type ? "bg-orange-50" : ""}`}>
                              <div className="p-1.5 rounded-full bg-gray-100">{opt.icon}</div>
                              <span className="text-sm font-medium text-gray-900">{opt.label}</span>
                              {formData.offer_type === opt.type && <div className="ml-auto w-2 h-2 bg-green-500 rounded-full" />}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Apply To */}
                    <div ref={applyToRef} className="relative">
                      <label className="block text-xs font-bold text-gray-700 mb-1.5">Apply To *</label>
                      <button type="button" onClick={() => { setShowApplyToDropdown(!showApplyToDropdown); setShowOfferTypeDropdown(false); setShowMenuItemSuggestions(false); }}
                        className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-left flex items-center justify-between bg-white hover:bg-gray-50">
                        <span className="text-sm font-medium text-gray-900">{formData.offer_sub_type === "SPECIFIC_ITEM" ? "Specific Items" : "All Orders"}</span>
                        <ChevronDown size={16} className={`text-gray-500 transition-transform ${showApplyToDropdown ? "rotate-180" : ""}`} />
                      </button>
                      {showApplyToDropdown && (
                        <div className="absolute left-0 right-0 z-50 mt-1 bg-white border border-gray-300 rounded-lg shadow-xl">
                          {[{ type: "ALL_ORDERS" as const, label: "All Orders" }, { type: "SPECIFIC_ITEM" as const, label: "Specific Items" }].map((opt) => (
                            <div key={opt.type} onClick={() => { setFormData((p) => ({ ...p, offer_sub_type: opt.type })); setShowApplyToDropdown(false); }}
                              className={`px-3 py-2.5 hover:bg-gray-50 cursor-pointer border-b last:border-b-0 flex items-center justify-between ${formData.offer_sub_type === opt.type ? "bg-orange-50" : ""}`}>
                              <span className="text-sm font-medium text-gray-900">{opt.label}</span>
                              {formData.offer_sub_type === opt.type && <div className="w-2 h-2 bg-green-500 rounded-full" />}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Menu item selector */}
                    {formData.offer_sub_type === "SPECIFIC_ITEM" && (
                      <div className="space-y-2" ref={menuItemSuggestionsRef}>
                        <label className="block text-xs font-bold text-gray-700">Select Menu Items *</label>
                        {formData.menu_item_ids.length > 0 && (
                          <div className="flex flex-wrap gap-1 mb-2">
                            {formData.menu_item_ids.map((itemId) => (
                              <span key={itemId} className="flex items-center gap-1 bg-green-100 text-green-800 px-2 py-1 rounded-full text-xs">
                                {getMenuItemName(itemId)}
                                <button type="button" onClick={() => toggleMenuItemSelection(itemId)} className="text-green-800 hover:text-green-900">×</button>
                              </span>
                            ))}
                          </div>
                        )}
                        <div className="relative">
                          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                          <input type="text" value={menuItemSearch} onChange={(e) => { setMenuItemSearch(e.target.value); setShowMenuItemSuggestions(true); }} onFocus={() => setShowMenuItemSuggestions(true)}
                            className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm" placeholder="Search menu items..." />
                          {showMenuItemSuggestions && (
                            <div className="absolute z-50 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-xl max-h-48 overflow-y-auto">
                              {filteredMenuItems.filter((item) => isItemEligibleForCurrentOffer(item)).length === 0 ? (
                                <div className="px-3 py-4 text-center text-sm text-gray-500">No eligible items found</div>
                              ) : (
                                filteredMenuItems.map((item) => {
                                  if (!isItemEligibleForCurrentOffer(item)) return null;
                                  const isSelected = formData.menu_item_ids.includes(item.item_id);
                                  const price = getItemPrice(item);
                                  const stats = offersByItemId.get(item.item_id);
                                  return (
                                    <div key={item.item_id} onClick={() => toggleMenuItemSelection(item.item_id)}
                                      className={`px-3 py-2.5 hover:bg-gray-50 cursor-pointer border-b last:border-b-0 flex items-center justify-between ${isSelected ? "bg-green-50" : ""}`}>
                                      <div>
                                        <div className="text-sm font-medium text-gray-900">{item.item_name}</div>
                                        <div className="flex items-center gap-1.5 mt-0.5">
                                          {price != null && <span className="text-[10px] bg-gray-100 px-1.5 rounded-full text-gray-700">₹{price.toFixed(0)}</span>}
                                          {stats && stats.activeCount > 0 && <span className="text-[10px] bg-amber-100 text-amber-700 px-1.5 rounded-full">{stats.activeCount} active offer{stats.activeCount > 1 ? "s" : ""}</span>}
                                        </div>
                                      </div>
                                      {isSelected && <Check size={15} className="text-green-600 flex-shrink-0" />}
                                    </div>
                                  );
                                })
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {/* ── Type-specific fields ── */}
                    <div className="border-t border-gray-200 pt-3 space-y-3">
                      <h4 className="text-xs font-bold text-gray-700">Discount Configuration</h4>

                      {/* PERCENTAGE / CART_PERCENTAGE */}
                      {needsDiscountPct && (
                        <>
                          <div>
                            <label className="block text-xs font-semibold text-gray-700 mb-1">Discount % *</label>
                            <div className="relative">
                              <input type="text" value={formData.discount_percentage} onChange={handleNumberInputChange("discount_percentage")} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm pr-8" placeholder="e.g., 10" required />
                              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 font-bold text-sm">%</span>
                            </div>
                          </div>
                          <div>
                            <label className="block text-xs font-semibold text-gray-700 mb-1">Max Discount Cap ₹ (Optional)</label>
                            <div className="relative">
                              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm">₹</span>
                              <input type="text" value={formData.max_discount_amount} onChange={handleNumberInputChange("max_discount_amount")} className="w-full pl-7 pr-3 py-2 border border-gray-300 rounded-lg text-sm" placeholder="e.g., 100" />
                            </div>
                          </div>
                        </>
                      )}

                      {/* FLAT / CART_FLAT */}
                      {needsDiscountFlat && (
                        <div>
                          <label className="block text-xs font-semibold text-gray-700 mb-1">Flat Discount ₹ *</label>
                          <div className="relative">
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm">₹</span>
                            <input type="text" value={formData.discount_value} onChange={handleNumberInputChange("discount_value")} className="w-full pl-7 pr-3 py-2 border border-gray-300 rounded-lg text-sm" placeholder="e.g., 50" required />
                          </div>
                        </div>
                      )}

                      {/* FREE_DELIVERY */}
                      {isFreeDelivery && (
                        <div>
                          <label className="block text-xs font-semibold text-gray-700 mb-1">Max Delivery Waiver ₹ (Optional)</label>
                          <div className="relative">
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm">₹</span>
                            <input type="text" value={formData.max_discount_amount} onChange={handleNumberInputChange("max_discount_amount")} className="w-full pl-7 pr-3 py-2 border border-gray-300 rounded-lg text-sm" placeholder="Leave blank to waive full fee" />
                          </div>
                        </div>
                      )}

                      {/* BUY_X_GET_Y / BUY_N_GET_M / BOGO */}
                      {needsBuyGet && (
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="block text-xs font-semibold text-gray-700 mb-1">Buy Quantity *</label>
                            <input type="number" min={1} value={formData.buy_quantity} onChange={handleNumberInputChange("buy_quantity")} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" required />
                          </div>
                          <div>
                            <label className="block text-xs font-semibold text-gray-700 mb-1">Get Free Quantity *</label>
                            <input type="number" min={1} value={formData.get_quantity} onChange={handleNumberInputChange("get_quantity")} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" required />
                          </div>
                        </div>
                      )}

                      {/* COUPON */}
                      {needsCoupon && (
                        <div className="space-y-3">
                          <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
                            <label className="block text-xs font-bold text-red-800 mb-2">Coupon Code *</label>
                            {generatedCouponCode ? (
                              <div>
                                <div className="flex items-center justify-between mb-1">
                                  <code className="text-base font-bold text-red-800 font-mono tracking-wider">{generatedCouponCode}</code>
                                  <button type="button" onClick={() => copyToClipboard(generatedCouponCode)} className="text-xs text-red-700"><Copy size={12} className="inline mr-1" />Copy</button>
                                </div>
                                <button type="button" onClick={generateCoupon} disabled={isGeneratingCoupon} className="text-xs text-red-600 mt-1">{isGeneratingCoupon ? "Regenerating..." : "Regenerate"}</button>
                              </div>
                            ) : (
                              <button type="button" onClick={generateCoupon} disabled={isGeneratingCoupon}
                                className={`w-full py-2 px-4 rounded-lg flex items-center justify-center gap-2 font-bold text-white ${isGeneratingCoupon ? "bg-red-300 cursor-not-allowed" : "bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700"}`}>
                                {isGeneratingCoupon ? <span className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" /> : <><Sparkles size={14} />Generate Code</>}
                              </button>
                            )}
                          </div>
                          <div>
                            <label className="block text-xs font-semibold text-gray-700 mb-1">Coupon Discount %</label>
                            <div className="relative">
                              <input type="text" value={formData.discount_percentage} onChange={handleNumberInputChange("discount_percentage")} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm pr-8" placeholder="e.g., 15" />
                              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm">%</span>
                            </div>
                          </div>
                          <div>
                            <label className="block text-xs font-semibold text-gray-700 mb-1">— OR Flat ₹ Discount</label>
                            <div className="relative">
                              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm">₹</span>
                              <input type="text" value={formData.discount_value} onChange={handleNumberInputChange("discount_value")} className="w-full pl-7 pr-3 py-2 border border-gray-300 rounded-lg text-sm" placeholder="e.g., 50" />
                            </div>
                          </div>
                        </div>
                      )}

                      {/* TIERED tier builder */}
                      {needsTiers && (
                        <div>
                          <div className="flex items-center justify-between mb-2">
                            <label className="text-xs font-bold text-gray-700">Tiers (spend more, save more)</label>
                            <button type="button" onClick={addTier} className="text-xs text-orange-600 font-semibold flex items-center gap-1">
                              + Add Tier
                            </button>
                          </div>
                          {tiers.map((tier, idx) => (
                            <div key={idx} className="flex items-center gap-2 mb-2 bg-gray-50 p-2 rounded-lg">
                              <div className="flex-1">
                                <label className="text-[10px] text-gray-500">Min Order ₹</label>
                                <input type="text" value={tier.min_order} onChange={(e) => updateTier(idx, "min_order", e.target.value)} className="w-full px-2 py-1 border border-gray-300 rounded text-xs mt-0.5" placeholder="0" />
                              </div>
                              <div className="flex-1">
                                <label className="text-[10px] text-gray-500">Discount %</label>
                                <input type="text" value={tier.discount_pct} onChange={(e) => updateTier(idx, "discount_pct", e.target.value)} className="w-full px-2 py-1 border border-gray-300 rounded text-xs mt-0.5" placeholder="0" />
                              </div>
                              <div className="flex-1">
                                <label className="text-[10px] text-gray-500">Flat ₹</label>
                                <input type="text" value={tier.discount_flat} onChange={(e) => updateTier(idx, "discount_flat", e.target.value)} className="w-full px-2 py-1 border border-gray-300 rounded text-xs mt-0.5" placeholder="0" />
                              </div>
                              {tiers.length > 1 && (
                                <button type="button" onClick={() => removeTier(idx)} className="text-red-400 hover:text-red-600 mt-4">
                                  <X size={14} />
                                </button>
                              )}
                            </div>
                          ))}
                          <p className="text-[10px] text-gray-400">Fill either % or flat ₹ per tier. The highest qualifying tier applies.</p>
                        </div>
                      )}

                      {/* Common min/max order */}
                      {!isFreeDelivery && !needsBuyGet && (
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="block text-xs font-semibold text-gray-700 mb-1">Min Order ₹</label>
                            <div className="relative">
                              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-xs">₹</span>
                              <input type="text" value={formData.min_order_amount} onChange={handleNumberInputChange("min_order_amount")} className="w-full pl-6 pr-2 py-2 border border-gray-300 rounded-lg text-sm" placeholder="e.g., 200" />
                            </div>
                          </div>
                          <div>
                            <label className="block text-xs font-semibold text-gray-700 mb-1">Max Order ₹</label>
                            <div className="relative">
                              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-xs">₹</span>
                              <input type="text" value={formData.max_order_amount} onChange={handleNumberInputChange("max_order_amount")} className="w-full pl-6 pr-2 py-2 border border-gray-300 rounded-lg text-sm" placeholder="Optional" />
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </>
                )}

                {/* ── TAB: Validity & Limits ── */}
                {activeTab === "validity" && (
                  <>
                    {/* Dates */}
                    <div>
                      <h4 className="text-xs font-bold text-gray-700 mb-2">Validity Period</h4>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs font-semibold text-gray-700 mb-1">Start Date *</label>
                          <input type="date" value={formData.valid_from} onChange={handleInputChange("valid_from")} className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm" min={new Date().toISOString().split("T")[0]} required />
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-gray-700 mb-1">End Date *</label>
                          <input type="date" value={formData.valid_till} onChange={handleInputChange("valid_till")} className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm" min={formData.valid_from || new Date().toISOString().split("T")[0]} required />
                        </div>
                      </div>
                    </div>

                    {/* Usage caps */}
                    <div>
                      <h4 className="text-xs font-bold text-gray-700 mb-2">Usage Limits</h4>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs font-semibold text-gray-700 mb-1">Total Uses</label>
                          <input type="text" value={formData.max_uses_total} onChange={handleNumberInputChange("max_uses_total")} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" placeholder="Unlimited" />
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-gray-700 mb-1">Per User</label>
                          <input type="text" value={formData.max_uses_per_user} onChange={handleNumberInputChange("max_uses_per_user")} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" placeholder="Unlimited" />
                        </div>
                      </div>
                    </div>

                    {/* Priority + Stackable */}
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-semibold text-gray-700 mb-1">Priority (higher = first)</label>
                        <input type="text" value={formData.priority} onChange={handleNumberInputChange("priority")} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" placeholder="0" />
                      </div>
                      <div className="flex flex-col justify-end">
                        <button type="button" onClick={() => handleToggle("is_stackable")}
                          className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-xs font-semibold transition-colors ${formData.is_stackable ? "bg-green-50 border-green-400 text-green-700" : "bg-gray-50 border-gray-300 text-gray-600"}`}>
                          <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${formData.is_stackable ? "border-green-600 bg-green-600" : "border-gray-400"}`}>
                            {formData.is_stackable && <div className="w-2 h-2 bg-white rounded-full" />}
                          </div>
                          Stackable
                        </button>
                      </div>
                    </div>

                    {/* Segment restrictions */}
                    <div>
                      <h4 className="text-xs font-bold text-gray-700 mb-2">User Segment</h4>
                      <div className="flex gap-3">
                        <button type="button" onClick={() => handleToggle("first_order_only")}
                          className={`flex-1 flex items-center gap-2 px-3 py-2 rounded-lg border text-xs font-semibold transition-colors ${formData.first_order_only ? "bg-amber-50 border-amber-400 text-amber-700" : "bg-gray-50 border-gray-300 text-gray-600"}`}>
                          <div className={`w-4 h-4 rounded border-2 flex items-center justify-center ${formData.first_order_only ? "border-amber-600 bg-amber-600" : "border-gray-400"}`}>
                            {formData.first_order_only && <Check size={10} className="text-white" />}
                          </div>
                          First Order Only
                        </button>
                        <button type="button" onClick={() => handleToggle("new_user_only")}
                          className={`flex-1 flex items-center gap-2 px-3 py-2 rounded-lg border text-xs font-semibold transition-colors ${formData.new_user_only ? "bg-amber-50 border-amber-400 text-amber-700" : "bg-gray-50 border-gray-300 text-gray-600"}`}>
                          <div className={`w-4 h-4 rounded border-2 flex items-center justify-center ${formData.new_user_only ? "border-amber-600 bg-amber-600" : "border-gray-400"}`}>
                            {formData.new_user_only && <Check size={10} className="text-white" />}
                          </div>
                          New Users Only
                        </button>
                      </div>
                    </div>

                    {/* Applicable days */}
                    <div>
                      <h4 className="text-xs font-bold text-gray-700 mb-2">Applicable Days (leave blank for every day)</h4>
                      <div className="flex gap-1.5 flex-wrap">
                        {DAYS.map((day) => (
                          <button key={day} type="button" onClick={() => toggleDay(day)}
                            className={`px-2.5 py-1 rounded-full text-xs font-semibold transition-colors ${applicableOnDays.has(day) ? "bg-orange-500 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}>
                            {DAY_LABELS[day]}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Time slot */}
                    <div>
                      <h4 className="text-xs font-bold text-gray-700 mb-2">Time Slot (leave blank for all day)</h4>
                      <div className="flex items-center gap-2">
                        <div className="flex-1">
                          <label className="block text-[10px] text-gray-500 mb-0.5">From</label>
                          <input type="time" value={formData.applicable_time_start} onChange={handleInputChange("applicable_time_start")} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
                        </div>
                        <span className="text-gray-400 mt-4">–</span>
                        <div className="flex-1">
                          <label className="block text-[10px] text-gray-500 mb-0.5">To</label>
                          <input type="time" value={formData.applicable_time_end} onChange={handleInputChange("applicable_time_end")} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
                        </div>
                      </div>
                    </div>

                    {/* Summary */}
                    <div className="border border-gray-200 rounded-lg overflow-hidden">
                      <div className="px-4 py-2 bg-gray-50 border-b border-gray-200">
                        <h4 className="text-xs font-bold text-gray-800">Offer Summary</h4>
                      </div>
                      <div className="p-3 space-y-1.5">
                        <SummaryRow label="Title" value={formData.offer_title || "—"} />
                        <SummaryRow label="Type" value={getOfferTypeLabel(formData.offer_type)} />
                        {formData.offer_type === "COUPON" && generatedCouponCode && <SummaryRow label="Coupon" value={generatedCouponCode} mono />}
                        {formData.discount_percentage && <SummaryRow label="Discount" value={`${formData.discount_percentage}% OFF`} />}
                        {formData.discount_value && <SummaryRow label="Discount" value={`₹${formData.discount_value} OFF`} />}
                        {formData.max_discount_amount && <SummaryRow label="Max Cap" value={`₹${formData.max_discount_amount}`} />}
                        {formData.min_order_amount && <SummaryRow label="Min Order" value={`₹${formData.min_order_amount}+`} />}
                        {formData.max_uses_total && <SummaryRow label="Total Uses" value={formData.max_uses_total} />}
                        {formData.max_uses_per_user && <SummaryRow label="Per User" value={formData.max_uses_per_user} />}
                        {applicableOnDays.size > 0 && <SummaryRow label="Days" value={Array.from(applicableOnDays).join(", ")} />}
                        {formData.valid_from && formData.valid_till && <SummaryRow label="Period" value={`${formData.valid_from} → ${formData.valid_till}`} />}
                      </div>
                    </div>
                  </>
                )}

                {/* Navigation buttons */}
                <div className="flex items-center justify-between gap-2 pt-4 mt-2 border-t border-gray-200">
                  <div>
                    {activeTab !== "basic" && (
                      <button type="button" onClick={() => setActiveTab(activeTab === "details" ? "basic" : "details")}
                        className="px-4 py-2.5 rounded-lg bg-gray-100 border border-gray-300 text-gray-700 text-xs font-bold">
                        ← Previous
                      </button>
                    )}
                  </div>
                  <div className="flex gap-2">
                    {activeTab !== "validity" && (
                      <button type="button" onClick={() => setActiveTab(activeTab === "basic" ? "details" : "validity")}
                        className="px-4 py-2.5 rounded-lg bg-gray-800 text-white text-xs font-bold">
                        Next →
                      </button>
                    )}
                    {activeTab === "validity" && (
                      <button type="submit" disabled={isSaving || !formData.offer_title.trim() || !formData.valid_from || !formData.valid_till || (formData.offer_sub_type === "SPECIFIC_ITEM" && formData.menu_item_ids.length === 0)}
                        className={`px-6 py-2.5 rounded-lg font-bold text-white text-xs ${isSaving || !formData.offer_title.trim() || !formData.valid_from || !formData.valid_till ? "bg-orange-300 cursor-not-allowed" : "bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600 shadow-lg"}`}>
                        {isSaving ? <span className="flex items-center gap-1"><span className="animate-spin rounded-full h-3 w-3 border-b-2 border-white" />Saving...</span> : editingId ? "Update Offer" : "Create Offer"}
                      </button>
                    )}
                  </div>
                </div>
              </form>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}

function SummaryRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex justify-between text-xs">
      <span className="font-semibold text-gray-600">{label}:</span>
      <span className={`font-bold text-gray-900 ${mono ? "font-mono" : ""}`}>{value}</span>
    </div>
  );
}
