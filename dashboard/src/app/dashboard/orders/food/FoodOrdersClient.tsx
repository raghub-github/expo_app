"use client";

import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAppSearchParams } from "@/hooks/useAppSearchParams";
import { useRouter } from "next/navigation";
import { useFoodOrdersListActive } from "@/hooks/useFoodOrdersListActive";
import Link from "next/link";
import { X, RefreshCw, Filter, CheckCircle2, ChevronDown } from "lucide-react";
import { type CSSProperties } from "react";
import { loadClientSnapshot, saveClientSnapshot } from "@/lib/client-route-snapshot";
import { queryKeys } from "@/lib/queryKeys";
import { FoodOrdersTableRowsSkeleton } from "@/components/skeletons/FoodOrdersPageSkeleton";
import { OrderMixedText, OrderNum } from "@/components/orders/orders-typography";
import {
  fetchOrderCorePayload,
  orderDetailQueryKey,
} from "@/hooks/queries/useOrderDetailQuery";
// Dashboard UI tokens (aligned with tickets / home rails — charcoal primary, not mint)
const ACCENT = "#121212"; // Primary CTA / active tab
const ACCENT_TEXT = "#FFFFFF";
/** BULK tab active — light yellow so it stands out from charcoal status tabs. */
const BULK_ACTIVE_BG = "#FDE68A";
const BULK_ACTIVE_BORDER = "#F59E0B";
const PAGE_BG = "#f3f5f7"; // Page background (tickets / dashboard rail)
const CONTENT_BG = "#FFFFFF"; // White content cards
const INACTIVE_BG = "#eef1f4"; // Inactive button background
const INACTIVE_TEXT = "#121212"; // Charcoal text
const BORDER_COLOR = "rgba(18,18,18,0.12)"; // Soft charcoal border
const DARK_TEXT = "#121212"; // Charcoal headers
const TABLE_TEXT = "#121212"; // Table data text
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

const FOOD_STATUS_TABS: Exclude<OrderStatusFilter, null>[] = [
  "PAYMENT DONE",
  "ACCEPTED",
  "DESPATCH READY",
  "DESPATCHED",
  "BULK",
];

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
  /** Actual store_id from merchant_stores (e.g. GMMC123). */
  storeId?: string | null;
  /** Locality from merchant store address (landmark / city). */
  merchantLocality?: string | null;
  pickupAddressRaw?: string | null;
  pickupAddressNormalized?: string | null;
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
  /** Trust tier labels matching DB `customer_trust_tier` / TRUST_TIER_LABEL */
  userType: string[];
}

/** Serialized in URL `foodFilters` and sent to /api/orders/core */
export interface FoodFiltersPayload {
  delivery?: ("GatiMitra" | "Merchant")[];
  pickUp?: boolean;
  food?: boolean;
  fashion?: boolean;
  grocery?: boolean;
  pharma?: boolean;
  overview?: boolean;
  userType?: string[];
}

const DEFAULT_FILTER_STATE: FilterState = {
  delivery: [],
  pickUp: false,
  food: false,
  fashion: false,
  grocery: false,
  pharma: false,
  overview: false,
  userType: [],
};

const USER_TYPE_OPTIONS = [
  "Premium",
  "Very Good",
  "Good",
  "Bad",
  "Very Bad",
  "Fraud",
] as const;

interface OrdersApiResponse {
  success: boolean;
  data?: OrdersCoreRow[];
  pagination?: {
    page: number;
    limit: number;
    total: number;
    totalPages?: number;
  };
  error?: string;
}

export interface OrdersFilters {
  orderType: "food";
  statusFilter: OrderStatusFilter | null;
  search: string;
  searchType: string;
  page: number;
  limit: number;
  foodFilters?: FoodFiltersPayload;
}

function useDebouncedValue<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const handle = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(handle);
  }, [value, delay]);

  return debounced;
}

export async function fetchFoodOrders(
  filters: OrdersFilters,
  signal?: AbortSignal
): Promise<{ orders: OrdersCoreRow[]; total: number; page: number; limit: number }> {
  const params = new URLSearchParams();
  params.set("orderType", filters.orderType);
  if (filters.statusFilter) params.set("statusFilter", filters.statusFilter);
  if (filters.search) params.set("search", filters.search);
  if (filters.searchType) params.set("searchType", filters.searchType);
  params.set("page", String(filters.page));
  params.set("limit", String(filters.limit));
  if (filters.foodFilters) {
    params.set("foodFilters", encodeURIComponent(JSON.stringify(filters.foodFilters)));
  }

  const res = await fetch(`/api/orders/core?${params.toString()}`, { credentials: "include", signal });
  const body: OrdersApiResponse = await res.json().catch(() => ({ success: false }));

  if (!res.ok || !body.success || !Array.isArray(body.data)) {
    return { orders: [], total: 0, page: filters.page, limit: filters.limit };
  }

  return {
    orders: body.data,
    total: body.pagination?.total ?? body.data.length,
    page: body.pagination?.page ?? filters.page,
    limit: body.pagination?.limit ?? filters.limit,
  };
}

function useFoodOrdersQuery(
  filters: OrdersFilters,
  enabled: boolean,
  snapshotKey: string | null,
  initialData: Awaited<ReturnType<typeof fetchFoodOrders>> | null | undefined
) {
  const query = useQuery({
    queryKey: queryKeys.ordersCore.foodList(filters as unknown as Record<string, unknown>),
    queryFn: ({ signal }) => fetchFoodOrders(filters, signal),
    enabled,
    ...(initialData != null ? { initialData } : {}),
    staleTime: 2 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    refetchOnWindowFocus: false,
    refetchOnMount: true,
    placeholderData: (previousData) => previousData,
  });

  useEffect(() => {
    if (!snapshotKey || query.data == null) return;
    saveClientSnapshot(snapshotKey, query.data);
  }, [snapshotKey, query.data]);

  return query;
}

export default function FoodOrdersClient() {
  const [hasMounted, setHasMounted] = useState(false);
  useEffect(() => setHasMounted(true), []);

  const isFoodOrdersListActive = useFoodOrdersListActive();
  const queryClient = useQueryClient();
  // Server page already enforced ORDER_FOOD access; list API validates session via cookies.
  const shouldFetch = hasMounted && isFoodOrdersListActive;

  const router = useRouter();
  const searchParams = useAppSearchParams();
  const urlStatus = searchParams.get("statusFilter") as OrderStatusFilter | null;
  const urlSearch = searchParams.get("search") ?? "";
  const urlSearchType = searchParams.get("searchType") ?? "Order Id";

  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTER_STATE);

  const foodFiltersRaw = searchParams.get("foodFilters");
  const foodFiltersPayload = useMemo((): FoodFiltersPayload | undefined => {
    if (!foodFiltersRaw) return undefined;
    try {
      return JSON.parse(decodeURIComponent(foodFiltersRaw)) as FoodFiltersPayload;
    } catch {
      return undefined;
    }
  }, [foodFiltersRaw]);

  useEffect(() => {
    if (!foodFiltersRaw) {
      setFilters(DEFAULT_FILTER_STATE);
      return;
    }
    try {
      const p = JSON.parse(decodeURIComponent(foodFiltersRaw)) as FoodFiltersPayload;
      setFilters({
        delivery: (p.delivery as FilterState["delivery"]) ?? [],
        pickUp: p.pickUp ?? false,
        food: p.food ?? false,
        fashion: p.fashion ?? false,
        grocery: p.grocery ?? false,
        pharma: p.pharma ?? false,
        overview: p.overview ?? false,
        userType: p.userType ?? [],
      });
    } catch {
      setFilters(DEFAULT_FILTER_STATE);
    }
  }, [foodFiltersRaw]);

  const selectedStatus: OrderStatusFilter = urlStatus ?? "PAYMENT DONE";

  // Default tab: PAYMENT DONE when URL has no statusFilter
  useEffect(() => {
    if (!isFoodOrdersListActive) return;
    if (urlStatus) return;
    const params = new URLSearchParams(searchParams.toString());
    params.set("statusFilter", "PAYMENT DONE");
    router.replace(`/dashboard/orders/food?${params.toString()}`, { scroll: false });
  }, [isFoodOrdersListActive, urlStatus, searchParams, router]);
  const [page] = useState(1);
  const [limit] = useState(20);
  const debouncedSearch = useDebouncedValue(urlSearch, 400);
  const [showDeliveryDropdown, setShowDeliveryDropdown] = useState(false);
  const [showUserTypeDropdown, setShowUserTypeDropdown] = useState(false);
  const deliveryRef = useRef<HTMLDivElement>(null);
  const userTypeRef = useRef<HTMLDivElement>(null);
  /** Stage instruction shown in Action column when that status filter is selected */
  const STAGE_INSTRUCTION: Record<Exclude<OrderStatusFilter, null>, string> = {
    "PAYMENT DONE": "Verify with MX",
    ACCEPTED: "Check with MX & RX",
    "DESPATCH READY": "Confirm with RX & MX",
    DESPATCHED: "Check with RX & CX",
    BULK: "Check with MX / RX / CX",
  };
  const stageInstructionText = selectedStatus ? STAGE_INSTRUCTION[selectedStatus] ?? "" : "";

  const setStatusFilter = useCallback(
    (status: OrderStatusFilter) => {
      if (!status) return;
      const params = new URLSearchParams(searchParams.toString());
      params.set("statusFilter", status);
      params.delete("page");
      router.replace(`/dashboard/orders/food?${params.toString()}`, { scroll: false });
    },
    [router, searchParams]
  );
  const filtersForQuery: OrdersFilters = useMemo(
    () => ({
      orderType: "food",
      statusFilter: selectedStatus,
      search: debouncedSearch,
      searchType: urlSearchType,
      page,
      limit,
      foodFilters: foodFiltersPayload,
    }),
    [selectedStatus, debouncedSearch, urlSearchType, page, limit, foodFiltersPayload]
  );

  const SNAPSHOT_TTL_MS = 5 * 60 * 1000;
  const listQueryKey = useMemo(
    () => queryKeys.ordersCore.foodList(filtersForQuery as unknown as Record<string, unknown>),
    [filtersForQuery]
  );

  const snapshotKey = useMemo(() => {
    if (!isFoodOrdersListActive) return null;
    return `dashboard_snapshot:orders_food_v2:/dashboard/orders/food:${JSON.stringify(filtersForQuery)}`;
  }, [isFoodOrdersListActive, filtersForQuery]);

  const cachedListData = useMemo(() => {
    if (!hasMounted) return null;
    return queryClient.getQueryData<Awaited<ReturnType<typeof fetchFoodOrders>>>(listQueryKey) ?? null;
  }, [hasMounted, listQueryKey, queryClient]);

  const initialSnapshot = useMemo(() => {
    if (!hasMounted || !snapshotKey) return null;
    return loadClientSnapshot<Awaited<ReturnType<typeof fetchFoodOrders>>>(snapshotKey, SNAPSHOT_TTL_MS);
  }, [hasMounted, snapshotKey]);

  const initialListData = cachedListData ?? initialSnapshot ?? undefined;

  const {
    data: ordersData,
    isFetching,
    isPending,
    refetch: refetchOrders,
  } = useFoodOrdersQuery(filtersForQuery, shouldFetch, snapshotKey, initialListData);

  // Always keep BULK pending count available (even when another status tab is selected).
  const bulkFiltersForCount = useMemo(
    (): OrdersFilters => ({ ...filtersForQuery, statusFilter: "BULK" }),
    [filtersForQuery]
  );
  const { data: bulkOrdersData } = useQuery({
    queryKey: queryKeys.ordersCore.foodList(
      bulkFiltersForCount as unknown as Record<string, unknown>
    ),
    queryFn: ({ signal }) => fetchFoodOrders(bulkFiltersForCount, signal),
    enabled: shouldFetch,
    staleTime: 2 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    refetchOnWindowFocus: false,
    placeholderData: (previousData) => previousData,
  });
  const bulkPendingCount =
    selectedStatus === "BULK"
      ? (ordersData?.total ?? bulkOrdersData?.total ?? 0)
      : (bulkOrdersData?.total ?? 0);

  // Prefetch other status tabs in the background so tab switches feel instant.
  useEffect(() => {
    if (!shouldFetch) return;
    for (const status of FOOD_STATUS_TABS) {
      if (status === selectedStatus) continue;
      const tabFilters: OrdersFilters = { ...filtersForQuery, statusFilter: status };
      void queryClient.prefetchQuery({
        queryKey: queryKeys.ordersCore.foodList(
          tabFilters as unknown as Record<string, unknown>
        ),
        queryFn: ({ signal }) => fetchFoodOrders(tabFilters, signal),
        staleTime: 2 * 60 * 1000,
      });
    }
  }, [shouldFetch, filtersForQuery, selectedStatus, queryClient]);

  const orders = ordersData?.orders ?? cachedListData?.orders ?? initialSnapshot?.orders ?? [];
  const total = ordersData?.total ?? cachedListData?.total ?? initialSnapshot?.total ?? 0;
  const showTableLoading = hasMounted && isPending && orders.length === 0;
  const [manualRefreshing, setManualRefreshing] = useState(false);
  const isRefreshing = manualRefreshing || (hasMounted && isFetching && orders.length > 0);
  const hasActiveSearch = Boolean(debouncedSearch.trim());
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

  const applyFilters = useCallback(() => {
    const params = new URLSearchParams(searchParams.toString());
    const payload: FoodFiltersPayload = {
      delivery: filters.delivery as FoodFiltersPayload["delivery"],
      pickUp: filters.pickUp,
      food: filters.food,
      fashion: filters.fashion,
      grocery: filters.grocery,
      pharma: filters.pharma,
      overview: filters.overview,
      userType: filters.userType,
    };
    const hasAny =
      (payload.delivery?.length ?? 0) > 0 ||
      payload.pickUp ||
      payload.food ||
      payload.fashion ||
      payload.grocery ||
      payload.pharma ||
      payload.overview ||
      (payload.userType?.length ?? 0) > 0;
    if (hasAny) {
      params.set("foodFilters", encodeURIComponent(JSON.stringify(payload)));
    } else {
      params.delete("foodFilters");
    }
    router.replace(`/dashboard/orders/food?${params.toString()}`, { scroll: false });
  }, [router, searchParams, filters]);

  const clearAllFilters = useCallback(() => {
    setFilters(DEFAULT_FILTER_STATE);
    const params = new URLSearchParams(searchParams.toString());
    params.delete("foodFilters");
    router.replace(`/dashboard/orders/food?${params.toString()}`, { scroll: false });
  }, [router, searchParams]);

  const refreshData = useCallback(() => {
    setManualRefreshing(true);
    void Promise.resolve(refetchOrders()).finally(() => {
      setManualRefreshing(false);
    });
  }, [refetchOrders]);
  const orderCount = total;

  const ROW_HEIGHT = 40;

  const OrdersRow = useCallback(
    ({ index, style }: { index: number; style?: CSSProperties }) => {
      const row = orders[index];
      if (!row) return null;

      const displayId =
        row.formattedOrderId ??
        row.orderId ??
        `GMF${String(row.id ?? "").padStart(6, "0")}`;
      const publicId = String(displayId).replace(/^#/, "");
      const routedTo = row.routedToEmail ?? "";
      const merchantIdDisplay =
        row.storeId != null && row.storeId !== "" ? row.storeId : null;
      const locality =
        row.merchantLocality?.trim() ||
        (row.pickupAddressNormalized ?? row.pickupAddressRaw ?? "")
          .split(",")
          .map((p) => p.trim())
          .find((p) => p.length >= 2 && !/^\d{5,6}$/.test(p)) ||
        null;
      const hasAssignedRider =
        row.riderId != null &&
        Number.isFinite(Number(row.riderId)) &&
        Number(row.riderId) > 0;
      const deliverProvider = !hasAssignedRider
        ? "—"
        : !row.orderSource || row.orderSource === "internal"
          ? "GatiMitra"
          : row.orderSource.charAt(0).toUpperCase() + row.orderSource.slice(1);

      return (
        <tr
          key={row.id}
          className="border-b border-gray-200 hover:bg-gray-50"
          style={style}
        >
          <td className="px-2 py-1.5 whitespace-nowrap" style={{ color: TABLE_TEXT }}>
            <Link
              href={`/order/${encodeURIComponent(publicId)}`}
              target="_blank"
              rel="noopener noreferrer"
              prefetch={false}
              onMouseEnter={() => {
                void queryClient.prefetchQuery({
                  queryKey: orderDetailQueryKey(publicId),
                  queryFn: ({ signal }) =>
                    fetchOrderCorePayload({ orderPublicId: publicId }, signal),
                  staleTime: 3 * 60 * 1000,
                });
              }}
              className="orders-num inline-flex items-center px-2 py-0.5 rounded font-medium cursor-pointer hover:underline text-[11px]"
              style={{ backgroundColor: ORDER_TAG_BG, color: ORDER_TAG_TEXT }}
            >
              #{publicId}
            </Link>
          </td>
          <td
            className="px-2 py-1.5 max-w-[200px]"
            style={{ color: TABLE_TEXT }}
            title={stageInstructionText || undefined}
          >
            {stageInstructionText ? (
              <span className="text-[11px] font-medium" style={{ color: CHECKMARK_COLOR }}>
                <OrderMixedText>{stageInstructionText}</OrderMixedText>
              </span>
            ) : (
              <span>—</span>
            )}
          </td>
          <td className="px-2 py-1.5 truncate max-w-[160px]" style={{ color: TABLE_TEXT }}>
            {routedTo || "—"}
          </td>
          <td className="px-2 py-1.5 whitespace-nowrap" style={{ color: TABLE_TEXT }}>
            <OrderNum>
              {row.createdAt ? new Date(row.createdAt).toLocaleString() : "—"}
            </OrderNum>
          </td>
          <td className="px-2 py-1.5" style={{ color: TABLE_TEXT }}>
            {row.customerName ?? "—"}
          </td>
          <td className="px-2 py-1.5 whitespace-nowrap" style={{ color: TABLE_TEXT }}>
            <OrderNum>{row.customerMobile ?? "—"}</OrderNum>
          </td>
          <td className="px-2 py-1.5 whitespace-nowrap" style={{ color: TABLE_TEXT }}>
            {merchantIdDisplay != null ? (
              <OrderNum>{merchantIdDisplay}</OrderNum>
            ) : (
              "—"
            )}
          </td>
          <td
            className="px-2 py-1.5 max-w-[140px] truncate"
            style={{ color: TABLE_TEXT }}
            title={locality ?? undefined}
          >
            {locality ?? "—"}
          </td>
          <td
            className="px-2 py-1.5 whitespace-nowrap"
            style={{ color: TABLE_TEXT }}
          >
            {deliverProvider}
          </td>
        </tr>
      );
    },
    [orders, stageInstructionText, queryClient]
  );

  // Helper function to get button styles - prevents hydration mismatch
  const getButtonStyles = (isActive: boolean) => {
    if (isActive) {
      return {
        backgroundColor: ACCENT,
        color: ACCENT_TEXT,
        borderColor: ACCENT,
      };
    }
    return {
      backgroundColor: INACTIVE_BG,
      color: INACTIVE_TEXT,
      borderColor: BORDER_COLOR,
    };
  };

  const getBulkButtonStyles = (isActive: boolean) => {
    if (isActive) {
      return {
        backgroundColor: BULK_ACTIVE_BG,
        color: DARK_TEXT,
        borderColor: BULK_ACTIVE_BORDER,
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
        backgroundColor: ACCENT,
        color: ACCENT_TEXT,
        borderColor: ACCENT,
      };
    }
    return {
      backgroundColor: CONTENT_BG,
      color: INACTIVE_TEXT,
      borderColor: BORDER_COLOR,
    };
  };

  return (
    <>
    <div
      className="orders-typo space-y-2 w-full max-w-full min-h-full overflow-x-hidden"
      style={{ backgroundColor: PAGE_BG }}
    >
      {/* Filter Section - No border */}
      <div
        className="rounded-xl border p-2 shadow-[0_1px_3px_rgba(18,18,18,0.04)]"
        style={{ backgroundColor: CONTENT_BG, borderColor: BORDER_COLOR }}
      >
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
            Overdue
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
                className="absolute top-full left-0 mt-1 w-48 border rounded-lg shadow-lg z-50 max-h-64 overflow-y-auto"
                style={{ backgroundColor: CONTENT_BG, borderColor: BORDER_COLOR }}
              >
                {USER_TYPE_OPTIONS.map((label) => (
                  <label
                    key={label}
                    className="flex items-center px-4 py-2 hover:bg-gray-100 cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={filters.userType.includes(label)}
                      onChange={() => handleUserTypeToggle(label)}
                      className="mr-2"
                    />
                    <span className="text-sm" style={{ color: DARK_TEXT }}>{label}</span>
                  </label>
                ))}
              </div>
            )}
          </div>

          {/* Apply Filter Button */}
          <button
            type="button"
            onClick={applyFilters}
            className="ml-auto px-3 py-1.5 rounded-md text-xs font-medium uppercase border cursor-pointer"
            style={{ backgroundColor: ACCENT, color: ACCENT_TEXT, borderColor: ACCENT }}
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
      <div
        className="rounded-xl border p-2 mt-3 shadow-[0_1px_3px_rgba(18,18,18,0.04)]"
        style={{ backgroundColor: CONTENT_BG, borderColor: BORDER_COLOR }}
      >
        <div className="flex items-center gap-2 w-full">
          <button
            onClick={() => setStatusFilter("PAYMENT DONE")}
            className={`flex-1 px-3 py-2 rounded-md text-xs transition-colors border cursor-pointer ${
              selectedStatus === "PAYMENT DONE" ? "font-bold" : "font-medium"
            }`}
            style={getButtonStyles(selectedStatus === "PAYMENT DONE")}
          >
            PAYMENT DONE
          </button>
          <button
            onClick={() => setStatusFilter("ACCEPTED")}
            className={`flex-1 px-3 py-2 rounded-md text-xs transition-colors border cursor-pointer ${
              selectedStatus === "ACCEPTED" ? "font-bold" : "font-medium"
            }`}
            style={getButtonStyles(selectedStatus === "ACCEPTED")}
          >
            ACCEPTED
          </button>
          <button
            onClick={() => setStatusFilter("DESPATCH READY")}
            className={`flex-1 px-3 py-2 rounded-md text-xs transition-colors border cursor-pointer ${
              selectedStatus === "DESPATCH READY" ? "font-bold" : "font-medium"
            }`}
            style={getButtonStyles(selectedStatus === "DESPATCH READY")}
          >
            DESPATCH READY
          </button>
          <button
            onClick={() => setStatusFilter("DESPATCHED")}
            className={`flex-1 px-3 py-2 rounded-md text-xs transition-colors border cursor-pointer ${
              selectedStatus === "DESPATCHED" ? "font-bold" : "font-medium"
            }`}
            style={getButtonStyles(selectedStatus === "DESPATCHED")}
          >
            DESPATCHED
          </button>
          <button
            onClick={() => setStatusFilter("BULK")}
            className={`flex-1 px-3 py-2 rounded-md text-xs transition-colors border cursor-pointer ${
              selectedStatus === "BULK" ? "font-bold" : "font-medium"
            }`}
            style={getBulkButtonStyles(selectedStatus === "BULK")}
            title={`${bulkPendingCount} bulk order(s) pending`}
          >
            BULK (<OrderNum>{bulkPendingCount}</OrderNum>)
          </button>
        </div>
      </div>

      {/* Summary and Action Bar - No border */}
      <div
        className="flex items-center justify-between rounded-xl border p-2 shadow-[0_1px_3px_rgba(18,18,18,0.04)]"
        style={{ backgroundColor: CONTENT_BG, borderColor: BORDER_COLOR }}
      >
        <div className="flex items-center gap-1.5">
          <CheckCircle2 className="h-4 w-4" style={{ color: CHECKMARK_COLOR }} />
          <span className="text-xs font-medium" style={{ color: DARK_TEXT }}>
            {selectedStatus ? selectedStatus.substring(0, 3).toUpperCase() : "PAY"} -{" "}
            <OrderNum>{orderCount}</OrderNum> / Out Of <OrderNum>{orderCount}</OrderNum>
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={refreshData}
            disabled={isFetching && orders.length === 0}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium border cursor-pointer disabled:opacity-60"
            style={{ backgroundColor: ACCENT, color: ACCENT_TEXT, borderColor: ACCENT }}
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isRefreshing ? "animate-spin" : ""}`} />
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

      {/* Orders Table — previous compact list rows (header + gray hover) */}
      <div
        className="overflow-x-auto"
        style={{ backgroundColor: CONTENT_BG, maxHeight: 400, overflowY: "auto" }}
      >
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
                DE provider
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200" style={{ backgroundColor: CONTENT_BG }}>
            {showTableLoading ? (
              <FoodOrdersTableRowsSkeleton rows={8} />
            ) : orders.length === 0 ? (
              hasActiveSearch ? (
                <tr>
                  <td colSpan={9} className="px-2 py-4 text-center text-xs" style={{ color: TABLE_TEXT }}>
                    We couldn&apos;t find any data for this ID.
                  </td>
                </tr>
              ) : null
            ) : (
              <>
                {orders.map((r, i) => (
                  <OrdersRow key={r.id ?? i} index={i} />
                ))}
              </>
            )}
          </tbody>
        </table>
      </div>
    </div>
    </>
  );
}
