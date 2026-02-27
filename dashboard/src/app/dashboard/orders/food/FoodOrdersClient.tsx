"use client";

import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { X, RefreshCw, Filter, CheckCircle2, ChevronDown, Info } from "lucide-react";

// Exact color codes from reference image
const MINT_GREEN = "#4EE5C1"; // Active buttons and elements
const PAGE_BG = "#F4F6F9"; // Page background
const CONTENT_BG = "#FFFFFF"; // White content background
const INACTIVE_BG = "#F0F2F5"; // Inactive button background
const INACTIVE_TEXT = "#1E3A8A"; // Dark blue text color
const BORDER_COLOR = "#D5DBDE"; // Border color
const DARK_TEXT = "#000000"; // Black text for headers
const TABLE_TEXT = "#000000"; // Black table data text
const CHECKMARK_COLOR = "#2F8F6F"; // Checkmark icon color
const ORDER_TAG_BG = "#ECF8F3"; // Order ID tag background
const ORDER_TAG_TEXT = "#2F8F6F"; // Order ID tag text

export type OrderStatusFilter =
  | "PAYMENT DONE"
  | "ACCEPTED"
  | "DESPATCH READY"
  | "DESPATCHED"
  | "BULK"
  | null;

interface OrdersCoreRow {
  id: number;
  orderUuid: string;
  orderType: string;
  formattedOrderId: string | null;
  orderId: string | null;
  status: string;
  currentStatus: string | null;
  paymentStatus: string | null;
  createdAt: string;
  updatedAt: string;
  customerId: number | null;
  customerName: string | null;
  customerMobile: string | null;
  riderId: number | null;
  riderName: string | null;
  riderMobile: string | null;
  /** Email of agent routed to (from latest remark). */
  routedToEmail: string | null;
  /** Latest internal remark text for this order (for agent actions). */
  latestRemark: string | null;
  /** Merchant foreign key (parent merchant). */
  merchantParentId: number | null;
  /** Store internal id if needed in future. */
  merchantStoreId: number | null;
  dropAddressRaw: string | null;
  dropAddressNormalized?: string | null;
  /** Order source / delivery provider (\"internal\" = GatiMitra). */
  orderSource: string | null;
  isBulkOrder: boolean;
}

interface FilterState {
  delivery: string[]; // Array for multiple selections: "GatiMitra" | "Merchant"
  pickUp: boolean;
  food: boolean;
  fashion: boolean;
  grocery: boolean;
  pharma: boolean;
  overview: boolean;
  userType: string[]; // Array for multiple selections: "Premium" | "Very Good" | "Good" | "Bad"
}

export default function FoodOrdersClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const urlStatus = searchParams.get("statusFilter") as OrderStatusFilter | null;
  const urlSearch = searchParams.get("search") ?? "";
  const urlSearchType = searchParams.get("searchType") ?? "Order Id";

  const [filters, setFilters] = useState<FilterState>({
    delivery: [],
    pickUp: false,
    food: false,
    fashion: false,
    grocery: false,
    pharma: false,
    overview: false,
    userType: [],
  });

  const selectedStatus = urlStatus ?? null;
  const [orders, setOrders] = useState<OrdersCoreRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);
  const [showDeliveryDropdown, setShowDeliveryDropdown] = useState(false);
  const [showUserTypeDropdown, setShowUserTypeDropdown] = useState(false);
  const deliveryRef = useRef<HTMLDivElement>(null);
  const userTypeRef = useRef<HTMLDivElement>(null);
  const [showCxInstructions, setShowCxInstructions] = useState(false);
  const [cxInstructions, setCxInstructions] = useState<string | null>(null);
  const [cxLoading, setCxLoading] = useState(false);
  const [cxError, setCxError] = useState<string | null>(null);

  const setStatusFilter = useCallback(
    (status: OrderStatusFilter) => {
      const params = new URLSearchParams(searchParams.toString());
      if (status) params.set("statusFilter", status);
      else params.delete("statusFilter");
      params.delete("page");
      router.replace(`/dashboard/orders/food?${params.toString()}`, { scroll: false });
    },
    [router, searchParams]
  );

  useEffect(() => {
    let cancelled = false;
    const params = new URLSearchParams();
    params.set("orderType", "food");
    const status = searchParams.get("statusFilter");
    if (status) params.set("statusFilter", status);
    const search = searchParams.get("search");
    if (search) params.set("search", search);
    const searchType = searchParams.get("searchType");
    if (searchType) params.set("searchType", searchType);
    params.set("page", "1");
    params.set("limit", "20");

    setLoading(true);
    fetch(`/api/orders/core?${params.toString()}`)
      .then((res) => res.json())
      .then((body) => {
        if (cancelled) return;
        if (body.success && Array.isArray(body.data)) {
          setOrders(body.data);
          setTotal(body.pagination?.total ?? body.data.length);
        } else {
          setOrders([]);
          setTotal(0);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setOrders([]);
          setTotal(0);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [searchParams.toString(), refreshKey]);

  // Close dropdowns when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (deliveryRef.current && !deliveryRef.current.contains(event.target as Node)) {
        setShowDeliveryDropdown(false);
      }
      if (userTypeRef.current && !userTypeRef.current.contains(event.target as Node)) {
        setShowUserTypeDropdown(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleCategoryToggle = (category: keyof FilterState) => {
    if (category === "delivery" || category === "userType") return;
    setFilters((prev) => ({
      ...prev,
      [category]: !prev[category],
    }));
  };

  const handleDeliveryToggle = (value: string) => {
    setFilters((prev) => ({
      ...prev,
      delivery: prev.delivery.includes(value)
        ? prev.delivery.filter((v) => v !== value)
        : [...prev.delivery, value],
    }));
  };

  const handleUserTypeToggle = (value: string) => {
    setFilters((prev) => ({
      ...prev,
      userType: prev.userType.includes(value)
        ? prev.userType.filter((v) => v !== value)
        : [...prev.userType, value],
    }));
  };

  // Build filter chips from applied filters
  const filterChips = useMemo(() => {
    const chips: Array<{ id: string; label: string }> = [];
    filters.delivery.forEach((d) => chips.push({ id: `delivery-${d}`, label: d }));
    if (filters.pickUp) chips.push({ id: "pickUp", label: "Pickup" });
    if (filters.food) chips.push({ id: "food", label: "Food" });
    if (filters.fashion) chips.push({ id: "fashion", label: "Fashion" });
    if (filters.grocery) chips.push({ id: "grocery", label: "Grocery" });
    if (filters.pharma) chips.push({ id: "pharma", label: "Pharma" });
    if (filters.overview) chips.push({ id: "overview", label: "Overview" });
    filters.userType.forEach((ut) => chips.push({ id: `userType-${ut}`, label: ut }));
    return chips;
  }, [filters]);

  const removeFilter = useCallback((id: string) => {
    if (id === "pickUp") {
      setFilters((prev) => ({ ...prev, pickUp: false }));
    } else if (id === "food") {
      setFilters((prev) => ({ ...prev, food: false }));
    } else if (id === "fashion") {
      setFilters((prev) => ({ ...prev, fashion: false }));
    } else if (id === "grocery") {
      setFilters((prev) => ({ ...prev, grocery: false }));
    } else if (id === "pharma") {
      setFilters((prev) => ({ ...prev, pharma: false }));
    } else if (id === "overview") {
      setFilters((prev) => ({ ...prev, overview: false }));
    } else if (id.startsWith("delivery-")) {
      const value = id.replace("delivery-", "");
      setFilters((prev) => ({
        ...prev,
        delivery: prev.delivery.filter((d) => d !== value),
      }));
    } else if (id.startsWith("userType-")) {
      const value = id.replace("userType-", "");
      setFilters((prev) => ({
        ...prev,
        userType: prev.userType.filter((ut) => ut !== value),
      }));
    }
  }, []);

  const clearAllFilters = useCallback(() => {
    setFilters({
      delivery: [],
      pickUp: false,
      food: false,
      fashion: false,
      grocery: false,
      pharma: false,
      overview: false,
      userType: [],
    });
    router.replace("/dashboard/orders/food", { scroll: false });
  }, [router]);

  const refreshData = useCallback(() => setRefreshKey((k) => k + 1), []);

  const orderCount = total;

  // Helper function to get button styles - prevents hydration mismatch
  const getButtonStyles = (isActive: boolean) => {
    if (isActive) {
      return {
        backgroundColor: MINT_GREEN,
        color: DARK_TEXT,
        borderColor: BORDER_COLOR,
      };
    }
    return {
      backgroundColor: INACTIVE_BG,
      color: INACTIVE_TEXT,
      borderColor: BORDER_COLOR,
    };
  };

  const getDropdownButtonStyles = (isActive: boolean) => {
    if (isActive) {
      return {
        backgroundColor: MINT_GREEN,
        color: DARK_TEXT,
        borderColor: BORDER_COLOR,
      };
    }
    return {
      backgroundColor: CONTENT_BG,
      color: INACTIVE_TEXT,
      borderColor: BORDER_COLOR,
    };
  };

  const openCxInstructions = () => {
    setShowCxInstructions(true);
    if (cxInstructions || cxLoading) return;
    setCxLoading(true);
    setCxError(null);
    fetch("/api/cx-instructions?context=orders-dashboard")
      .then((res) => res.json())
      .then((body) => {
        if (body.success && typeof body.content === "string") {
          setCxInstructions(body.content);
        } else {
          setCxError("Failed to load instructions.");
        }
      })
      .catch(() => {
        setCxError("Failed to load instructions.");
      })
      .finally(() => {
        setCxLoading(false);
      });
  };

  return (
    <>
    <div className="space-y-2 w-full max-w-full overflow-x-hidden" style={{ backgroundColor: PAGE_BG }}>
      {/* Header with CX instructions */}
      <div className="flex items-center justify-between px-2 pt-2" style={{ backgroundColor: CONTENT_BG }}>
        <div className="flex flex-col">
          <span className="text-sm font-semibold" style={{ color: DARK_TEXT }}>
            Food Orders
          </span>
          <span className="text-[11px] text-slate-500">
            Live dashboard for CX / CS team
          </span>
        </div>
        <button
          type="button"
          onClick={openCxInstructions}
          className="inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-[11px] font-medium cursor-pointer hover:bg-gray-50"
          style={{ borderColor: BORDER_COLOR, backgroundColor: CONTENT_BG, color: INACTIVE_TEXT }}
        >
          <Info className="h-3.5 w-3.5" />
          <span>CX Instructions</span>
        </button>
      </div>

      {/* Filter Section - No border */}
      <div className="p-2" style={{ backgroundColor: CONTENT_BG }}>
        <div className="flex flex-wrap items-center gap-2">
          {/* Delivery Dropdown */}
          <div ref={deliveryRef} className="relative">
            <button
              onClick={() => setShowDeliveryDropdown(!showDeliveryDropdown)}
              className="px-3 py-1.5 rounded-md text-xs font-medium border transition-colors hover:bg-gray-50 cursor-pointer"
              style={getDropdownButtonStyles(filters.delivery.length > 0)}
            >
              Delivery
              <ChevronDown className="inline-block ml-1 h-3 w-3" />
            </button>
            {showDeliveryDropdown && (
              <div
                className="absolute top-full left-0 mt-1 w-48 border rounded-lg shadow-lg z-50"
                style={{ backgroundColor: CONTENT_BG, borderColor: BORDER_COLOR }}
              >
                <label className="flex items-center px-4 py-2 hover:bg-gray-100 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={filters.delivery.includes("GatiMitra")}
                    onChange={() => handleDeliveryToggle("GatiMitra")}
                    className="mr-2"
                  />
                  <span className="text-sm" style={{ color: DARK_TEXT }}>GatiMitra</span>
                </label>
                <label className="flex items-center px-4 py-2 hover:bg-gray-100 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={filters.delivery.includes("Merchant")}
                    onChange={() => handleDeliveryToggle("Merchant")}
                    className="mr-2"
                  />
                  <span className="text-sm" style={{ color: DARK_TEXT }}>Merchant</span>
                </label>
              </div>
            )}
          </div>

          {/* Category Buttons */}
          <button
            onClick={() => handleCategoryToggle("pickUp")}
            className="px-3 py-1.5 rounded-md text-xs font-medium transition-colors border cursor-pointer"
            style={getButtonStyles(filters.pickUp)}
          >
            Pickup
          </button>
          <button
            onClick={() => handleCategoryToggle("food")}
            className="px-3 py-1.5 rounded-md text-xs font-medium transition-colors border cursor-pointer"
            style={getButtonStyles(filters.food)}
          >
            Food
          </button>
          <button
            onClick={() => handleCategoryToggle("fashion")}
            className="px-3 py-1.5 rounded-md text-xs font-medium transition-colors border cursor-pointer"
            style={getButtonStyles(filters.fashion)}
          >
            Fashion
          </button>
          <button
            onClick={() => handleCategoryToggle("grocery")}
            className="px-3 py-1.5 rounded-md text-xs font-medium transition-colors border cursor-pointer"
            style={getButtonStyles(filters.grocery)}
          >
            Grocery
          </button>
          <button
            onClick={() => handleCategoryToggle("pharma")}
            className="px-3 py-1.5 rounded-md text-xs font-medium transition-colors border cursor-pointer"
            style={getButtonStyles(filters.pharma)}
          >
            Pharma
          </button>
          <button
            onClick={() => handleCategoryToggle("overview")}
            className="px-3 py-1.5 rounded-md text-xs font-medium transition-colors border cursor-pointer"
            style={getButtonStyles(filters.overview)}
          >
            Overview
          </button>

          {/* User-Type Dropdown */}
          <div ref={userTypeRef} className="relative">
            <button
              onClick={() => setShowUserTypeDropdown(!showUserTypeDropdown)}
              className="px-3 py-1.5 rounded-md text-xs font-medium border transition-colors hover:bg-gray-50 cursor-pointer"
              style={getDropdownButtonStyles(filters.userType.length > 0)}
            >
              User-Type
              <ChevronDown className="inline-block ml-1 h-3 w-3" />
            </button>
            {showUserTypeDropdown && (
              <div
                className="absolute top-full left-0 mt-1 w-48 border rounded-lg shadow-lg z-50"
                style={{ backgroundColor: CONTENT_BG, borderColor: BORDER_COLOR }}
              >
                <label className="flex items-center px-4 py-2 hover:bg-gray-100 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={filters.userType.includes("Premium")}
                    onChange={() => handleUserTypeToggle("Premium")}
                    className="mr-2"
                  />
                  <span className="text-sm" style={{ color: DARK_TEXT }}>Premium</span>
                </label>
                <label className="flex items-center px-4 py-2 hover:bg-gray-100 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={filters.userType.includes("Very Good")}
                    onChange={() => handleUserTypeToggle("Very Good")}
                    className="mr-2"
                  />
                  <span className="text-sm" style={{ color: DARK_TEXT }}>Very Good</span>
                </label>
                <label className="flex items-center px-4 py-2 hover:bg-gray-100 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={filters.userType.includes("Good")}
                    onChange={() => handleUserTypeToggle("Good")}
                    className="mr-2"
                  />
                  <span className="text-sm" style={{ color: DARK_TEXT }}>Good</span>
                </label>
                <label className="flex items-center px-4 py-2 hover:bg-gray-100 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={filters.userType.includes("Bad")}
                    onChange={() => handleUserTypeToggle("Bad")}
                    className="mr-2"
                  />
                  <span className="text-sm" style={{ color: DARK_TEXT }}>Bad</span>
                </label>
              </div>
            )}
          </div>

          {/* Apply Filter Button */}
          <button
            className="ml-auto px-3 py-1.5 rounded-md text-xs font-medium uppercase border cursor-pointer"
            style={{ backgroundColor: MINT_GREEN, color: DARK_TEXT, borderColor: BORDER_COLOR }}
          >
            Apply Filter
          </button>

          {/* Applied Filters Chips - In same section */}
          {filterChips.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5 w-full mt-2">
              {filterChips.map((chip) => (
                <span
                  key={chip.id}
                  className="inline-flex items-center gap-1 pl-2 pr-1.5 py-0.5 rounded-full text-xs font-medium border"
                  style={{ backgroundColor: CONTENT_BG, borderColor: BORDER_COLOR, color: DARK_TEXT }}
                >
                  <span>{chip.label}</span>
                  <button
                    type="button"
                    onClick={() => removeFilter(chip.id)}
                    className="flex-shrink-0 p-0.5 rounded hover:bg-gray-100 focus:outline-none cursor-pointer"
                    aria-label={`Remove ${chip.label}`}
                  >
                    <X className="h-3 w-3" style={{ color: INACTIVE_TEXT }} />
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Status Buttons Section - No border, full width */}
      <div className="p-2 mt-3" style={{ backgroundColor: CONTENT_BG }}>
        <div className="flex items-center gap-2 w-full">
          <button
            onClick={() => setStatusFilter(selectedStatus === "PAYMENT DONE" ? null : "PAYMENT DONE")}
            className={`flex-1 px-3 py-2 rounded-md text-xs transition-colors border cursor-pointer ${
              selectedStatus === "PAYMENT DONE" ? "font-bold" : "font-medium"
            }`}
            style={getButtonStyles(selectedStatus === "PAYMENT DONE")}
          >
            PAYMENT DONE
          </button>
          <button
            onClick={() => setStatusFilter(selectedStatus === "ACCEPTED" ? null : "ACCEPTED")}
            className={`flex-1 px-3 py-2 rounded-md text-xs transition-colors border cursor-pointer ${
              selectedStatus === "ACCEPTED" ? "font-bold" : "font-medium"
            }`}
            style={getButtonStyles(selectedStatus === "ACCEPTED")}
          >
            ACCEPTED
          </button>
          <button
            onClick={() => setStatusFilter(selectedStatus === "DESPATCH READY" ? null : "DESPATCH READY")}
            className={`flex-1 px-3 py-2 rounded-md text-xs transition-colors border cursor-pointer ${
              selectedStatus === "DESPATCH READY" ? "font-bold" : "font-medium"
            }`}
            style={getButtonStyles(selectedStatus === "DESPATCH READY")}
          >
            DESPATCH READY
          </button>
          <button
            onClick={() => setStatusFilter(selectedStatus === "DESPATCHED" ? null : "DESPATCHED")}
            className={`flex-1 px-3 py-2 rounded-md text-xs transition-colors border cursor-pointer ${
              selectedStatus === "DESPATCHED" ? "font-bold" : "font-medium"
            }`}
            style={getButtonStyles(selectedStatus === "DESPATCHED")}
          >
            DESPATCHED
          </button>
          <button
            onClick={() => setStatusFilter(selectedStatus === "BULK" ? null : "BULK")}
            className={`flex-1 px-3 py-2 rounded-md text-xs transition-colors border cursor-pointer ${
              selectedStatus === "BULK" ? "font-bold" : "font-medium"
            }`}
            style={getButtonStyles(selectedStatus === "BULK")}
          >
            BULK
          </button>
        </div>
      </div>

      {/* Summary and Action Bar - No border */}
      <div className="flex items-center justify-between p-2" style={{ backgroundColor: CONTENT_BG }}>
        <div className="flex items-center gap-1.5">
          <CheckCircle2 className="h-4 w-4" style={{ color: CHECKMARK_COLOR }} />
          <span className="text-xs font-medium" style={{ color: DARK_TEXT }}>
            {selectedStatus ? selectedStatus.substring(0, 3).toUpperCase() : "ALL"} - {orderCount} / Out Of {orderCount}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={refreshData}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium border cursor-pointer disabled:opacity-60"
            style={{ backgroundColor: MINT_GREEN, color: DARK_TEXT, borderColor: BORDER_COLOR }}
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            Refresh Data
          </button>
          <button
            onClick={clearAllFilters}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium border cursor-pointer"
            style={{ backgroundColor: CONTENT_BG, borderColor: BORDER_COLOR, color: INACTIVE_TEXT }}
          >
            <Filter className="h-3.5 w-3.5" />
            Clear All Filters
          </button>
        </div>
      </div>

      {/* Orders Table - compact layout */}
      <div className="overflow-x-auto" style={{ backgroundColor: CONTENT_BG }}>
        <table className="min-w-full divide-y divide-gray-200 text-[11px]">
          <thead className="bg-gray-100">
            <tr>
              <th className="px-2 py-1.5 text-left font-medium" style={{ color: DARK_TEXT }}>
                Order
              </th>
              <th className="px-2 py-1.5 text-left font-medium" style={{ color: DARK_TEXT }}>
                Action
              </th>
              <th className="px-2 py-1.5 text-left font-medium" style={{ color: DARK_TEXT }}>
                Routed to
              </th>
              <th className="px-2 py-1.5 text-left font-medium whitespace-nowrap" style={{ color: DARK_TEXT }}>
                Order time
              </th>
              <th className="px-2 py-1.5 text-left font-medium" style={{ color: DARK_TEXT }}>
                User name
              </th>
              <th className="px-2 py-1.5 text-left font-medium whitespace-nowrap" style={{ color: DARK_TEXT }}>
                User mobile
              </th>
              <th className="px-2 py-1.5 text-left font-medium whitespace-nowrap" style={{ color: DARK_TEXT }}>
                Merchant id
              </th>
              <th className="px-2 py-1.5 text-left font-medium whitespace-nowrap" style={{ color: DARK_TEXT }}>
                Mx locality
              </th>
              <th className="px-2 py-1.5 text-left font-medium whitespace-nowrap" style={{ color: DARK_TEXT }}>
                Updated time
              </th>
              <th className="px-2 py-1.5 text-left font-medium whitespace-nowrap" style={{ color: DARK_TEXT }}>
                DE provider
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200" style={{ backgroundColor: CONTENT_BG }}>
            {loading ? (
              <tr>
                <td colSpan={10} className="px-2 py-4 text-center" style={{ color: TABLE_TEXT }}>
                  Loading…
                </td>
              </tr>
            ) : orders.length === 0 ? (
              <tr>
                <td colSpan={10} className="px-2 py-4 text-center" style={{ color: TABLE_TEXT }}>
                  No orders found
                </td>
              </tr>
            ) : (
              orders.map((row) => {
                const displayId =
                  row.formattedOrderId ??
                  row.orderId ??
                  `GMF${String(row.id ?? "").padStart(6, "0")}`;
                const publicId = String(displayId).replace(/^#/, "");
                const routedTo = row.routedToEmail ?? "";
                const merchantId =
                  row.merchantParentId != null ? row.merchantParentId : null;
                const localitySource =
                  row.dropAddressNormalized ?? row.dropAddressRaw ?? null;
                const locality =
                  localitySource != null && localitySource.length > 0
                    ? localitySource.split(",")[0]?.trim() || localitySource
                    : null;
                const deliverProvider =
                  !row.orderSource || row.orderSource === "internal"
                    ? "GatiMitra"
                    : row.orderSource.charAt(0).toUpperCase() + row.orderSource.slice(1);

                return (
                  <tr key={row.id} className="hover:bg-gray-50">
                    <td className="px-2 py-1.5 whitespace-nowrap" style={{ color: TABLE_TEXT }}>
                      <Link
                        href={`/order/${encodeURIComponent(publicId)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center px-2 py-0.5 rounded font-medium cursor-pointer hover:underline text-[11px]"
                        style={{ backgroundColor: ORDER_TAG_BG, color: ORDER_TAG_TEXT }}
                      >
                        #{publicId}
                      </Link>
                    </td>
                    <td
                      className="px-2 py-1.5 max-w-[180px] truncate"
                      style={{ color: TABLE_TEXT }}
                      title={row.latestRemark ?? undefined}
                    >
                      {row.latestRemark ?? "—"}
                    </td>
                    <td className="px-2 py-1.5 truncate max-w-[160px]" style={{ color: TABLE_TEXT }}>
                      {routedTo}
                    </td>
                    <td className="px-2 py-1.5 whitespace-nowrap" style={{ color: TABLE_TEXT }}>
                      {row.createdAt ? new Date(row.createdAt).toLocaleString() : "—"}
                    </td>
                    <td className="px-2 py-1.5" style={{ color: TABLE_TEXT }}>
                      {row.customerName ?? "—"}
                    </td>
                    <td className="px-2 py-1.5 whitespace-nowrap" style={{ color: TABLE_TEXT }}>
                      {row.customerMobile ?? "—"}
                    </td>
                    <td className="px-2 py-1.5 whitespace-nowrap" style={{ color: TABLE_TEXT }}>
                      {merchantId != null ? merchantId : "—"}
                    </td>
                    <td
                      className="px-2 py-1.5 max-w-[140px] truncate"
                      style={{ color: TABLE_TEXT }}
                      title={locality ?? undefined}
                    >
                      {locality ?? "—"}
                    </td>
                    <td className="px-2 py-1.5 whitespace-nowrap" style={{ color: TABLE_TEXT }}>
                      {row.updatedAt ? new Date(row.updatedAt).toLocaleString() : "—"}
                    </td>
                    <td
                      className="px-2 py-1.5 whitespace-nowrap"
                      style={{ color: TABLE_TEXT }}
                    >
                      {deliverProvider}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
    {showCxInstructions && (
      <div
        className="fixed inset-0 z-[9999] bg-black/50 flex items-center justify-center p-4"
        onClick={(e) => {
          if (e.target === e.currentTarget) setShowCxInstructions(false);
        }}
      >
        <div
          className="bg-white rounded-lg shadow-lg max-w-2xl w-full p-5 text-[12px] text-slate-800"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
                <Info className="h-3.5 w-3.5" />
              </span>
              <div>
                <h2 className="text-sm font-semibold text-slate-900">CX / CS instructions</h2>
                <p className="text-[11px] text-slate-500">
                  Reference checklist for handling food orders from this dashboard.
                </p>
              </div>
            </div>
            <button
              type="button"
              className="text-xs text-slate-500 hover:text-slate-700"
              onClick={() => setShowCxInstructions(false)}
            >
              ✕
            </button>
          </div>

          <div className="mt-1 max-h-[60vh] overflow-y-auto rounded-md border border-slate-200 bg-slate-50/60 p-3">
            {cxLoading ? (
              <p className="text-[12px] text-slate-600">Loading instructions…</p>
            ) : cxError ? (
              <p className="text-[12px] text-red-600">{cxError}</p>
            ) : (
              <pre className="whitespace-pre-wrap text-[12px] text-slate-700">
                {cxInstructions}
              </pre>
            )}
          </div>
        </div>
      </div>
    )}
    </>
  );
}
