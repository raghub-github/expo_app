'use client';

import React, { useEffect, useState, useCallback, useRef, useMemo, Suspense } from 'react';
import { createPortal } from 'react-dom';
import { useSearchParams, useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { MXLayoutWhite } from '@/components/MXLayoutWhite';
import { PartnerPageHeader } from '@/context/PartnerShellHeaderContext';
import { toast } from 'sonner';
import { showFoodOrderStatusToast } from '@/lib/showFoodOrderStatusToast';
import {
  dispatchPartnerNotificationsChanged,
  shouldClearOrderNotifications,
} from '@/lib/clear-store-order-notifications';
import { toastStoreOperationsPostFailure } from '@/lib/storeOperationsPostFeedback';
import { displayLabelForAcceptedStep } from '@/lib/merchantVisibleTimeline';
import { partnerSurfaceOnlineFromStoreOperationsBody } from '@/lib/partnerStoreSurfaceOnline';
import {
  Clock,
  CheckCircle2,
  XCircle,
  ChevronRight,
  Package,
  UtensilsCrossed,
  AlertTriangle,
  Star,
  Store,
  Bell,
  BellOff,
  X,
  Printer,
  ChevronLeft,
  LayoutGrid,
  List,
  Phone,
  MapPin,
  Search,
  ChevronDown,
  Loader2,
  Power,
  Check,
  User,
  Bike,
  MoreVertical,
} from 'lucide-react';
import { type OrdersFoodRow, type FoodOrderStats } from '@/hooks/useFoodOrders';
import {
  DEFAULT_FOOD_ORDER_STATS,
  readCachedFoodOrderStats,
  writeCachedFoodOrderStats,
} from '@/lib/food-order-stats-cache';
import { usePastRidersEligibility } from '@/hooks/usePastRidersEligibility';
import { PageSkeletonOrders } from '@/components/PageSkeleton';
import { MerchantStore } from '@/lib/merchantStore';
import { isValidPartnerStoreId } from '@/lib/partner-store-id-shared';
import { usePartnerStoreRecord } from '@/hooks/usePartnerStoreRecord';
import { merchantKeys } from '@/lib/query-keys';
import { createClient } from '@/lib/supabase/client';
import { MobileHamburgerButton } from '@/components/MobileHamburgerButton';
import { FoodOrdersEmptyState } from '@/components/FoodOrdersEmptyState';
import {
  actionSourceLabel,
  computeOrderItemQuantityCount,
  formatStatusActionMessage,
  type MerchantOrderActionRow,
} from '@/lib/merchantOrderFoodActions';
import { OrderPanel } from '@/components/orders/OrderPanel';
import { MerchantOrderItemsList } from '@/components/orders/MerchantOrderItemsList';
import { MerchantOrderBillSummary } from '@/components/orders/MerchantOrderBillSummary';
import { resolveMerchantInstructionsForDisplay, formatMerchantInstructionsForCard } from '@/lib/merchant-order-instructions';
import { resolveMerchantCtm } from '@/lib/merchant-order-ctm';
import { formatInr } from '@/lib/format-inr';
import { resolvePreparedLateMinutes } from '@/lib/order-prep-time';
import type { NormalizedOrderLineItem } from '@/lib/orderLineItems';
import { OrderRidersHistorySidesheet } from '@/components/orders/OrderRidersHistorySidesheet';
import { OrderBillSidesheet } from '@/components/orders/OrderBillSidesheet';
import {
  GatiMitraOrderPrintBill,
  printOrderBill,
  type GatiMitraPrintStoreInfo,
} from '@/components/orders/GatiMitraOrderPrintBill';
import { printOrderKot } from '@/components/orders/GatiMitraOrderPrintKOT';
import { prefetchMerchantOrderTimelineBundle } from '@/lib/merchantTimelineEnrichmentCache';
import { OrderCustomerSidesheet } from '@/components/orders/OrderCustomerSidesheet';
import { OrderTimelineModal } from '@/components/orders/OrderTimelineModal';
import { OrderRiderTrackingModal } from '@/components/orders/OrderRiderTrackingModal';
import { orderHasAssignedRider } from '@/lib/order-has-assigned-rider';
import { RiderPhotoModal } from '@/components/orders/RiderPhotoModal';
import { RejectOrderSidesheet } from '@/components/orders/RejectOrderSidesheet';
import { RejectFollowUpHost, useRejectFollowUp } from '@/components/orders/RejectFollowUpHost';
import { rejectReasonNeedsFollowUp } from '@/lib/merchantCancellationReasons';
import { OrderCancellationBanner } from '@/components/orders/OrderCancellationBanner';
import { OrderOtpSection } from '@/components/orders/OrderOtpSection';
import { MerchantWeatherBanner } from '@/components/merchant/MerchantWeatherBanner';
import { resolveOrderOtps, type CachedOrderOtps } from '@/lib/orderOtps';
import type { OrderPricingBreakdown } from '@/lib/orderLineItems';
import {
  PARTNER_DEVICE_ORDER_ALERTS_EVENT,
  readPartnerDeviceOrderAlerts,
  writePartnerDeviceOrderAlerts,
} from '@/lib/partner-device-order-alerts';
import { MerchantPrepDelayModal } from '@/components/orders/MerchantPrepDelayModal';
import {
  MerchantPreparingOrderActions,
  OrderPrepDelayedBanner,
  OrderPreparedLateTopBanner,
  ExtraPrepTimeAddedBanner,
  computePrepExpired,
} from '@/components/orders/MerchantPreparingOrderActions';
import { formatExtraPrepTimeAddedLabel } from '@/lib/order-prep-time';
import { StoreClosedActiveOrdersNotice } from '@/components/orders/StoreClosedActiveOrdersNotice';
import { ReadyHandoverRunningTimeline } from '@/components/orders/ReadyHandoverRunningTimeline';
import { isActiveMerchantFoodOrderStatus, canMerchantMarkDelivered } from '@/lib/merchantActiveOrders';
import {
  countLiveSidebarPipelineOrders,
  orderMatchesLiveSidebarFilter as orderMatchesFoodOrdersSidebar,
  pipelineTabForSidebarStatus,
  resolveOrderSidebarPipelineStatus,
} from '@/lib/foodOrdersLivePipeline';

// orders_food_status enum: CREATED, ACCEPTED, PREPARING, READY_FOR_PICKUP, OUT_FOR_DELIVERY, DELIVERED, RTO, CANCELLED
const STATUS_LABEL: Record<string, string> = {
  CREATED: 'Created',
  NEW: 'Created', // backward compat
  ACCEPTED: 'Accepted',
  PREPARING: 'Preparing',
  READY_FOR_PICKUP: 'Ready',
  OUT_FOR_DELIVERY: 'Dispatch',
  DELIVERED: 'Delivered',
  RTO: 'RTO',
  CANCELLED: 'Cancelled',
};

/** Keep line items when PATCH/list refresh returns a row without items. */
function mergeFoodOrderPatch(prev: OrdersFoodRow, patch: OrdersFoodRow): OrdersFoodRow {
  const merged = { ...prev, ...patch };
  const patchItems = Array.isArray(patch.items) ? patch.items : [];
  const prevItems = Array.isArray(prev.items) ? prev.items : [];
  if (patchItems.length === 0 && prevItems.length > 0) {
    merged.items = prevItems;
  }
  const patchCount = Number(patch.food_items_count ?? patch.display_item_count ?? 0);
  const prevCount = Number(prev.food_items_count ?? prev.display_item_count ?? 0);
  if (patchCount <= 0 && prevCount > 0) {
    merged.food_items_count = prev.food_items_count;
    merged.display_item_count = prev.display_item_count;
  }
  return merged;
}

const FOOD_ORDERS_SIDEBAR_FILTERS = [
  { id: 'NEW_ORDERS', label: 'New orders' },
  { id: 'PREPARING', label: 'Preparing' },
  { id: 'READY_FOR_PICKUP', label: 'Ready' },
  { id: 'OUT_FOR_DELIVERY', label: 'Picked up' },
  { id: 'RTO', label: 'RTO' },
] as const;

type FoodOrdersSidebarFilterId = (typeof FOOD_ORDERS_SIDEBAR_FILTERS)[number]['id'];

/** Zomato-style pills: white active tab, light grey inactive */
const SIDEBAR_ACTIVE_CLASS = 'bg-white text-gray-900 border-gray-300 shadow-sm';
const SIDEBAR_INACTIVE_CLASS = 'bg-[#F0F0F0] text-gray-700 border-transparent hover:bg-[#E8E8E8]';

function prepDeadlineMs(order: OrdersFoodRow): number {
  const base = order.accepted_at || order.created_at;
  const mins = Number(order.preparation_time_minutes) || 30;
  return new Date(base).getTime() + mins * 60 * 1000;
}

function formatVegNonVeg(v: string | null): string {
  if (!v || v === 'na') return '—';
  if (v === 'veg') return '🥗 Veg';
  if (v === 'non_veg') return '🍗 Non-Veg';
  if (v === 'mixed') return '🥗🍗 Mixed';
  return v;
}

function formatTimeAgo(dateStr: string): string {
  const d = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  return d.toLocaleDateString();
}

const ORDERS_STORAGE_KEY = 'food-orders-ui';
const ORDER_ITEMS_PREVIEW_MAX = 8;

// Helper function to format order ID display with last 4 digits in increasing size
function FormattedOrderId({ 
  formattedOrderId, 
  fallbackOrderId, 
  size = 'base' 
}: { 
  formattedOrderId?: string | null; 
  fallbackOrderId: number; 
  size?: 'sm' | 'base' | 'lg';
}) {
  const sizeClasses = {
    sm: { base: 'text-xs', sizes: ['0.625rem', '0.7rem', '0.775rem', '0.85rem'] },
    base: { base: 'text-base', sizes: ['0.875rem', '1rem', '1.125rem', '1.25rem'] },
    lg: { base: 'text-lg', sizes: ['1rem', '1.125rem', '1.25rem', '1.375rem'] },
  };
  
  const classes = sizeClasses[size];
  
  if (formattedOrderId) {
    const prefix = formattedOrderId.slice(0, -4);
    const lastFour = formattedOrderId.slice(-4);
    
    return (
      <div className="flex items-baseline gap-0.5">
        <span className={`font-bold text-gray-900 ${classes.base}`}>
          {prefix}
        </span>
        {lastFour.split('').map((digit, idx) => (
          <span 
            key={idx}
            className="font-bold text-orange-600"
            style={{ fontSize: classes.sizes[idx] }}
          >
            {digit}
          </span>
        ))}
      </div>
    );
  }
  
  return <span className={`font-bold text-gray-900 ${classes.base}`}>#{fallbackOrderId}</span>;
}

function OrdersPageContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [store, setStore] = useState<MerchantStore | null>(null);
  const [storeId, setStoreId] = useState<string | null>(null);
  const [storeInternalId, setStoreInternalId] = useState<number | null>(null);
  // SSR-safe defaults only — reading sessionStorage/React Query in useState causes hydration mismatches.
  const [orders, setOrders] = useState<OrdersFoodRow[]>([]);
  const [stats, setStats] = useState<FoodOrderStats>(DEFAULT_FOOD_ORDER_STATS);
  const [filter, setFilter] = useState<string>('PREPARING');
  const [selectedOrder, setSelectedOrder] = useState<OrdersFoodRow | null>(null);
  const [rightPanelOpen, setRightPanelOpen] = useState(false);
  const [rejectModal, setRejectModal] = useState<OrdersFoodRow | null>(null);
  const { followUp, beginFollowUp, dismissFollowUp, setFollowUp } = useRejectFollowUp();
  const [dispatchModal, setDispatchModal] = useState<OrdersFoodRow | null>(null);
  const [rtoModalOrder, setRtoModalOrder] = useState<OrdersFoodRow | null>(null);
  const [ridersLogModalOrderId, setRidersLogModalOrderId] = useState<number | null>(null);
  const [ridersLogModalOrderLabel, setRidersLogModalOrderLabel] = useState<string | null>(null);
  const [ridersLogList, setRidersLogList] = useState<Array<{ rider_id: number; rider_name: string | null; rider_mobile: string | null; selfie_url: string | null; assignment_status: string; assigned_at: string | null; accepted_at: string | null; rejected_at: string | null; reached_merchant_at: string | null; picked_up_at: string | null; delivered_at: string | null; cancelled_at: string | null }>>([]);
  const [ridersLogLoading, setRidersLogLoading] = useState(false);
  const [acceptanceSettings, setAcceptanceSettings] = useState<{
    acceptance_window_minutes: number;
    alert_sound_urls_by_slot: [string | null, string | null, string | null];
    alert_sound_slot_choice: number;
  } | null>(null);
  const [nowTick, setNowTick] = useState(() => Date.now());
  const [prepDelayOrder, setPrepDelayOrder] = useState<OrdersFoodRow | null>(null);
  const [prepDelayLoading, setPrepDelayLoading] = useState(false);
  const [riderImageModalUrl, setRiderImageModalUrl] = useState<string | null>(null);
  const [headerRtoMenuOpen, setHeaderRtoMenuOpen] = useState(false);
  const headerRtoMenuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!headerRtoMenuOpen) return;
    const close = (e: MouseEvent) => {
      if (headerRtoMenuRef.current && !headerRtoMenuRef.current.contains(e.target as Node)) setHeaderRtoMenuOpen(false);
    };
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, [headerRtoMenuOpen]);

  useEffect(() => {
    if (!ridersLogModalOrderId) {
      setRidersLogList([]);
      return;
    }
    setRidersLogLoading(true);
    fetch(`/api/food-orders/${ridersLogModalOrderId}/riders-log`)
      .then((res) => res.ok ? res.json() : { riders: [] })
      .then((data) => { setRidersLogList(data.riders || []); })
      .catch(() => setRidersLogList([]))
      .finally(() => setRidersLogLoading(false));
  }, [ridersLogModalOrderId]);

  useEffect(() => {
    // Tick for countdown labels (accept window).
    const t = window.setInterval(() => setNowTick(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, []);

  // Lock shell scroll: only order panel + list column scroll, not pills/sidebar together.
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const html = document.documentElement;
    const body = document.body;
    html.classList.add('mx-no-page-scroll');
    body.classList.add('mx-no-page-scroll');
    return () => {
      html.classList.remove('mx-no-page-scroll');
      body.classList.remove('mx-no-page-scroll');
    };
  }, []);

  useEffect(() => {
    if (ridersLogModalOrderId == null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setRidersLogModalOrderId(null);
        setRidersLogModalOrderLabel(null);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [ridersLogModalOrderId]);

  const [otpInput, setOtpInput] = useState('');
  const [rtoOtpInput, setRtoOtpInput] = useState('');
  const [otpVerified, setOtpVerified] = useState<Record<number, { pickup?: boolean; rto?: boolean }>>({});
  const [otpCache, setOtpCache] = useState<Record<number, CachedOrderOtps>>({});
  const [loading, setLoading] = useState(true);
  const [notifyEnabled, setNotifyEnabled] = useState(true);
  const [actionLoading, setActionLoading] = useState<number | null>(null);
  const [billSheetOpen, setBillSheetOpen] = useState(false);
  const [billSheetAllItemsOnly, setBillSheetAllItemsOnly] = useState(false);
  const [customerSheetOpen, setCustomerSheetOpen] = useState(false);
  const [timelineModalOpen, setTimelineModalOpen] = useState(false);
  const [printBillOpen, setPrintBillOpen] = useState(false);
  const [thermalPrinterWidthMm, setThermalPrinterWidthMm] = useState<58 | 80>(80);
  const [riderTrackingOpen, setRiderTrackingOpen] = useState(false);
  const [isStoreOpen, setIsStoreOpen] = useState<boolean | null>(null);
  const [showStoreCloseModal, setShowStoreCloseModal] = useState(false);
  const [closeClosureType, setCloseClosureType] = useState<'temporary' | 'today' | 'manual_hold' | null>(null);
  const [closeClosureDate, setCloseClosureDate] = useState('');
  const [closeClosureTime, setCloseClosureTime] = useState('12:00');
  const [closeReason, setCloseReason] = useState('');
  const [closeReasonOther, setCloseReasonOther] = useState('');
  const [closeConfirmLoading, setCloseConfirmLoading] = useState(false);
  const [showTurnOnModal, setShowTurnOnModal] = useState(false);
  const [turnOnLoading, setTurnOnLoading] = useState(false);
  const [viewMode, setViewMode] = useState<'card' | 'list'>('card');

  const [orderSort, setOrderSort] = useState<'remaining' | 'newest' | 'oldest'>('remaining');
  const [orderIdSearch, setOrderIdSearch] = useState('');
  const updateUrlParams = useCallback((updates: { filter?: string; orderId?: string | null }) => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(searchParams?.toString() || '');
    if (updates.filter !== undefined) {
      params.set('filter', updates.filter);
    }
    if (updates.orderId !== undefined) {
      if (!updates.orderId) params.delete('orderId');
      else params.set('orderId', updates.orderId);
    }
    const q = params.toString();
    const path = `${window.location.pathname}${q ? `?${q}` : ''}`;
    router.replace(path, { scroll: false });
  }, [searchParams, router]);

  // Restore persisted view after mount (SSR-safe).
  useEffect(() => {
    try {
      if (window.innerWidth >= 1024) {
        const s = localStorage.getItem(ORDERS_STORAGE_KEY);
        const v = s ? JSON.parse(s).viewMode : null;
        if (v === 'list' || v === 'card') setViewMode(v);
      }
    } catch {
      /* ignore */
    }
  }, []);

  // Force card view on mobile/tablet; list only on lg+.
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth < 1024 && viewMode === 'list') {
        setViewMode('card');
        try {
          const s = localStorage.getItem(ORDERS_STORAGE_KEY);
          const stored = s ? JSON.parse(s) : {};
          stored.viewMode = 'card';
          localStorage.setItem(ORDERS_STORAGE_KEY, JSON.stringify(stored));
        } catch {
          /* ignore */
        }
      }
    };
    window.addEventListener('resize', handleResize);
    handleResize();
    return () => window.removeEventListener('resize', handleResize);
  }, [viewMode]);

  const persistLocal = useCallback(
    (key: 'viewMode' | 'notifyEnabled', value: unknown) => {
      if (typeof window === 'undefined') return;
      try {
        const s = localStorage.getItem(ORDERS_STORAGE_KEY);
        const prev = s ? JSON.parse(s) : {};
        const next = { ...prev, [key]: value };
        localStorage.setItem(ORDERS_STORAGE_KEY, JSON.stringify(next));
        if (key === 'notifyEnabled' && storeId) {
          writePartnerDeviceOrderAlerts(storeId, { soundAlertsEnabled: value === true });
        }
      } catch {}
    },
    [storeId]
  );

  const openOrder = useCallback((order: OrdersFoodRow) => {
    setSelectedOrder(order);
    setRightPanelOpen(true);
    updateUrlParams({ orderId: String(order.order_id || order.id) });
    prefetchMerchantOrderTimelineBundle(order.id, storeId);
  }, [updateUrlParams, storeId]);

  useEffect(() => {
    if (selectedOrder?.id) prefetchMerchantOrderTimelineBundle(selectedOrder.id, storeId);
  }, [selectedOrder?.id, storeId]);

  const closeOrderPanel = useCallback(() => {
    setRightPanelOpen(false);
    setSelectedOrder(null);
    updateUrlParams({ orderId: null });
  }, [updateUrlParams]);

  const handleFilterChange = useCallback((f: string) => {
    setFilter(f);
    setRightPanelOpen(false);
    setSelectedOrder(null);
    updateUrlParams({ filter: f, orderId: null });
  }, [updateUrlParams]);

  /** Move sidebar to the tab that matches this order's pipeline status. */
  const switchToOrderTab = useCallback(
    (order: OrdersFoodRow, keepPanelOpen = true) => {
      const tab = pipelineTabForSidebarStatus(resolveOrderSidebarPipelineStatus(order));
      if (!tab) return false;
      setFilter(tab);
      if (keepPanelOpen) {
        setSelectedOrder(order);
        setRightPanelOpen(true);
        updateUrlParams({
          filter: tab,
          orderId: String(order.order_id || order.id),
        });
      } else {
        updateUrlParams({ filter: tab, orderId: null });
      }
      return true;
    },
    [updateUrlParams]
  );

  useEffect(() => {
    let id = searchParams?.get('storeId') || searchParams?.get('store_id');
    if (!id && typeof window !== 'undefined') id = localStorage.getItem('selectedStoreId');
    const trimmed = (id || '').trim();
    setStoreId(isValidPartnerStoreId(trimmed) ? trimmed : null);
  }, [searchParams]);

  useEffect(() => {
    if (!storeId) return;
    setNotifyEnabled(readPartnerDeviceOrderAlerts(storeId).soundAlertsEnabled);
  }, [storeId]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const syncFromDevice = () => {
      if (!storeId) return;
      setNotifyEnabled(readPartnerDeviceOrderAlerts(storeId).soundAlertsEnabled);
    };
    window.addEventListener(PARTNER_DEVICE_ORDER_ALERTS_EVENT, syncFromDevice);
    return () => window.removeEventListener(PARTNER_DEVICE_ORDER_ALERTS_EVENT, syncFromDevice);
  }, [storeId]);

  useEffect(() => {
    const f = searchParams?.get('filter');
    const valid = new Set<string>(['NEW_ORDERS', 'PREPARING', 'READY_FOR_PICKUP', 'OUT_FOR_DELIVERY', 'RTO']);
    if (f && valid.has(f)) {
      setFilter(f);
    } else {
      setFilter('PREPARING');
      updateUrlParams({ filter: 'PREPARING' });
    }
  }, [searchParams?.toString(), updateUrlParams]);

  const orderIdFromUrl = searchParams?.get('orderId') || null;

  useEffect(() => {
    if (loading || orders.length === 0) return;
    if (!orderIdFromUrl) return;
    const id = parseInt(orderIdFromUrl, 10);
    if (isNaN(id)) return;
    const order = orders.find((o) => o.order_id === id || o.id === id);
    if (order && orderMatchesFoodOrdersSidebar(order, filter)) {
      setSelectedOrder(order);
      setRightPanelOpen(true);
    } else if (order) {
      switchToOrderTab(order, true);
    }
  }, [loading, orderIdFromUrl, orders, filter, switchToOrderTab]);

  /** Close detail panel when the open order no longer belongs on the active tab (e.g. after Complete). */
  useEffect(() => {
    if (!rightPanelOpen || !selectedOrder) return;
    const fresh = orders.find((o) => o.id === selectedOrder.id);
    const orderToCheck = fresh ?? selectedOrder;
    if (!fresh) {
      closeOrderPanel();
      return;
    }
    if (fresh.order_status !== selectedOrder.order_status) {
      setSelectedOrder(fresh);
    }
    if (!orderMatchesFoodOrdersSidebar(orderToCheck, filter)) {
      const movedTab = pipelineTabForSidebarStatus(resolveOrderSidebarPipelineStatus(fresh));
      if (movedTab && movedTab !== filter) {
        switchToOrderTab(fresh, true);
        return;
      }
      closeOrderPanel();
    }
  }, [orders, filter, selectedOrder, rightPanelOpen, closeOrderPanel, switchToOrderTab]);

  const { data: storeRecord } = usePartnerStoreRecord(storeId);

  useEffect(() => {
    if (!storeRecord) return;
    setStore(storeRecord);
    setStoreInternalId(storeRecord.id);
    setIsStoreOpen(storeRecord.operational_status === 'OPEN');
  }, [storeRecord]);

  useEffect(() => {
    if (!storeId) return;
    let cancelled = false;
    fetch(`/api/merchant/store-settings?storeId=${encodeURIComponent(storeId)}`)
      .then((res) => (res.ok ? res.json() : {}))
      .then((data: { thermal_printer_width_mm?: number }) => {
        if (!cancelled) {
          setThermalPrinterWidthMm(data.thermal_printer_width_mm === 58 ? 58 : 80);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [storeId]);

  const fetchStoreStatus = useCallback(async () => {
    if (!storeId) return;
    try {
      const res = await fetch(`/api/store-operations?store_id=${encodeURIComponent(storeId)}`);
      const data = await res.json();
      if (data.operational_status !== undefined) {
        const surface = partnerSurfaceOnlineFromStoreOperationsBody(data as Record<string, unknown>);
        setIsStoreOpen(surface ?? String(data.operational_status).toUpperCase() === 'OPEN');
      }
    } catch {}
  }, [storeId]);

  useEffect(() => {
    fetchStoreStatus();
  }, [fetchStoreStatus]);

  // Realtime: auto-update store status when it changes in DB (merchant_stores, merchant_store_availability, merchant_store_operating_hours)
  useEffect(() => {
    if (!storeInternalId || !storeId) return;
    const supabase = createClient();
    const ch = supabase
      .channel(`store_status:${storeInternalId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'merchant_stores', filter: `id=eq.${storeInternalId}` },
        () => { fetchStoreStatus(); }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'merchant_store_availability', filter: `store_id=eq.${storeInternalId}` },
        () => { fetchStoreStatus(); }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'merchant_store_operating_hours', filter: `store_id=eq.${storeInternalId}` },
        () => { fetchStoreStatus(); }
      )
      .subscribe();
    return () => {
      ch.unsubscribe();
    };
  }, [storeInternalId, storeId, fetchStoreStatus]);

  const fetchOrders = useCallback(async () => {
    if (!storeId) return;
    const cached = queryClient.getQueryData<OrdersFoodRow[]>(merchantKeys.foodOrders(storeId));
    if (cached?.length) {
      setOrders(cached);
      setLoading(false);
    }
    const url = `/api/food-orders?store_id=${encodeURIComponent(storeId)}&limit=200`;
    const loadOnce = async () => {
      const res = await fetch(url, { cache: 'no-store' });
      const data = await res.json();
      return { res, data };
    };
    try {
      let result: Awaited<ReturnType<typeof loadOnce>> | null = null;
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          result = await loadOnce();
          break;
        } catch (err) {
          const isLast = attempt >= 2;
          if (isLast) throw err;
          await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
        }
      }
      if (!result) return;
      const { res, data } = result;
      if (res.ok) {
        if (Array.isArray(data.orders)) {
          setOrders(data.orders);
          queryClient.setQueryData(merchantKeys.foodOrders(storeId), data.orders);
        } else {
          console.warn('[FoodOrders] Invalid response format:', data);
          setOrders([]);
          queryClient.setQueryData(merchantKeys.foodOrders(storeId), []);
        }
      } else {
        console.error('[FoodOrders] API error:', data.error);
        toast.error(data.error || 'Failed to load orders');
        setOrders([]);
      }
    } catch (err) {
      console.error('[FoodOrders] Fetch error:', err);
      toast.error('Failed to load orders');
      setOrders([]);
    } finally {
      setLoading(false);
    }
  }, [storeId, queryClient]);

  const fetchStats = useCallback(async () => {
    if (!storeId) return;
    try {
      const res = await fetch(`/api/food-orders/stats?store_id=${encodeURIComponent(storeId)}`, {
        cache: 'no-store',
      });
      const data = await res.json();
      if (res.ok) {
        const next = { ...DEFAULT_FOOD_ORDER_STATS, ...data } as FoodOrderStats;
        setStats(next);
        writeCachedFoodOrderStats(storeId, next);
      }
    } catch {
      /* keep last known / default stats visible */
    }
  }, [storeId]);

  useEffect(() => {
    if (!storeId) return;
    const cached = readCachedFoodOrderStats(storeId);
    setStats(cached ?? DEFAULT_FOOD_ORDER_STATS);
  }, [storeId]);

  useEffect(() => {
    if (!storeId) return;
    void fetch(
      `/api/merchant/sync-acceptance-timeout?store_id=${encodeURIComponent(storeId)}`,
      { method: 'POST', credentials: 'include', cache: 'no-store' }
    ).catch(() => {});
    void fetchOrders();
    void fetchStats();
  }, [fetchOrders, fetchStats, storeId]);

  useEffect(() => {
    const onRefresh = () => {
      void fetchOrders();
      void fetchStats();
    };
    window.addEventListener('partner-food-orders-refresh', onRefresh);
    return () => window.removeEventListener('partner-food-orders-refresh', onRefresh);
  }, [fetchOrders, fetchStats]);

  useEffect(() => {
    const t = setInterval(() => void fetchStats(), 15000);
    return () => clearInterval(t);
  }, [fetchStats]);
  useEffect(() => {
    if (!storeId) return;
    const t = setInterval(() => {
      void fetchOrders();
    }, 12000);
    return () => clearInterval(t);
  }, [storeId, fetchOrders]);

  useEffect(() => {
    if (!storeId) return;
    void (async () => {
      try {
        const res = await fetch(`/api/merchant/order-acceptance-settings?store_id=${encodeURIComponent(storeId)}`);
        const data = (await res.json().catch(() => ({}))) as {
          settings?: {
            acceptance_window_minutes?: number;
            alert_sound_urls_by_slot?: [string | null, string | null, string | null];
            alert_sound_slot_choice?: number;
          };
        };
        if (res.ok && data.settings) {
          const mins =
            typeof data.settings.acceptance_window_minutes === 'number'
              ? data.settings.acceptance_window_minutes
              : 5;
          const slots = data.settings.alert_sound_urls_by_slot;
          const normalizedSlots: [string | null, string | null, string | null] =
            Array.isArray(slots) && slots.length === 3
              ? [slots[0] ?? null, slots[1] ?? null, slots[2] ?? null]
              : [null, null, null];
          const choice =
            typeof data.settings.alert_sound_slot_choice === 'number'
              ? data.settings.alert_sound_slot_choice
              : 0;
          setAcceptanceSettings({
            acceptance_window_minutes: mins,
            alert_sound_urls_by_slot: normalizedSlots,
            alert_sound_slot_choice: choice,
          });
        } else {
          setAcceptanceSettings({
            acceptance_window_minutes: 5,
            alert_sound_urls_by_slot: [null, null, null],
            alert_sound_slot_choice: 0,
          });
        }
      } catch {
        setAcceptanceSettings({
          acceptance_window_minutes: 5,
          alert_sound_urls_by_slot: [null, null, null],
          alert_sound_slot_choice: 0,
        });
      }
    })();
  }, [storeId]);

  const notificationSoundOptions = useMemo(() => {
    const slots = acceptanceSettings?.alert_sound_urls_by_slot ?? [null, null, null];
    const out: { slot: number; label: string }[] = [];
    slots.forEach((u, i) => {
      if (u && String(u).trim()) out.push({ slot: i, label: `Gmitra Notification - ${i + 1}` });
    });
    return out;
  }, [acceptanceSettings?.alert_sound_urls_by_slot]);

  const notificationSoundSelectValue = useMemo(() => {
    const choice = acceptanceSettings?.alert_sound_slot_choice ?? 0;
    if (notificationSoundOptions.some((o) => o.slot === choice)) return choice;
    return notificationSoundOptions[0]?.slot ?? 0;
  }, [acceptanceSettings?.alert_sound_slot_choice, notificationSoundOptions]);

  const patchNotificationSoundSlot = useCallback(
    async (slot: number) => {
      if (!storeId) return;
      try {
        const res = await fetch('/api/merchant/order-acceptance-settings', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ store_id: storeId, platform_food_alert_sound_slot: slot }),
        });
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        if (!res.ok) {
          toast.error(data.error || 'Could not update notification sound');
          return;
        }
        setAcceptanceSettings((prev) =>
          prev ? { ...prev, alert_sound_slot_choice: slot } : prev
        );
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('partner-order-acceptance-settings-changed'));
        }
        toast.success('Notification sound updated');
      } catch {
        toast.error('Could not update notification sound');
      }
    },
    [storeId]
  );

  /** Source of truth is orders_core; refetch when core or kitchen row changes. */
  useEffect(() => {
    if (!storeInternalId || !storeId) return;
    const supabase = createClient();
    const reload = () => {
      void fetchOrders();
      void fetchStats();
      dispatchPartnerNotificationsChanged();
    };
    const ch = supabase
      .channel(`partner_store_orders:${storeInternalId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'orders_core',
          filter: `merchant_store_id=eq.${storeInternalId}`,
        },
        reload
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'orders_food',
          filter: `merchant_store_id=eq.${storeInternalId}`,
        },
        reload
      )
      .subscribe();
    return () => {
      ch.unsubscribe();
    };
  }, [storeInternalId, storeId, fetchOrders, fetchStats]);

  const fetchOtp = useCallback(
    async (orderId: number) => {
      if (!storeId) return;
      try {
        const res = await fetch(`/api/food-orders/${orderId}/otp?store_id=${encodeURIComponent(storeId)}`);
        const data = await res.json().catch(() => ({}));
        if (!res.ok) return;
        setOtpCache((prev) => ({
          ...prev,
          [orderId]: {
            pickup: data.pickup_otp ?? prev[orderId]?.pickup ?? null,
            rto: data.rto_otp ?? prev[orderId]?.rto ?? null,
          },
        }));
      } catch {}
    },
    [storeId]
  );

  // Auto-fetch OTP for all orders when they're loaded (always visible) — OTP rows are on orders_food only
  useEffect(() => {
    const orderIds = orders.filter((o) => !o.core_only).map((o) => o.id);
    orderIds.forEach((orderId) => {
      if (!otpCache[orderId]) {
        fetchOtp(orderId);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orders.length, fetchOtp]);

  // Seed OTP from list row + refresh when the open order changes
  useEffect(() => {
    if (!selectedOrder?.id || selectedOrder.core_only) return;
    if (selectedOrder.pickup_otp || selectedOrder.rto_otp) {
      setOtpCache((prev) => ({
        ...prev,
        [selectedOrder.id]: {
          pickup: selectedOrder.pickup_otp ?? prev[selectedOrder.id]?.pickup ?? null,
          rto: selectedOrder.rto_otp ?? prev[selectedOrder.id]?.rto ?? null,
        },
      }));
    }
    void fetchOtp(selectedOrder.id);
  }, [selectedOrder?.id, selectedOrder?.core_only, fetchOtp]);

  const validateOtp = useCallback(
    async (orderId: number, otpType: 'PICKUP' | 'RTO' = 'PICKUP', codeOverride?: string) => {
      const code = (codeOverride ?? (otpType === 'RTO' ? rtoOtpInput : otpInput)).trim();
      if (!storeId || !code) return false;
      try {
        const res = await fetch(`/api/food-orders/${orderId}/validate-otp`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ store_id: storeId, otp: code, otp_type: otpType }),
        });
        const data = await res.json();
        if (data.valid) {
          setOtpVerified((prev) => ({
            ...prev,
            [orderId]: {
              ...prev[orderId],
              ...(otpType === 'PICKUP' ? { pickup: true } : { rto: true }),
            },
          }));
          if (otpType === 'PICKUP' && data.handed_over_to_rider_at) {
            const handedIso = String(data.handed_over_to_rider_at);
            setOrders((prev) =>
              prev.map((o) =>
                o.id === orderId ? { ...o, handed_over_to_rider_at: handedIso } : o
              )
            );
            setSelectedOrder((prev) =>
              prev?.id === orderId ? { ...prev, handed_over_to_rider_at: handedIso } : prev
            );
          }
          toast.success(`${otpType === 'RTO' ? 'RTO' : 'Pickup'} OTP verified`);
          return true;
        }
        toast.error(data.error || 'Invalid OTP');
        return false;
      } catch {
        toast.error('Validation failed');
        return false;
      }
    },
    [storeId, otpInput, rtoOtpInput]
  );

  const handleStoreToggle = useCallback(() => {
    if (!storeId) return;
    if (isStoreOpen) {
      setShowStoreCloseModal(true);
      return;
    }
    setShowTurnOnModal(true);
  }, [storeId, isStoreOpen]);

  const handleConfirmTurnOn = useCallback(async () => {
    if (!storeId) return;
    setTurnOnLoading(true);
    try {
      const res = await fetch('/api/store-operations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ store_id: storeId, action: 'manual_open' }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setIsStoreOpen(true);
        setStore((prev) => (prev ? { ...prev, operational_status: 'OPEN', is_accepting_orders: true } : prev));
        setShowTurnOnModal(false);
        toast.success('Store is now OPEN. Orders are being accepted!');
      } else {
        toastStoreOperationsPostFailure(res, data, 'Failed to open store');
        await fetchStoreStatus();
      }
    } catch {
      toast.error('Failed to open store');
      await fetchStoreStatus();
    } finally {
      setTurnOnLoading(false);
    }
  }, [storeId, fetchStoreStatus]);

  // When store close modal opens: fetch opening time and set default date/time
  useEffect(() => {
    if (!showStoreCloseModal || !storeId) return;
    const now = new Date();
    const y = now.getFullYear();
    const m = (now.getMonth() + 1).toString().padStart(2, '0');
    const d = now.getDate().toString().padStart(2, '0');
    setCloseClosureDate(`${y}-${m}-${d}`);
    const in10 = new Date(now.getTime() + 10 * 60 * 1000);
    setCloseClosureTime(`${in10.getHours().toString().padStart(2, '0')}:${in10.getMinutes().toString().padStart(2, '0')}`);
    setCloseClosureType(null);
    setCloseReason('');
    setCloseReasonOther('');
  }, [showStoreCloseModal, storeId]);

  const confirmStoreClose = useCallback(async () => {
    if (!storeId || !closeClosureType) return;
    setCloseConfirmLoading(true);
    let manualCloseUntilIso: string | undefined;
    if (closeClosureType === 'temporary') {
      const closedUntil = new Date(`${closeClosureDate}T${closeClosureTime}:00`);
      manualCloseUntilIso = closedUntil.toISOString();
    }
    const reasonText = closeReason === 'Other' ? (closeReasonOther?.trim() || 'Other') : closeReason;
    const body: {
      store_id: string;
      action: string;
      closure_type: string;
      manual_close_until?: string;
      close_reason?: string;
    } = {
      store_id: storeId,
      action: 'manual_close',
      closure_type: closeClosureType,
      close_reason: reasonText,
    };
    if (manualCloseUntilIso) body.manual_close_until = manualCloseUntilIso;
    try {
      const res = await fetch('/api/store-operations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setIsStoreOpen(false);
        setStore((prev) => (prev ? { ...prev, operational_status: 'CLOSED', is_accepting_orders: false } : prev));
        setShowStoreCloseModal(false);
        setCloseClosureType(null);
        setCloseReason('');
        setCloseReasonOther('');
        if (closeClosureType === 'manual_hold') toast.success('Store closed. It will only open when you turn it ON.');
        else if (closeClosureType === 'temporary') {
          const until = new Date(`${closeClosureDate}T${closeClosureTime}:00`);
          toast.success(`Store closed until ${until.toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}. You can also turn it ON manually anytime.`);
        } else toast.success('Store closed for the rest of today (IST). You can turn it ON anytime.');
      } else {
        toast.error(data.error || 'Failed to close store');
      }
    } catch {
      toast.error('Failed to close store');
    } finally {
      setCloseConfirmLoading(false);
    }
  }, [storeId, closeClosureType, closeClosureDate, closeClosureTime, closeReason, closeReasonOther]);

  const handleStoreCloseModalConfirm = useCallback(() => {
    if (!closeClosureType) {
      toast.error('Please select closure type');
      return;
    }
    if (closeClosureType === 'temporary') {
      if (!closeClosureDate || !closeClosureTime) {
        toast.error('Please select date and time for reopening');
        return;
      }
      const closedUntil = new Date(`${closeClosureDate}T${closeClosureTime}:00`);
      if (closedUntil.getTime() <= Date.now()) {
        toast.error('Reopening date and time must be in the future');
        return;
      }
    }
    if (!closeReason?.trim()) {
      toast.error('Please select a reason for closing');
      return;
    }
    if (closeReason === 'Other' && !closeReasonOther?.trim()) {
      toast.error('Please enter the reason in "Other"');
      return;
    }
    void confirmStoreClose();
  }, [closeClosureType, closeClosureDate, closeClosureTime, closeReason, closeReasonOther, confirmStoreClose]);

  const orderPipelineByKeyRef = useRef<Map<number, string>>(new Map());

  const updateStatus = useCallback(
    async (
      order: OrdersFoodRow,
      newStatus: string,
      extra?: { rejected_reason?: string; cancel_mode?: 'manual' | 'auto'; accept_mode?: 'manual' | 'auto' }
    ) => {
      if (!storeId || !String(storeId).trim()) {
        console.debug('[food-orders-ui] updateStatus blocked: missing storeId', {
          order_id: order?.order_id,
          orders_food_id: order?.id,
          core_only: (order as any)?.core_only,
          newStatus,
        });
        toast.error('Store not selected. Please refresh and select your store again.');
        return;
      }
      setActionLoading(order.id);
      const { rejected_reason, cancel_mode, accept_mode, ...restExtra } = extra ?? {};
      const payload = {
        store_id: storeId,
        status: newStatus,
        action_source: 'website' as const,
        ...(newStatus === 'ACCEPTED' ? { accept_mode: accept_mode ?? ('manual' as const) } : {}),
        ...(newStatus === 'CANCELLED'
          ? {
              cancel_mode: cancel_mode ?? ('manual' as const),
              ...(rejected_reason ? { rejected_reason } : {}),
            }
          : {}),
        ...restExtra,
      };

      const safeReadBody = async (res: Response): Promise<unknown> => {
        try {
          return await res.json();
        } catch {
          try {
            const txt = await res.text();
            return { error: txt || 'Non-JSON response' };
          } catch {
            return { error: 'Could not read response body' };
          }
        }
      };

      const tryUpdateFood = async (): Promise<{ ok: boolean; data: unknown; status: number }> => {
        const url = `/api/food-orders/${order.id}`;
        console.debug('[food-orders-ui] PATCH start', {
          kind: 'orders_food',
          url,
          payload,
          order_id: order.order_id,
          orders_food_id: order.id,
        });
        const res = await fetch(url, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        const data = await safeReadBody(res);
        console.debug('[food-orders-ui] PATCH done', {
          kind: 'orders_food',
          url,
          httpStatus: res.status,
          ok: res.ok,
          data,
        });
        return { ok: res.ok, data, status: res.status };
      };

      const tryUpdateCore = async (): Promise<{ ok: boolean; data: unknown; status: number }> => {
        const url = `/api/merchant/orders-core/${order.order_id}`;
        console.debug('[food-orders-ui] PATCH start', {
          kind: 'orders_core',
          url,
          payload,
          core_id: order.order_id,
        });
        const res = await fetch(url, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        const data = await safeReadBody(res);
        console.debug('[food-orders-ui] PATCH done', {
          kind: 'orders_core',
          url,
          httpStatus: res.status,
          ok: res.ok,
          data,
        });
        return { ok: res.ok, data, status: res.status };
      };

      try {
        const coreOnly = order.core_only === true;
        let result = coreOnly ? await tryUpdateCore() : await tryUpdateFood();
        if (!result.ok && result.status >= 500) {
          await new Promise((r) => setTimeout(r, 1500));
          result = coreOnly ? await tryUpdateCore() : await tryUpdateFood();
        }
        if (!result.ok) {
          console.debug('[food-orders-ui] updateStatus failed', {
            coreOnly,
            result,
            payload,
            order_id: order.order_id,
            orders_food_id: order.id,
          });
          toast.error((result.data as { error?: string })?.error || 'Failed to update');
          return;
        }
        window.dispatchEvent(new CustomEvent('partner-pending-orders-refresh'));
        if (shouldClearOrderNotifications(newStatus)) {
          dispatchPartnerNotificationsChanged();
        }
        if (coreOnly) {
          await fetchOrders();
          showFoodOrderStatusToast(newStatus);
          // If the currently-open order moved out of this tab, auto-open next matching order.
          if (selectedOrder?.id === order.id && !orderMatchesFoodOrdersSidebar({ ...order, order_status: newStatus } as any, filter)) {
            setTimeout(() => {
              setOrders((prev) => {
                const next = prev.find((o) => orderMatchesFoodOrdersSidebar(o, filter));
                if (next) {
                  setSelectedOrder(next);
                  setRightPanelOpen(true);
                } else {
                  setSelectedOrder(null);
                  setRightPanelOpen(false);
                }
                return prev;
              });
            }, 0);
          }
        } else {
          const data = result.data as { order?: OrdersFoodRow };
          if (data?.order) {
            const nextOrder = mergeFoodOrderPatch(order, data.order as OrdersFoodRow);
            setOrders((prev) => prev.map((o) => (o.id === order.id ? nextOrder : o)));
            if (selectedOrder?.id === order.id) {
              setSelectedOrder(nextOrder);
              if (newStatus === 'DELIVERED') {
                closeOrderPanel();
              }
            }
            if (newStatus === 'OUT_FOR_DELIVERY') setDispatchModal(null);
          }
          showFoodOrderStatusToast(newStatus);
          if (selectedOrder?.id === order.id && data?.order) {
            const patched = mergeFoodOrderPatch(order, data.order as OrdersFoodRow);
            if (!orderMatchesFoodOrdersSidebar(patched, filter)) {
              setTimeout(() => {
                setOrders((prev) => {
                  const next = prev.find((o) => orderMatchesFoodOrdersSidebar(o, filter));
                  if (next) {
                    setSelectedOrder(next);
                    setRightPanelOpen(true);
                  } else {
                    setSelectedOrder(null);
                    setRightPanelOpen(false);
                  }
                  return prev;
                });
              }, 0);
            }
          }
        }
      } catch (e) {
        console.debug('[food-orders-ui] updateStatus exception', {
          message: e instanceof Error ? e.message : String(e),
          order_id: order?.order_id,
          orders_food_id: order?.id,
          newStatus,
        });
        toast.error(e instanceof Error ? e.message : 'Failed to update order');
      } finally {
        setActionLoading(null);
      }
    },
    [storeId, selectedOrder, closeOrderPanel, fetchOrders]
  );

  const extendPrepDelay = useCallback(
    async (order: OrdersFoodRow, additionalMinutes: number) => {
      if (!storeId) return false;
      setPrepDelayLoading(true);
      try {
        const res = await fetch(
          `/api/food-orders/${order.id}/prep-delay?store_id=${encodeURIComponent(storeId)}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ additional_minutes: additionalMinutes }),
          }
        );
        const payload = (await res.json().catch(() => ({}))) as {
          error?: string;
          expected_ready_at?: string;
          prep_ready_by_at?: string;
          prep_delay_minutes?: number;
          prep_delay_use_count?: number;
          last_prep_delay_minutes_added?: number;
        };
        if (!res.ok) {
          toast.error(
            payload.error === 'prep_delay_limit_reached'
              ? 'Need more time limit reached for this order'
              : payload.error || 'Could not extend preparation time'
          );
          return false;
        }
        const patch = {
          expected_ready_at: payload.expected_ready_at ?? order.expected_ready_at,
          prep_ready_by_at: payload.prep_ready_by_at ?? order.prep_ready_by_at,
          prep_delay_minutes: payload.prep_delay_minutes ?? order.prep_delay_minutes,
          prep_delay_use_count: payload.prep_delay_use_count ?? order.prep_delay_use_count,
          last_prep_delay_minutes_added:
            payload.last_prep_delay_minutes_added ?? additionalMinutes,
        };
        setOrders((prev) =>
          prev.map((o) => (o.id === order.id ? { ...o, ...patch } : o))
        );
        if (selectedOrder?.id === order.id) {
          setSelectedOrder((prev) => (prev ? { ...prev, ...patch } : prev));
        }
        toast.success(`Extra Time Added: +${additionalMinutes} min`);
        setPrepDelayOrder(null);
        return true;
      } catch {
        toast.error('Could not extend preparation time');
        return false;
      } finally {
        setPrepDelayLoading(false);
      }
    },
    [storeId, selectedOrder]
  );

  const selectedOrderPricing = useMemo((): OrderPricingBreakdown | null => {
    if (!selectedOrder) return null;
    const lineSum = (selectedOrder.items ?? []).reduce(
      (acc, it) => acc + Number(it.total || (it.price || 0) * (it.quantity || 1)),
      0
    );
    const p = selectedOrder.pricing;
    if (p) return p;
    const total = resolveMerchantCtm(selectedOrder);
    return {
      subtotal: lineSum,
      packaging: 0,
      taxes: 0,
      discount: 0,
      total: Number.isFinite(total) ? total : lineSum,
    };
  }, [selectedOrder]);

  // Direct print — no preview modal. Builds the store invoice header (incl. full
  // address) and opens the browser's native print dialog immediately.
  const handlePrintBill = useCallback(() => {
    if (!selectedOrder) return;
    const storeInfo: GatiMitraPrintStoreInfo = store
      ? {
          storeName: store.store_name,
          fullAddress:
            [store.full_address, store.landmark, store.postal_code]
              .map((s) => (s ?? '').toString().trim())
              .filter(Boolean)
              .join(', ') || null,
          city: store.city,
          cuisineLabel: store.cuisine_types?.[0] ?? null,
          fssaiNumber: store.fssai_number ?? null,
        }
      : { storeName: selectedOrder.restaurant_name ?? 'Store' };
    printOrderBill(
      selectedOrder,
      selectedOrderPricing ?? { subtotal: 0, packaging: 0, taxes: 0, discount: 0, total: 0 },
      storeInfo
    );
  }, [selectedOrder, selectedOrderPricing, store]);

  // Direct KOT print — kitchen ticket only, built from the LIVE order so any change
  // before printing is reflected. Completely separate from the bill (no pricing).
  const handlePrintKot = useCallback(() => {
    if (!selectedOrder) return;
    printOrderKot(selectedOrder, {
      storeName: store?.store_name ?? selectedOrder.restaurant_name ?? null,
      storePhone:
        (Array.isArray(store?.store_phones) ? store?.store_phones?.[0] : null) ??
        selectedOrder.restaurant_phone ??
        null,
      storeAddress:
        store != null
          ? [store.full_address, store.landmark, store.city, store.state, store.postal_code]
              .map((s) => (s ?? '').toString().trim())
              .filter(Boolean)
              .join(', ') || null
          : null,
      thermalPrinterWidthMm,
      address:
        store != null
          ? {
              full_address: store.full_address,
              landmark: store.landmark,
              city: store.city,
              state: store.state,
              postal_code: store.postal_code,
            }
          : null,
    });
  }, [selectedOrder, store, thermalPrinterWidthMm]);

  const selectedOrderLineSum = useMemo(() => {
    if (!selectedOrder?.items?.length) return 0;
    return selectedOrder.items.reduce(
      (acc, it) => acc + Number(it.total || (it.price || 0) * (it.quantity || 1)),
      0
    );
  }, [selectedOrder]);

  useEffect(() => {
    setBillSheetOpen(false);
    setBillSheetAllItemsOnly(false);
    setCustomerSheetOpen(false);
    setTimelineModalOpen(false);
  }, [selectedOrder?.id]);

  const acceptCountdown = useMemo(() => {
    if (!selectedOrder) return { label: undefined as string | undefined, disabled: false };
    const st = resolveOrderSidebarPipelineStatus(selectedOrder);
    if (st !== 'CREATED' && st !== 'NEW') return { label: undefined, disabled: false };
    const fromBackend = selectedOrder.merchant_response_deadline_at;
    const deadline = fromBackend
      ? new Date(fromBackend).getTime()
      : new Date(selectedOrder.created_at).getTime() +
        Math.max(1, Math.min(180, Number(acceptanceSettings?.acceptance_window_minutes ?? 5))) *
          60_000;
    if (!Number.isFinite(deadline)) return { label: undefined, disabled: false };
    const secondsLeft = Math.max(0, Math.ceil((deadline - nowTick) / 1000));
    const m = Math.floor(secondsLeft / 60);
    const s = secondsLeft % 60;
    return {
      label: `Accept (${m}:${s.toString().padStart(2, '0')})`,
      disabled: secondsLeft <= 0,
    };
  }, [selectedOrder, acceptanceSettings?.acceptance_window_minutes, nowTick]);

  const acceptCountdownFor = useCallback(
    (order: OrdersFoodRow) => {
      const st = resolveOrderSidebarPipelineStatus(order);
      if (st !== 'CREATED' && st !== 'NEW') return { label: undefined as string | undefined, disabled: false };
      const fromBackend = order.merchant_response_deadline_at;
      const deadline = fromBackend
        ? new Date(fromBackend).getTime()
        : new Date(order.created_at).getTime() +
          Math.max(1, Math.min(180, Number(acceptanceSettings?.acceptance_window_minutes ?? 5))) *
            60_000;
      if (!Number.isFinite(deadline)) return { label: undefined as string | undefined, disabled: false };
      const secondsLeft = Math.max(0, Math.ceil((deadline - nowTick) / 1000));
      const m = Math.floor(secondsLeft / 60);
      const s = secondsLeft % 60;
      return {
        label: `Accept (${m}:${s.toString().padStart(2, '0')})`,
        disabled: secondsLeft <= 0,
      };
    },
    [acceptanceSettings?.acceptance_window_minutes, nowTick]
  );

  // Backend owns auto-cancel. Clients must never PATCH CANCELLED on fuse expiry.
  // When countdown hits 0, Accept is disabled until backend/realtime closes the order.
  // (Previous client auto-cancel here could fire before snapshotted deadline.)

  const filteredOrders = orders.filter((o) => orderMatchesFoodOrdersSidebar(o, filter));

  /** When status changes externally (admin dashboard), follow the order into its new tab. */
  useEffect(() => {
    if (loading || orders.length === 0) return;

    const prev = orderPipelineByKeyRef.current;
    let orderToFollow: OrdersFoodRow | null = null;

    for (const order of orders) {
      const key = Number(order.order_id ?? order.id);
      if (!Number.isFinite(key)) continue;

      const pipeline = resolveOrderSidebarPipelineStatus(order);
      const previousPipeline = prev.get(key);
      prev.set(key, pipeline);

      if (!previousPipeline || previousPipeline === pipeline) continue;

      const fromTab = pipelineTabForSidebarStatus(previousPipeline);
      const toTab = pipelineTabForSidebarStatus(pipeline);
      if (!fromTab || !toTab || fromTab === toTab) continue;

      const isSelected =
        selectedOrder?.id === order.id ||
        selectedOrder?.order_id === order.order_id ||
        (orderIdFromUrl != null &&
          (orderIdFromUrl === String(order.order_id) || orderIdFromUrl === String(order.id)));

      const othersStillOnFromTab = orders.some(
        (o) =>
          o.id !== order.id &&
          pipelineTabForSidebarStatus(resolveOrderSidebarPipelineStatus(o)) === fromTab
      );

      if (isSelected || (fromTab === filter && !othersStillOnFromTab)) {
        orderToFollow = order;
        break;
      }
    }

    if (orderToFollow) {
      switchToOrderTab(
        orderToFollow,
        Boolean(
          selectedOrder?.id === orderToFollow.id ||
            orderIdFromUrl === String(orderToFollow.order_id) ||
            orderIdFromUrl === String(orderToFollow.id)
        )
      );
    }
  }, [
    orders,
    loading,
    filter,
    selectedOrder,
    orderIdFromUrl,
    switchToOrderTab,
  ]);

  const selectedOrderBelongsToFilter =
    selectedOrder != null && orderMatchesFoodOrdersSidebar(selectedOrder, filter);

  const displayOrders = useMemo(() => {
    let list = [...filteredOrders];
    const digitsOnly = orderIdSearch.replace(/\D/g, '');
    if (digitsOnly.length >= 4) {
      const last4 = digitsOnly.slice(-4);
      list = list.filter((o) => {
        const fd = (o.formatted_order_id || '').replace(/\D/g, '');
        if (fd.slice(-4) === last4) return true;
        const oid = String(o.order_id).replace(/\D/g, '');
        return oid.slice(-4) === last4;
      });
    }
    if (orderSort === 'newest') {
      list.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    } else if (orderSort === 'oldest') {
      list.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
    } else {
      list.sort((a, b) => prepDeadlineMs(a) - prepDeadlineMs(b));
    }
    return list;
  }, [filteredOrders, orderIdSearch, orderSort]);

  const hasActiveOrders = useMemo(
    () => orders.some((o) => isActiveMerchantFoodOrderStatus(o.order_status)),
    [orders]
  );

  const showFullStoreClosedBlankState = isStoreOpen === false && !hasActiveOrders;

  const sidebarFilterCounts: Record<FoodOrdersSidebarFilterId, number> = {
    NEW_ORDERS: orders.filter((o) => orderMatchesFoodOrdersSidebar(o, 'NEW_ORDERS')).length,
    PREPARING: orders.filter((o) => orderMatchesFoodOrdersSidebar(o, 'PREPARING')).length,
    READY_FOR_PICKUP: orders.filter((o) => orderMatchesFoodOrdersSidebar(o, 'READY_FOR_PICKUP')).length,
    OUT_FOR_DELIVERY: orders.filter((o) => orderMatchesFoodOrdersSidebar(o, 'OUT_FOR_DELIVERY')).length,
    RTO: orders.filter((o) => orderMatchesFoodOrdersSidebar(o, 'RTO')).length,
  };

  /** Matches sum of live tab counts (New + Preparing + Ready + Picked up + RTO). */
  const liveActiveCount = useMemo(
    () => countLiveSidebarPipelineOrders(orders),
    [orders]
  );

  const foodOrdersEmptyVariant = useMemo(() => {
    if (filteredOrders.length > 0 && displayOrders.length === 0) return 'search' as const;
    if (
      filter === 'NEW_ORDERS' ||
      filter === 'PREPARING' ||
      filter === 'READY_FOR_PICKUP' ||
      filter === 'OUT_FOR_DELIVERY' ||
      filter === 'RTO'
    ) {
      return filter;
    }
    return 'PREPARING' as const;
  }, [filteredOrders.length, displayOrders.length, filter]);

  const displayStats = stats;

  const mobileStatsExtra = (
    <div className="grid grid-cols-1 gap-2.5 text-sm">
      <div className="flex justify-between items-center">
        <span className="text-gray-500">Avg Prep</span>
        <span className="font-semibold text-gray-900">{displayStats.avgPreparationTimeMinutes}m</span>
      </div>
      <div className="flex justify-between items-center">
        <span className="text-gray-500">Completion</span>
        <span className="font-semibold text-gray-900">{displayStats.completionRatePercent}%</span>
      </div>
    </div>
  );

  function StoreClosedOrdersState() {
    return (
      <div className="flex flex-1 min-h-0 items-center justify-center bg-white">
        <div className="mx-auto flex w-full max-w-xl flex-col items-center justify-center px-6 py-14 text-center">
          <svg viewBox="0 0 360 220" className="h-auto w-full max-w-[520px]" aria-hidden>
            {/* hanger */}
            <path
              d="M120 48 L180 12 L240 48"
              fill="none"
              stroke="#cbd5e1"
              strokeWidth="10"
              strokeLinecap="round"
            />
            <circle cx="180" cy="12" r="10" fill="#34d399" />
            {/* board */}
            <g transform="translate(0,0) rotate(-10 180 120)">
              <rect
                x="92"
                y="62"
                width="176"
                height="112"
                rx="16"
                fill="#f8fafc"
                stroke="#cbd5e1"
                strokeWidth="6"
              />
              <rect
                x="108"
                y="78"
                width="144"
                height="80"
                rx="12"
                fill="#ffffff"
                stroke="#e2e8f0"
                strokeWidth="3"
              />
              <text
                x="180"
                y="128"
                textAnchor="middle"
                fill="#64748b"
                fontSize="40"
                fontWeight="800"
                fontFamily="system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif"
                letterSpacing="2"
              >
                CLOSED
              </text>
            </g>
          </svg>

          <p className="mt-6 text-sm font-semibold text-slate-700">You are offline</p>
          <p className="mt-1 text-sm text-slate-500">
            Visit{" "}
            <button
              type="button"
              onClick={() => {
                window.dispatchEvent(new CustomEvent("mx-open-need-help"));
              }}
              className="font-semibold text-emerald-600 underline decoration-emerald-300 underline-offset-2 hover:text-emerald-700"
            >
              help centre
            </button>{" "}
            for more details
          </p>
        </div>
      </div>
    );
  }

  return (
    <>
    <MXLayoutWhite restaurantName={store?.store_name} restaurantId={storeId || ''} mobileMenuExtra={mobileStatsExtra}>
      <PartnerPageHeader title="Orders" subtitle={store?.store_name || undefined} />
      <MerchantWeatherBanner storeId={storeId || null} />
      <div className="flex h-full min-h-0 overflow-hidden bg-gray-50 relative flex-col">
        <header id="food-orders-header" className="shrink-0 z-20 bg-white">
          <div className="mx-shell-header !px-3 sm:!px-4 md:!px-4 lg:!px-6">
            {/* Mobile: 2 rows (Row 1 = Today+Active, Row 2 = Filter + status + sound). Desktop: single row */}
            <div className="flex w-full min-w-0 flex-col md:flex-row md:items-center md:justify-between gap-2 md:gap-0">
              {/* Row 1 (mobile) / Left (desktop): On mobile Today+Active on right. On desktop title + all stats on left */}
              <div className="flex items-center justify-end md:justify-start md:flex-1 md:items-center md:gap-3 min-w-0 overflow-x-auto hide-scrollbar">
                {/* Hamburger menu on left (mobile) */}
                <div className="md:hidden mr-2">
                  <MobileHamburgerButton />
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <StatBadge
                    label="Today"
                    value={String(
                      Math.max(displayStats.ordersToday ?? 0, displayStats.deliveredTodayCount ?? 0)
                    )}
                    title="Orders placed or delivered today (IST)"
                  />
                  <StatBadge
                    label="Active"
                    value={String(orders.length > 0 ? liveActiveCount : (displayStats.activeOrders ?? 0))}
                    title="Pending live orders (New + Preparing + Ready + Picked up + RTO)"
                    accent
                  />
                </div>
                <div className="hidden md:flex items-center gap-2 sm:gap-3 shrink-0">
                  <StatBadge label="Avg Prep" value={`${displayStats.avgPreparationTimeMinutes}m`} />
                  <StatBadge label="Completion" value={`${displayStats.completionRatePercent}%`} />
                </div>
              </div>
              <div className="flex items-center justify-end gap-1.5 sm:gap-2 shrink-0">
              <button
                onClick={handleStoreToggle}
                disabled={isStoreOpen === null}
                className={`flex items-center gap-1 sm:gap-1.5 px-2 sm:px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap ${
                  isStoreOpen === null
                    ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                    : isStoreOpen
                      ? 'bg-green-100 text-green-700 border border-green-200 hover:bg-green-200'
                      : 'bg-red-100 text-red-700 border border-red-200 hover:bg-red-200'
                }`}
                title={isStoreOpen === null ? 'Loading store status...' : isStoreOpen ? 'Click to close store' : 'Click to open store'}
              >
                <Store size={14} className="shrink-0" />
                <span className="hidden min-[400px]:inline">{isStoreOpen === null ? 'Loading...' : isStoreOpen ? 'Store Open' : 'Store Closed'}</span>
                <span className="min-[400px]:hidden">{isStoreOpen === null ? '...' : isStoreOpen ? 'Open' : 'Closed'}</span>
              </button>
              {/* View mode toggle - only visible on large screens (lg+) */}
              <div className="hidden lg:flex items-center gap-1 border border-gray-200 rounded-lg p-0.5 shrink-0">
                <button
                  onClick={() => { setViewMode('card'); persistLocal('viewMode', 'card'); }}
                  className={`p-1.5 rounded transition-colors ${viewMode === 'card' ? 'bg-orange-100 text-orange-600' : 'text-gray-500 hover:bg-gray-100'}`}
                  title="Card view"
                >
                  <LayoutGrid size={16} />
                </button>
                <button
                  onClick={() => { setViewMode('list'); persistLocal('viewMode', 'list'); }}
                  className={`p-1.5 rounded transition-colors ${viewMode === 'list' ? 'bg-orange-100 text-orange-600' : 'text-gray-500 hover:bg-gray-100'}`}
                  title="List view"
                >
                  <List size={16} />
                </button>
              </div>
              <button
                onClick={() => {
                  const next = !notifyEnabled;
                  setNotifyEnabled(next);
                  persistLocal('notifyEnabled', next);
                }}
                className={`flex items-center gap-1 sm:gap-1.5 px-2 sm:px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap ${
                  notifyEnabled ? 'bg-orange-100 text-orange-700' : 'bg-gray-100 text-gray-600'
                }`}
                title={notifyEnabled ? 'Disable new order sound' : 'Enable new order sound'}
              >
                {notifyEnabled ? <Bell size={14} /> : <BellOff size={14} />}
                <span className="hidden sm:inline">{notifyEnabled ? 'Sound On' : 'Sound Off'}</span>
              </button>
              {notificationSoundOptions.length > 1 ? (
                <div className="relative shrink-0">
                  <select
                    value={notificationSoundSelectValue}
                    onChange={(e) => {
                      const v = Number(e.target.value);
                      if (!Number.isInteger(v) || v < 0 || v > 2) return;
                      void patchNotificationSoundSlot(v);
                    }}
                    className="appearance-none pl-2 pr-7 py-1.5 rounded-lg border border-gray-200 bg-white text-xs font-medium text-gray-800 cursor-pointer max-w-[140px] sm:max-w-[180px] truncate"
                    aria-label="Notification sound"
                    title="Choose which uploaded notification sound plays"
                  >
                    {notificationSoundOptions.map(({ slot, label }) => (
                      <option key={slot} value={slot}>
                        {label}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="absolute right-1.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-orange-500 pointer-events-none" aria-hidden />
                </div>
              ) : null}
              </div>
            </div>
          </div>
        </header>

        <StoreClosedActiveOrdersNotice visible={isStoreOpen === false && hasActiveOrders} />

        <div
          id="food-orders-pills"
          className="shrink-0 z-30 border-t border-b border-gray-200 bg-white px-3 sm:px-4 lg:px-6 py-3 shadow-sm"
        >
            <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
              <div className="flex flex-wrap items-center gap-2 min-w-0">
                {FOOD_ORDERS_SIDEBAR_FILTERS.map(({ id, label }) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => handleFilterChange(id)}
                    className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full text-sm font-semibold border transition-colors shrink-0 ${
                      filter === id ? SIDEBAR_ACTIVE_CLASS : SIDEBAR_INACTIVE_CLASS
                    }`}
                  >
                    {label}
                    <span
                      className={`inline-flex h-5 min-w-[20px] items-center justify-center rounded-full px-1.5 text-[11px] font-bold leading-none ${
                        filter === id ? 'bg-gray-900 text-white' : 'bg-gray-500 text-white'
                      }`}
                    >
                      {sidebarFilterCounts[id]}
                    </span>
                  </button>
                ))}
              </div>
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full xl:w-auto xl:shrink-0">
                <div className="relative w-full sm:w-auto sm:min-w-[180px]">
                  <select
                    value={orderSort}
                    onChange={(e) => setOrderSort(e.target.value as 'remaining' | 'newest' | 'oldest')}
                    className="w-full appearance-none pl-3 pr-9 py-2 rounded-lg border border-gray-200 bg-white text-sm font-medium text-gray-800 cursor-pointer"
                    aria-label="Sort orders"
                  >
                    <optgroup label="Placed at">
                      <option value="newest">Newest first</option>
                      <option value="oldest">Oldest first</option>
                    </optgroup>
                    <option value="remaining">Prep time left</option>
                  </select>
                  <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-orange-500 pointer-events-none" aria-hidden />
                </div>
                <div className="relative flex-1 sm:min-w-[220px] lg:min-w-[300px]">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" aria-hidden />
                  <input
                    type="search"
                    inputMode="numeric"
                    placeholder="Search with order id  ..............."
                    value={orderIdSearch}
                    onChange={(e) => setOrderIdSearch(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 rounded-lg border border-gray-200 bg-white text-sm text-gray-900 placeholder:text-gray-400 shadow-sm"
                  />
                </div>
              </div>
            </div>
        </div>

        <div className="flex flex-1 min-h-0 flex-col overflow-hidden">
          <div className="flex flex-col lg:flex-row flex-1 min-h-0 overflow-hidden">
            {loading && orders.length === 0 && !showFullStoreClosedBlankState ? (
              <PageSkeletonOrders />
            ) : showFullStoreClosedBlankState ? (
              <StoreClosedOrdersState />
            ) : (
              <>
            {rightPanelOpen && selectedOrder && selectedOrderBelongsToFilter ? (
              <>
                <div className="hidden lg:grid lg:grid-cols-[minmax(0,1fr)_16rem] flex-1 min-h-0 min-w-0 h-full w-full overflow-hidden">
                  <div className="min-w-0 min-h-0 h-full overflow-y-auto overflow-x-hidden border-r border-gray-200 bg-gray-50/80 p-3 hide-scrollbar">
                      {selectedOrderPricing ? (
                        <OrderPanel
                          className="w-full"
                          order={selectedOrder}
                          pricing={selectedOrderPricing}
                          formattedOrderId={
                            <FormattedOrderId
                              formattedOrderId={selectedOrder.formatted_order_id}
                              fallbackOrderId={selectedOrder.order_id}
                              size="lg"
                            />
                          }
                          onOpenBill={() => {
                            setBillSheetAllItemsOnly(false);
                            setBillSheetOpen(true);
                          }}
                          onOpenCustomer={() => setCustomerSheetOpen(true)}
                          onOpenAllItems={() => {
                            setBillSheetAllItemsOnly(true);
                            setBillSheetOpen(true);
                          }}
                          onOpenTimeline={() => {
                            if (selectedOrder) {
                              prefetchMerchantOrderTimelineBundle(selectedOrder.id, storeId);
                            }
                            setTimelineModalOpen(true);
                          }}
                          onPrintBill={handlePrintBill}
                          onPrintKot={handlePrintKot}
                          onClose={closeOrderPanel}
                          onViewPastRiders={() => {
                            setRidersLogModalOrderId(selectedOrder.id);
                            setRidersLogModalOrderLabel(
                              selectedOrder.formatted_order_id || `#${selectedOrder.order_id}`
                            );
                          }}
                          onTrackRider={() => setRiderTrackingOpen(true)}
                          onOpenRiderPhoto={(url) => setRiderImageModalUrl(url)}
                          nowMs={nowTick}
                          otpCache={otpCache[selectedOrder.id]}
                          pickupVerified={!!otpVerified[selectedOrder.id]?.pickup}
                          rtoVerified={!!otpVerified[selectedOrder.id]?.rto}
                          otpCode={resolveOrderOtps(selectedOrder, otpCache[selectedOrder.id]).pickup ?? undefined}
                          otpType="PICKUP"
                          primaryAction={
                            <ActionBtns
                              order={selectedOrder}
                              onAccept={() => updateStatus(selectedOrder, 'ACCEPTED')}
                              onReject={() => setRejectModal(selectedOrder)}
                              onPreparing={() => updateStatus(selectedOrder, 'PREPARING')}
                              onReady={() => updateStatus(selectedOrder, 'READY_FOR_PICKUP')}
                              onNeedMoreTime={() => setPrepDelayOrder(selectedOrder)}
                              onDispatch={() => setDispatchModal(selectedOrder)}
                              onComplete={() => updateStatus(selectedOrder, 'DELIVERED')}
                              onRto={() => {
                                void fetchOtp(selectedOrder.id);
                                setRtoOtpInput('');
                                setRtoModalOrder(selectedOrder);
                              }}
                              loading={actionLoading === selectedOrder.id}
                              otpVerified={!!otpVerified[selectedOrder.id]?.pickup}
                              topRightLayout
                              hideRtoMenu
                              acceptLabel={acceptCountdown.label}
                              acceptDisabled={acceptCountdown.disabled}
                              nowMs={nowTick}
                            />
                          }
                        />
                      ) : null}
                  </div>
                  <div className="flex min-h-0 h-full flex-col overflow-hidden bg-gray-50/80 p-3 pl-4">
                    <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden overscroll-contain hide-scrollbar">
                      <div className="space-y-3 pr-1">
                      {displayOrders.map((order) => (
                        <OrderCard
                          key={order.id}
                          order={order}
                          selected={selectedOrder?.id === order.id}
                          onClick={() => openOrder(order)}
                          onAccept={() => updateStatus(order, 'ACCEPTED')}
                          onReject={() => setRejectModal(order)}
                          onPreparing={() => updateStatus(order, 'PREPARING')}
                          onReady={() => updateStatus(order, 'READY_FOR_PICKUP')}
                          onNeedMoreTime={() => setPrepDelayOrder(order)}
                          onDispatch={() => {
                            fetchOtp(order.id);
                            setDispatchModal(order);
                            setOtpInput('');
                          }}
                          onRto={() => {
                            void fetchOtp(order.id);
                            setRtoOtpInput('');
                            setRtoModalOrder(order);
                          }}
                          onComplete={() => updateStatus(order, 'DELIVERED')}
                          loading={actionLoading === order.id}
                          otpCode={resolveOrderOtps(order, otpCache[order.id]).pickup ?? undefined}
                          otpType="PICKUP"
                          otpVerified={!!otpVerified[order.id]?.pickup}
                          onFetchOtp={() => fetchOtp(order.id)}
                          statusLabel={STATUS_LABEL[order.order_status || 'CREATED'] || order.order_status}
                          acceptLabel={acceptCountdownFor(order).label}
                          acceptDisabled={acceptCountdownFor(order).disabled}
                          nowMs={nowTick}
                          hideDetails
                        />
                      ))}
                      </div>
                      {displayOrders.length === 0 && <FoodOrdersEmptyState variant={foodOrdersEmptyVariant} />}
                    </div>
                  </div>
                </div>

                <div className="lg:hidden flex-1 min-w-0 flex flex-col overflow-hidden">
                  <OrderDetailMobile
                    order={selectedOrder}
                    onClose={closeOrderPanel}
                    statusLabel={STATUS_LABEL[selectedOrder.order_status || 'CREATED'] || selectedOrder.order_status || 'CREATED'}
                    formatVegNonVeg={formatVegNonVeg}
                    formatTimeAgo={formatTimeAgo}
                    otpCache={otpCache[selectedOrder.id]}
                    pickupVerified={!!otpVerified[selectedOrder.id]?.pickup}
                    rtoVerified={!!otpVerified[selectedOrder.id]?.rto}
                    onFetchOtp={() => fetchOtp(selectedOrder.id)}
                    onAccept={() => updateStatus(selectedOrder, 'ACCEPTED')}
                    onReject={() => setRejectModal(selectedOrder)}
                    onPreparing={() => updateStatus(selectedOrder, 'PREPARING')}
                    onReady={() => updateStatus(selectedOrder, 'READY_FOR_PICKUP')}
                    onNeedMoreTime={() => setPrepDelayOrder(selectedOrder)}
                    onDispatch={() => setDispatchModal(selectedOrder)}
                    onComplete={() => updateStatus(selectedOrder, 'DELIVERED')}
                    onRto={() => {
                      void fetchOtp(selectedOrder.id);
                      setRtoOtpInput('');
                      setRtoModalOrder(selectedOrder);
                    }}
                    actionLoading={actionLoading === selectedOrder.id}
                    onOpenRidersLog={() => { setRidersLogModalOrderId(selectedOrder.id); setRidersLogModalOrderLabel(selectedOrder.formatted_order_id || `#${selectedOrder.order_id}`); }}
                    onOpenRiderImage={(url) => setRiderImageModalUrl(url)}
                    acceptLabel={acceptCountdown.label}
                    acceptDisabled={acceptCountdown.disabled}
                    nowMs={nowTick}
                    onOpenBill={() => {
                      setBillSheetAllItemsOnly(false);
                      setBillSheetOpen(true);
                    }}
                    onOpenAllItems={() => {
                      setBillSheetAllItemsOnly(true);
                      setBillSheetOpen(true);
                    }}
                    onOpenTimeline={() => {
                      if (selectedOrder) {
                        prefetchMerchantOrderTimelineBundle(selectedOrder.id, storeId);
                      }
                      setTimelineModalOpen(true);
                    }}
                    onPrintBill={handlePrintBill}
                  />
                </div>
              </>
            ) : (
              <>
            {/* Main order cards / list - full width when no order open */}
            <div className="flex-1 overflow-y-auto p-3 sm:p-4 min-w-0 min-h-0 hide-scrollbar" style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom, 0px))' }}>
              {viewMode === 'card' ? (
                displayOrders.length === 0 ? (
                  <FoodOrdersEmptyState variant={foodOrdersEmptyVariant} />
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2 sm:gap-3">
                    {displayOrders.map((order) => (
                      <OrderCard
                        key={order.id}
                        order={order}
                        selected={selectedOrder?.id === order.id}
                        onClick={() => openOrder(order)}
                        onAccept={() => updateStatus(order, 'ACCEPTED')}
                        onReject={() => setRejectModal(order)}
                        onPreparing={() => updateStatus(order, 'PREPARING')}
                        onReady={() => updateStatus(order, 'READY_FOR_PICKUP')}
                        onNeedMoreTime={() => setPrepDelayOrder(order)}
                        onDispatch={() => {
                          fetchOtp(order.id);
                          setDispatchModal(order);
                          setOtpInput('');
                        }}
                        onRto={() => setRtoModalOrder(order)}
                        onComplete={() => updateStatus(order, 'DELIVERED')}
                        loading={actionLoading === order.id}
                        otpCode={resolveOrderOtps(order, otpCache[order.id]).pickup ?? undefined}
                        otpType="PICKUP"
                        otpVerified={!!otpVerified[order.id]?.pickup}
                        onFetchOtp={() => fetchOtp(order.id)}
                        statusLabel={STATUS_LABEL[order.order_status || 'CREATED'] || order.order_status}
                        acceptLabel={acceptCountdownFor(order).label}
                        acceptDisabled={acceptCountdownFor(order).disabled}
                        nowMs={nowTick}
                      />
                    ))}
                  </div>
                )
              ) : (
                <div className="hidden lg:block space-y-2">
                  {displayOrders.length === 0 ? (
                    <FoodOrdersEmptyState variant={foodOrdersEmptyVariant} />
                  ) : (
                    displayOrders.map((order) => (
                      <OrderListRow
                        key={order.id}
                        order={order}
                        selected={selectedOrder?.id === order.id}
                        onClick={() => openOrder(order)}
                        onAccept={() => updateStatus(order, 'ACCEPTED')}
                        onReject={() => setRejectModal(order)}
                        onPreparing={() => updateStatus(order, 'PREPARING')}
                        onReady={() => updateStatus(order, 'READY_FOR_PICKUP')}
                        onDispatch={() => setDispatchModal(order)}
                        onRto={() => setRtoModalOrder(order)}
                        onComplete={() => updateStatus(order, 'DELIVERED')}
                        loading={actionLoading === order.id}
                        otpCode={resolveOrderOtps(order, otpCache[order.id]).pickup ?? undefined}
                        otpType="PICKUP"
                        otpVerified={!!otpVerified[order.id]?.pickup}
                        onFetchOtp={() => fetchOtp(order.id)}
                        statusLabel={STATUS_LABEL[order.order_status || 'CREATED'] || order.order_status}
                        acceptLabel={acceptCountdownFor(order).label}
                        acceptDisabled={acceptCountdownFor(order).disabled}
                        nowMs={nowTick}
                      />
                    ))
                  )}
                </div>
              )}
            </div>
              </>
            )}
              </>
            )}
          </div>
          </div>
        </div>

      <OrderBillSidesheet
        open={billSheetOpen && !!selectedOrder}
        onClose={() => {
          setBillSheetOpen(false);
          setBillSheetAllItemsOnly(false);
        }}
        order={selectedOrder}
        pricing={
          selectedOrderPricing ?? {
            subtotal: 0,
            packaging: 0,
            taxes: 0,
            discount: 0,
            total: 0,
          }
        }
        lineSum={selectedOrderLineSum}
        allItemsOnly={billSheetAllItemsOnly}
      />
      <OrderCustomerSidesheet
        open={customerSheetOpen && !!selectedOrder}
        onClose={() => setCustomerSheetOpen(false)}
        order={selectedOrder}
      />
      <GatiMitraOrderPrintBill
        open={printBillOpen && !!selectedOrder}
        onClose={() => setPrintBillOpen(false)}
        order={selectedOrder}
        pricing={
          selectedOrderPricing ?? {
            subtotal: 0,
            packaging: 0,
            taxes: 0,
            discount: 0,
            total: 0,
          }
        }
        store={
          store
            ? {
                storeName: store.store_name,
                city: store.city,
                cuisineLabel: store.cuisine_types?.[0] ?? null,
                fssaiNumber: store.fssai_number ?? null,
              }
            : selectedOrder
              ? {
                  storeName: selectedOrder.restaurant_name ?? 'Store',
                  city: null,
                  cuisineLabel: null,
                  fssaiNumber: null,
                }
              : null
        }
      />
      <OrderTimelineModal
        open={timelineModalOpen && !!selectedOrder}
        onClose={() => setTimelineModalOpen(false)}
        order={selectedOrder}
        storeId={storeId}
        layout="horizontal"
      />
      <MerchantPrepDelayModal
        open={!!prepDelayOrder}
        loading={prepDelayLoading}
        onClose={() => setPrepDelayOrder(null)}
        onSelectMinutes={(mins) => {
          if (prepDelayOrder) void extendPrepDelay(prepDelayOrder, mins);
        }}
      />
      <OrderRiderTrackingModal
        open={riderTrackingOpen}
        preload={orderHasAssignedRider(selectedOrder)}
        onClose={() => setRiderTrackingOpen(false)}
        order={selectedOrder}
        merchantStoreLat={store?.latitude ?? null}
        merchantStoreLon={store?.longitude ?? null}
        merchantStoreName={store?.store_name ?? null}
      />
      <RiderPhotoModal
        open={!!riderImageModalUrl}
        imageUrl={riderImageModalUrl}
        riderName={
          selectedOrder?.rider_details?.name ??
          selectedOrder?.rider_name ??
          null
        }
        onClose={() => setRiderImageModalUrl(null)}
      />

      <RejectOrderSidesheet
        open={!!rejectModal}
        order={rejectModal}
        loading={rejectModal != null && actionLoading === rejectModal.id}
        onClose={() => setRejectModal(null)}
        onConfirm={async (reason) => {
          if (!rejectModal || !storeId) return;
          const snap = rejectModal;
          if (rejectReasonNeedsFollowUp(reason)) {
            setRejectModal(null);
            const items = (Array.isArray(snap.items) ? snap.items : []) as NormalizedOrderLineItem[];
            beginFollowUp(reason, {
              storeId,
              storeName: store?.store_name ?? storeId,
              lineItems: items,
              finalizeReject: () =>
                updateStatus(snap, 'CANCELLED', { rejected_reason: reason }),
            });
            return;
          }
          await updateStatus(snap, 'CANCELLED', { rejected_reason: reason });
          setRejectModal(null);
        }}
      />

      <RejectFollowUpHost
        followUp={followUp}
        storeId={storeId ?? ''}
        onDismiss={dismissFollowUp}
        setFollowUp={setFollowUp}
      />

      {/* Dispatch modal – warning only; no OTP. Portaled so sidebar blurs. */}
      {dispatchModal && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 bg-black/50 backdrop-blur-md flex items-end sm:items-center justify-center z-[100] p-3 sm:p-4">
          <div className="bg-white rounded-t-xl sm:rounded-xl shadow-xl max-w-sm w-full p-4 sm:p-5 max-h-[90vh] overflow-y-auto">
            <h3 className="font-semibold text-gray-900 mb-2">
              Confirm Dispatch - Order{' '}
              {dispatchModal.formatted_order_id ? (
                <FormattedOrderId 
                  formattedOrderId={dispatchModal.formatted_order_id} 
                  fallbackOrderId={dispatchModal.order_id}
                  size="base"
                />
              ) : (
                `#${dispatchModal.order_id}`
              )}
            </h3>
            <div className="mb-4 p-3 rounded-lg bg-amber-50 border border-amber-200">
              <p className="text-sm text-amber-800">
                You are marking this order as dispatched from the portal without OTP validation. If this order is falsely marked as dispatched, you will be responsible and penalties may apply.
              </p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setDispatchModal(null)}
                className="flex-1 py-2.5 border border-gray-200 rounded-lg text-sm font-medium hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  updateStatus(dispatchModal, 'OUT_FOR_DELIVERY');
                  setDispatchModal(null);
                }}
                className="flex-1 py-2.5 bg-purple-600 text-white rounded-lg text-sm font-semibold hover:bg-purple-700"
              >
                Confirm Dispatch
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* RTO warning modal */}
      {rtoModalOrder && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 bg-black/50 backdrop-blur-md flex items-end sm:items-center justify-center z-[100] p-3 sm:p-4">
          <div className="bg-white rounded-t-xl sm:rounded-xl shadow-xl max-w-sm w-full p-4 sm:p-5 max-h-[90vh] overflow-y-auto">
            <h3 className="font-semibold text-gray-900 mb-2">
              Mark as RTO (Return to Origin) - Order{' '}
              {rtoModalOrder.formatted_order_id ? (
                <FormattedOrderId 
                  formattedOrderId={rtoModalOrder.formatted_order_id} 
                  fallbackOrderId={rtoModalOrder.order_id}
                  size="base"
                />
              ) : (
                `#${rtoModalOrder.order_id}`
              )}
            </h3>
            <div className="mb-4 p-3 rounded-lg bg-orange-50 border border-orange-200">
              <p className="text-sm text-orange-800">
                This will mark the order as Return to Origin. The order will be considered undelivered and may affect your metrics.
              </p>
            </div>
            {rtoModalOrder && (() => {
              const rtoOtpVal = resolveOrderOtps(rtoModalOrder, otpCache[rtoModalOrder.id]).rto;
              return rtoOtpVal ? (
                <div className="mb-4 rounded-lg border border-slate-200 bg-slate-50 p-3">
                  <p className="text-xs font-semibold text-slate-600 mb-1">RTO OTP (share with rider)</p>
                  <p className="font-mono text-2xl font-bold tracking-widest text-slate-900">{rtoOtpVal}</p>
                  <label className="block mt-3 text-xs text-slate-600">Verify OTP before confirming (optional)</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    maxLength={4}
                    value={rtoOtpInput}
                    onChange={(e) => setRtoOtpInput(e.target.value.replace(/\D/g, '').slice(0, 4))}
                    className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm font-mono"
                    placeholder="4-digit OTP"
                  />
                </div>
              ) : null;
            })()}
            <div className="flex gap-2">
              <button
                onClick={() => {
                  setRtoModalOrder(null);
                  setRtoOtpInput('');
                }}
                className="flex-1 py-2.5 border border-gray-200 rounded-lg text-sm font-medium hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  if (!rtoModalOrder) return;
                  const rtoOtpVal = resolveOrderOtps(rtoModalOrder, otpCache[rtoModalOrder.id]).rto;
                  if (rtoOtpVal && rtoOtpInput.trim() && !otpVerified[rtoModalOrder.id]?.rto) {
                    const ok = await validateOtp(rtoModalOrder.id, 'RTO', rtoOtpInput);
                    if (!ok) return;
                  }
                  await updateStatus(rtoModalOrder, 'RTO');
                  setRtoModalOrder(null);
                  setRtoOtpInput('');
                }}
                className="flex-1 py-2.5 bg-orange-600 text-white rounded-lg text-sm font-semibold hover:bg-orange-700"
              >
                Confirm RTO
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      <OrderRidersHistorySidesheet
        open={ridersLogModalOrderId != null}
        orderLabel={ridersLogModalOrderLabel}
        riders={ridersLogList}
        loading={ridersLogLoading}
        onClose={() => {
          setRidersLogModalOrderId(null);
          setRidersLogModalOrderLabel(null);
        }}
        onRiderPhotoClick={(url) => setRiderImageModalUrl(url)}
      />

      {/* Reject modal */}
    </MXLayoutWhite>

      {/* Store close modal – portaled so overlay is above sidebar */}
      {showStoreCloseModal && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 bg-black/50 backdrop-blur-md flex items-center justify-center z-[100] p-4" aria-hidden="true">
          <div className="mx-auto max-w-md rounded-2xl bg-white p-6 shadow-2xl border border-gray-200 max-h-[90vh] overflow-y-auto">
            <h2 className="text-lg font-bold text-gray-900 mb-4">How would you like to close your store?</h2>
            <div className="space-y-3">
              <label className={`flex items-center gap-3 p-3 rounded-lg cursor-pointer border-2 ${closeClosureType === 'temporary' ? 'bg-orange-50 border-orange-400' : 'border-gray-200 hover:border-orange-200'}`}>
                <input type="radio" name="closureType" checked={closeClosureType === 'temporary'} onChange={() => setCloseClosureType('temporary')} className="w-4 h-4" />
                <div className="flex-1">
                  <p className="text-sm font-semibold text-gray-900">Temporary Closed</p>
                  <p className="text-xs text-gray-600">Close until a specific date and time. Reopens automatically then, or turn ON manually anytime.</p>
                </div>
              </label>
              {closeClosureType === 'temporary' && (
                <div className="ml-7 space-y-3 p-3 rounded-lg bg-orange-50/50 border border-orange-200">
                  <p className="text-xs font-semibold text-gray-700">Reopen on (date and time):</p>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-[10px] font-medium text-gray-500 block mb-1">Date</label>
                      <input type="date" value={closeClosureDate} onChange={(e) => setCloseClosureDate(e.target.value)} min={(() => { const n = new Date(); return `${n.getFullYear()}-${(n.getMonth() + 1).toString().padStart(2, '0')}-${n.getDate().toString().padStart(2, '0')}`; })()} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900" />
                    </div>
                    <div>
                      <label className="text-[10px] font-medium text-gray-500 block mb-1">Time</label>
                      <input type="time" value={closeClosureTime} onChange={(e) => setCloseClosureTime(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900" />
                    </div>
                  </div>
                  <p className="text-[10px] text-gray-600">Store stays closed until this date & time, or until you turn it ON manually.</p>
                </div>
              )}
              <label className={`flex items-center gap-3 p-3 rounded-lg cursor-pointer border-2 ${closeClosureType === 'today' ? 'bg-red-50 border-red-400' : 'border-gray-200 hover:border-red-200'}`}>
                <input type="radio" name="closureType" checked={closeClosureType === 'today'} onChange={() => setCloseClosureType('today')} className="w-4 h-4" />
                <div className="flex-1">
                  <p className="text-sm font-semibold text-gray-900">Close for Today</p>
                  <p className="text-xs text-gray-600">Closed until end of today (India time). Schedule can resume tomorrow.</p>
                </div>
              </label>
              <label className={`flex items-center gap-3 p-3 rounded-lg cursor-pointer border-2 ${closeClosureType === 'manual_hold' ? 'bg-amber-50 border-amber-400' : 'border-gray-200 hover:border-amber-200'}`}>
                <input type="radio" name="closureType" checked={closeClosureType === 'manual_hold'} onChange={() => setCloseClosureType('manual_hold')} className="w-4 h-4" />
                <div className="flex-1">
                  <p className="text-sm font-semibold text-gray-900">Until I manually turn it ON</p>
                  <p className="text-xs text-gray-600">Store stays OFF even during operating hours until you turn it ON</p>
                </div>
              </label>
            </div>
            <div className="mt-4 space-y-2">
              <label className="text-xs font-semibold text-gray-700 block">Reason for closing <span className="text-red-500">*</span></label>
              <select value={closeReason} onChange={(e) => setCloseReason(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white">
                <option value="">Select reason</option>
                <option value="Staff shortage">Staff shortage</option>
                <option value="Inventory restock">Inventory restock</option>
                <option value="Device issue / electricity">Device issue / electricity</option>
                <option value="Run out of Gas">Run out of Gas</option>
                <option value="Payment issue">Payment issue</option>
                <option value="Rush of offline orders">Rush of offline orders</option>
                <option value="Equipment issue">Equipment issue</option>
                <option value="Holiday / Off">Holiday / Off</option>
                <option value="Maintenance">Maintenance</option>
                <option value="Personal / Emergency">Personal / Emergency</option>
                <option value="Kitchen / Prep area issue">Kitchen / Prep area issue</option>
                <option value="Supplier delay">Supplier delay</option>
                <option value="Other">Other</option>
              </select>
              {closeReason === 'Other' && (
                <input type="text" value={closeReasonOther} onChange={(e) => setCloseReasonOther(e.target.value)} placeholder="Enter reason" className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900" />
              )}
            </div>
            <div className="flex gap-3 mt-5">
              <button type="button" onClick={() => { if (!closeConfirmLoading) { setShowStoreCloseModal(false); setCloseClosureType(null); setCloseReason(''); setCloseReasonOther(''); } }} disabled={closeConfirmLoading} className="flex-1 px-4 py-2.5 border border-gray-300 rounded-xl text-gray-700 font-medium hover:bg-gray-50 disabled:opacity-50">Cancel</button>
              <button type="button" onClick={handleStoreCloseModalConfirm} disabled={!closeClosureType || !closeReason?.trim() || (closeReason === 'Other' && !closeReasonOther?.trim()) || (closeClosureType === 'temporary' && (!closeClosureDate || !closeClosureTime)) || closeConfirmLoading} className="flex-1 px-4 py-2.5 bg-red-600 text-white rounded-xl font-medium hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center justify-center gap-2">
                {closeConfirmLoading ? <><Loader2 size={18} className="animate-spin" /> Confirming...</> : 'Confirm'}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Turn Store ON modal – portaled so overlay is above sidebar */}
      {showTurnOnModal && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 bg-black/50 backdrop-blur-md flex items-center justify-center z-[100] p-4" aria-hidden="true">
          <div className="backdrop-blur-md bg-white/95 rounded-2xl shadow-2xl max-w-sm w-full p-6 border-2 border-emerald-200">
            <div className="flex justify-center mb-4">
              <div className="w-14 h-14 rounded-full bg-gradient-to-r from-emerald-100 to-emerald-50 flex items-center justify-center">
                <Power size={28} className="text-emerald-600" />
              </div>
            </div>
            <div className="text-center space-y-2 mb-6">
              <h3 className="text-lg font-bold text-gray-900">Turn Store ON?</h3>
              <p className="text-sm text-gray-600">
                Your store will be OPEN and customers can place orders. Make sure you&apos;re ready to accept orders!
              </p>
            </div>
            <div className="p-3 rounded-lg bg-amber-50/70 border border-amber-200 mb-6">
              <p className="text-xs text-amber-800 font-medium">
                ⚠️ <strong>Orders will start coming immediately!</strong> Be prepared to receive and process them.
              </p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => !turnOnLoading && setShowTurnOnModal(false)}
                disabled={turnOnLoading}
                className="flex-1 px-4 py-2.5 border-2 border-gray-300 rounded-lg text-gray-900 font-semibold hover:bg-gray-50/50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmTurnOn}
                disabled={turnOnLoading}
                className="flex-1 px-4 py-2.5 bg-gradient-to-r from-emerald-600 to-emerald-700 text-white rounded-lg font-semibold hover:from-emerald-700 hover:to-emerald-800 transition-all shadow-md hover:shadow-lg disabled:opacity-80 disabled:cursor-not-allowed inline-flex items-center justify-center gap-2"
              >
                {turnOnLoading ? (
                  <>
                    <Loader2 size={18} className="animate-spin" />
                    Turning ON...
                  </>
                ) : (
                  'Yes, Turn ON'
                )}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}

function StatBadge({
  label,
  value,
  accent,
  title,
}: {
  label: string;
  value: string;
  accent?: boolean;
  title?: string;
}) {
  return (
    <div
      title={title}
      className={`px-3 py-1.5 rounded-lg text-xs font-medium ${
        accent ? 'bg-orange-100 text-orange-700' : 'bg-gray-100 text-gray-700'
      }`}
    >
      <span className="opacity-80">{label}:</span> <span className="font-semibold">{value}</span>
    </div>
  );
}

function DetailSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="text-xs text-gray-500 font-medium uppercase mb-1 break-words">{title}</p>
      <div className="text-sm text-gray-900 break-words">{children}</div>
    </div>
  );
}

const ORDER_STEPS = [
  { key: 'placed', label: 'Placed', status: 'CREATED', at: (o: OrdersFoodRow) => o.created_at },
  { key: 'accepted', label: 'Accepted', status: 'ACCEPTED', at: (o: OrdersFoodRow) => o.accepted_at },
  { key: 'preparing', label: 'Preparing', status: 'PREPARING', at: (o: OrdersFoodRow) => o.preparing_at ?? null },
  { key: 'ready', label: 'Ready', status: 'READY_FOR_PICKUP', at: (o: OrdersFoodRow) => o.prepared_at },
  { key: 'dispatch', label: 'Dispatch', status: 'OUT_FOR_DELIVERY', at: (o: OrdersFoodRow) => o.dispatched_at },
  { key: 'delivered', label: 'Delivered', status: 'DELIVERED', at: (o: OrdersFoodRow) => o.delivered_at },
] as const;

function normalizeTimelineStatus(status: string | undefined): string {
  const s = (status || 'CREATED').toUpperCase();
  if (s === 'NEW' || s === 'PLACED') return 'CREATED';
  return s;
}

type OrderStepVisual = 'completed' | 'active' | 'pending';

function orderStepVisualState(
  order: OrdersFoodRow,
  step: (typeof ORDER_STEPS)[number],
  status: string
): OrderStepVisual {
  if (step.at(order)) return 'completed';
  const st = normalizeTimelineStatus(status);
  if (st === step.status) return 'active';
  if (step.status === 'CREATED' && st === 'CREATED') return 'active';
  return 'pending';
}

function orderStepIndex(status: string | undefined): number {
  const order = ['CREATED', 'NEW', 'ACCEPTED', 'PREPARING', 'READY_FOR_PICKUP', 'OUT_FOR_DELIVERY', 'DELIVERED', 'RTO', 'CANCELLED'];
  const i = order.indexOf(status || 'CREATED');
  return i >= 0 ? i : 0;
}

/** Last completed step index based on timestamps (for cancelled/RTO timeline). */
function lastCompletedStepIndex(order: OrdersFoodRow): number {
  let last = -1;
  ORDER_STEPS.forEach((step, i) => {
    if (step.at(order)) last = i;
  });
  return last >= 0 ? last : 0;
}

const RIDER_STEPS = [
  { key: 'assigned', label: 'Assigned', at: (data: RiderTimelineData) => data.assigned_at },
  { key: 'reached_merchant', label: 'Reached Merchant', at: (data: RiderTimelineData) => data.reached_merchant_at },
  { key: 'picked_up', label: 'Picked Up', at: (data: RiderTimelineData) => data.picked_up_at },
  { key: 'delivered', label: 'Delivered', at: (data: RiderTimelineData) => data.delivered_at },
] as const;

type RiderTimelineData = {
  assigned_at?: string | null;
  accepted_at?: string | null;
  reached_merchant_at?: string | null;
  picked_up_at?: string | null;
  delivered_at?: string | null;
  events?: Array<{
    event_type: string;
    occurred_at: string;
    merchant_distance_km?: number | null;
    customer_distance_km?: number | null;
  }>;
};

function formatDistKm(v: number | null | undefined): string | null {
  if (v == null || !Number.isFinite(Number(v))) return null;
  const n = Number(v);
  if (n <= 0) return null;
  return `${n % 1 === 0 ? n : n.toFixed(2)}km`;
}

function eventDistances(
  data: RiderTimelineData | null,
  eventType: string
): { mx: string | null; cx: string | null } {
  const hit = data?.events?.find((e) => e.event_type === eventType);
  return {
    mx: formatDistKm(hit?.merchant_distance_km),
    cx: formatDistKm(hit?.customer_distance_km),
  };
}

function RiderTimeline({ riderId, orderId }: { riderId: number | null | undefined; orderId: number }) {
  const [riderAssignment, setRiderAssignment] = useState<RiderTimelineData | null>(null);
  const [loading, setLoading] = useState(true);
  
  useEffect(() => {
    if (!riderId || !orderId) {
      setLoading(false);
      return;
    }
    
    // Fetch rider assignment details from order_rider_assignments
    const fetchRiderTimeline = async () => {
      try {
        const res = await fetch(`/api/food-orders/${orderId}/rider-timeline?rider_id=${riderId}`);
        if (res.ok) {
          const data = await res.json();
          setRiderAssignment(data);
        }
      } catch (err) {
        console.error('Failed to fetch rider timeline:', err);
      } finally {
        setLoading(false);
      }
    };
    
    fetchRiderTimeline();
  }, [riderId, orderId]);

  if (!riderId) return null;
  if (loading) {
    return (
      <div className="flex items-start overflow-x-auto hide-scrollbar">
        <div className="text-[9px] text-gray-400">Loading rider timeline...</div>
      </div>
    );
  }

  const formatTs = (s: string | null | undefined) => (s ? new Date(s).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true }) : '');
  
  // Determine current step based on timestamps
  // If rider is assigned, at least show "Assigned" as active (index 0)
  let currentStepIdx = riderId ? 0 : -1;
  
  // Find the highest completed step based on timestamps
  RIDER_STEPS.forEach((step, idx) => {
    if (riderAssignment && step.at(riderAssignment)) {
      currentStepIdx = idx;
    }
  });

  return (
    <div className="flex items-start overflow-x-auto hide-scrollbar">
      {RIDER_STEPS.map((step, i) => {
        const ts = riderAssignment ? step.at(riderAssignment) : null;
        const done = currentStepIdx >= i;
        const isActive = i === currentStepIdx && !ts;
        const prevDone = i > 0 && (currentStepIdx >= i - 1);
        const dist = eventDistances(riderAssignment, step.key);
        
        return (
          <React.Fragment key={step.key}>
            {i > 0 && (
              <div className={`shrink-0 w-4 h-0.5 mt-3 ${prevDone ? 'bg-blue-400' : 'bg-gray-200'}`} />
            )}
            <div className="flex flex-col items-center shrink-0 min-w-[52px]">
              <div className={`w-6 h-6 rounded-full flex items-center justify-center ${
                done && ts 
                  ? 'bg-blue-500 text-white'
                  : isActive 
                    ? 'bg-blue-500 text-white'
                    : done && !ts && i === 0
                      ? 'bg-blue-500 text-white'
                      : 'bg-gray-200 text-gray-500'
              }`}>
                {(done && ts) || (isActive) || (done && !ts && i === 0) ? (
                  <Check size={12} strokeWidth={3} />
                ) : (
                  <span className="text-[9px] font-bold">{i + 1}</span>
                )}
              </div>
              <span className={`text-[9px] font-medium mt-1 text-center leading-tight ${
                done || isActive ? 'text-blue-600' : 'text-gray-600'
              }`}>
                {step.label}
              </span>
              {ts ? <span className="text-[8px] text-gray-400 text-center">{formatTs(ts)}</span> : null}
              {(dist.mx || dist.cx) ? (
                <div className="mt-1 rounded border border-gray-200 bg-white px-1 py-0.5 text-[7px] leading-tight text-gray-600 text-center">
                  {dist.mx ? <div>Mx-{dist.mx}</div> : null}
                  {dist.cx ? <div>Cx-{dist.cx}</div> : null}
                </div>
              ) : null}
            </div>
          </React.Fragment>
        );
      })}
    </div>
  );
}

function OrderActivityStrip({ ordersFoodId, storeId }: { ordersFoodId: number; storeId: string }) {
  const [actions, setActions] = useState<MerchantOrderActionRow[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(
      `/api/food-orders/${ordersFoodId}/activity?store_id=${encodeURIComponent(storeId)}`
    )
      .then((r) => (r.ok ? r.json() : { actions: [] }))
      .then((data: { actions?: MerchantOrderActionRow[] }) => {
        if (!cancelled) setActions(data.actions ?? []);
      })
      .catch(() => {
        if (!cancelled) setActions([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [ordersFoodId, storeId]);

  if (loading && actions.length === 0) return null;
  if (actions.length === 0) return null;

  return (
    <div className="rounded-lg bg-slate-50/80 p-2.5 border border-slate-100">
      <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Recent activity</p>
      <ul className="space-y-1 max-h-28 overflow-y-auto hide-scrollbar">
        {actions.slice(0, 8).map((a) => (
          <li key={a.id} className="text-[11px] text-gray-700 flex justify-between gap-2">
            <span className="truncate">{formatStatusActionMessage(a.to_status, a.action_source)}</span>
            <span className="text-gray-400 shrink-0">{actionSourceLabel(a.action_source)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function orderStepLabel(step: (typeof ORDER_STEPS)[number], order: OrdersFoodRow): string {
  if (step.key === 'accepted') return displayLabelForAcceptedStep(order);
  return step.label;
}

function OrderStatusTimeline({ order, compact }: { order: OrdersFoodRow; compact?: boolean }) {
  const status = order.order_status || 'CREATED';
  const isTerminal = status === 'CANCELLED' || status === 'RTO';
  const lastCompletedIdx = lastCompletedStepIndex(order);
  const formatTs = (s: string | null | undefined) => (s ? new Date(s).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true }) : '');

  const stepsToShow = isTerminal ? ORDER_STEPS.slice(0, lastCompletedIdx + 1) : ORDER_STEPS;

  if (compact) {
    const terminalLabel = status === 'CANCELLED' ? 'Cancelled' : 'RTO';
    return (
      <div className="flex-1 w-full min-w-0 flex flex-col">
        {/* Row 1: Timeline heading 45° tilt; step titles – same left column width as rows 2 & 3 for perfect alignment */}
        <div className="flex items-center w-full">
          <div className="shrink-0 w-16 mr-3 flex items-center justify-center min-h-[20px] mt-1.5">
            {/* <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide px-2 py-1 rounded-md bg-blue-100 border border-gray-200/80 inline-flex items-center justify-center origin-center" style={{ transform: 'rotate(-50deg)' }}></span> */}
          </div>
          <div className="flex-1 flex min-w-0">
            {stepsToShow.map((step) => (
              <div key={step.key} className="flex-1 flex flex-col items-center min-w-0 px-0.5">
                <span className="text-[9px] font-medium text-gray-600 text-center leading-tight truncate w-full" title={orderStepLabel(step, order)}>{orderStepLabel(step, order)}</span>
              </div>
            ))}
            {isTerminal && (
              <div className="flex-1 flex flex-col items-center min-w-0 px-0.5">
                <span className="text-[9px] font-medium text-gray-600 text-center leading-tight">{terminalLabel}</span>
              </div>
            )}
          </div>
        </div>
        {/* Row 2: beech me – circles + connectors (single line) */}
        <div className="flex items-center w-full mt-1">
          <div className="shrink-0 w-16 mr-3" aria-hidden />
          <div className="flex-1 flex items-center min-w-0">
            {stepsToShow.map((step, i) => {
              const visual = orderStepVisualState(order, step, status);
              const done = visual === 'completed';
              const active = visual === 'active';
              const prevDone =
                i > 0 && orderStepVisualState(order, stepsToShow[i - 1], status) === 'completed';
              return (
                <div key={step.key} className="flex-1 flex items-center min-w-0">
                  <div
                    className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 ${
                      done
                        ? 'bg-green-500 text-white'
                        : active
                          ? 'bg-blue-500 text-white ring-2 ring-blue-200'
                          : 'bg-gray-200 text-gray-500'
                    }`}
                  >
                    {done ? <Check size={10} strokeWidth={3} /> : <span className="text-[8px] font-bold">{i + 1}</span>}
                  </div>
                  {i < stepsToShow.length - 1 ? (
                    <div className={`flex-1 h-0.5 min-w-[6px] ${prevDone ? 'bg-green-400' : 'bg-gray-200'}`} />
                  ) : null}
                </div>
              );
            })}
            {isTerminal && (
              <>
                <div className="flex-1 h-0.5 min-w-[6px] bg-gray-300" />
                <div className="flex-1 flex items-center min-w-0">
                  <div className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 ${status === 'CANCELLED' ? 'bg-red-100 text-red-600' : 'bg-orange-100 text-orange-600'}`}>
                    <XCircle size={12} strokeWidth={2.5} />
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
        {/* Row 3: time neeche */}
        <div className="flex items-start w-full mt-1">
          <div className="shrink-0 w-16 mr-3" aria-hidden />
          <div className="flex-1 flex min-w-0">
            {stepsToShow.map((step) => {
              const ts = step.at(order);
              return (
                <div key={step.key} className="flex-1 flex flex-col items-center min-w-0 px-0.5">
                  {ts ? <span className="text-[8px] text-gray-500 text-center">{formatTs(ts)}</span> : <span className="text-[8px] text-gray-400">—</span>}
                </div>
              );
            })}
            {isTerminal && (
              <div className="flex-1 flex flex-col items-center min-w-0 px-0.5">
                {order.cancelled_at ? <span className="text-[8px] text-gray-500 text-center">{formatTs(order.cancelled_at)}</span> : <span className="text-[8px] text-gray-400">—</span>}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-start overflow-x-auto hide-scrollbar">
      {stepsToShow.map((step, i) => {
        const visual = orderStepVisualState(order, step, status);
        const done = visual === 'completed';
        const active = visual === 'active';
        const ts = step.at(order);
        const prevDone =
          i > 0 && orderStepVisualState(order, stepsToShow[i - 1], status) === 'completed';
        return (
          <React.Fragment key={step.key}>
            {i > 0 && (
              <div className={`shrink-0 w-4 h-0.5 mt-3 ${prevDone ? 'bg-green-400' : 'bg-gray-200'}`} />
            )}
            <div className="flex flex-col items-center shrink-0 min-w-[44px]">
              <div
                className={`w-6 h-6 rounded-full flex items-center justify-center ${
                  done
                    ? 'bg-green-500 text-white'
                    : active
                      ? 'bg-blue-500 text-white ring-2 ring-blue-200'
                      : 'bg-gray-200 text-gray-500'
                }`}
              >
                {done ? <Check size={12} strokeWidth={3} /> : <span className="text-[9px] font-bold">{i + 1}</span>}
              </div>
              <span className="text-[9px] font-medium text-gray-600 mt-1 text-center leading-tight">{orderStepLabel(step, order)}</span>
              {ts ? <span className="text-[8px] text-gray-400 text-center">{formatTs(ts)}</span> : null}
            </div>
          </React.Fragment>
        );
      })}
      {isTerminal && (
        <>
          <div className="shrink-0 w-4 h-0.5 mt-3 bg-gray-300" />
          <div className="flex flex-col items-center shrink-0 min-w-[44px]">
            <div className={`w-6 h-6 rounded-full flex items-center justify-center ${status === 'CANCELLED' ? 'bg-red-100 text-red-600' : 'bg-orange-100 text-orange-600'}`}>
              <XCircle size={14} strokeWidth={2.5} />
            </div>
            <span className="text-[9px] font-medium text-gray-600 mt-1 text-center leading-tight">{status === 'CANCELLED' ? 'Cancelled' : 'RTO'}</span>
            {order.cancelled_at ? <span className="text-[8px] text-gray-400 text-center">{formatTs(order.cancelled_at)}</span> : null}
          </div>
        </>
      )}
    </div>
  );
}

function OrderDetailMobile({
  order,
  onClose,
  statusLabel,
  formatVegNonVeg,
  formatTimeAgo,
  otpCache,
  pickupVerified,
  rtoVerified,
  onFetchOtp,
  onAccept,
  onReject,
  onPreparing,
  onReady,
  onNeedMoreTime,
  onDispatch,
  onComplete,
  onRto,
  actionLoading,
  onOpenRidersLog,
  onOpenRiderImage,
  acceptLabel,
  acceptDisabled,
  nowMs,
  onOpenBill,
  onOpenAllItems,
  onOpenTimeline,
  onPrintBill,
}: {
  order: OrdersFoodRow;
  onClose: () => void;
  statusLabel: string;
  formatVegNonVeg: (v: string | null) => string;
  formatTimeAgo: (s: string) => string;
  otpCache?: CachedOrderOtps;
  pickupVerified?: boolean;
  rtoVerified?: boolean;
  onFetchOtp: () => void;
  onAccept: () => void;
  onReject: () => void;
  onPreparing: () => void;
  onReady: () => void;
  onNeedMoreTime?: () => void;
  onDispatch: () => void;
  onComplete: () => void;
  onRto: () => void;
  actionLoading: boolean;
  onOpenRidersLog?: () => void;
  onOpenRiderImage?: (url: string) => void;
  acceptLabel?: string;
  acceptDisabled?: boolean;
  nowMs?: number;
  onOpenBill?: () => void;
  onOpenAllItems?: () => void;
  onOpenTimeline?: () => void;
  onPrintBill?: () => void;
}) {
  const status = order.order_status || 'CREATED';
  const showPastRidersLog = usePastRidersEligibility(order.id, !!onOpenRidersLog);
  const statusColor =
    status === 'CREATED' || status === 'NEW'
      ? 'bg-red-100 text-red-800'
      : status === 'DELIVERED'
        ? 'bg-green-100 text-green-800'
        : status === 'CANCELLED'
          ? 'bg-gray-100 text-gray-700'
          : 'bg-blue-100 text-blue-800';
  const totalValue = resolveMerchantCtm(order).toFixed(2);
  const hasFlags =
    order.requires_utensils ||
    order.is_fragile ||
    order.is_high_value ||
    (order.veg_non_veg && order.veg_non_veg !== 'na');
  const otps = resolveOrderOtps(order, otpCache);
  const orderItems = Array.isArray(order.items) ? order.items : [];
  const previewItems = orderItems.slice(0, ORDER_ITEMS_PREVIEW_MAX);
  const moreItemsCount = Math.max(0, orderItems.length - ORDER_ITEMS_PREVIEW_MAX);

  return (
    <div
      className="flex flex-col h-full overflow-hidden bg-gray-50"
      style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom, 0px))' }}
    >
      {/* Header Card */}
      <div className="shrink-0 bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0 flex-1 flex-wrap">
          <FormattedOrderId 
            formattedOrderId={order.formatted_order_id} 
            fallbackOrderId={order.order_id}
            size="lg"
          />
          {(otps.pickup || otps.rto) && (
            <div className="flex flex-wrap items-center gap-2">
              {otps.pickup && (
                <div className="flex items-center gap-1.5 px-2.5 py-1 bg-slate-100 rounded-lg border border-slate-200">
                  <span className="text-[10px] font-semibold text-slate-600">Pickup</span>
                  <span className="font-mono font-bold text-base text-gray-900 tracking-wider">{otps.pickup}</span>
                  {pickupVerified && <span className="text-green-600 text-xs">✓</span>}
                </div>
              )}
              {otps.rto && (
                <div className="flex items-center gap-1.5 px-2.5 py-1 bg-orange-50 rounded-lg border border-orange-200">
                  <span className="text-[10px] font-semibold text-orange-700">RTO</span>
                  <span className="font-mono font-bold text-base text-orange-900 tracking-wider">{otps.rto}</span>
                  {rtoVerified && <span className="text-green-600 text-xs">✓</span>}
                </div>
              )}
            </div>
          )}
          <span className={`px-2.5 py-1 rounded-lg text-xs font-semibold ${statusColor}`}>{statusLabel}</span>
        </div>
        <button
          onClick={onClose}
          className="p-2 -m-2 hover:bg-gray-100 rounded-lg touch-manipulation shrink-0"
          aria-label="Close"
        >
          <X size={20} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto overflow-x-hidden p-4 space-y-3 hide-scrollbar min-h-0">
        {/* Customer - Full Details */}
        {order.customer_name && (
          <div className="rounded-lg bg-gradient-to-br from-blue-50/50 to-blue-100/30 p-3 border border-blue-100/60 shadow-sm">
            <div className="flex items-start gap-2.5">
              <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center shrink-0">
                <User size={16} className="text-blue-600" />
              </div>
              <div className="min-w-0 flex-1 space-y-1.5">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="font-semibold text-gray-900 text-sm">{order.customer_name}</p>
                  {order.customer_scores && (
                    <span className={`px-1.5 py-0.5 rounded text-[9px] font-medium ${
                      (order.customer_scores.trust_score || 100) >= 80 
                        ? 'bg-green-100 text-green-700' 
                        : (order.customer_scores.trust_score || 100) >= 50
                          ? 'bg-yellow-100 text-yellow-700'
                          : 'bg-red-100 text-red-700'
                    }`}>
                      {(order.customer_scores.trust_score || 100).toFixed(0)}
                    </span>
                  )}
                </div>
                {order.customer_phone && (
                  <a href={`tel:${order.customer_phone}`} className="flex items-center gap-1.5 text-blue-600 text-xs font-medium hover:text-blue-700">
                    <Phone size={12} /> {order.customer_phone}
                  </a>
                )}
                {(order.drop_address_raw || order.drop_address_normalized) && (
                  <div className="flex items-start gap-1.5 text-xs text-gray-700">
                    <MapPin size={12} className="shrink-0 mt-0.5 text-amber-600" />
                    <span className="leading-relaxed break-words">{order.drop_address_normalized || order.drop_address_raw}</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Rider - Full Details with Timeline */}
        {(order.rider_id || order.rider_name || order.rider_details) ? (
          <div className="rounded-lg bg-gradient-to-br from-purple-50/50 to-purple-100/30 p-3 border border-purple-100/60 shadow-sm relative">
            {showPastRidersLog && onOpenRidersLog && (
              <button
                type="button"
                onClick={onOpenRidersLog}
                className="absolute top-2 right-2 text-[10px] font-semibold text-purple-600 hover:text-purple-800 hover:underline"
              >
                Rider&apos;s log
              </button>
            )}
            <div className="space-y-2.5">
              <div className="flex items-start gap-2.5">
                {order.rider_details?.selfie_url ? (
                  onOpenRiderImage ? (
                    <button
                      type="button"
                      onClick={() => onOpenRiderImage(order.rider_details!.selfie_url!)}
                      className="shrink-0 rounded-full border-2 border-purple-200 overflow-hidden focus:outline-none focus:ring-2 focus:ring-purple-400"
                    >
                      <img 
                        src={order.rider_details.selfie_url} 
                        alt={order.rider_name || 'Rider'} 
                        className="w-8 h-8 rounded-full object-cover"
                      />
                    </button>
                  ) : (
                    <img 
                      src={order.rider_details.selfie_url} 
                      alt={order.rider_name || 'Rider'} 
                      className="w-8 h-8 rounded-full object-cover border-2 border-purple-200 shrink-0"
                    />
                  )
                ) : (
                  <div className="w-8 h-8 rounded-full bg-purple-100 flex items-center justify-center shrink-0">
                    <Bike size={16} className="text-purple-600" />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <p className="font-semibold text-gray-900 text-sm">
                      {order.rider_details?.name || order.rider_name || `Rider #${order.rider_id}`}
                    </p>
                    {order.rider_details?.id && (
                      <span className="text-[9px] text-gray-500">ID: {order.rider_details.id}</span>
                    )}
                    {order.rider_details?.status && (
                      <span className={`px-1.5 py-0.5 rounded text-[9px] font-medium ${
                        order.rider_details.status === 'ACTIVE' 
                          ? 'bg-green-100 text-green-700' 
                          : 'bg-gray-100 text-gray-600'
                      }`}>
                        {order.rider_details.status}
                      </span>
                    )}
                  </div>
                  {order.rider_details?.mobile && (
                    <a href={`tel:${order.rider_details.mobile}`} className="flex items-center gap-1.5 text-purple-600 text-xs font-medium hover:text-purple-700">
                      <Phone size={12} /> {order.rider_details.mobile}
                    </a>
                  )}
                  {order.rider_details?.city && (
                    <p className="text-xs text-gray-600 mt-0.5">{order.rider_details.city}</p>
                  )}
                </div>
              </div>
              {/* Rider Timeline */}
              {order.rider_id && (
                <div className="pt-2 border-t border-purple-100/60">
                  <RiderTimeline riderId={order.rider_id} orderId={order.order_id} />
                </div>
              )}
            </div>
          </div>
        ) : null}

        <div className="rounded-xl border border-gray-200 bg-white p-3 shadow-sm">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs text-gray-500">{order.preparation_time_minutes ?? '—'}m prep</span>
          </div>
          <MerchantOrderItemsList
            items={(previewItems.length ? previewItems : orderItems) as NormalizedOrderLineItem[]}
            showUtensilsBanner={false}
            maxItems={ORDER_ITEMS_PREVIEW_MAX}
            compact
          />
          {moreItemsCount > 0 && onOpenAllItems ? (
            <button
              type="button"
              onClick={onOpenAllItems}
              className="mt-2 w-full text-left text-xs font-semibold text-blue-600 hover:underline"
            >
              +{moreItemsCount} more
            </button>
          ) : null}
          <MerchantOrderBillSummary
            className="mt-2"
            items={orderItems as NormalizedOrderLineItem[]}
            pricing={
              order.pricing ?? {
                subtotal: 0,
                packaging: 0,
                taxes: 0,
                discount: 0,
                total: resolveMerchantCtm(order),
              }
            }
            onTotalClick={onOpenBill}
          />
        </div>

        {/* Merchant instructions (kitchen notes — not rider delivery instructions) */}
        {(() => {
          const lines = resolveMerchantInstructionsForDisplay(order);
          if (lines.length === 0) return null;
          return (
          <div className="rounded-lg bg-amber-50/60 p-2.5 border border-amber-100">
            <div className="flex items-start gap-2">
              <MapPin size={12} className="shrink-0 mt-0.5 text-amber-600" />
              <p className="text-xs text-gray-700 leading-relaxed break-words">{lines.join(' · ')}</p>
            </div>
          </div>
          );
        })()}

        {/* Flags - compact */}
        {(order.requires_utensils || (order.veg_non_veg && order.veg_non_veg !== 'na') || order.is_fragile || order.is_high_value) && (
          <div className="rounded-lg bg-gray-50/60 p-2.5 border border-gray-100">
            <div className="flex flex-wrap gap-1.5">
              {order.requires_utensils && (
                <span className="px-2 py-0.5 bg-gray-100 text-gray-700 text-[10px] rounded-md flex items-center gap-1 w-fit"><UtensilsCrossed size={10} /> Utensils</span>
              )}
              {order.veg_non_veg && order.veg_non_veg !== 'na' && (
                <span className="px-2 py-0.5 bg-green-100 text-green-800 text-[10px] rounded-md w-fit">{formatVegNonVeg(order.veg_non_veg)}</span>
              )}
              {order.is_fragile && <span className="px-2 py-0.5 bg-amber-100 text-amber-800 text-[10px] rounded-md">Fragile</span>}
              {order.is_high_value && <span className="px-2 py-0.5 bg-yellow-100 text-yellow-800 text-[10px] rounded-md">High value</span>}
            </div>
          </div>
        )}

        <OrderCancellationBanner order={order} />
        <OrderOtpSection
          status={status}
          otps={otps}
          pickupVerified={pickupVerified}
          rtoVerified={rtoVerified}
          compact
          merchantInstructions={resolveMerchantInstructionsForDisplay(order)}
        />

        {/* Order Status Timeline */}
        <div className="rounded-lg bg-white p-3 border border-gray-200 shadow-sm">
          <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-2.5">Order Status Timeline</p>
          <OrderStatusTimeline order={order} />
        </div>

        {/* Action Buttons Card */}
        <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
          <ActionBtns
            order={order}
            onAccept={onAccept}
            onReject={onReject}
            onPreparing={onPreparing}
            onReady={onReady}
            onNeedMoreTime={onNeedMoreTime}
            onDispatch={onDispatch}
            onComplete={onComplete}
            onRto={onRto}
            loading={actionLoading}
            otpVerified={pickupVerified}
            acceptLabel={acceptLabel}
            acceptDisabled={acceptDisabled}
            nowMs={nowMs}
          />
        </div>
      </div>
    </div>
  );
}

function OrderCard({
  order,
  selected,
  onClick,
  onAccept,
  onReject,
  onPreparing,
  onReady,
  onNeedMoreTime,
  onDispatch,
  onComplete,
  onRto,
  loading,
  otpCode,
  otpType,
  otpVerified,
  onFetchOtp,
  statusLabel,
  acceptLabel,
  acceptDisabled,
  nowMs,
  hideDetails,
}: {
  order: OrdersFoodRow;
  selected: boolean;
  onClick: () => void;
  onAccept: () => void;
  onReject?: () => void;
  onPreparing: () => void;
  onReady: () => void;
  onNeedMoreTime?: () => void;
  onDispatch: () => void;
  onComplete: () => void;
  onRto: () => void;
  loading: boolean;
  otpCode?: string;
  otpType?: string;
  otpVerified?: boolean;
  onFetchOtp?: () => void;
  statusLabel?: string;
  acceptLabel?: string;
  acceptDisabled?: boolean;
  nowMs?: number;
  /** Hide the "Details" CTA (used in right slider list) */
  hideDetails?: boolean;
}) {
  const status = order.order_status || 'CREATED';
  const isNew = status === 'CREATED' || status === 'NEW';
  const isPrepPipeline = status === 'PREPARING' || status === 'ACCEPTED';
  const prepExpired =
    isPrepPipeline && nowMs != null && computePrepExpired(order, nowMs);
  const value = resolveMerchantCtm(order);
  const label = statusLabel ?? STATUS_LABEL[status] ?? status;
  const merchantInstructionsText = formatMerchantInstructionsForCard(order);
  const preparedLateMins =
    status === 'READY_FOR_PICKUP' || status === 'OUT_FOR_DELIVERY'
      ? resolvePreparedLateMinutes(order)
      : null;
  const showPreparedLateBanner = preparedLateMins != null && preparedLateMins > 0;
  const showTopDelayBanner =
    (prepExpired && nowMs != null) || showPreparedLateBanner;
  const extraTimeLabel = formatExtraPrepTimeAddedLabel(
    order.last_prep_delay_minutes_added,
    order.prep_delay_minutes
  );

  return (
    <div className="min-w-0 touch-manipulation">
      <div className="overflow-hidden rounded-lg">
        {showTopDelayBanner ? (
          prepExpired && nowMs != null ? (
            <>
              <OrderPrepDelayedBanner order={order} nowMs={nowMs} />
              {extraTimeLabel ? <ExtraPrepTimeAddedBanner label={extraTimeLabel} /> : null}
            </>
          ) : showPreparedLateBanner ? (
            <OrderPreparedLateTopBanner lateMinutes={preparedLateMins!} />
          ) : null
        ) : null}
        <div
          onClick={onClick}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(); } }}
          className={`rounded-lg border-2 p-3 sm:p-3.5 cursor-pointer transition-all overflow-hidden min-w-0 active:scale-[0.99] ${
            showTopDelayBanner ? 'rounded-t-none border-t-0' : ''
          } ${
            selected
              ? 'border-orange-500 bg-orange-50 shadow-md'
              : isNew
                ? 'border-red-300 bg-red-50/50 ring-2 ring-red-200/50'
                : 'border-gray-200 bg-white hover:border-gray-300 hover:shadow'
          }`}
        >
      <div className="flex items-start justify-between gap-2 mb-2 min-w-0">
        <div className="min-w-0 flex-1">
          <FormattedOrderId 
            formattedOrderId={order.formatted_order_id} 
            fallbackOrderId={order.order_id}
            size="sm"
          />
      <p className="text-xs text-gray-600 truncate">{order.customer_name || '—'}</p>
        </div>
        <span
          className={`shrink-0 px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide ${
            status === 'CREATED' || status === 'NEW'
              ? 'bg-red-100 text-red-800'
              : status === 'DELIVERED' || status === 'CANCELLED'
                ? 'bg-gray-100 text-gray-700'
                : 'bg-blue-100 text-blue-800'
          }`}
          title={status}
        >
          {label}
        </span>
      </div>
      <div className="flex items-center gap-2 text-xs text-gray-500 mb-2 flex-wrap">
        <span className="flex items-center gap-1">
          <Clock size={12} />
          {formatTimeAgo(order.created_at)}
        </span>
        <span>•</span>
        <span>{computeOrderItemQuantityCount(order)} items</span>
        <span>•</span>
        <span className="font-semibold text-gray-900">{formatInr(value)}</span>
        {order.preparation_time_minutes != null && (
          <>
            <span>•</span>
            <span>{order.preparation_time_minutes}m prep</span>
          </>
        )}
      </div>
      <div className="flex flex-wrap gap-1 mb-2">
        {order.veg_non_veg === 'veg' && (
          <span className="px-1.5 py-0.5 bg-green-100 text-green-700 text-xs rounded">🥗 Veg</span>
        )}
        {order.veg_non_veg === 'non_veg' && (
          <span className="px-1.5 py-0.5 bg-amber-100 text-amber-800 text-xs rounded">🍗 Non-Veg</span>
        )}
        {order.veg_non_veg === 'mixed' && (
          <span className="px-1.5 py-0.5 bg-emerald-100 text-emerald-800 text-xs rounded">🥗🍗 Mixed</span>
        )}
        {order.is_high_value && (
          <span className="px-1.5 py-0.5 bg-yellow-100 text-yellow-800 text-xs rounded flex items-center gap-0.5">
            <Star size={10} /> High
          </span>
        )}
        {order.is_fragile && (
          <span className="px-1.5 py-0.5 bg-amber-100 text-amber-700 text-xs rounded">⚠ Fragile</span>
        )}
        {order.requires_utensils && (
          <span className="px-1.5 py-0.5 bg-gray-100 text-gray-600 text-xs rounded flex items-center gap-0.5">
            <UtensilsCrossed size={10} /> Utensils
          </span>
        )}
      </div>
      {merchantInstructionsText ? (
        <p className="text-xs text-amber-700 mb-2 flex items-center gap-1 truncate" title={merchantInstructionsText}>
          <AlertTriangle size={12} /> {merchantInstructionsText}
        </p>
      ) : null}

      {(status === 'READY_FOR_PICKUP' || status === 'OUT_FOR_DELIVERY') && (otpCode || onFetchOtp) && (
        <div className="mb-2 px-2 py-1 bg-slate-100 rounded text-xs flex items-center justify-between">
          <span className="text-slate-600">OTP ({otpType || 'PICKUP'}):</span>
          {otpCode ? (
            <span className="font-mono font-bold text-slate-900">{otpCode}</span>
          ) : (
            <button onClick={(e) => { e.stopPropagation(); onFetchOtp?.(); }} className="text-orange-600 font-medium">Show</button>
          )}
          {otpVerified && <span className="text-green-600 text-[10px]">✓ Verified</span>}
        </div>
      )}
      <div className="mt-2 pt-2 border-t border-gray-100 flex flex-col gap-2">
        {/* Actions always in one row (no overlap) */}
        <div className="w-full" onClick={(e) => e.stopPropagation()}>
          <ActionBtns
            order={order}
            onAccept={onAccept}
            onReject={onReject}
            onPreparing={onPreparing}
            onReady={onReady}
            onNeedMoreTime={onNeedMoreTime}
            onDispatch={onDispatch}
            onComplete={onComplete}
            onRto={onRto}
            loading={loading}
            otpVerified={otpVerified}
            compact
            topRightLayout
            hideRtoMenu
            acceptLabel={acceptLabel}
            acceptDisabled={acceptDisabled}
            nowMs={nowMs}
          />
        </div>

      </div>
        </div>
      </div>
    </div>
  );
}

function OrderListRow({
  order,
  selected,
  onClick,
  onAccept,
  onReject,
  onPreparing,
  onReady,
  onNeedMoreTime,
  onDispatch,
  onRto,
  onComplete,
  loading,
  otpCode,
  otpType,
  otpVerified,
  onFetchOtp,
  statusLabel,
  acceptLabel,
  acceptDisabled,
  nowMs,
}: {
  order: OrdersFoodRow;
  selected: boolean;
  onClick: () => void;
  onAccept: () => void;
  onReject?: () => void;
  onPreparing: () => void;
  onReady: () => void;
  onNeedMoreTime?: () => void;
  onDispatch: () => void;
  onRto: () => void;
  onComplete: () => void;
  loading: boolean;
  otpCode?: string;
  otpType?: string;
  otpVerified?: boolean;
  onFetchOtp?: () => void;
  statusLabel?: string;
  acceptLabel?: string;
  acceptDisabled?: boolean;
  nowMs?: number;
}) {
  const status = order.order_status || 'CREATED';
  const value = resolveMerchantCtm(order);
  const label = statusLabel ?? STATUS_LABEL[status] ?? status;
  const isNew = status === 'CREATED' || status === 'NEW';

  return (
    <div
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(); } }}
      className={`group relative flex items-center gap-4 rounded-xl border-2 px-4 py-3.5 cursor-pointer transition-all duration-200 overflow-hidden min-w-0 ${
        selected
          ? 'border-orange-500 bg-gradient-to-r from-orange-50 to-orange-50/50 shadow-md'
          : isNew
            ? 'border-red-200 bg-gradient-to-r from-red-50/30 to-white hover:border-red-300 hover:shadow-sm'
            : 'border-gray-200 bg-white hover:border-orange-200 hover:bg-gradient-to-r hover:from-orange-50/30 hover:to-white hover:shadow-md'
      }`}
    >
      {/* Status Badge */}
      <div className="shrink-0">
        <span
          className={`inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-bold uppercase tracking-wide ${
            status === 'CREATED' || status === 'NEW'
              ? 'bg-red-100 text-red-700 border border-red-200'
              : status === 'DELIVERED'
                ? 'bg-green-100 text-green-700 border border-green-200'
                : status === 'CANCELLED'
                  ? 'bg-gray-100 text-gray-600 border border-gray-200'
                  : 'bg-blue-100 text-blue-700 border border-blue-200'
          }`}
          title={status}
        >
          {label}
        </span>
      </div>

      {/* Order ID */}
      <div className="shrink-0 min-w-[120px]">
        <FormattedOrderId 
          formattedOrderId={order.formatted_order_id} 
          fallbackOrderId={order.order_id}
          size="sm"
        />
      </div>

      {/* Restaurant Name */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-gray-900 truncate">{order.customer_name || '—'}</p>
        <div className="flex items-center gap-3 mt-1">
          <span className="text-xs text-gray-500 flex items-center gap-1">
            <Clock size={11} />
            {formatTimeAgo(order.created_at)}
          </span>
          <span className="text-xs text-gray-600 font-medium">
            {computeOrderItemQuantityCount(order)} {computeOrderItemQuantityCount(order) === 1 ? 'item' : 'items'}
          </span>
          <span className="text-xs font-bold text-gray-900">
            {formatInr(value)}
          </span>
          {order.preparation_time_minutes != null && (
            <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded">
              {order.preparation_time_minutes}m prep
            </span>
          )}
        </div>
      </div>

      {/* OTP Display */}
      {(status === 'READY_FOR_PICKUP' || status === 'OUT_FOR_DELIVERY') && (otpCode || onFetchOtp) && (
        <div className="shrink-0 px-3 py-1.5 bg-gradient-to-r from-slate-100 to-slate-50 rounded-lg border border-slate-200">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-semibold text-gray-600 uppercase">OTP</span>
            {otpCode ? (
              <span className="font-mono font-bold text-sm text-gray-900">{otpCode}</span>
            ) : (
              <button 
                onClick={(e) => { e.stopPropagation(); onFetchOtp?.(); }} 
                className="text-xs font-medium text-orange-600 hover:text-orange-700"
              >
                Show
              </button>
            )}
            {otpVerified && <span className="text-green-600 text-xs">✓</span>}
          </div>
        </div>
      )}

      {/* Action Buttons */}
      <div className="shrink-0" onClick={(e) => e.stopPropagation()}>
        <ActionBtns
          order={order}
          onAccept={onAccept}
          onReject={onReject}
          onPreparing={onPreparing}
          onReady={onReady}
          onNeedMoreTime={onNeedMoreTime}
          onDispatch={onDispatch}
          onComplete={onComplete}
          onRto={onRto}
          loading={loading}
          otpVerified={otpVerified}
          compact
          acceptLabel={acceptLabel}
          acceptDisabled={acceptDisabled}
          nowMs={nowMs}
        />
      </div>

      {/* Details Button */}
      <button
        onClick={(e) => { e.stopPropagation(); onClick(); }}
        className={`shrink-0 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${
          selected
            ? 'bg-orange-600 text-white hover:bg-orange-700'
            : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
        }`}
      >
        Details <ChevronRight size={14} />
      </button>
    </div>
  );
}

function ActionBtns({
  order,
  onAccept,
  onReject,
  onPreparing,
  onReady,
  onNeedMoreTime,
  onDispatch,
  onComplete,
  onRto,
  loading,
  compact,
  otpVerified,
  topRightLayout,
  hideRtoMenu,
  acceptLabel,
  acceptDisabled,
  nowMs,
}: {
  order: OrdersFoodRow;
  onAccept: () => void;
  onReject?: () => void;
  onPreparing: () => void;
  onReady: () => void;
  onNeedMoreTime?: () => void;
  onDispatch: () => void;
  onComplete: () => void;
  onRto?: () => void;
  loading: boolean;
  compact?: boolean;
  otpVerified?: boolean;
  /** When true: actions at top-right, primary button full width, Reject/secondary half width */
  topRightLayout?: boolean;
  /** When true: do not render 3-dot RTO menu (e.g. when RTO is in header) */
  hideRtoMenu?: boolean;
  /** Optional: show accept countdown label */
  acceptLabel?: string;
  /** Optional: disable accept when window expired */
  acceptDisabled?: boolean;
  nowMs?: number;
}) {
  const status = order.order_status || 'CREATED';
  const dis = loading;
  const btnBase = 'rounded-xl font-medium disabled:opacity-50 min-w-0 transition-all duration-200 active:scale-[0.98] shadow-sm border border-transparent';
  const primaryFull = topRightLayout ? 'flex-[2] px-4 py-2.5 text-sm font-semibold' : '';
  const rejectHalf = topRightLayout ? 'flex-1 px-3 py-2.5 text-sm font-semibold' : '';
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!menuOpen) return;
    const close = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, [menuOpen]);

  if (status === 'CREATED' || status === 'NEW') {
    return (
      <div className={`flex gap-2 items-center ${topRightLayout ? 'w-full flex-1' : 'flex-wrap'}`}>
        <button
          onClick={(e) => { e.stopPropagation(); onAccept(); }}
          disabled={dis || acceptDisabled}
          className={`${btnBase} ${compact ? 'px-4 py-2 text-sm font-semibold' : 'px-5 py-2.5 text-base font-semibold'} ${primaryFull} bg-green-600 text-white hover:bg-green-700 hover:shadow-md border-green-700/20`}
        >
          {acceptLabel || 'Accept'}
        </button>
        {onReject && (
          <button
            onClick={(e) => { e.stopPropagation(); onReject(); }}
            disabled={dis}
            className={`${btnBase} ${rejectHalf} ${!topRightLayout ? (compact ? 'px-2.5 py-1.5 text-xs' : 'px-3 py-2 text-sm') : ''} bg-red-50 text-red-700 hover:bg-red-100 border-red-200/60`}
          >
            Reject
          </button>
        )}
      </div>
    );
  }
  const RtoMenu = () => {
    if (!onRto || hideRtoMenu || topRightLayout) return null;
    return (
      <div className="relative shrink-0" ref={menuRef}>
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); setMenuOpen((o) => !o); }}
          disabled={dis}
          className="p-2 rounded-xl border border-gray-200 bg-white hover:bg-gray-50 text-gray-600 disabled:opacity-50 transition-colors"
          aria-label="More actions"
        >
          <MoreVertical size={18} />
        </button>
        {menuOpen && (
          <div className="absolute right-0 top-full mt-1 py-1 bg-white border border-gray-200 rounded-lg shadow-lg z-50 min-w-[100px]">
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onRto(); setMenuOpen(false); }}
              disabled={dis}
              className="w-full text-left px-3 py-2 text-sm font-medium text-orange-700 hover:bg-orange-50 rounded-none first:rounded-t-lg last:rounded-b-lg"
            >
              RTO
            </button>
          </div>
        )}
      </div>
    );
  };

  if (status === 'PREPARING' || status === 'ACCEPTED') {
    if (nowMs == null) {
      return (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onReady();
          }}
          disabled={dis}
          className={`${btnBase} w-full min-h-[44px] rounded-xl px-3 py-2.5 text-sm font-semibold bg-slate-800 text-white hover:bg-slate-900`}
        >
          Order Ready
        </button>
      );
    }
    return (
      <MerchantPreparingOrderActions
        order={order}
        nowMs={nowMs}
        onReady={onReady}
        onNeedMoreTime={onNeedMoreTime}
        loading={dis}
        compact={compact}
      />
    );
  }
  if (status === 'READY_FOR_PICKUP') {
    if (topRightLayout) return null;
    return (
      <div className={`flex flex-col gap-2 ${topRightLayout ? 'w-full' : ''}`}>
        <ReadyHandoverRunningTimeline
          order={order}
          nowMs={nowMs ?? Date.now()}
          compact={compact}
        />
        {!compact && !topRightLayout ? <RtoMenu /> : null}
      </div>
    );
  }
  if (status === 'OUT_FOR_DELIVERY') {
    const showMerchantComplete = canMerchantMarkDelivered(order);
    return (
      <div className={`flex flex-col gap-2 ${topRightLayout ? 'w-full' : ''}`}>
        {showMerchantComplete ? (
          <button
            onClick={(e) => { e.stopPropagation(); onComplete(); }}
            disabled={dis}
            className={`${btnBase} ${topRightLayout ? 'w-full px-4 py-2.5 text-sm font-semibold' : ''} ${compact ? 'px-2.5 py-1.5 text-xs' : 'px-4 py-2 text-sm'} bg-green-600 text-white hover:bg-green-700 hover:shadow-md border-green-700/20`}
          >
            Mark delivered
          </button>
        ) : (
          <p
            className={`text-center text-sm font-medium text-gray-600 ${topRightLayout ? 'w-full py-2' : 'px-2 py-1'}`}
          >
            Rider will complete delivery
          </p>
        )}
        <RtoMenu />
      </div>
    );
  }
  return null;
}

export default function FoodOrdersPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-gray-50">
          <div className="text-gray-500">Loading...</div>
        </div>
      }
    >
      <OrdersPageContent />
    </Suspense>
  );
}
