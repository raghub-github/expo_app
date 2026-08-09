'use client';

import React, { Suspense, useCallback, useEffect, useMemo, useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useSearchParams } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import {
  Calendar,
  ChevronDown,
  Loader2,
  Search,
  SlidersHorizontal,
  X,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { MXLayoutWhite } from '@/components/MXLayoutWhite';
import { PartnerPageHeader } from '@/context/PartnerShellHeaderContext';
import { PARTNER_PAGE_HEADERS } from '@/lib/partner-page-headers';
import { PageSkeletonOrders } from '@/components/PageSkeleton';
import { MerchantStore } from '@/lib/merchantStore';
import { isValidPartnerStoreId } from '@/lib/partner-store-id-shared';
import { readPartnerSelectedStoreId } from '@/lib/partner-selected-store';
import { usePartnerStoreRecord } from '@/hooks/usePartnerStoreRecord';
import { getQueryClient } from '@/lib/query-client';
import { merchantKeys } from '@/lib/query-keys';
import { toast } from 'sonner';
import type { OrdersFoodRow } from '@/hooks/useFoodOrders';
import { MobileHamburgerButton } from '@/components/MobileHamburgerButton';
import { type OrderPricingBreakdown } from '@/lib/orderLineItems';
import { FormattedOrderId } from '@/components/FormattedOrderId';
import { OrderPanel } from '@/components/orders/OrderPanel';
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
import { OrderRidersHistorySidesheet, type RiderLogEntry } from '@/components/orders/OrderRidersHistorySidesheet';
import {
  fetchRidersLogCached,
  getCachedRidersLog,
  pastRidersFromLog,
  prefetchRidersLog,
} from '@/lib/ridersLogCache';
import { resolveOrderOtps } from '@/lib/orderOtps';
import { computeOrderItemQuantityCount } from '@/lib/merchantOrderFoodActions';
import { splitRejectionMessage } from '@/lib/orderRejectionDisplay';
import { resolveMerchantCtm } from '@/lib/merchant-order-ctm';

/** Order history shows completed terminal orders only (not live pipeline). */
const HISTORY_TERMINAL_STATUSES = new Set(['DELIVERED', 'RTO', 'CANCELLED']);

const HISTORY_STATUS_OPTIONS = ['DELIVERED', 'RTO', 'CANCELLED'] as const;

/** UI filter keys → terminal DB statuses */
const HISTORY_UI_STATUS_DEF: { key: string; label: string; statuses: string[] }[] = [
  { key: 'delivered', label: 'Delivered', statuses: ['DELIVERED'] },
  { key: 'timed_out', label: 'Timed out', statuses: ['RTO'] },
  { key: 'rejected', label: 'Rejected', statuses: ['CANCELLED'] },
];

type FilterCategory = 'status' | 'type' | 'ratings';

function normStatus(s: string | null | undefined) {
  return s === 'NEW' ? 'CREATED' : s || 'CREATED';
}

function formatItemsSummary(order: OrdersFoodRow): string {
  const raw = order.items;
  const totalQty = computeOrderItemQuantityCount(order);
  if (Array.isArray(raw) && raw.length > 0) {
    const it = raw[0] as Record<string, unknown>;
    const name = String(it.name ?? it.item_name ?? 'Item').trim();
    const qty = Number(it.quantity ?? 1) || 1;
    const moreLines = raw.length > 1 ? ` +${raw.length - 1} more` : '';
    const countSuffix =
      totalQty > 0 ? ` · ${totalQty} item${totalQty === 1 ? '' : 's'}` : '';
    return `${qty} × ${name}${moreLines}${countSuffix}`;
  }
  return totalQty > 0 ? `${totalQty} item${totalQty === 1 ? '' : 's'}` : '—';
}

function formatListTime(iso: string) {
  const d = new Date(iso);
  const time = d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true });
  const date = d.toLocaleDateString('en-IN', { day: 'numeric', month: 'long' });
  return { time, date };
}

function historyStatusLabel(status: string) {
  const s = normStatus(status);
  const map: Record<string, string> = {
    CREATED: 'CREATED',
    ACCEPTED: 'ACCEPTED',
    PREPARING: 'PREPARING',
    READY_FOR_PICKUP: 'READY',
    OUT_FOR_DELIVERY: 'PICKED UP',
    DELIVERED: 'DELIVERED',
    RTO: 'RTO',
    CANCELLED: 'CANCELLED',
  };
  return map[s] || s.replace(/_/g, ' ');
}

function historyBadgeClass(status: string) {
  const s = normStatus(status);
  if (s === 'PREPARING' || s === 'ACCEPTED' || s === 'CREATED') return 'bg-violet-600 text-white';
  if (s === 'READY_FOR_PICKUP') return 'bg-emerald-600 text-white';
  if (s === 'OUT_FOR_DELIVERY') return 'bg-orange-500 text-white';
  if (s === 'DELIVERED') return 'bg-green-600 text-white';
  if (s === 'RTO') return 'bg-amber-600 text-white';
  if (s === 'CANCELLED') return 'bg-red-600 text-white';
  return 'bg-slate-600 text-white';
}

function startOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function endOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}

function toYmd(d: Date) {
  const y = d.getFullYear();
  const m = (d.getMonth() + 1).toString().padStart(2, '0');
  const day = d.getDate().toString().padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function parseYmd(ymd: string): Date {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

/** DD-MM-YYYY */
function formatDdMmYyyy(ymd: string) {
  const [y, m, d] = ymd.split('-').map(Number);
  if (!y || !m || !d) return ymd;
  return `${String(d).padStart(2, '0')}-${String(m).padStart(2, '0')}-${y}`;
}

/** e.g. 10 Apr to 11 Apr */
function formatRangeSummary(fromYmd: string, toYmd: string) {
  const a = parseYmd(fromYmd);
  const b = parseYmd(toYmd);
  const o: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short' };
  return `${a.toLocaleDateString('en-IN', o)} to ${b.toLocaleDateString('en-IN', o)}`;
}

function statusSetFromUiKeys(keys: Set<string>): Set<string> {
  const s = new Set<string>();
  for (const def of HISTORY_UI_STATUS_DEF) {
    if (keys.has(def.key)) def.statuses.forEach((x) => s.add(x));
  }
  return s;
}

function uiKeysFromStatusSet(sf: Set<string>): Set<string> {
  const u = new Set<string>();
  for (const def of HISTORY_UI_STATUS_DEF) {
    if (def.statuses.some((st) => sf.has(st))) u.add(def.key);
  }
  return u;
}

function buildOrderPricing(order: OrdersFoodRow): OrderPricingBreakdown {
  const lineSum = (order.items ?? []).reduce(
    (acc, it) => acc + Number(it.total || (it.price || 0) * (it.quantity || 1)),
    0
  );
  const p = order.pricing;
  if (p) return p;
  const total = resolveMerchantCtm(order);
  return {
    subtotal: lineSum,
    packaging: 0,
    taxes: 0,
    discount: 0,
    total: Number.isFinite(total) ? total : lineSum,
  };
}

function OrderHistoryInner() {
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const [store, setStore] = useState<MerchantStore | null>(null);
  const [storeId, setStoreId] = useState<string | null>(null);
  const [orders, setOrders] = useState<OrdersFoodRow[]>(() => {
    if (typeof window === 'undefined') return [];
    const id = readPartnerSelectedStoreId();
    if (!id) return [];
    return getQueryClient().getQueryData<OrdersFoodRow[]>(merchantKeys.orderHistory(id)) ?? [];
  });
  const [loading, setLoading] = useState(() => {
    if (typeof window === 'undefined') return true;
    const id = readPartnerSelectedStoreId();
    if (!id) return true;
    const cached = getQueryClient().getQueryData<OrdersFoodRow[]>(merchantKeys.orderHistory(id));
    return !cached?.length;
  });
  const [dateFrom, setDateFrom] = useState(() => {
    const t = new Date();
    t.setDate(t.getDate() - 1);
    return toYmd(t);
  });
  const [dateTo, setDateTo] = useState(() => toYmd(new Date()));
  const [searchInput, setSearchInput] = useState('');
  const [searchApplied, setSearchApplied] = useState('');
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [statusFilter, setStatusFilter] = useState<Set<string>>(
    () => new Set(HISTORY_STATUS_OPTIONS)
  );

  const [datePopoverOpen, setDatePopoverOpen] = useState(false);
  const [filterModalOpen, setFilterModalOpen] = useState(false);
  const [downloadOpen, setDownloadOpen] = useState(false);

  const [filterCategory, setFilterCategory] = useState<FilterCategory>('status');
  const [draftUiStatus, setDraftUiStatus] = useState<Set<string>>(() =>
    uiKeysFromStatusSet(new Set(HISTORY_STATUS_OPTIONS))
  );
  const [draftOrderType, setDraftOrderType] = useState<'all' | 'gatimitra' | 'self'>('all');
  const [draftRatingCap, setDraftRatingCap] = useState<number | null>(null);

  const [calMonth, setCalMonth] = useState(() => {
    const d = parseYmd(dateFrom);
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const [rangeSel, setRangeSel] = useState<{ a: string | null; b: string | null }>({ a: null, b: null });

  const downloadBtnRef = useRef<HTMLButtonElement>(null);
  const [downloadMenuPos, setDownloadMenuPos] = useState<{ top: number; left: number } | null>(null);
  const [billSheetOpen, setBillSheetOpen] = useState(false);
  const [billSheetAllItemsOnly, setBillSheetAllItemsOnly] = useState(false);
  const [customerSheetOpen, setCustomerSheetOpen] = useState(false);
  const [timelineModalOpen, setTimelineModalOpen] = useState(false);
  const [printBillOpen, setPrintBillOpen] = useState(false);
  const [thermalPrinterWidthMm, setThermalPrinterWidthMm] = useState<58 | 80>(80);
  const [riderTrackingOpen, setRiderTrackingOpen] = useState(false);
  const [riderImageModalUrl, setRiderImageModalUrl] = useState<string | null>(null);
  const [ridersLogModalOrderId, setRidersLogModalOrderId] = useState<number | null>(null);
  const [ridersLogModalOrderLabel, setRidersLogModalOrderLabel] = useState<string | null>(null);
  const [ridersLogList, setRidersLogList] = useState<RiderLogEntry[]>([]);
  const [ridersLogLoading, setRidersLogLoading] = useState(false);

  useEffect(() => {
    let id = searchParams?.get('storeId') || searchParams?.get('store_id');
    if (!id && typeof window !== 'undefined') id = localStorage.getItem('selectedStoreId');
    const trimmed = (id || '').trim();
    setStoreId(isValidPartnerStoreId(trimmed) ? trimmed : null);
  }, [searchParams]);

  const { data: storeRecord } = usePartnerStoreRecord(storeId);

  useEffect(() => {
    if (storeRecord) setStore(storeRecord);
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

  const fetchOrders = useCallback(async () => {
    if (!storeId) return;
    const cached = queryClient.getQueryData<OrdersFoodRow[]>(merchantKeys.orderHistory(storeId));
    if (cached?.length) {
      setOrders(cached);
      setLoading(false);
    } else {
      setLoading(true);
    }
    try {
      const res = await fetch(`/api/food-orders?store_id=${encodeURIComponent(storeId)}&limit=500`);
      const data = await res.json();
      if (res.ok && Array.isArray(data.orders)) {
        setOrders(data.orders);
        queryClient.setQueryData(merchantKeys.orderHistory(storeId), data.orders);
      } else {
        setOrders([]);
        toast.error(data.error || 'Failed to load orders');
      }
    } catch {
      setOrders([]);
      toast.error('Failed to load orders');
    } finally {
      setLoading(false);
    }
  }, [storeId, queryClient]);

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  useEffect(() => {
    if (!downloadOpen) return;
    const update = () => {
      const el = downloadBtnRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const menuWidth = 208;
      const left = Math.max(8, Math.min(r.right - menuWidth, window.innerWidth - menuWidth - 8));
      setDownloadMenuPos({ top: r.bottom + 6, left });
    };
    update();
    window.addEventListener('scroll', update, true);
    window.addEventListener('resize', update);
    return () => {
      window.removeEventListener('scroll', update, true);
      window.removeEventListener('resize', update);
    };
  }, [downloadOpen]);

  const openFilterModal = () => {
    setDraftUiStatus(uiKeysFromStatusSet(statusFilter));
    setDraftOrderType('all');
    setDraftRatingCap(null);
    setFilterCategory('status');
    setFilterModalOpen(true);
  };

  const applyFilterModal = () => {
    const next = statusSetFromUiKeys(draftUiStatus);
    if (next.size === 0) setStatusFilter(new Set(HISTORY_STATUS_OPTIONS));
    else setStatusFilter(next);
    setFilterModalOpen(false);
  };

  const clearFilterModal = () => {
    setDraftUiStatus(new Set());
    setDraftOrderType('all');
    setDraftRatingCap(null);
  };

  const openDatePopover = () => {
    setRangeSel({ a: dateFrom, b: dateTo });
    setCalMonth(new Date(parseYmd(dateFrom).getFullYear(), parseYmd(dateFrom).getMonth(), 1));
    setDatePopoverOpen(true);
  };

  const applyDateRange = () => {
    if (rangeSel.a && rangeSel.b) {
      const t1 = parseYmd(rangeSel.a).getTime();
      const t2 = parseYmd(rangeSel.b).getTime();
      const [from, to] = t1 <= t2 ? [rangeSel.a, rangeSel.b] : [rangeSel.b, rangeSel.a];
      setDateFrom(from);
      setDateTo(to);
    }
    setDatePopoverOpen(false);
  };

  const filteredOrders = useMemo(() => {
    const start = startOfDay(new Date(`${dateFrom}T12:00:00`));
    const end = endOfDay(new Date(`${dateTo}T12:00:00`));
    let list = orders.filter((o) => {
      const t = new Date(o.created_at).getTime();
      if (t < start.getTime() || t > end.getTime()) return false;
      const st = normStatus(o.order_status);
      if (!HISTORY_TERMINAL_STATUSES.has(st)) return false;
      return statusFilter.has(st);
    });
    const q = searchApplied.trim().toLowerCase();
    if (q) {
      list = list.filter((o) => {
        const fid = (o.formatted_order_id || '').toLowerCase();
        const oid = String(o.order_id);
        return fid.includes(q) || oid.includes(q);
      });
    }
    return list.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }, [orders, dateFrom, dateTo, statusFilter, searchApplied]);

  const selected = useMemo(
    () => filteredOrders.find((o) => o.id === selectedId) || filteredOrders[0] || null,
    [filteredOrders, selectedId]
  );

  const selectedOrderPricing = useMemo(
    () => (selected ? buildOrderPricing(selected) : null),
    [selected]
  );

  const selectedOrderLineSum = useMemo(() => {
    if (!selected?.items?.length) return 0;
    return selected.items.reduce(
      (acc, it) => acc + Number(it.total || (it.price || 0) * (it.quantity || 1)),
      0
    );
  }, [selected]);

  // Direct KOT print — kitchen ticket only (no pricing), built from the live order.
  const handlePrintKot = useCallback(() => {
    if (!selected) return;
    printOrderKot(selected, {
      storeName: store?.store_name ?? selected.restaurant_name ?? null,
      storePhone:
        (Array.isArray(store?.store_phones) ? store?.store_phones?.[0] : null) ??
        selected.restaurant_phone ??
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
  }, [selected, store, thermalPrinterWidthMm]);

  // Direct print — no preview modal — with the store's full invoice address.
  const handlePrintBill = useCallback(() => {
    if (!selected) return;
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
      : { storeName: selected.restaurant_name ?? 'Store' };
    printOrderBill(
      selected,
      selectedOrderPricing ?? { subtotal: 0, packaging: 0, taxes: 0, discount: 0, total: 0 },
      storeInfo
    );
  }, [selected, selectedOrderPricing, store]);

  useEffect(() => {
    if (selected?.id) {
      prefetchMerchantOrderTimelineBundle(selected.id, storeId);
      prefetchRidersLog(selected.id);
    }
  }, [selected?.id, storeId]);

  useEffect(() => {
    setBillSheetOpen(false);
    setBillSheetAllItemsOnly(false);
    setCustomerSheetOpen(false);
    setTimelineModalOpen(false);
    setRiderTrackingOpen(false);
  }, [selected?.id]);

  useEffect(() => {
    if (!ridersLogModalOrderId) {
      setRidersLogList([]);
      setRidersLogLoading(false);
      return;
    }
    const cached = getCachedRidersLog(ridersLogModalOrderId);
    if (cached) {
      setRidersLogList(pastRidersFromLog(cached.riders));
      setRidersLogLoading(false);
      void fetchRidersLogCached(ridersLogModalOrderId, { force: true }).then((data) => {
        setRidersLogList(pastRidersFromLog(data.riders));
      });
      return;
    }
    let cancelled = false;
    setRidersLogLoading(true);
    void fetchRidersLogCached(ridersLogModalOrderId).then((data) => {
      if (cancelled) return;
      setRidersLogList(pastRidersFromLog(data.riders));
      setRidersLogLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [ridersLogModalOrderId]);

  useEffect(() => {
    if (filteredOrders.length === 0) {
      setSelectedId(null);
      return;
    }
    setSelectedId((prev) =>
      prev != null && filteredOrders.some((o) => o.id === prev) ? prev : filteredOrders[0].id
    );
  }, [filteredOrders]);

  const downloadOrderHistoryCsv = useCallback(
    (scope: 'visible' | 'all') => {
      const rows =
        scope === 'visible'
          ? filteredOrders
          : orders.filter((o) => {
              const start = startOfDay(new Date(`${dateFrom}T12:00:00`));
              const end = endOfDay(new Date(`${dateTo}T12:00:00`));
              const t = new Date(o.created_at).getTime();
              return t >= start.getTime() && t <= end.getTime();
            });
      const header = ['order_id', 'formatted_id', 'status', 'created_at', 'customer', 'total', 'summary'];
      const lines = [
        header.join(','),
        ...rows.map((o) => {
          const cells = [
            o.order_id,
            o.formatted_order_id || '',
            normStatus(o.order_status),
            o.created_at,
            (o.customer_name || '').replace(/,/g, ' '),
            String(o.food_items_total_value ?? ''),
            formatItemsSummary(o).replace(/,/g, ' '),
          ];
          return cells.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',');
        }),
      ];
      const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `order-history-${storeId || 'store'}-${dateFrom}-${dateTo}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      setDownloadOpen(false);
      toast.success('Download started');
    },
    [filteredOrders, orders, dateFrom, dateTo, storeId]
  );

  const downloadCustomerDetailsCsv = useCallback(() => {
    const rows = filteredOrders;
    const header = ['order_id', 'formatted_id', 'created_at', 'customer_name', 'customer_phone', 'customer_email'];
    const lines = [
      header.join(','),
      ...rows.map((o) => {
        const cells = [
          o.order_id,
          o.formatted_order_id || '',
          o.created_at,
          (o.customer_name || '').replace(/,/g, ' '),
          (o.customer_phone || '').replace(/,/g, ' '),
          (o.customer_email || '').replace(/,/g, ' '),
        ];
        return cells.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',');
      }),
    ];
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `customer-details-${storeId || 'store'}-${dateFrom}-${dateTo}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    setDownloadOpen(false);
    toast.success('Download started');
  }, [filteredOrders, dateFrom, dateTo, storeId]);

  const toggleDraftUiStatus = (key: string) => {
    setDraftUiStatus((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  if (loading && orders.length === 0) {
    return (
      <MXLayoutWhite restaurantName={store?.store_name} restaurantId={storeId || ''}>
        <PageSkeletonOrders />
      </MXLayoutWhite>
    );
  }

  return (
    <MXLayoutWhite restaurantName={store?.store_name} restaurantId={storeId || ''}>
      <PartnerPageHeader {...PARTNER_PAGE_HEADERS.orderHistory} />
      <div className="flex flex-col h-full min-h-0 bg-gray-50 overflow-hidden">
        <header className="mx-shell-header sticky top-0 z-30 !px-3 sm:!px-4 lg:!px-6">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between w-full min-w-0">
            <div className="flex items-center gap-2 min-w-0 w-full sm:w-auto sm:max-w-[280px]">
              <div className="md:hidden shrink-0 flex items-center">
                <MobileHamburgerButton />
              </div>
              <div className="flex gap-1.5 min-w-0 flex-1 sm:flex-none sm:w-[260px]">
              <input
                type="search"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && setSearchApplied(searchInput)}
                placeholder="Order ID"
                className="flex-1 min-w-0 border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs sm:text-sm bg-white"
              />
              <button
                type="button"
                onClick={() => setSearchApplied(searchInput)}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-medium hover:bg-blue-700 shrink-0"
                aria-label="Search orders"
              >
                <Search size={14} />
              </button>
              </div>
            </div>
            <div className="flex min-w-0 w-full sm:w-auto items-center justify-end gap-1.5 sm:gap-2 shrink-0 flex-wrap sm:flex-nowrap">
              <div className="min-w-0 overflow-x-auto hide-scrollbar flex items-center gap-1.5 sm:gap-2 py-0.5">
                <button
                  type="button"
                  onClick={openDatePopover}
                  className="inline-flex items-center gap-1 sm:gap-1.5 px-2 sm:px-2.5 py-1.5 rounded-lg border border-gray-200 bg-white text-[11px] sm:text-xs text-gray-800 whitespace-nowrap hover:bg-gray-50 shrink-0"
                >
                  <Calendar size={14} className="text-gray-500 shrink-0" />
                  <span className="font-medium tabular-nums">{formatDdMmYyyy(dateFrom)}</span>
                  <span className="text-gray-400">–</span>
                  <span className="font-medium tabular-nums">{formatDdMmYyyy(dateTo)}</span>
                  <Calendar size={14} className="text-gray-500 shrink-0" />
                </button>
                <span className="hidden sm:inline text-xs text-gray-500 whitespace-nowrap shrink-0">
                  {formatRangeSummary(dateFrom, dateTo)}
                </span>
              </div>
              <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
                <button
                  type="button"
                  onClick={openFilterModal}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-gray-200 bg-white text-xs font-medium text-gray-700 hover:bg-gray-50 whitespace-nowrap"
                >
                  <SlidersHorizontal size={14} className="text-gray-600" />
                  Filter
                </button>
                <button
                  ref={downloadBtnRef}
                  type="button"
                  onClick={() => {
                    if (downloadOpen) {
                      setDownloadMenuPos(null);
                      setDownloadOpen(false);
                      return;
                    }
                    const el = downloadBtnRef.current;
                    if (el) {
                      const r = el.getBoundingClientRect();
                      const menuWidth = 208;
                      const left = Math.max(8, Math.min(r.right - menuWidth, window.innerWidth - menuWidth - 8));
                      setDownloadMenuPos({ top: r.bottom + 6, left });
                    }
                    setDownloadOpen(true);
                  }}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-gray-200 bg-white text-xs font-medium text-gray-700 hover:bg-gray-50 whitespace-nowrap"
                >
                  Download data
                  <ChevronDown size={14} className={`text-gray-600 transition-transform ${downloadOpen ? 'rotate-180' : ''}`} />
                </button>
              </div>
            </div>
          </div>
        </header>

        {downloadOpen && downloadMenuPos && typeof document !== 'undefined' && createPortal(
          <>
            <button
              type="button"
              className="fixed inset-0 z-[190] cursor-default bg-transparent"
              aria-label="Close menu"
              onClick={() => setDownloadOpen(false)}
            />
            <div
              className="fixed z-[200] w-[min(100vw-1rem,13rem)] rounded-lg border border-gray-200 bg-white shadow-lg py-0.5"
              style={{ top: downloadMenuPos.top, left: downloadMenuPos.left }}
              role="menu"
            >
              <button
                type="button"
                className="w-full text-left px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 border-b border-gray-100"
                onClick={() => downloadOrderHistoryCsv('visible')}
              >
                Order history
              </button>
              <button
                type="button"
                className="w-full text-left px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50"
                onClick={() => downloadCustomerDetailsCsv()}
              >
                Customer details
              </button>
            </div>
          </>,
          document.body
        )}

        {datePopoverOpen && typeof document !== 'undefined' && createPortal(
          <DateRangePopover
            calMonth={calMonth}
            setCalMonth={setCalMonth}
            rangeSel={rangeSel}
            setRangeSel={setRangeSel}
            onClose={() => setDatePopoverOpen(false)}
            onApply={applyDateRange}
          />,
          document.body
        )}

        {filterModalOpen && typeof document !== 'undefined' && createPortal(
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50" role="presentation">
            <button type="button" className="absolute inset-0 cursor-default" aria-label="Close" onClick={() => setFilterModalOpen(false)} />
            <div
              className="relative bg-white rounded-xl shadow-2xl border border-gray-200 w-full max-w-lg max-h-[85vh] flex flex-col overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 shrink-0">
                <h2 className="text-base font-bold text-gray-900">Filters</h2>
                <button type="button" onClick={() => setFilterModalOpen(false)} className="p-1.5 rounded-lg hover:bg-gray-100" aria-label="Close">
                  <X size={18} className="text-gray-600" />
                </button>
              </div>
              <div className="flex flex-1 min-h-0 overflow-hidden">
                <div className="w-[38%] sm:w-[40%] border-r border-gray-200 bg-gray-100 flex flex-col shrink-0">
                  {(
                    [
                      { id: 'status' as const, label: 'Order status' },
                      { id: 'type' as const, label: 'Order type' },
                      { id: 'ratings' as const, label: 'Ratings' },
                    ]
                  ).map((cat) => (
                    <button
                      key={cat.id}
                      type="button"
                      onClick={() => setFilterCategory(cat.id)}
                      className={`text-left px-3 py-3 text-sm font-medium border-r-[3px] transition-colors ${
                        filterCategory === cat.id
                          ? 'bg-white text-gray-900 border-orange-500'
                          : 'bg-transparent text-gray-600 border-transparent hover:bg-gray-50'
                      }`}
                    >
                      {cat.label}
                    </button>
                  ))}
                </div>
                <div className="flex-1 overflow-y-auto min-h-0 p-4 bg-white">
                  {filterCategory === 'status' && (
                    <div className="space-y-3">
                      {HISTORY_UI_STATUS_DEF.map((def) => (
                        <label key={def.key} className="flex items-center gap-3 text-sm text-gray-800 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={draftUiStatus.has(def.key)}
                            onChange={() => toggleDraftUiStatus(def.key)}
                            className="rounded border-gray-300 w-4 h-4 accent-orange-600"
                          />
                          {def.label}
                        </label>
                      ))}
                    </div>
                  )}
                  {filterCategory === 'type' && (
                    <div className="space-y-3">
                      <label className="flex items-center gap-3 text-sm text-gray-800 cursor-pointer">
                        <input
                          type="radio"
                          name="orderType"
                          checked={draftOrderType === 'all'}
                          onChange={() => setDraftOrderType('all')}
                          className="border-gray-300 w-4 h-4 accent-orange-600"
                        />
                        All order types
                      </label>
                      {(
                        [
                          { v: 'gatimitra' as const, label: 'GatiMitra Delivery' },
                          { v: 'self' as const, label: 'Self Delivery' },
                        ]
                      ).map((opt) => (
                        <label key={opt.v} className="flex items-center gap-3 text-sm text-gray-800 cursor-pointer">
                          <input
                            type="radio"
                            name="orderType"
                            checked={draftOrderType === opt.v}
                            onChange={() => setDraftOrderType(opt.v)}
                            className="border-gray-300 w-4 h-4 accent-orange-600"
                          />
                          {opt.label}
                        </label>
                      ))}
                      <p className="text-xs text-gray-500 mt-4">
                        Order type filtering will apply when delivery channel is available on orders.
                      </p>
                    </div>
                  )}
                  {filterCategory === 'ratings' && (
                    <div className="space-y-3">
                      {([5, 4, 3, 2, 1] as const).map((n) => (
                        <label key={n} className="flex items-center gap-3 text-sm text-gray-800 cursor-pointer">
                          <input
                            type="radio"
                            name="ratingCap"
                            checked={draftRatingCap === n}
                            onChange={() => setDraftRatingCap(n)}
                            className="border-gray-300 w-4 h-4 accent-orange-600"
                          />
                          {n === 1 ? '1' : `${n} or less`}
                        </label>
                      ))}
                      <label className="flex items-center gap-3 text-sm text-gray-800 cursor-pointer">
                        <input
                          type="radio"
                          name="ratingCap"
                          checked={draftRatingCap === null}
                          onChange={() => setDraftRatingCap(null)}
                          className="border-gray-300 w-4 h-4 accent-orange-600"
                        />
                        Any rating
                      </label>
                      <p className="text-xs text-gray-500 mt-4">Customer rating filters apply when rating data is linked to orders.</p>
                    </div>
                  )}
                </div>
              </div>
              <div className="flex items-center justify-end gap-3 px-4 py-3 border-t border-gray-200 bg-white shrink-0">
                <button type="button" onClick={clearFilterModal} className="text-sm font-medium text-gray-500 hover:text-gray-800">
                  Clear all
                </button>
                <button
                  type="button"
                  onClick={applyFilterModal}
                  className="px-5 py-2 rounded-lg bg-gray-700 text-white text-sm font-semibold hover:bg-gray-800"
                >
                  Apply
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}

        <div className="flex flex-1 min-h-0 flex-col lg:flex-row overflow-hidden bg-white">
          <aside className="w-full lg:w-[380px] shrink-0 border-b lg:border-b-0 lg:border-r border-gray-200 bg-white flex flex-col min-h-0 max-h-[45vh] lg:max-h-none">
            <div className="flex-1 overflow-y-auto min-h-0 p-2 space-y-2 hide-scrollbar">
              {loading && (
                <div className="flex justify-center py-8 text-gray-500">
                  <Loader2 className="animate-spin" size={24} />
                </div>
              )}
              {!loading && filteredOrders.length === 0 && (
                <p className="text-sm text-gray-500 text-center py-8">No orders in this range.</p>
              )}
              {filteredOrders.map((o) => {
                const { time, date } = formatListTime(o.created_at);
                const active = selected?.id === o.id;
                const isCancelled = normStatus(o.order_status) === 'CANCELLED';
                const rejection = isCancelled
                  ? splitRejectionMessage(
                      o.rejected_reason,
                      o.cancelled_by_label,
                      o.cancelled_by_type
                    )
                  : null;
                return (
                  <button
                    key={o.id}
                    type="button"
                    onClick={() => setSelectedId(o.id)}
                    className={`w-full text-left rounded-xl border p-3 transition-colors ${
                      active ? 'border-blue-300 bg-blue-50/80' : 'border-gray-200 bg-white hover:bg-gray-50'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md ${historyBadgeClass(o.order_status || '')}`}>
                        {historyStatusLabel(o.order_status || '')}
                      </span>
                      <span className="text-[10px] text-gray-500 text-right shrink-0">
                        {time} | {date}
                      </span>
                    </div>
                    <p className="text-xs font-semibold text-gray-900">ID: {o.formatted_order_id || o.order_id}</p>
                    {o.customer_name && <p className="text-xs text-gray-600 mt-0.5">By {o.customer_name}</p>}
                    <p className="text-xs text-gray-500 mt-1 line-clamp-2">{formatItemsSummary(o)}</p>
                    <p className="text-sm font-bold text-gray-900 text-right mt-2">
                      ₹{resolveMerchantCtm(o).toFixed(2)}
                    </p>
                    {rejection ? (
                      <p className="text-[11px] text-red-700 mt-2 leading-snug line-clamp-2">
                        {rejection.detail
                          ? `${rejection.prefix} - ${rejection.detail}`
                          : rejection.prefix}
                      </p>
                    ) : null}
                  </button>
                );
              })}
            </div>
          </aside>

          <main className="flex-1 min-w-0 flex flex-col min-h-0 overflow-hidden bg-gray-50">
            {!selected || !selectedOrderPricing ? (
              <div className="flex-1 flex flex-col items-center justify-center text-gray-500 text-sm gap-2 p-4">
                <span className="text-4xl opacity-40" aria-hidden>
                  🍽
                </span>
                {filteredOrders.length === 0
                  ? 'No completed orders in this date range'
                  : 'Select an order to view details'}
              </div>
            ) : (
              <div className="flex flex-1 min-h-0 flex-col overflow-hidden">
              <OrderPanel
                className="w-full h-full min-h-0 flex-1 max-w-none max-h-none rounded-none border-0 shadow-none"
                panelMode="history"
                order={selected}
                pricing={selectedOrderPricing}
                formattedOrderId={
                  <FormattedOrderId
                    formattedOrderId={selected.formatted_order_id}
                    fallbackOrderId={selected.order_id}
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
                onOpenTimeline={() => setTimelineModalOpen(true)}
                onPrintBill={handlePrintBill}
                onPrintKot={handlePrintKot}
                onViewPastRiders={() => {
                  prefetchRidersLog(selected.id);
                  const hit = getCachedRidersLog(selected.id);
                  if (hit) setRidersLogList(pastRidersFromLog(hit.riders));
                  setRidersLogModalOrderId(selected.id);
                  setRidersLogModalOrderLabel(
                    selected.formatted_order_id || `#${selected.order_id}`
                  );
                }}
                onTrackRider={() => setRiderTrackingOpen(true)}
                onOpenRiderPhoto={(url) => setRiderImageModalUrl(url)}
                otpCode={resolveOrderOtps(selected).pickup ?? undefined}
                otpType="PICKUP"
              />
              </div>
            )}
          </main>
        </div>
      </div>

      <OrderBillSidesheet
        open={billSheetOpen && !!selected}
        onClose={() => {
          setBillSheetOpen(false);
          setBillSheetAllItemsOnly(false);
        }}
        order={selected}
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
        open={customerSheetOpen && !!selected}
        onClose={() => setCustomerSheetOpen(false)}
        order={selected}
      />
      <GatiMitraOrderPrintBill
        open={printBillOpen && !!selected}
        onClose={() => setPrintBillOpen(false)}
        order={selected}
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
            : null
        }
      />
      <OrderTimelineModal
        open={timelineModalOpen && !!selected}
        onClose={() => setTimelineModalOpen(false)}
        order={selected}
        storeId={storeId}
        layout="horizontal"
      />
      <OrderRiderTrackingModal
        open={riderTrackingOpen}
        preload={orderHasAssignedRider(selected)}
        onClose={() => setRiderTrackingOpen(false)}
        order={selected}
        merchantStoreLat={store?.latitude ?? null}
        merchantStoreLon={store?.longitude ?? null}
        merchantStoreName={store?.store_name ?? null}
      />
      <RiderPhotoModal
        open={!!riderImageModalUrl}
        imageUrl={riderImageModalUrl}
        riderName={selected?.rider_details?.name ?? selected?.rider_name ?? null}
        onClose={() => setRiderImageModalUrl(null)}
      />
      <OrderRidersHistorySidesheet
        open={ridersLogModalOrderId != null}
        orderLabel={ridersLogModalOrderLabel}
        riders={ridersLogList}
        loading={ridersLogLoading}
        onClose={() => {
          setRidersLogModalOrderId(null);
          setRidersLogModalOrderLabel(null);
        }}
      />

    </MXLayoutWhite>
  );
}

function DateRangePopover({
  calMonth,
  setCalMonth,
  rangeSel,
  setRangeSel,
  onClose,
  onApply,
}: {
  calMonth: Date;
  setCalMonth: (d: Date) => void;
  rangeSel: { a: string | null; b: string | null };
  setRangeSel: React.Dispatch<React.SetStateAction<{ a: string | null; b: string | null }>>;
  onClose: () => void;
  onApply: () => void;
}) {
  const y = calMonth.getFullYear();
  const m = calMonth.getMonth();
  const firstDow = new Date(y, m, 1).getDay();
  const daysInM = new Date(y, m + 1, 0).getDate();
  const prevMonthLast = new Date(y, m, 0).getDate();

  const inRange = (ymd: string) => {
    if (!rangeSel.a || !rangeSel.b) return false;
    const t = parseYmd(ymd).getTime();
    const t1 = parseYmd(rangeSel.a).getTime();
    const t2 = parseYmd(rangeSel.b).getTime();
    const lo = Math.min(t1, t2);
    const hi = Math.max(t1, t2);
    return t >= lo && t <= hi;
  };

  const isEndpoint = (ymd: string) => rangeSel.a === ymd || rangeSel.b === ymd;

  const pickYmd = (ymd: string) => {
    setRangeSel((prev) => {
      if (!prev.a || (prev.a && prev.b)) {
        return { a: ymd, b: null };
      }
      return { ...prev, b: ymd };
    });
  };

  const labelA = rangeSel.a
    ? parseYmd(rangeSel.a).toLocaleDateString('en-IN', { month: 'short', day: 'numeric', year: 'numeric' })
    : 'Start';
  const labelB = rangeSel.b
    ? parseYmd(rangeSel.b).toLocaleDateString('en-IN', { month: 'short', day: 'numeric', year: 'numeric' })
    : 'End';

  const cells: { ymd: string; label: string; muted: boolean }[] = [];
  for (let i = 0; i < firstDow; i++) {
    const day = prevMonthLast - firstDow + i + 1;
    cells.push({ ymd: toYmd(new Date(y, m - 1, day)), label: String(day), muted: true });
  }
  for (let d = 1; d <= daysInM; d++) {
    cells.push({ ymd: toYmd(new Date(y, m, d)), label: String(d), muted: false });
  }
  let pad = 0;
  while (cells.length % 7 !== 0) {
    pad++;
    cells.push({ ymd: toYmd(new Date(y, m + 1, pad)), label: String(pad), muted: true });
  }

  return (
    <div className="fixed inset-0 z-[90] flex items-start justify-center pt-20 sm:pt-24 px-3 bg-black/40" role="presentation">
      <button type="button" className="absolute inset-0 cursor-default" aria-label="Close" onClick={onClose} />
      <div
        className="relative bg-white rounded-xl shadow-2xl border border-gray-200 w-full max-w-sm overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex border-b border-gray-200">
          <div className="flex-1 px-3 py-2.5 text-center text-xs font-medium text-gray-900 border-r border-gray-100">
            {labelA}
          </div>
          <div className="flex-1 px-3 py-2.5 text-center text-xs font-medium text-gray-900">{labelB}</div>
        </div>
        <div className="flex items-center justify-between px-2 py-2 border-b border-gray-100">
          <button
            type="button"
            onClick={() => setCalMonth(new Date(y, m - 1, 1))}
            className="p-2 rounded-lg hover:bg-gray-100"
            aria-label="Previous month"
          >
            <ChevronLeft size={18} />
          </button>
          <div className="flex items-center gap-1 text-sm font-semibold text-gray-900">
            {calMonth.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })}
          </div>
          <button
            type="button"
            onClick={() => setCalMonth(new Date(y, m + 1, 1))}
            className="p-2 rounded-lg hover:bg-gray-100"
            aria-label="Next month"
          >
            <ChevronRight size={18} />
          </button>
        </div>
        <div className="p-2">
          <div className="grid grid-cols-7 gap-0.5 text-center text-[10px] text-gray-500 mb-1">
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
              <div key={d} className="py-1">
                {d}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-0.5">
            {cells.map((c) => {
              const range = inRange(c.ymd);
              const end = isEndpoint(c.ymd);
              return (
                <button
                  key={`${c.ymd}-${c.label}-${c.muted}`}
                  type="button"
                  onClick={() => pickYmd(c.ymd)}
                  className={`aspect-square max-h-9 text-xs rounded-full transition-colors ${
                    c.muted ? 'text-gray-300 hover:bg-gray-50' : ''
                  } ${
                    end
                      ? 'bg-blue-600 text-white font-semibold'
                      : range
                        ? 'bg-blue-100 text-blue-900'
                        : !c.muted
                          ? 'text-gray-800 hover:bg-gray-100'
                          : ''
                  }`}
                >
                  {c.label}
                </button>
              );
            })}
          </div>
        </div>
        <div className="flex justify-end gap-2 px-3 py-2.5 border-t border-gray-200 bg-gray-50">
          <button type="button" onClick={onClose} className="px-3 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-200 rounded-lg">
            Cancel
          </button>
          <button
            type="button"
            onClick={onApply}
            disabled={!rangeSel.a || !rangeSel.b}
            className="px-4 py-1.5 text-sm font-semibold bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-40"
          >
            Apply
          </button>
        </div>
      </div>
    </div>
  );
}

export default function OrderHistoryPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center bg-gray-50 text-gray-500">Loading...</div>}>
      <OrderHistoryInner />
    </Suspense>
  );
}
