'use client';

import React, { Suspense, useCallback, useEffect, useMemo, useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useSearchParams } from 'next/navigation';
import {
  Calendar,
  ChevronDown,
  HelpCircle,
  Loader2,
  Printer,
  Search,
  SlidersHorizontal,
  Check,
  X,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { MXLayoutWhite } from '@/components/MXLayoutWhite';
import { PartnerPageHeader } from '@/context/PartnerShellHeaderContext';
import { PageSkeletonOrders } from '@/components/PageSkeleton';
import { fetchStoreById } from '@/lib/database';
import { MerchantStore } from '@/lib/merchantStore';
import { DEMO_RESTAURANT_ID } from '@/lib/constants';
import { toast } from 'sonner';
import type { OrdersFoodRow } from '@/hooks/useFoodOrders';
import { MobileHamburgerButton } from '@/components/MobileHamburgerButton';

const FILTER_STATUS_OPTIONS = [
  'CREATED',
  'ACCEPTED',
  'PREPARING',
  'READY_FOR_PICKUP',
  'OUT_FOR_DELIVERY',
  'DELIVERED',
  'RTO',
  'CANCELLED',
] as const;

/** UI filter keys (reference modal) → DB statuses */
const UI_STATUS_DEF: { key: string; label: string; statuses: string[] }[] = [
  { key: 'preparing', label: 'Preparing', statuses: ['CREATED', 'ACCEPTED', 'PREPARING'] },
  { key: 'ready', label: 'Ready', statuses: ['READY_FOR_PICKUP'] },
  { key: 'picked_up', label: 'Picked up', statuses: ['OUT_FOR_DELIVERY'] },
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
  if (Array.isArray(raw) && raw.length > 0) {
    const it = raw[0] as Record<string, unknown>;
    const name = String(it.name ?? it.item_name ?? 'Item').trim();
    const qty = Number(it.quantity ?? 1) || 1;
    const more = raw.length > 1 ? ` +${raw.length - 1} more` : '';
    return `${qty} × ${name}${more}`;
  }
  const n = order.food_items_count ?? 0;
  return n ? `${n} item${n === 1 ? '' : 's'}` : '—';
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
  if (s === 'DELIVERED') return 'bg-teal-600 text-white';
  if (s === 'RTO') return 'bg-amber-600 text-white';
  if (s === 'CANCELLED') return 'bg-gray-600 text-white';
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

function normalizeItems(order: OrdersFoodRow): Array<{ name: string; quantity: number; price: number; total: number }> {
  const raw = order.items;
  if (!Array.isArray(raw) || raw.length === 0) return [];
  return raw.map((it: Record<string, unknown>, idx: number) => {
    const qty = Number(it.quantity) || 1;
    const unit = Number(it.price ?? it.unit_price ?? 0);
    const total = Number(it.total ?? it.total_price ?? unit * qty);
    const name = String(it.name ?? it.item_name ?? `Item ${idx + 1}`).trim();
    return { name, quantity: qty, price: unit, total };
  });
}

function statusSetFromUiKeys(keys: Set<string>): Set<string> {
  const s = new Set<string>();
  for (const def of UI_STATUS_DEF) {
    if (keys.has(def.key)) def.statuses.forEach((x) => s.add(x));
  }
  return s;
}

function uiKeysFromStatusSet(sf: Set<string>): Set<string> {
  const u = new Set<string>();
  for (const def of UI_STATUS_DEF) {
    if (def.statuses.some((st) => sf.has(st))) u.add(def.key);
  }
  return u;
}

function OrderHistoryInner() {
  const searchParams = useSearchParams();
  const [store, setStore] = useState<MerchantStore | null>(null);
  const [storeId, setStoreId] = useState<string | null>(null);
  const [orders, setOrders] = useState<OrdersFoodRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [dateFrom, setDateFrom] = useState(() => {
    const t = new Date();
    t.setDate(t.getDate() - 1);
    return toYmd(t);
  });
  const [dateTo, setDateTo] = useState(() => toYmd(new Date()));
  const [searchInput, setSearchInput] = useState('');
  const [searchApplied, setSearchApplied] = useState('');
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [statusFilter, setStatusFilter] = useState<Set<string>>(() => new Set(FILTER_STATUS_OPTIONS));

  const [datePopoverOpen, setDatePopoverOpen] = useState(false);
  const [filterModalOpen, setFilterModalOpen] = useState(false);
  const [downloadOpen, setDownloadOpen] = useState(false);

  const [filterCategory, setFilterCategory] = useState<FilterCategory>('status');
  const [draftUiStatus, setDraftUiStatus] = useState<Set<string>>(() => uiKeysFromStatusSet(new Set(FILTER_STATUS_OPTIONS)));
  const [draftOrderType, setDraftOrderType] = useState<'all' | 'gatimitra' | 'self'>('all');
  const [draftRatingCap, setDraftRatingCap] = useState<number | null>(null);

  const [calMonth, setCalMonth] = useState(() => {
    const d = parseYmd(dateFrom);
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const [rangeSel, setRangeSel] = useState<{ a: string | null; b: string | null }>({ a: null, b: null });

  const downloadBtnRef = useRef<HTMLButtonElement>(null);
  const [downloadMenuPos, setDownloadMenuPos] = useState<{ top: number; left: number } | null>(null);

  useEffect(() => {
    let id = searchParams?.get('storeId') || searchParams?.get('store_id');
    if (!id && typeof window !== 'undefined') id = localStorage.getItem('selectedStoreId');
    if (!id) id = DEMO_RESTAURANT_ID;
    setStoreId(id);
  }, [searchParams]);

  useEffect(() => {
    if (!storeId) return;
    (async () => {
      const s = await fetchStoreById(storeId);
      if (s) setStore(s as MerchantStore);
    })();
  }, [storeId]);

  const fetchOrders = useCallback(async () => {
    if (!storeId) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/food-orders?store_id=${encodeURIComponent(storeId)}&limit=500`);
      const data = await res.json();
      if (res.ok && Array.isArray(data.orders)) setOrders(data.orders);
      else {
        setOrders([]);
        toast.error(data.error || 'Failed to load orders');
      }
    } catch {
      setOrders([]);
      toast.error('Failed to load orders');
    } finally {
      setLoading(false);
    }
  }, [storeId]);

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
    if (next.size === 0) setStatusFilter(new Set(FILTER_STATUS_OPTIONS));
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

  const lineItems = selected ? normalizeItems(selected) : [];
  const subtotalItems = lineItems.reduce((acc, it) => acc + it.total, 0);
  const orderTotal = Number(selected?.food_items_total_value ?? subtotalItems);

  return (
    <MXLayoutWhite restaurantName={store?.store_name} restaurantId={storeId || ''}>
      <PartnerPageHeader title="Order History" subtitle={store?.store_name || undefined} />
      <div className="flex flex-col h-full min-h-0 bg-gray-50">
        <header className="mx-shell-header sticky top-0 z-30 !px-3 sm:!px-4 lg:!px-6">
          <div className="flex items-center gap-2 sm:gap-3 w-full min-w-0">
            <div className="md:hidden shrink-0 flex items-center">
              <MobileHamburgerButton />
            </div>
            <div className="flex-1 min-w-0 flex items-center justify-end gap-2">
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
                      {UI_STATUS_DEF.map((def) => (
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

        <div className="flex flex-1 min-h-0 flex-col lg:flex-row overflow-hidden">
          <aside className="w-full lg:w-[380px] shrink-0 border-b lg:border-b-0 lg:border-r border-gray-200 bg-white flex flex-col min-h-0 max-h-[45vh] lg:max-h-none">
            <div className="mx-shell-header !py-2 flex-col !items-stretch gap-2 sm:flex-row sm:!items-center">
              <div className="flex gap-2 w-full min-w-0">
                <input
                  type="search"
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && setSearchApplied(searchInput)}
                  placeholder="Enter full order ID to search"
                  className="flex-1 min-w-0 border border-gray-200 rounded-lg px-3 py-2 text-sm"
                />
                <button
                  type="button"
                  onClick={() => setSearchApplied(searchInput)}
                  className="inline-flex items-center gap-1 px-3 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 shrink-0"
                >
                  <Search size={16} />
                  Search
                </button>
              </div>
            </div>
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
                      ₹{Number(o.food_items_total_value || 0).toFixed(2)}
                    </p>
                  </button>
                );
              })}
            </div>
          </aside>

          <main className="flex-1 min-w-0 overflow-y-auto min-h-0 bg-gray-50 p-3 sm:p-5">
            {!selected ? (
              <div className="h-full flex flex-col items-center justify-center text-gray-500 text-sm gap-2">
                <span className="text-4xl opacity-40" aria-hidden>
                  🍽
                </span>
                No order selected
              </div>
            ) : (
              <div className="max-w-3xl mx-auto bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden print:shadow-none">
                <div className="border-b border-gray-200 px-4 py-3 flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-base font-bold text-gray-900">
                        ID: {selected.formatted_order_id || selected.order_id}
                      </span>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md ${historyBadgeClass(selected.order_status || '')}`}>
                        {historyStatusLabel(selected.order_status || '')}
                      </span>
                    </div>
                    <p className="text-xs text-gray-500 mt-1">
                      {selected.customer_name ? `Order by ${selected.customer_name}` : 'Order details'}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-500 whitespace-nowrap">
                      {new Date(selected.created_at).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}
                    </span>
                    <button
                      type="button"
                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-blue-500 text-blue-600 text-xs font-semibold hover:bg-blue-50"
                      onClick={() => toast.message('Support', { description: 'Use Help in your profile or contact your account manager.' })}
                    >
                      <HelpCircle size={14} />
                      Help
                    </button>
                  </div>
                </div>

                <div className="px-4 py-4 border-b border-gray-100">
                  <p className="text-xs font-semibold text-gray-500 mb-3">Order timeline</p>
                  <HistoryTimeline order={selected} />
                  <p className="text-xs text-gray-500 mt-3">
                    Placed{' '}
                    {(() => {
                      const mins = Math.floor((Date.now() - new Date(selected.created_at).getTime()) / 60000);
                      if (mins < 1) return 'just now';
                      if (mins < 60) return `${mins} minutes ago`;
                      const h = Math.floor(mins / 60);
                      return `${h} hour${h === 1 ? '' : 's'} ago`;
                    })()}
                  </p>
                </div>

                <div id="order-history-print" className="p-4">
                  <div className="flex justify-end gap-2 mb-4 print:hidden">
                    <button
                      type="button"
                      onClick={() => window.print()}
                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-blue-500 text-blue-600 text-xs font-semibold hover:bg-blue-50"
                    >
                      <Printer size={14} />
                      KOT
                    </button>
                    <button
                      type="button"
                      onClick={() => window.print()}
                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-blue-500 text-blue-600 text-xs font-semibold hover:bg-blue-50"
                    >
                      <Printer size={14} />
                      ORDER
                    </button>
                  </div>
                  <ul className="divide-y divide-gray-100">
                    {lineItems.length === 0 ? (
                      <li className="py-2 text-sm text-gray-500">No line items</li>
                    ) : (
                      lineItems.map((it, i) => (
                        <li key={i} className="py-2 flex justify-between text-sm gap-2">
                          <span className="text-gray-800">
                            {it.quantity} × {it.name}
                          </span>
                          <span className="font-medium text-gray-900 shrink-0">₹{it.total.toFixed(2)}</span>
                        </li>
                      ))
                    )}
                  </ul>
                  <div className="mt-4 pt-3 border-t border-gray-200 space-y-1.5 text-sm">
                    <div className="flex justify-between text-gray-600">
                      <span>Subtotal</span>
                      <span>₹{subtotalItems.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-gray-600">
                      <span>Restaurant packaging</span>
                      <span>₹0.00</span>
                    </div>
                    <div className="flex justify-between text-gray-600">
                      <span>Taxes</span>
                      <span>₹0.00</span>
                    </div>
                    <div className="flex justify-between text-gray-600">
                      <span>Discount</span>
                      <span>₹0.00</span>
                    </div>
                    <div className="flex justify-between font-bold text-gray-900 pt-2">
                      <span>Total</span>
                      <span>₹{orderTotal.toFixed(2)}</span>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </main>
        </div>
      </div>
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

function HistoryTimeline({ order }: { order: OrdersFoodRow }) {
  const steps = [
    { key: 'placed', label: 'Placed', done: !!order.created_at },
    { key: 'accepted', label: 'Accepted', done: !!order.accepted_at, showView: !!order.accepted_at },
    {
      key: 'pickup',
      label: 'Estimated pickup',
      done: !!(order.prepared_at || order.dispatched_at),
    },
    { key: 'delivery', label: 'Estimated delivery', done: !!order.delivered_at },
  ];

  return (
    <div className="flex items-start justify-between gap-1 overflow-x-auto hide-scrollbar pb-1">
      {steps.map((step, i) => {
        const prevDone = i === 0 ? true : steps[i - 1].done;
        const lineGreen = i > 0 && prevDone;
        return (
          <React.Fragment key={step.key}>
            {i > 0 && (
              <div
                className={`shrink-0 flex-1 h-0.5 mt-3 min-w-[12px] max-w-[48px] ${lineGreen ? 'bg-green-500' : 'bg-gray-200'}`}
              />
            )}
            <div className="flex flex-col items-center shrink-0 w-[72px]">
              <div
                className={`w-7 h-7 rounded-full flex items-center justify-center border-2 ${
                  step.done ? 'bg-green-500 border-green-500 text-white' : 'border-green-400 bg-white text-green-600'
                }`}
              >
                {step.done ? <Check size={14} strokeWidth={3} /> : <span className="text-[10px] font-bold">{i + 1}</span>}
              </div>
              <span className="text-[9px] font-medium text-gray-600 mt-1 text-center leading-tight">{step.label}</span>
              {step.showView && <span className="text-[9px] text-blue-600 mt-0.5 print:hidden">View</span>}
            </div>
          </React.Fragment>
        );
      })}
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
