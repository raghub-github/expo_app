"use client";

import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { useQuery, useQueries, useQueryClient } from "@tanstack/react-query";
import { useAppSearchParams } from "@/hooks/useAppSearchParams";
import { useRouter } from "next/navigation";
import { useFoodOrdersListActive } from "@/hooks/useFoodOrdersListActive";
import {
  endOrderListSearch,
  getOrderListSearchSnapshot,
  ORDER_LIST_SEARCH_REPEAT_EVENT,
  useOrderListSearchPending,
} from "@/lib/orders/order-list-search-ui";
import Link from "next/link";
import { X, RefreshCw, Filter, CheckCircle2, ChevronDown, ArrowUpDown } from "lucide-react";
import { type CSSProperties } from "react";
import { loadClientSnapshot, saveClientSnapshot } from "@/lib/client-route-snapshot";
import { queryKeys } from "@/lib/queryKeys";
import { OrderMixedText, OrderNum } from "@/components/orders/orders-typography";
import {
  DELAYED_ROW_BG,
  OrderStatusLegend,
} from "@/components/orders/OrderStatusLegend";
import {
  fetchOrderCorePayload,
  orderDetailQueryKey,
} from "@/hooks/queries/useOrderDetailQuery";
import { resolveFoodOrderDashboardAction } from "@/lib/orders/food-order-dashboard-status";
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

export type ListSortMode = "newest" | "oldest" | "delayed";

const LIST_SORT_OPTIONS: { value: ListSortMode; label: string }[] = [
  { value: "newest", label: "Newest First" },
  { value: "oldest", label: "Oldest First" },
  { value: "delayed", label: "Delayed" },
];

function parseListSort(raw: string | null): ListSortMode {
  if (raw === "oldest" || raw === "delayed" || raw === "newest") return raw;
  return "newest";
}

interface OrdersCoreRow {
  id: number;
  orderUuid: string;
  orderType: string;
  formattedOrderId: string | null;
  orderId: string | null;
  status?: string | null;
  currentStatus?: string | null;
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
  /** Set when first ETA was breached — used for delayed row highlight. */
  etaBreachedAt?: string | Date | null;
  foodOrderStatus?: string | null;
  cancelledAt?: string | Date | null;
  riderPickedUpAt?: string | Date | null;
  /** From API — terminal outcome (Delivered / Cancelled / RTO - Delivered / …). */
  isTerminal?: boolean;
  isActionable?: boolean;
  dashboardStage?: OrderStatusFilter | null;
  dashboardAction?: string | null;
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
  listSort?: ListSortMode;
}

export async function fetchFoodOrders(
  filters: OrdersFilters,
  signal?: AbortSignal
): Promise<{ orders: OrdersCoreRow[]; total: number; page: number; limit: number }> {
  const params = new URLSearchParams();
  params.set("orderType", filters.orderType);
  const isDirectOrderIdLookup =
    Boolean(filters.search?.trim()) &&
    (filters.searchType === "Order Id" ||
      filters.searchType === "Internal Order Id" ||
      filters.searchType === "Merchant Id" ||
      filters.searchType === "Customer Mobile" ||
      filters.searchType === "Rider Mobile" ||
      !filters.searchType);
  // Direct ID lookup must ignore stage tabs (cancelled/delivered still resolve).
  if (filters.statusFilter && !isDirectOrderIdLookup) {
    params.set("statusFilter", filters.statusFilter);
  }
  if (filters.search) params.set("search", filters.search);
  if (filters.searchType) params.set("searchType", filters.searchType);
  params.set("page", String(filters.page));
  params.set("limit", String(filters.limit));
  if (isDirectOrderIdLookup) {
    params.set("skipCache", "1");
  }
  if (filters.foodFilters) {
    params.set("foodFilters", encodeURIComponent(JSON.stringify(filters.foodFilters)));
  }
  const listSort = filters.listSort ?? "newest";
  params.set("listSort", listSort);
  if (listSort === "oldest") {
    params.set("sortOrder", "asc");
  } else {
    params.set("sortOrder", "desc");
  }

  const res = await fetch(`/api/orders/core?${params.toString()}`, {
    credentials: "include",
    signal,
  });
  const body: OrdersApiResponse = await res.json().catch(() => ({ success: false }));

  if (!res.ok || !body.success || !Array.isArray(body.data)) {
    const message =
      (body as { error?: string }).error ||
      `Orders fetch failed (${res.status || "network"})`;
    throw new Error(message);
  }

  return {
    orders: body.data,
    total: body.pagination?.total ?? body.data.length,
    page: body.pagination?.page ?? filters.page,
    limit: body.pagination?.limit ?? filters.limit,
  };
}

/** Order time column: `7-30-2026, 4:20:53 PM` (dashes, no zero-padded month/day/hour). */
function formatFoodOrderListTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const month = d.getMonth() + 1;
  const day = d.getDate();
  const year = d.getFullYear();
  let hours = d.getHours();
  const minutes = d.getMinutes();
  const seconds = d.getSeconds();
  const ampm = hours >= 12 ? "PM" : "AM";
  hours = hours % 12;
  if (hours === 0) hours = 12;
  const pad2 = (n: number) => String(n).padStart(2, "0");
  return `${month}-${day}-${year}, ${hours}:${pad2(minutes)}:${pad2(seconds)} ${ampm}`;
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
  const listSort = parseListSort(searchParams.get("listSort"));

  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTER_STATE);
  const [showListSortDropdown, setShowListSortDropdown] = useState(false);
  const listSortRef = useRef<HTMLDivElement>(null);

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

  // Default tab: PAYMENT DONE when URL has no statusFilter; default listSort = newest
  useEffect(() => {
    if (!isFoodOrdersListActive) return;
    const params = new URLSearchParams(searchParams.toString());
    let changed = false;
    if (!urlStatus) {
      params.set("statusFilter", "PAYMENT DONE");
      changed = true;
    }
    if (!searchParams.get("listSort")) {
      params.set("listSort", "newest");
      changed = true;
    }
    if (changed) {
      router.replace(`/dashboard/orders/food?${params.toString()}`, { scroll: false });
    }
  }, [isFoodOrdersListActive, urlStatus, searchParams, router]);

  // Hard reload: clear search so reload never restores a previous order-id lookup.
  useEffect(() => {
    if (!isFoodOrdersListActive) return;
    let isReload = false;
    try {
      const nav = performance.getEntriesByType("navigation")[0] as
        | PerformanceNavigationTiming
        | undefined;
      isReload = nav?.type === "reload";
    } catch {
      isReload = false;
    }
    if (!isReload) return;
    const params = new URLSearchParams(searchParams.toString());
    if (!params.get("search") && !params.get("searchType")) return;
    params.delete("search");
    params.delete("searchType");
    router.replace(`/dashboard/orders/food?${params.toString()}`, { scroll: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once on mount/reload only
  }, [isFoodOrdersListActive]);

  const [page] = useState(1);
  const [limit] = useState(20);
  const [showDeliveryDropdown, setShowDeliveryDropdown] = useState(false);
  const [showUserTypeDropdown, setShowUserTypeDropdown] = useState(false);
  const deliveryRef = useRef<HTMLDivElement>(null);
  const userTypeRef = useRef<HTMLDivElement>(null);
  /** Stage instruction for the selected tab — fallback only when row has no resolved action. */
  const STAGE_INSTRUCTION: Record<Exclude<OrderStatusFilter, null>, string> = {
    "PAYMENT DONE": "Verify with MX",
    ACCEPTED: "Check with MX & RX",
    "DESPATCH READY": "Confirm with RX & MX",
    DESPATCHED: "Check with RX & CX",
    BULK: "Check with MX / RX / CX",
  };
  const stageInstructionText = selectedStatus ? STAGE_INSTRUCTION[selectedStatus] ?? "" : "";

  const resolveRowAction = useCallback(
    (row: OrdersCoreRow): { text: string | null; actionable: boolean } => {
      const resolved = resolveFoodOrderDashboardAction({
        status: row.status,
        currentStatus: row.currentStatus,
        foodOrderStatus: row.foodOrderStatus,
        cancelledAt: row.cancelledAt,
        isBulkOrder: row.isBulkOrder,
        riderPickedUpAt: row.riderPickedUpAt,
      });
      // Prefer API enrichment when present; always re-check terminal as a safety layer.
      if (row.isTerminal || resolved.isTerminal) {
        return {
          text: row.dashboardAction || resolved.action || "Delivered",
          actionable: false,
        };
      }
      if (row.dashboardAction) {
        return { text: row.dashboardAction, actionable: row.isActionable !== false };
      }
      if (resolved.action) {
        return { text: resolved.action, actionable: resolved.isActionable };
      }
      // Last resort: selected-tab instruction only for non-terminal active-stage rows.
      return {
        text: stageInstructionText || null,
        actionable: Boolean(stageInstructionText),
      };
    },
    [stageInstructionText]
  );

  const setStatusFilter = useCallback(
    (status: OrderStatusFilter) => {
      if (!status) return;
      const params = new URLSearchParams(searchParams.toString());
      params.set("statusFilter", status);
      // Leaving search mode: drop the lookup so the stage list loads for that CTA.
      params.delete("search");
      params.delete("searchType");
      params.delete("page");
      if (!params.get("listSort")) params.set("listSort", "newest");
      router.replace(`/dashboard/orders/food?${params.toString()}`, { scroll: false });
    },
    [router, searchParams]
  );

  const setListSort = useCallback(
    (mode: ListSortMode) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set("listSort", mode);
      params.delete("page");
      setShowListSortDropdown(false);
      router.replace(`/dashboard/orders/food?${params.toString()}`, { scroll: false });
    },
    [router, searchParams]
  );

  const filtersForQuery: OrdersFilters = useMemo(
    () => ({
      orderType: "food",
      statusFilter: selectedStatus,
      search: urlSearch,
      searchType: urlSearchType,
      page,
      limit,
      foodFilters: foodFiltersPayload,
      listSort,
    }),
    [selectedStatus, urlSearch, urlSearchType, page, limit, foodFiltersPayload, listSort]
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
  const searchPending = useOrderListSearchPending();
  const sawSearchFetchRef = useRef(false);

  useEffect(() => {
    if (!searchPending) {
      sawSearchFetchRef.current = false;
      return;
    }
    if (isFetching) sawSearchFetchRef.current = true;
    const submitted = getOrderListSearchSnapshot().query;
    if ((urlSearch ?? "") !== submitted) return;
    if (!sawSearchFetchRef.current || isFetching) return;
    endOrderListSearch();
  }, [searchPending, urlSearch, isFetching]);

  useEffect(() => {
    const onRepeat = () => {
      void refetchOrders();
    };
    window.addEventListener(ORDER_LIST_SEARCH_REPEAT_EVENT, onRepeat);
    return () => window.removeEventListener(ORDER_LIST_SEARCH_REPEAT_EVENT, onRepeat);
  }, [refetchOrders]);

  // Stage tab counts — always from unscoped stage queries (never search result totals).
  const statusCountFilters = useMemo(
    () =>
      FOOD_STATUS_TABS.map(
        (status): OrdersFilters => ({
          orderType: "food",
          statusFilter: status,
          search: "",
          searchType: "Order Id",
          page: 1,
          limit: 20,
          foodFilters: foodFiltersPayload,
          listSort: "newest",
        })
      ),
    [foodFiltersPayload]
  );
  const statusCountQueries = useQueries({
    queries: statusCountFilters.map((tabFilters) => ({
      queryKey: queryKeys.ordersCore.foodList(
        tabFilters as unknown as Record<string, unknown>
      ),
      queryFn: ({ signal }: { signal?: AbortSignal }) =>
        fetchFoodOrders(tabFilters, signal),
      enabled: shouldFetch,
      staleTime: 2 * 60 * 1000,
      gcTime: 10 * 60 * 1000,
      refetchOnWindowFocus: false,
      placeholderData: (previousData: Awaited<ReturnType<typeof fetchFoodOrders>> | undefined) =>
        previousData,
    })),
  });
  const statusCounts = useMemo(() => {
    const map = {} as Record<Exclude<OrderStatusFilter, null>, number>;
    const searching = Boolean(urlSearch.trim());
    FOOD_STATUS_TABS.forEach((status, i) => {
      // While searching, never substitute the search-hit total into a stage CTA count.
      const fromActive =
        !searching && selectedStatus === status ? ordersData?.total : undefined;
      map[status] = fromActive ?? statusCountQueries[i]?.data?.total ?? 0;
    });
    return map;
  }, [selectedStatus, ordersData?.total, statusCountQueries, urlSearch]);

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
  const hasActiveSearch = Boolean(urlSearch.trim());
  const searchInFlight = searchPending;
  const showTableLoading =
    hasMounted && ((isPending && orders.length === 0) || searchInFlight);
  const [manualRefreshing, setManualRefreshing] = useState(false);
  const isRefreshing = manualRefreshing || (hasMounted && isFetching && orders.length > 0);
  // Close dropdowns when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (deliveryRef.current && !deliveryRef.current.contains(event.target as Node)) {
        setShowDeliveryDropdown(false);
      }
      if (userTypeRef.current && !userTypeRef.current.contains(event.target as Node)) {
        setShowUserTypeDropdown(false);
      }
      if (listSortRef.current && !listSortRef.current.contains(event.target as Node)) {
        setShowListSortDropdown(false);
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
    void Promise.all([
      refetchOrders(),
      queryClient.invalidateQueries({ queryKey: ["orders", "core", "food"] }),
    ]).finally(() => {
      setManualRefreshing(false);
    });
  }, [refetchOrders, queryClient]);
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

      // Search results always use white row bg (no delayed highlight).
      const isDelayed = !hasActiveSearch && Boolean(row.etaBreachedAt);

      const { text: actionText, actionable } = resolveRowAction(row);

      return (
        <tr
          key={row.id}
          className="border-b border-gray-200 hover:bg-gray-50"
          style={{
            ...style,
            backgroundColor: isDelayed ? DELAYED_ROW_BG : "#FFFFFF",
          }}
          title={isDelayed ? "Delayed — ETA breached" : undefined}
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
            title={actionText || undefined}
          >
            {actionText ? (
              <span
                className="text-[11px] font-medium"
                style={{ color: actionable ? CHECKMARK_COLOR : "#64748b" }}
              >
                <OrderMixedText>{actionText}</OrderMixedText>
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
              {row.createdAt ? formatFoodOrderListTime(row.createdAt) : "—"}
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
    [orders, resolveRowAction, queryClient, hasActiveSearch]
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
            PAYMENT DONE (<OrderNum>{statusCounts["PAYMENT DONE"]}</OrderNum>)
          </button>
          <button
            onClick={() => setStatusFilter("ACCEPTED")}
            className={`flex-1 px-3 py-2 rounded-md text-xs transition-colors border cursor-pointer ${
              selectedStatus === "ACCEPTED" ? "font-bold" : "font-medium"
            }`}
            style={getButtonStyles(selectedStatus === "ACCEPTED")}
          >
            ACCEPTED (<OrderNum>{statusCounts.ACCEPTED}</OrderNum>)
          </button>
          <button
            onClick={() => setStatusFilter("DESPATCH READY")}
            className={`flex-1 px-3 py-2 rounded-md text-xs transition-colors border cursor-pointer ${
              selectedStatus === "DESPATCH READY" ? "font-bold" : "font-medium"
            }`}
            style={getButtonStyles(selectedStatus === "DESPATCH READY")}
          >
            DESPATCH READY (<OrderNum>{statusCounts["DESPATCH READY"]}</OrderNum>)
          </button>
          <button
            onClick={() => setStatusFilter("DESPATCHED")}
            className={`flex-1 px-3 py-2 rounded-md text-xs transition-colors border cursor-pointer ${
              selectedStatus === "DESPATCHED" ? "font-bold" : "font-medium"
            }`}
            style={getButtonStyles(selectedStatus === "DESPATCHED")}
          >
            DESPATCHED (<OrderNum>{statusCounts.DESPATCHED}</OrderNum>)
          </button>
          <button
            onClick={() => setStatusFilter("BULK")}
            className={`flex-1 px-3 py-2 rounded-md text-xs transition-colors border cursor-pointer ${
              selectedStatus === "BULK" ? "font-bold" : "font-medium"
            }`}
            style={getBulkButtonStyles(selectedStatus === "BULK")}
            title={`${statusCounts.BULK} bulk order(s) pending`}
          >
            BULK (<OrderNum>{statusCounts.BULK}</OrderNum>)
          </button>
        </div>
      </div>

      {/* Summary and Action Bar — single row: count | legend | actions */}
      <div
        className="flex items-center gap-2 rounded-xl border p-2 shadow-[0_1px_3px_rgba(18,18,18,0.04)]"
        style={{ backgroundColor: CONTENT_BG, borderColor: BORDER_COLOR }}
      >
        <div className="flex items-center gap-1.5 shrink-0 min-w-0">
          <CheckCircle2 className="h-4 w-4 shrink-0" style={{ color: CHECKMARK_COLOR }} />
          <span className="text-xs font-medium whitespace-nowrap" style={{ color: DARK_TEXT }}>
            {selectedStatus ? selectedStatus.substring(0, 3).toUpperCase() : "PAY"} -{" "}
            <OrderNum>{orderCount}</OrderNum> / Out Of <OrderNum>{orderCount}</OrderNum>
          </span>
        </div>

        <div className="flex-1 min-w-0 flex items-center justify-center px-2">
          <OrderStatusLegend compact />
        </div>

        <div className="flex items-center gap-2 shrink-0">
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
          <div ref={listSortRef} className="relative">
            <button
              type="button"
              onClick={() => setShowListSortDropdown((v) => !v)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium border cursor-pointer"
              style={getDropdownButtonStyles(listSort !== "newest")}
              aria-expanded={showListSortDropdown}
              title="Sort / filter list"
            >
              <ArrowUpDown className="h-3.5 w-3.5" />
              {LIST_SORT_OPTIONS.find((o) => o.value === listSort)?.label ?? "Newest First"}
              <ChevronDown className="h-3 w-3" />
            </button>
            {showListSortDropdown && (
              <div
                className="absolute right-0 top-full mt-1 w-44 border rounded-lg shadow-lg z-50 py-1"
                style={{ backgroundColor: CONTENT_BG, borderColor: BORDER_COLOR }}
              >
                {LIST_SORT_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setListSort(opt.value)}
                    className={`w-full px-3 py-2 text-left text-xs hover:bg-gray-50 cursor-pointer ${
                      listSort === opt.value ? "font-semibold" : "font-medium"
                    }`}
                    style={{
                      color: DARK_TEXT,
                      backgroundColor: listSort === opt.value ? INACTIVE_BG : undefined,
                    }}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            )}
          </div>
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
              <tr>
                <td colSpan={9} className="px-2 py-8 text-center text-xs" style={{ color: TABLE_TEXT }}>
                  {hasActiveSearch || searchPending ? "Searching…" : "Loading orders…"}
                </td>
              </tr>
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
