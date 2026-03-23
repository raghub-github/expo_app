"use client";

import React, { useState, useEffect, useRef, useMemo } from "react";
import {
  Plus,
  Edit2,
  Trash2,
  Zap,
  X,
  Calendar,
  Percent,
  DollarSign,
  Tag,
  Gift,
  User,
  Clock,
  ShoppingBag,
  Copy,
  Search,
  Check,
  Sparkles,
  ChevronDown,
} from "lucide-react";
import { createPortal } from "react-dom";
import { useToast } from "@/context/ToastContext";
import type { Offer, MenuItemForOffer } from "./offers-types";

const defaultForm = {
  offer_title: "",
  offer_description: "",
  offer_type: "PERCENTAGE" as Offer["offer_type"],
  offer_sub_type: "ALL_ORDERS" as Offer["offer_sub_type"],
  menu_item_ids: [] as string[],
  offer_image_aspect_ratio: null as number | null,
  discount_value: "",
  min_order_amount: "",
  buy_quantity: "",
  get_quantity: "",
  valid_from: "",
  valid_till: "",
};

function getOfferIcon(offerType: Offer["offer_type"]) {
  switch (offerType) {
    case "BUY_N_GET_M":
      return <Gift size={16} className="text-purple-600" />;
    case "PERCENTAGE":
      return <Percent size={16} className="text-green-600" />;
    case "FLAT":
      return <DollarSign size={16} className="text-blue-600" />;
    case "COUPON":
      return <Tag size={16} className="text-red-600" />;
    case "FREE_ITEM":
      return <User size={16} className="text-orange-600" />;
    default:
      return <Zap size={16} className="text-yellow-600" />;
  }
}

function getOfferDescription(offer: Offer) {
  switch (offer.offer_type) {
    case "BUY_N_GET_M":
      return `Buy ${offer.buy_quantity} Get ${offer.get_quantity}`;
    case "PERCENTAGE":
      return `${offer.discount_value}% OFF${offer.min_order_amount ? ` on orders above ₹${offer.min_order_amount}` : ""}`;
    case "FLAT":
      return `Flat ₹${offer.discount_value} OFF${offer.min_order_amount ? ` on orders above ₹${offer.min_order_amount}` : ""}`;
    case "COUPON":
      return `Coupon: ${offer.coupon_code} - ₹${offer.discount_value} OFF${offer.min_order_amount ? ` on min. order of ₹${offer.min_order_amount}` : ""}`;
    case "FREE_ITEM":
      return `Free Item for New Users${offer.min_order_amount ? ` on orders above ₹${offer.min_order_amount}` : ""}`;
    default:
      return offer.offer_description || "";
  }
}

function getOfferTypeDisplay(type: Offer["offer_type"]) {
  switch (type) {
    case "PERCENTAGE":
      return "Percentage Discount";
    case "FLAT":
      return "Flat Amount Discount";
    case "COUPON":
      return "Coupon Discount";
    case "BUY_N_GET_M":
      return "Buy N Get M";
    case "FREE_ITEM":
      return "Free Item";
    default:
      return "Percentage Discount";
  }
}

function getApplyToDisplay(type: Offer["offer_sub_type"]) {
  return type === "SPECIFIC_ITEM" ? "Specific Items" : "All Orders";
}

function getStatusColor(offer: Offer) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const vf = new Date(offer.valid_from);
  const vt = new Date(offer.valid_till);
  const validFrom = new Date(vf.getFullYear(), vf.getMonth(), vf.getDate());
  const validTill = new Date(vt.getFullYear(), vt.getMonth(), vt.getDate());
  const isExpired = validTill < today;
  const isUpcoming = validFrom > today;
  if (isExpired) return { bg: "bg-gray-100", text: "text-gray-700", label: "EXPIRED" };
  if (!offer.is_active) return { bg: "bg-yellow-50", text: "text-amber-700", label: "INACTIVE" };
  if (isUpcoming) return { bg: "bg-blue-50", text: "text-blue-700", label: "UPCOMING" };
  return { bg: "bg-green-50", text: "text-green-700", label: "ACTIVE" };
}

function getOfferBadgeColor(offerType: Offer["offer_type"]) {
  switch (offerType) {
    case "PERCENTAGE":
      return "bg-gradient-to-r from-emerald-500 to-green-600";
    case "FLAT":
      return "bg-gradient-to-r from-blue-500 to-cyan-600";
    case "COUPON":
      return "bg-gradient-to-r from-rose-500 to-pink-600";
    case "BUY_N_GET_M":
      return "bg-gradient-to-r from-purple-500 to-violet-600";
    case "FREE_ITEM":
      return "bg-gradient-to-r from-amber-500 to-orange-600";
    default:
      return "bg-gradient-to-r from-gray-500 to-gray-600";
  }
}

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
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  // Keep the previously saved offer image URL so the upload endpoint can delete the old object from R2.
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

  const filteredMenuItems =
    menuItemSearch.trim() === ""
      ? menuItems
      : menuItems.filter((item) =>
          item.item_name.toLowerCase().includes(menuItemSearch.toLowerCase())
        );

  const offersByItemId = useMemo(() => {
    const now = new Date();
    const map = new Map<
      string,
      { totalCount: number; activeCount: number }
    >();
    offers.forEach((offer) => {
      if (offer.offer_sub_type !== "SPECIFIC_ITEM" || !offer.menu_item_ids?.length) return;
      const isWithinDates =
        new Date(offer.valid_from) <= now && now <= new Date(offer.valid_till);
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
    const raw =
      item.selling_price ??
      item.base_price ??
      item.actual_price ??
      null;
    const n = typeof raw === "string" ? Number(raw) : raw;
    return typeof n === "number" && Number.isFinite(n) ? n : null;
  };

  const isItemEligibleForCurrentOffer = (item: MenuItemForOffer): boolean => {
    if (formData.offer_type !== "FLAT") {
      // For non-flat offers, allow all items here (other rules already apply).
      return true;
    }
    // For flat offers, only freeze items that are already mapped to any offer.
    const stats = offersByItemId.get(item.item_id);
    if (stats && stats.totalCount > 0) return false;
    return true;
  };

  useEffect(() => {
    if (!storeId) {
      setIsLoading(false);
      return;
    }
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
      .catch(() => {
        if (!cancelled) setOffers([]);
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [storeId]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (showOfferTypeDropdown && offerTypeRef.current && !offerTypeRef.current.contains(target))
        setShowOfferTypeDropdown(false);
      if (showApplyToDropdown && applyToRef.current && !applyToRef.current.contains(target))
        setShowApplyToDropdown(false);
      if (showMenuItemSuggestions && menuItemSuggestionsRef.current && !menuItemSuggestionsRef.current.contains(target))
        setShowMenuItemSuggestions(false);
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showOfferTypeDropdown, showApplyToDropdown, showMenuItemSuggestions]);

  useEffect(() => {
    if (formData.offer_type === "COUPON" && !generatedCouponCode && !editingId) {
      generateCoupon();
    }
  }, [formData.offer_type]);

  function generateCoupon() {
    setIsGeneratingCoupon(true);
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    let coupon = "";
    for (let i = 0; i < 8; i++) {
      coupon += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    coupon = coupon.slice(0, 4) + "-" + coupon.slice(4);
    const prefix = storeName ? storeName.substring(0, 3).toUpperCase() : "OFF";
    const finalCode = `${prefix}-${coupon}`;
    setTimeout(() => {
      setGeneratedCouponCode(finalCode);
      setIsGeneratingCoupon(false);
      toast("Coupon code generated!");
    }, 300);
  }

  const handleInputChange = (field: keyof typeof formData) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setFormData((prev) => ({ ...prev, [field]: e.target.value }));
  };

  const handleNumberInputChange = (field: keyof typeof formData) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    if (value === "" || /^\d*\.?\d*$/.test(value)) {
      setFormData((prev) => ({ ...prev, [field]: value }));
    }
  };

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setImageFile(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        const url = reader.result as string;
        setImagePreview(url);
        // Fallback while the image dimensions are being read.
        setFormData((prev) => ({ ...prev, offer_image_aspect_ratio: prev.offer_image_aspect_ratio ?? 2 }));
        // Save banner aspect ratio so preview + customer app can render consistently.
        const img = new window.Image();
        img.onload = () => {
          const w = img.naturalWidth;
          const h = img.naturalHeight;
          if (w > 0 && h > 0) {
            const ratio = w / h; // width/height
            setFormData((prev) => ({ ...prev, offer_image_aspect_ratio: Number(ratio.toFixed(4)) }));
          }
        };
        img.onerror = () => {
          // If we can't read dimensions, keep any previous value (or fallback to null).
          setFormData((prev) => ({ ...prev, offer_image_aspect_ratio: prev.offer_image_aspect_ratio ?? null }));
        };
        img.src = url;
      };
      reader.readAsDataURL(file);
    }
  };

  const handleOpenModal = (offer?: Offer) => {
    if (offer) {
      setEditingId((offer.id ?? parseInt(String(offer.offer_id), 10)) || null);
      setFormData({
        offer_title: offer.offer_title,
        offer_description: offer.offer_description || "",
        offer_type: offer.offer_type,
        offer_sub_type: offer.offer_sub_type,
        menu_item_ids: offer.menu_item_ids || [],
        offer_image_aspect_ratio: offer.offer_image_aspect_ratio ?? (offer.image_url ? 2 : null),
        discount_value: offer.discount_value?.toString() ?? "",
        min_order_amount: offer.min_order_amount?.toString() ?? "",
        buy_quantity: offer.buy_quantity?.toString() ?? "",
        get_quantity: offer.get_quantity?.toString() ?? "",
        valid_from: offer.valid_from.split("T")[0],
        valid_till: offer.valid_till.split("T")[0],
      });
      setImagePreview(offer.image_url || null);
      setExistingOfferImageUrl(offer.image_url || null);
      // If we don't have a saved aspect ratio (older offers), compute it from the current image.
      if (offer.image_url && offer.offer_image_aspect_ratio == null) {
        const img = new window.Image();
        img.onload = () => {
          const w = img.naturalWidth;
          const h = img.naturalHeight;
          if (w > 0 && h > 0) {
            const ratio = w / h;
            setFormData((prev) => ({ ...prev, offer_image_aspect_ratio: Number(ratio.toFixed(4)) }));
          }
        };
        img.onerror = () => {
          // keep fallback value
        };
        img.src = offer.image_url;
      }
      if (offer.offer_type === "COUPON") setGeneratedCouponCode(offer.coupon_code || "");
    } else {
      setEditingId(null);
      setFormData(defaultForm);
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

  const handleSaveOffer = async () => {
    if (!storeId) {
      toast("Store context not loaded.");
      return;
    }
    if (!formData.offer_title.trim()) {
      toast("Offer title is required");
      return;
    }
    if (!formData.valid_from || !formData.valid_till) {
      toast("Valid dates are required");
      return;
    }
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (new Date(formData.valid_from) < today) {
      toast("Offer start date cannot be before today");
      return;
    }
    if (new Date(formData.valid_till) < new Date(formData.valid_from)) {
      toast("End date must be after start date");
      return;
    }
    if (formData.offer_sub_type === "SPECIFIC_ITEM" && formData.menu_item_ids.length === 0) {
      toast("Please select at least one menu item when applying to specific items");
      return;
    }
    if (formData.offer_type === "COUPON" && !generatedCouponCode) {
      toast("Please generate a coupon code");
      return;
    }
    setIsSaving(true);
    try {
      const payload = {
        offer_title: formData.offer_title.trim(),
        offer_description: formData.offer_description || null,
        offer_type: formData.offer_type,
        offer_sub_type: formData.offer_sub_type,
        menu_item_ids: formData.offer_sub_type === "SPECIFIC_ITEM" && formData.menu_item_ids.length > 0 ? formData.menu_item_ids : null,
        ...(formData.offer_image_aspect_ratio != null
          ? { offer_image_aspect_ratio: formData.offer_image_aspect_ratio }
          : {}),
        discount_value: formData.discount_value !== "" ? formData.discount_value : null,
        min_order_amount: formData.min_order_amount !== "" ? formData.min_order_amount : null,
        buy_quantity: formData.buy_quantity ? parseInt(formData.buy_quantity, 10) : null,
        get_quantity: formData.get_quantity ? parseInt(formData.get_quantity, 10) : null,
        coupon_code: formData.offer_type === "COUPON" ? generatedCouponCode : null,
        valid_from: new Date(formData.valid_from).toISOString(),
        valid_till: new Date(formData.valid_till).toISOString(),
        is_active: true,
      };
      if (editingId != null) {
        const res = await fetch(`/api/merchant/stores/${storeId}/offers/${editingId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          toast(data?.error || "Failed to update offer");
          return;
        }
        // Upload offer image (one per offer) and then patch offer_image_url
        if (imageFile && data?.offer?.offer_id) {
          try {
            const form = new FormData();
            form.append("file", imageFile);
            form.append("offerId", String(data.offer.offer_id));
            if (existingOfferImageUrl) form.append("currentImageUrl", String(existingOfferImageUrl));
            const upRes = await fetch(`/api/merchant/stores/${storeId}/offers/upload-image`, {
              method: "POST",
              body: form,
            });
            const up = await upRes.json().catch(() => ({}));
            if (upRes.ok && up?.url) {
              const patchRes = await fetch(`/api/merchant/stores/${storeId}/offers/${editingId}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ offer_image_url: up.url }),
              });
              const patched = await patchRes.json().catch(() => ({}));
              if (patchRes.ok && patched?.offer) {
                setOffers((prev) => prev.map((o) => (o.id === editingId ? { ...o, ...patched.offer } : o)));
              }
            }
          } catch {
            // best effort
          }
        }
        setOffers((prev) => prev.map((o) => (o.id === editingId ? { ...o, ...payload, ...data.offer } : o)));
        toast("Offer updated successfully!");
      } else {
        const res = await fetch(`/api/merchant/stores/${storeId}/offers`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          toast(data?.error || "Failed to create offer");
          return;
        }
        let created = data.offer ?? null;
        // Create then upload image then patch offer_image_url
        if (created && imageFile && created.offer_id) {
          try {
            const form = new FormData();
            form.append("file", imageFile);
            form.append("offerId", String(created.offer_id));
            const upRes = await fetch(`/api/merchant/stores/${storeId}/offers/upload-image`, {
              method: "POST",
              body: form,
            });
            const up = await upRes.json().catch(() => ({}));
            if (upRes.ok && up?.url) {
              const patchRes = await fetch(`/api/merchant/stores/${storeId}/offers/${created.id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ offer_image_url: up.url }),
              });
              const patched = await patchRes.json().catch(() => ({}));
              if (patchRes.ok && patched?.offer) created = { ...created, ...patched.offer };
            }
          } catch {
            // best effort
          }
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
      if (!res.ok) {
        toast(data?.error || "Failed to delete offer");
        return;
      }
      setOffers((prev) => prev.filter((o) => (o.id ?? parseInt(String(o.offer_id), 10)) !== id));
      toast("Offer deleted successfully!");
    } catch {
      toast("Error deleting offer");
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast("Copied to clipboard!");
  };

  const toggleMenuItemSelection = (itemId: string) => {
    setFormData((prev) => {
      const isSelected = prev.menu_item_ids.includes(itemId);
      if (isSelected) return { ...prev, menu_item_ids: prev.menu_item_ids.filter((id) => id !== itemId) };
      return { ...prev, menu_item_ids: [...prev.menu_item_ids, itemId] };
    });
  };

  const getMenuItemName = (itemId: string) => menuItems.find((m) => m.item_id === itemId)?.item_name ?? "Unknown Item";

  const toggleOfferItemsExpanded = (offerKey: string) => {
    setExpandedOfferItems((prev) => ({ ...prev, [offerKey]: !prev[offerKey] }));
  };

  const handleOfferTypeChange = (type: Offer["offer_type"]) => {
    setFormData((prev) => ({ ...prev, offer_type: type }));
    setShowOfferTypeDropdown(false);
    if (type !== "COUPON") setGeneratedCouponCode("");
  };

  const handleApplyToChange = (type: Offer["offer_sub_type"]) => {
    setFormData((prev) => ({ ...prev, offer_sub_type: type }));
    setShowApplyToDropdown(false);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-orange-600 border-t-transparent" />
      </div>
    );
  }

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
            <Plus size={18} />
            Create Offer
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
            <p className="text-gray-600 mb-8 max-w-md mx-auto">
              Create your first offer to attract more customers and boost your sales
            </p>
            <button
              onClick={() => handleOpenModal()}
              className="px-6 py-3 bg-gradient-to-r from-orange-500 to-red-500 text-white rounded-xl hover:from-orange-600 hover:to-red-600 font-semibold shadow-lg hover:shadow-xl transition-all"
            >
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
                const totalDuration = Math.ceil((validTill.getTime() - validFrom.getTime()) / (1000 * 60 * 60 * 24));
                const startsIn = Math.ceil((validFrom.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
                statusLabel = `Starts in ${startsIn} day${startsIn !== 1 ? "s" : ""} (Duration: ${totalDuration} day${totalDuration !== 1 ? "s" : ""})`;
              } else if (now > validTill) {
                statusLabel = "Expired";
              } else {
                const daysLeft = Math.ceil((validTill.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
                statusLabel = `${daysLeft} day${daysLeft !== 1 ? "s" : ""} left`;
              }
              const status = getStatusColor(offer);
              const badgeColor = getOfferBadgeColor(offer.offer_type);
              const offerKey = String(offer.offer_id ?? offer.id ?? "");
              const itemNames =
                offer.offer_sub_type === "SPECIFIC_ITEM" && offer.menu_item_ids?.length
                  ? offer.menu_item_ids.map((id) => getMenuItemName(id))
                  : [];
              const isExpanded = expandedOfferItems[offerKey] ?? false;
              const itemsToShow = isExpanded ? itemNames : itemNames.slice(0, 3);
              const hasMoreItems = !isExpanded && itemNames.length > 3;
              const showViewLess = isExpanded && itemNames.length > 3;
              const imageAspectRatio =
                offer.offer_image_aspect_ratio != null && offer.offer_image_aspect_ratio > 0
                  ? offer.offer_image_aspect_ratio
                  : 2; // fallback for older offers
              return (
                <div
                  key={offer.offer_id}
                  className={`bg-white rounded-xl shadow-sm border border-gray-200 hover:shadow-lg transition-all duration-300 hover:-translate-y-0.5 group relative overflow-hidden ${statusLabel === "Expired" ? "opacity-80" : ""}`}
                  style={{ minHeight: "auto", maxWidth: 340 }}
                >
                  <div className={`absolute top-0 left-0 right-0 h-1 ${badgeColor}`} />
                  <div className="p-1.5 md:p-2">
                      <div className="flex items-start justify-between mb-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1 mb-0.5">
                          {getOfferIcon(offer.offer_type)}
                          <span className={`px-2 py-1 rounded-full text-[10px] font-bold ${status.bg} ${status.text}`}>
                            {status.label}
                          </span>
                        </div>
                        <h3 className="font-bold text-gray-900 text-xs truncate group-hover:text-orange-600 transition-colors">
                          {offer.offer_title}
                        </h3>
                        <p className="text-[9px] text-gray-500 font-mono mt-0.5">
                          ID: {offer.offer_id.substring(0, 8)}...
                        </p>
                      </div>
                      <div className="flex-shrink-0">
                        {offer.offer_sub_type === "SPECIFIC_ITEM" ? (
                          <span
                            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-semibold bg-indigo-50 text-indigo-700"
                            title={
                              offer.menu_item_ids?.length
                                ? offer.menu_item_ids.map((id) => `• ${getMenuItemName(id)}`).join("\n")
                                : "No items"
                            }
                          >
                              Specific Items{offer.menu_item_ids?.length ? ` (${offer.menu_item_ids.length})` : ""}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-semibold bg-blue-50 text-blue-700">
                            All Orders
                          </span>
                        )}
                      </div>
                    </div>

                      {offer.offer_sub_type === "SPECIFIC_ITEM" && (
                        <div className="mb-2">
                          <div className="text-[10px] font-semibold text-gray-600 mb-1">Applies to</div>
                          <div className="space-y-0.5">
                            {itemsToShow.length > 0 ? (
                              itemsToShow.map((name, idx) => (
                                <div key={`${offerKey}-${idx}`} className="text-[10px] text-gray-700 truncate">
                                  • {name}
                                </div>
                              ))
                            ) : (
                              <div className="text-[10px] text-gray-500">No items selected</div>
                            )}
                          </div>
                          {(hasMoreItems || showViewLess) && (
                            <button
                              type="button"
                              onClick={() => toggleOfferItemsExpanded(offerKey)}
                              className="mt-1 text-[10px] font-semibold text-orange-600 hover:text-orange-700"
                            >
                              {showViewLess ? "View fewer items" : `View all items (${itemNames.length})`}
                            </button>
                          )}
                        </div>
                      )}

                    <div className="mb-2">
                      {offer.offer_type === "COUPON" && offer.coupon_code && (
                        <div className="mb-1.5">
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-xs font-semibold text-gray-600">Coupon Code</span>
                            <button
                              type="button"
                              onClick={() => copyToClipboard(offer.coupon_code!)}
                              className="text-xs font-medium text-gray-500 hover:text-orange-600 flex items-center gap-1"
                            >
                              <Copy size={10} />
                              Copy
                            </button>
                          </div>
                          <div className="bg-gradient-to-r from-gray-50 to-gray-100 border border-gray-300 rounded-lg p-2">
                            <code className="text-sm font-bold text-gray-900 font-mono tracking-wider block text-center">
                              {offer.coupon_code}
                            </code>
                          </div>
                        </div>
                      )}
                      <div className="flex items-center gap-1 mb-2">
                        <div className="p-1 rounded-lg bg-gradient-to-br from-gray-50 to-gray-100">
                          {offer.offer_type === "PERCENTAGE" ? (
                            <Percent size={14} className="text-green-600" />
                          ) : offer.offer_type === "FLAT" ? (
                            <DollarSign size={14} className="text-blue-600" />
                          ) : offer.offer_type === "BUY_N_GET_M" ? (
                            <Gift size={14} className="text-purple-600" />
                          ) : (
                            <Tag size={14} className="text-red-600" />
                          )}
                        </div>
                        <div>
                          <p className="text-xs font-bold text-gray-900">{getOfferDescription(offer)}</p>
                          {offer.min_order_amount && (
                            <p className="text-[9px] text-gray-500 mt-0.5">Min. order: ₹{offer.min_order_amount}</p>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center justify-between text-[10px] text-gray-600 bg-gray-50 rounded-lg p-1.5">
                        <div className="flex items-center gap-1">
                          <Calendar size={12} className="text-gray-500" />
                          <span>
                            {new Date(offer.valid_from).toLocaleDateString("en-IN", { day: "numeric", month: "short" })} -{" "}
                            {new Date(offer.valid_till).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                          </span>
                        </div>
                        {statusLabel && statusLabel !== "Expired" && (
                          <div className="flex items-center gap-1 bg-gradient-to-r from-amber-100 to-orange-100 px-2 py-1 rounded-full">
                            <Clock size={10} className="text-amber-700" />
                            <span className="font-bold text-amber-800 text-[10px]">{statusLabel}</span>
                          </div>
                        )}
                      </div>
                      {offer.image_url && (
                        <div
                          className="mt-0.5 rounded-lg overflow-hidden border border-gray-200"
                          style={{ aspectRatio: imageAspectRatio }}
                        >
                          <img
                            src={offer.image_url}
                            alt={offer.offer_title}
                            style={{ width: "100%", height: "100%", objectFit: "cover" }}
                          />
                        </div>
                      )}
                      {offer.offer_description && (
                        <p className="text-[10px] text-gray-500 mt-0.5 line-clamp-2">{offer.offer_description}</p>
                      )}
                    </div>

                    <div className="flex items-center justify-between pt-1.5 border-t border-gray-100">
                      <span className="text-[9px] text-gray-400">
                        Updated: {new Date(offer.updated_at).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                      </span>
                      <div className="flex items-center gap-0.5">
                        <button
                          type="button"
                          onClick={() => handleOpenModal(offer)}
                          className="p-1 rounded-lg bg-gradient-to-r from-blue-50 to-blue-100 text-blue-700 hover:from-blue-100 hover:to-blue-200"
                          title="Edit offer"
                        >
                          <Edit2 size={12} />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteOffer(offer)}
                          className="p-1 rounded-lg bg-gradient-to-r from-red-50 to-red-100 text-red-700 hover:from-red-100 hover:to-red-200"
                          title="Delete offer"
                        >
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

      {showModal &&
        typeof document !== "undefined" &&
        createPortal(
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-2 md:p-4 backdrop-blur-[2px]">
            <div className="bg-white w-full max-w-md border border-gray-200 shadow-2xl flex flex-col max-h-[90vh] rounded-[20px] overflow-hidden">
              <div className="flex-shrink-0 flex items-center justify-between px-5 py-4 border-b border-gray-100 bg-gradient-to-r from-gray-50 to-white">
                <div>
                  <h2 className="text-lg font-bold text-gray-900">{editingId ? "Edit Offer" : "Create New Offer"}</h2>
                  <p className="text-xs text-gray-500 mt-0.5">Enter details for the offer</p>
                </div>
                <button type="button" onClick={() => { setShowModal(false); resetForm(); }} className="p-2 hover:bg-gray-100 rounded-lg" aria-label="Close">
                  <X size={20} className="text-gray-600" />
                </button>
              </div>

              <div className="flex-shrink-0 border-b border-gray-200 bg-white">
                <div className="flex">
                  <button type="button" onClick={() => setActiveTab("basic")} className={`flex-1 px-3 py-3 text-xs font-semibold border-b-2 ${activeTab === "basic" ? "border-orange-500 text-orange-600" : "border-transparent text-gray-500"}`}>
                    Basic Info
                  </button>
                  <button type="button" onClick={() => setActiveTab("details")} className={`flex-1 px-3 py-3 text-xs font-semibold border-b-2 ${activeTab === "details" ? "border-orange-500 text-orange-600" : "border-transparent text-gray-500"}`}>
                    Offer Details
                  </button>
                  <button type="button" onClick={() => setActiveTab("validity")} className={`flex-1 px-3 py-3 text-xs font-semibold border-b-2 ${activeTab === "validity" ? "border-orange-500 text-orange-600" : "border-transparent text-gray-500"}`}>
                    Validity
                  </button>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto hide-scrollbar">
                <form className="px-5 py-4" autoComplete="off" onSubmit={(e) => { e.preventDefault(); handleSaveOffer(); }}>
                  {activeTab === "basic" && (
                    <div className="space-y-4">
                      <div className="bg-gradient-to-r from-blue-50 to-blue-100 border border-blue-200 rounded-lg p-3 mb-2">
                        <h3 className="text-sm font-bold text-blue-800 mb-1">Basic Information</h3>
                        <p className="text-xs text-blue-600">Fill in the basic details of your offer</p>
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-gray-700 mb-1.5">Offer Title *</label>
                        <input type="text" value={formData.offer_title} onChange={handleInputChange("offer_title")} className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:border-orange-500 focus:ring-2 focus:ring-orange-100 text-sm" placeholder="e.g., Summer Special" required />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-gray-700 mb-1.5">Description (Optional)</label>
                        <textarea value={formData.offer_description} onChange={handleInputChange("offer_description")} className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:border-orange-500 focus:ring-2 focus:ring-orange-100 text-sm" placeholder="Describe your offer..." rows={2} />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-gray-700 mb-1.5">Offer Image (Optional)</label>
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
                        <p className="text-xs text-gray-400 mt-1.5">Recommended: 800x400px</p>
                      </div>
                    </div>
                  )}

                  {activeTab === "details" && (
                    <div className="space-y-4">
                      <div className="bg-gradient-to-r from-blue-50 to-blue-100 border border-blue-200 rounded-lg p-3 mb-2">
                        <h3 className="text-sm font-bold text-blue-800 mb-1">Offer Configuration</h3>
                        <p className="text-xs text-blue-600">Configure the type and rules of your offer</p>
                      </div>
                      <div ref={offerTypeRef} className="relative">
                        <label className="block text-xs font-bold text-gray-700 mb-1.5">Offer Type *</label>
                        <button type="button" onClick={() => { setShowOfferTypeDropdown(!showOfferTypeDropdown); setShowApplyToDropdown(false); setShowMenuItemSuggestions(false); }} className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-left flex items-center justify-between bg-white hover:bg-gray-50">
                          <div className="flex items-center gap-2">
                            <div className="p-1.5 rounded-full bg-gray-100">{getOfferIcon(formData.offer_type)}</div>
                            <span className="text-sm font-medium text-gray-900">{getOfferTypeDisplay(formData.offer_type)}</span>
                          </div>
                          <ChevronDown size={16} className={`text-gray-500 transition-transform ${showOfferTypeDropdown ? "rotate-180" : ""}`} />
                        </button>
                        {showOfferTypeDropdown && (
                          <div className="absolute left-0 right-0 z-50 mt-1 bg-white border border-gray-300 rounded-lg shadow-xl max-h-60 overflow-y-auto">
                            {[
                              { type: "PERCENTAGE" as const, label: "Percentage Discount", icon: <Percent size={14} className="text-green-600" /> },
                              { type: "FLAT" as const, label: "Flat Amount Discount", icon: <DollarSign size={14} className="text-blue-600" /> },
                              { type: "COUPON" as const, label: "Coupon Discount", icon: <Tag size={14} className="text-red-600" /> },
                              { type: "BUY_N_GET_M" as const, label: "Buy N Get M", icon: <Gift size={14} className="text-purple-600" /> },
                              { type: "FREE_ITEM" as const, label: "Free Item", icon: <User size={14} className="text-orange-600" /> },
                            ].map((opt) => (
                              <div
                                key={opt.type}
                                onClick={() => handleOfferTypeChange(opt.type)}
                                className={`flex items-center gap-3 px-3 py-2.5 hover:bg-gray-50 cursor-pointer border-b last:border-b-0 ${formData.offer_type === opt.type ? "bg-orange-50" : ""}`}
                              >
                                <div className="p-1.5 rounded-full bg-gray-100">{opt.icon}</div>
                                <span className="text-sm font-medium text-gray-900">{opt.label}</span>
                                {formData.offer_type === opt.type && <div className="ml-auto w-2 h-2 bg-green-500 rounded-full" />}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                      <div ref={applyToRef} className="relative">
                        <label className="block text-xs font-bold text-gray-700 mb-1.5">Apply To *</label>
                        <button type="button" onClick={() => { setShowApplyToDropdown(!showApplyToDropdown); setShowOfferTypeDropdown(false); setShowMenuItemSuggestions(false); }} className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-left flex items-center justify-between bg-white hover:bg-gray-50">
                          <span className="text-sm font-medium text-gray-900">{getApplyToDisplay(formData.offer_sub_type)}</span>
                          <ChevronDown size={16} className={`text-gray-500 transition-transform ${showApplyToDropdown ? "rotate-180" : ""}`} />
                        </button>
                        {showApplyToDropdown && (
                          <div className="absolute left-0 right-0 z-50 mt-1 bg-white border border-gray-300 rounded-lg shadow-xl">
                            {[
                              { type: "ALL_ORDERS" as const, label: "All Orders" },
                              { type: "SPECIFIC_ITEM" as const, label: "Specific Items" },
                            ].map((opt) => (
                              <div key={opt.type} onClick={() => handleApplyToChange(opt.type)} className={`px-3 py-2.5 hover:bg-gray-50 cursor-pointer border-b last:border-b-0 ${formData.offer_sub_type === opt.type ? "bg-orange-50" : ""}`}>
                                <span className="text-sm font-medium text-gray-900">{opt.label}</span>
                                {formData.offer_sub_type === opt.type && <div className="w-2 h-2 bg-green-500 rounded-full inline-block ml-2" />}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      {formData.offer_sub_type === "SPECIFIC_ITEM" && (
                        <div className="space-y-2" ref={menuItemSuggestionsRef}>
                          <label className="block text-xs font-bold text-gray-700 mb-1.5">Select Menu Items *</label>
                          {formData.menu_item_ids.length > 0 && (
                            <div className="mb-2">
                              <div className="text-xs font-semibold text-gray-600 mb-1">Selected ({formData.menu_item_ids.length}):</div>
                              <div className="flex flex-wrap gap-1">
                                {formData.menu_item_ids.map((itemId) => (
                                  <span key={itemId} className="flex items-center gap-1 bg-green-100 text-green-800 px-2 py-1 rounded-full text-xs">
                                    {getMenuItemName(itemId)}
                                    <button type="button" onClick={() => toggleMenuItemSelection(itemId)} className="text-green-800 hover:text-green-900">×</button>
                                  </span>
                                ))}
                              </div>
                            </div>
                          )}
                          <div className="relative">
                            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                            <input type="text" value={menuItemSearch} onChange={(e) => { setMenuItemSearch(e.target.value); setShowMenuItemSuggestions(true); }} onFocus={() => setShowMenuItemSuggestions(true)} className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg focus:border-orange-500 focus:ring-2 focus:ring-orange-100 text-sm" placeholder="Search menu items..." />
                            {showMenuItemSuggestions && (
                              <div className="absolute z-50 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-xl max-h-60 overflow-y-auto">
                                {filteredMenuItems.length === 0 ? (
                                  <div className="px-3 py-4 text-center text-sm text-gray-500">No menu items found</div>
                                ) : (
                                  filteredMenuItems.map((item) => {
                                    const isSelected = formData.menu_item_ids.includes(item.item_id);
                                    const stats = offersByItemId.get(item.item_id);
                                    const price = getItemPrice(item);
                                    const hasActiveOffer = (stats?.activeCount ?? 0) > 0;
                                    if (!isItemEligibleForCurrentOffer(item)) {
                                      // Hide ineligible items for the current flat discount configuration.
                                      return null;
                                    }
                                    return (
                                      <div
                                        key={item.item_id}
                                        onClick={() => toggleMenuItemSelection(item.item_id)}
                                        className={`px-3 py-2.5 hover:bg-gray-50 cursor-pointer border-b last:border-b-0 flex items-center justify-between ${
                                          isSelected ? "bg-green-50" : ""
                                        }`}
                                      >
                                        <div className="flex-1 min-w-0 mr-2">
                                          <div className="flex items-center gap-2">
                                            <span className="text-sm font-medium text-gray-900 truncate">
                                              {item.item_name}
                                            </span>
                                            <span className="text-[10px] font-mono text-gray-500">
                                              #{item.item_id}
                                            </span>
                                          </div>
                                          <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[10px]">
                                            {price != null && (
                                              <span className="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 font-medium text-gray-700">
                                                ₹{price.toFixed(0)}
                                              </span>
                                            )}
                                            {item.in_stock === false && (
                                              <span className="inline-flex items-center rounded-full bg-red-50 px-2 py-0.5 font-medium text-red-700">
                                                Out of stock
                                              </span>
                                            )}
                                            {stats && stats.totalCount > 0 && (
                                              <span
                                                className={`inline-flex items-center rounded-full px-2 py-0.5 font-medium ${
                                                  hasActiveOffer
                                                    ? "bg-amber-100 text-amber-800"
                                                    : "bg-emerald-50 text-emerald-700"
                                                }`}
                                              >
                                                {hasActiveOffer
                                                  ? `${stats.activeCount} active offer${stats.activeCount > 1 ? "s" : ""}`
                                                  : `${stats.totalCount} mapped offer${stats.totalCount > 1 ? "s" : ""}`}
                                              </span>
                                            )}
                                          </div>
                                        </div>
                                        {isSelected && (
                                          <Check
                                            size={16}
                                            className="text-green-600 flex-shrink-0 ml-2"
                                          />
                                        )}
                                      </div>
                                    );
                                  })
                                )}
                              </div>
                            )}
                          </div>
                          <p className="text-xs text-gray-500">{menuItems.length > 0 ? `Found ${menuItems.length} menu items. Search or click to select.` : "No menu items for this store."}</p>
                        </div>
                      )}

                      <div className="border-t border-gray-200 pt-3 space-y-3">
                        <h4 className="text-xs font-bold text-gray-700">Offer Rules & Values</h4>
                        {formData.offer_type === "BUY_N_GET_M" && (
                          <div className="grid grid-cols-2 gap-3">
                            <div>
                              <label className="block text-xs font-semibold text-gray-700 mb-1">Buy Quantity *</label>
                              <input type="number" min={1} value={formData.buy_quantity} onChange={handleNumberInputChange("buy_quantity")} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" required />
                            </div>
                            <div>
                              <label className="block text-xs font-semibold text-gray-700 mb-1">Get Quantity *</label>
                              <input type="number" min={1} value={formData.get_quantity} onChange={handleNumberInputChange("get_quantity")} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" required />
                            </div>
                          </div>
                        )}
                        {(formData.offer_type === "PERCENTAGE" || formData.offer_type === "FLAT" || formData.offer_type === "COUPON") && (
                          <>
                            <div>
                              <label className="block text-xs font-semibold text-gray-700 mb-1">Discount Value *</label>
                              <div className="relative">
                                <input type="text" value={formData.discount_value} onChange={handleNumberInputChange("discount_value")} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" placeholder={formData.offer_type === "PERCENTAGE" ? "e.g., 10 for 10%" : "e.g., 50 for ₹50"} required />
                                {formData.offer_type === "PERCENTAGE" && <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 font-bold">%</span>}
                              </div>
                            </div>
                            <div className="relative">
                              <label className="block text-xs font-semibold text-gray-700 mb-1">Minimum Order (Optional)</label>
                              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 font-bold">₹</span>
                              <input type="text" value={formData.min_order_amount} onChange={handleNumberInputChange("min_order_amount")} className="w-full pl-8 pr-3 py-2 border border-gray-300 rounded-lg text-sm" placeholder="e.g., 500" />
                            </div>
                          </>
                        )}
                        {formData.offer_type === "FREE_ITEM" && (
                          <div className="relative">
                            <label className="block text-xs font-semibold text-gray-700 mb-1">Minimum Order for New Users *</label>
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 font-bold">₹</span>
                            <input type="text" value={formData.min_order_amount} onChange={handleNumberInputChange("min_order_amount")} className="w-full pl-8 pr-3 py-2 border border-gray-300 rounded-lg text-sm" placeholder="Order amount required" required />
                          </div>
                        )}
                        {formData.offer_type === "COUPON" && (
                          <div className="mt-3 p-3 bg-gradient-to-r from-red-50 to-red-100 border border-red-200 rounded-lg">
                            <label className="block text-xs font-bold text-red-800 mb-2">Coupon Code *</label>
                            {generatedCouponCode ? (
                              <div>
                                <div className="flex items-center justify-between mb-2">
                                  <span className="text-sm font-semibold text-red-700">Generated:</span>
                                  <button type="button" onClick={() => copyToClipboard(generatedCouponCode)} className="text-xs font-medium text-red-700"><Copy size={12} className="inline mr-1" />Copy</button>
                                </div>
                                <div className="bg-white px-3 py-2 rounded border border-red-300">
                                  <code className="text-lg font-bold text-red-800 font-mono tracking-wider">{generatedCouponCode}</code>
                                </div>
                                <button type="button" onClick={generateCoupon} disabled={isGeneratingCoupon} className="text-xs font-medium text-red-700 mt-2">{isGeneratingCoupon ? "Regenerating..." : "Regenerate"}</button>
                              </div>
                            ) : (
                              <button type="button" onClick={generateCoupon} disabled={isGeneratingCoupon} className={`w-full py-2 px-4 rounded-lg flex items-center justify-center gap-2 font-bold ${isGeneratingCoupon ? "bg-red-300 cursor-not-allowed" : "bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700"} text-white`}>
                                {isGeneratingCoupon ? <span className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" /> : <><Sparkles size={14} />Generate Coupon Code</>}
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {activeTab === "validity" && (
                    <div className="space-y-4">
                      <div className="bg-gradient-to-r from-blue-50 to-blue-100 border border-blue-200 rounded-lg p-3 mb-2">
                        <h3 className="text-sm font-bold text-blue-800 mb-1">Validity Period</h3>
                        <p className="text-xs text-blue-600">Set when your offer will be active</p>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs font-bold text-gray-700 mb-1.5">Start Date *</label>
                          <input type="date" value={formData.valid_from} onChange={handleInputChange("valid_from")} className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm" min={new Date().toISOString().split("T")[0]} required />
                        </div>
                        <div>
                          <label className="block text-xs font-bold text-gray-700 mb-1.5">End Date *</label>
                          <input type="date" value={formData.valid_till} onChange={handleInputChange("valid_till")} className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm" min={formData.valid_from || new Date().toISOString().split("T")[0]} required />
                        </div>
                      </div>
                      {formData.valid_from && formData.valid_till && (
                        <div className="p-3 bg-gradient-to-r from-gray-50 to-gray-100 rounded-lg border border-gray-200">
                          <div className="text-xs font-bold text-gray-700 flex items-center gap-2">
                            <Calendar size={12} />
                            Valid from <span className="text-orange-600">{formData.valid_from}</span> to <span className="text-orange-600">{formData.valid_till}</span>
                          </div>
                        </div>
                      )}
                      <div className="border border-gray-200 rounded-lg overflow-hidden bg-gradient-to-br from-white to-gray-50">
                        <div className="px-4 py-3 bg-gradient-to-r from-gray-50 to-gray-100 border-b border-gray-200">
                          <h4 className="text-sm font-bold text-gray-900">Offer Summary</h4>
                        </div>
                        <div className="p-4 space-y-2">
                          <div className="flex justify-between"><span className="text-xs font-semibold text-gray-600">Title:</span><span className="text-xs font-bold text-gray-900">{formData.offer_title || "Not set"}</span></div>
                          <div className="flex justify-between"><span className="text-xs font-semibold text-gray-600">Type:</span><span className="text-xs font-bold text-gray-900">{getOfferTypeDisplay(formData.offer_type)}</span></div>
                          <div className="flex justify-between"><span className="text-xs font-semibold text-gray-600">Apply To:</span><span className="text-xs font-bold text-gray-900">{getApplyToDisplay(formData.offer_sub_type)}</span></div>
                          {formData.offer_type === "COUPON" && generatedCouponCode && <div className="flex justify-between"><span className="text-xs font-semibold text-gray-600">Coupon:</span><span className="text-xs font-bold text-red-600 font-mono">{generatedCouponCode}</span></div>}
                          {formData.discount_value && <div className="flex justify-between"><span className="text-xs font-semibold text-gray-600">Discount:</span><span className="text-xs font-bold text-green-600">{formData.offer_type === "PERCENTAGE" ? `${formData.discount_value}% OFF` : `₹${formData.discount_value} OFF`}</span></div>}
                          {formData.min_order_amount && <div className="flex justify-between"><span className="text-xs font-semibold text-gray-600">Min. Order:</span><span className="text-xs font-bold text-orange-600">₹{formData.min_order_amount}+</span></div>}
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="flex items-center justify-between gap-2 pt-6 mt-6 border-t border-gray-200">
                    <div>
                      {activeTab !== "basic" && (
                        <button type="button" className="px-4 py-2.5 rounded-lg bg-gray-100 border border-gray-300 text-gray-700 text-xs font-bold" onClick={() => { if (activeTab === "details") setActiveTab("basic"); if (activeTab === "validity") setActiveTab("details"); }}>
                          ← Previous
                        </button>
                      )}
                    </div>
                    <div className="flex gap-2">
                      {activeTab !== "validity" && (
                        <button type="button" className="px-4 py-2.5 rounded-lg bg-gray-800 text-white text-xs font-bold" onClick={() => { if (activeTab === "basic") setActiveTab("details"); if (activeTab === "details") setActiveTab("validity"); }}>
                          Next →
                        </button>
                      )}
                      {activeTab === "validity" && (
                        <button
                          type="submit"
                          disabled={isSaving || !formData.offer_title.trim() || !formData.valid_from || !formData.valid_till || (formData.offer_sub_type === "SPECIFIC_ITEM" && formData.menu_item_ids.length === 0) || (formData.offer_type === "COUPON" && !generatedCouponCode)}
                          className={`px-6 py-2.5 rounded-lg font-bold text-white text-xs ${isSaving || !formData.offer_title.trim() || !formData.valid_from || !formData.valid_till ? "bg-orange-300 cursor-not-allowed" : "bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600 shadow-lg"}`}
                        >
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
