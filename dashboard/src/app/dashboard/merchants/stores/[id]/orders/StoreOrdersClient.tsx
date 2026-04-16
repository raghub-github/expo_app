'use client';

import React, { useEffect, useState, useCallback, useRef, useMemo, Suspense } from 'react';
import { createPortal } from 'react-dom';
import { useSearchParams, useRouter } from 'next/navigation';
import { useToast } from '@/context/ToastContext';
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
  Calendar,
  ChevronLeft,
  Sparkles,
  LayoutGrid,
  List,
  Phone,
  MapPin,
  SlidersHorizontal,
  Search,
  ChevronDown,
  Loader2,
  Power,
  Check,
  User,
  Bike,
  MoreVertical,
  Wallet,
} from 'lucide-react';
import { useStoreFoodOrders } from '@/hooks/useStoreFoodOrders';
import { WalletAdjustmentModal } from '@/components/merchants/WalletAdjustmentModal';
import type { OrdersFoodRow, FoodOrderStats } from '@/lib/types/food-orders';
import { PageSkeletonOrders } from './PageSkeletonOrders';
import { supabase } from '@/lib/supabase/client';
import { useStore } from '@/hooks/useStore';
import {
  MERCHANT_PORTAL_CLOSE_REASONS,
  merchantPortalCloseReasonWithSuffix,
} from '@/lib/merchantPortalCloseReasons';
import { FoodOrdersEmptyState, type FoodOrdersEmptyVariant } from '@/components/orders/FoodOrdersEmptyState';

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

const STATUS_FILTERS = [
  { id: 'CREATED', label: 'Created', color: 'bg-red-100 text-red-800 border-red-200' },
  { id: 'ACCEPTED', label: 'Accepted', color: 'bg-blue-100 text-blue-800 border-blue-200' },
  { id: 'PREPARING', label: 'Preparing', color: 'bg-amber-100 text-amber-800 border-amber-200' },
  { id: 'READY_FOR_PICKUP', label: 'Ready', color: 'bg-emerald-100 text-emerald-800 border-emerald-200' },
  { id: 'OUT_FOR_DELIVERY', label: 'Dispatch', color: 'bg-purple-100 text-purple-800 border-purple-200' },
  { id: 'DELIVERED', label: 'Delivered', color: 'bg-green-100 text-green-800 border-green-200' },
  { id: 'RTO', label: 'RTO', color: 'bg-orange-100 text-orange-800 border-orange-200' },
  { id: 'CANCELLED', label: 'Cancelled', color: 'bg-gray-100 text-gray-700 border-gray-200' },
];

// Tabs shown in the Orders page header (matches the portal UI).
const ORDERS_TABS = [
  { id: 'CREATED', label: 'New orders' },
  { id: 'PREPARING', label: 'Preparing' },
  { id: 'READY_FOR_PICKUP', label: 'Ready' },
  { id: 'OUT_FOR_DELIVERY', label: 'Picked up' },
  { id: 'RTO', label: 'RTO' },
] as const;

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

/** UI filter keys (reference modal) → DB statuses (partnersite parity). */
const UI_STATUS_DEF: { key: string; label: string; statuses: string[] }[] = [
  { key: 'preparing', label: 'Preparing', statuses: ['CREATED', 'ACCEPTED', 'PREPARING'] },
  { key: 'ready', label: 'Ready', statuses: ['READY_FOR_PICKUP'] },
  { key: 'picked_up', label: 'Picked up', statuses: ['OUT_FOR_DELIVERY'] },
  { key: 'delivered', label: 'Delivered', statuses: ['DELIVERED'] },
  { key: 'timed_out', label: 'Timed out', statuses: ['RTO'] },
  { key: 'rejected', label: 'Rejected', statuses: ['CANCELLED'] },
];

type FilterCategory = 'status' | 'type' | 'ratings';

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

function storeOrdersTitle(storeType: string | null | undefined) {
  const t = (storeType || '').trim().toUpperCase();
  if (!t) return 'Food Orders';
  if (t.includes('GROCERY')) return 'Grocery Orders';
  if (t.includes('PHARM')) return 'Pharmacy Orders';
  if (t.includes('MEAT')) return 'Meat Orders';
  if (t.includes('FLOWER')) return 'Flower Orders';
  if (t.includes('STORE') || t.includes('RETAIL')) return 'Store Orders';
  return 'Food Orders';
}

function toYmd(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
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

function parseYmd(ymd: string): Date {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

function formatDdMmYyyy(ymd: string) {
  const [y, m, d] = ymd.split('-').map(Number);
  if (!y || !m || !d) return ymd;
  return `${String(d).padStart(2, '0')}-${String(m).padStart(2, '0')}-${y}`;
}

function formatRangeSummary(fromYmd: string, toYmd: string) {
  const a = parseYmd(fromYmd);
  const b = parseYmd(toYmd);
  const o: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short' };
  return `${a.toLocaleDateString('en-IN', o)} to ${b.toLocaleDateString('en-IN', o)}`;
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
      if (!prev.a || (prev.a && prev.b)) return { a: ymd, b: null };
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
  for (let d = 1; d <= daysInM; d++) cells.push({ ymd: toYmd(new Date(y, m, d)), label: String(d), muted: false });
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
          <button type="button" onClick={() => setCalMonth(new Date(y, m - 1, 1))} className="p-2 rounded-lg hover:bg-gray-100" aria-label="Previous month">
            <ChevronLeft size={18} />
          </button>
          <div className="flex items-center gap-1 text-sm font-semibold text-gray-900">
            {calMonth.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })}
          </div>
          <button type="button" onClick={() => setCalMonth(new Date(y, m + 1, 1))} className="p-2 rounded-lg hover:bg-gray-100" aria-label="Next month">
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
                    end ? 'bg-blue-600 text-white font-semibold' : range ? 'bg-blue-100 text-blue-900' : !c.muted ? 'text-gray-800 hover:bg-gray-100' : ''
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

function useNewOrderSound(enabled: boolean) {
  const play = useCallback(() => {
    if (!enabled || typeof window === 'undefined') return;
    try {
      const audio = new Audio('/notification.wav');
      audio.volume = 0.8;
      audio.play().catch(() => {});
    } catch {}
  }, [enabled]);

  return play;
}

const ORDERS_STORAGE_KEY = 'food-orders-ui';

function prepDeadlineMs(order: OrdersFoodRow): number {
  const base = order.accepted_at || order.created_at;
  const mins = Number(order.preparation_time_minutes) || 30;
  return new Date(base).getTime() + mins * 60 * 1000;
}

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

function OrdersPageContent({ storeId }: { storeId: string }) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const storeInternalId = parseInt(storeId, 10);
  const [orders, setOrders] = useState<OrdersFoodRow[]>([]);
  const [stats, setStats] = useState<FoodOrderStats | null>(null);
  const [filter, setFilter] = useState<string>('CREATED');
  const [selectedOrder, setSelectedOrder] = useState<OrdersFoodRow | null>(null);
  // Partnersite-style: show full-width list by default, open details panel only after selecting an order.
  const [rightPanelOpen, setRightPanelOpen] = useState(false);
  const [rejectModal, setRejectModal] = useState<OrdersFoodRow | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [dispatchModal, setDispatchModal] = useState<OrdersFoodRow | null>(null);
  const [rtoModalOrder, setRtoModalOrder] = useState<OrdersFoodRow | null>(null);
  const [ridersLogModalOrderId, setRidersLogModalOrderId] = useState<number | null>(null);
  const [ridersLogModalOrderLabel, setRidersLogModalOrderLabel] = useState<string | null>(null);
  const [ridersLogList, setRidersLogList] = useState<Array<{ rider_id: number; rider_name: string | null; rider_mobile: string | null; selfie_url: string | null; assignment_status: string; assigned_at: string | null; accepted_at: string | null; rejected_at: string | null; reached_merchant_at: string | null; picked_up_at: string | null; delivered_at: string | null; cancelled_at: string | null }>>([]);
  const [ridersLogLoading, setRidersLogLoading] = useState(false);
  const [riderImageModalUrl, setRiderImageModalUrl] = useState<string | null>(null);
  const [headerRtoMenuOpen, setHeaderRtoMenuOpen] = useState(false);
  const headerRtoMenuRef = useRef<HTMLDivElement>(null);
  const [walletAdjustmentOrder, setWalletAdjustmentOrder] = useState<OrdersFoodRow | null>(null);
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
    fetch(`/api/merchant/stores/${storeId}/orders/${ridersLogModalOrderId}/riders-log`)
      .then((res) => res.ok ? res.json() : { riders: [] })
      .then((data) => { setRidersLogList(data.riders || []); })
      .catch(() => setRidersLogList([]))
      .finally(() => setRidersLogLoading(false));
  }, [ridersLogModalOrderId, storeId]);

  const [otpInput, setOtpInput] = useState('');
  const [otpVerified, setOtpVerified] = useState<Set<number>>(new Set());
  const [otpCache, setOtpCache] = useState<Record<number, { otp_code: string; otp_type: string }>>({});
  const [loading, setLoading] = useState(true);
  const [notifyEnabled, setNotifyEnabled] = useState(() => {
    if (typeof window === 'undefined') return true;
    try {
      const s = localStorage.getItem(ORDERS_STORAGE_KEY);
      return s ? JSON.parse(s).notifyEnabled !== false : true;
    } catch { return true; }
  });
  const [actionLoading, setActionLoading] = useState<number | null>(null);
  const [isStoreOpen, setIsStoreOpen] = useState<boolean | null>(null);
  const [showStoreCloseModal, setShowStoreCloseModal] = useState(false);
  const [closeClosureType, setCloseClosureType] = useState<'temporary' | 'today' | 'manual_hold' | null>(null);
  const [closeClosureDate, setCloseClosureDate] = useState('');
  const [closeClosureTime, setCloseClosureTime] = useState('12:00');
  const [closeReason, setCloseReason] = useState('');
  const [closeReasonOther, setCloseReasonOther] = useState('');
  const [closeConfirmLoading, setCloseConfirmLoading] = useState(false);
  const [openingTimeForClose, setOpeningTimeForClose] = useState<string | null>(null);
  const [showTurnOnModal, setShowTurnOnModal] = useState(false);
  const [turnOnLoading, setTurnOnLoading] = useState(false);
  const [viewMode, setViewMode] = useState<'card' | 'list'>(() => {
    if (typeof window === 'undefined') return 'card';
    // Only allow list view on large screens (lg+)
    const isLargeScreen = typeof window !== 'undefined' && window.innerWidth >= 1024;
    if (!isLargeScreen) return 'card';
    try {
      const s = localStorage.getItem(ORDERS_STORAGE_KEY);
      const v = s ? JSON.parse(s).viewMode : null;
      return v === 'list' || v === 'card' ? v : 'card';
    } catch { return 'card'; }
  });
  const [orderSort, setOrderSort] = useState<'remaining' | 'newest' | 'oldest'>('remaining');
  const [orderIdSearch, setOrderIdSearch] = useState('');
  const [ordersSection, setOrdersSection] = useState<'live' | 'history'>(() => {
    const sec = searchParams?.get('section');
    return sec === 'history' ? 'history' : 'live';
  });
  const [historyDateFrom, setHistoryDateFrom] = useState(() => {
    const t = new Date();
    t.setDate(t.getDate() - 1);
    return toYmd(t);
  });
  const [historyDateTo, setHistoryDateTo] = useState(() => toYmd(new Date()));
  const [historyStatuses, setHistoryStatuses] = useState<Set<string>>(
    () => new Set(['CREATED', 'ACCEPTED', 'PREPARING', 'READY_FOR_PICKUP', 'OUT_FOR_DELIVERY', 'DELIVERED', 'RTO', 'CANCELLED'])
  );
  const [datePopoverOpen, setDatePopoverOpen] = useState(false);
  const [calMonth, setCalMonth] = useState(() => {
    const d = parseYmd(historyDateFrom);
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const [rangeSel, setRangeSel] = useState<{ a: string | null; b: string | null }>({ a: null, b: null });

  const [filterModalOpen, setFilterModalOpen] = useState(false);
  const [filterCategory, setFilterCategory] = useState<FilterCategory>('status');
  const [draftUiStatus, setDraftUiStatus] = useState<Set<string>>(() => uiKeysFromStatusSet(new Set(FILTER_STATUS_OPTIONS)));
  const [draftOrderType, setDraftOrderType] = useState<'all' | 'gatimitra' | 'self'>('all');
  const [draftRatingCap, setDraftRatingCap] = useState<number | null>(null);

  const downloadBtnRef = useRef<HTMLButtonElement>(null);
  const [downloadMenuPos, setDownloadMenuPos] = useState<{ top: number; left: number } | null>(null);
  const [downloadOpen, setDownloadOpen] = useState(false);

  const hasNotifiedNew = useRef<Set<number>>(new Set());

  const { store: storeMeta } = useStore(storeId);
  const isDelisted =
    ((storeMeta as { approval_status?: string } | null)?.approval_status || '').toUpperCase() === 'DELISTED';

  const updateUrlParams = useCallback((updates: { filter?: string; orderId?: string | null; section?: 'live' | 'history' }) => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(searchParams?.toString() || '');
    if (updates.filter !== undefined) {
      if (updates.filter === 'all') params.delete('filter');
      else params.set('filter', updates.filter);
    }
    if (updates.orderId !== undefined) {
      if (!updates.orderId) params.delete('orderId');
      else params.set('orderId', updates.orderId);
    }
    if (updates.section !== undefined) {
      if (updates.section === 'live') params.delete('section');
      else params.set('section', updates.section);
    }
    const q = params.toString();
    const path = `${window.location.pathname}${q ? `?${q}` : ''}`;
    router.replace(path, { scroll: false });
  }, [searchParams, router]);

  // Force card view on mobile/tablet, only allow list on lg+
  useEffect(() => {
    const handleResize = () => {
      if (typeof window !== 'undefined' && window.innerWidth < 1024 && viewMode === 'list') {
        setViewMode('card');
        try {
          const s = localStorage.getItem(ORDERS_STORAGE_KEY);
          const stored = s ? JSON.parse(s) : {};
          stored.viewMode = 'card';
          localStorage.setItem(ORDERS_STORAGE_KEY, JSON.stringify(stored));
        } catch {}
      }
    };
    if (typeof window !== 'undefined') {
      window.addEventListener('resize', handleResize);
      handleResize(); // Check on mount
      return () => window.removeEventListener('resize', handleResize);
    }
  }, [viewMode]);

  const persistLocal = useCallback((key: 'viewMode' | 'notifyEnabled', value: unknown) => {
    if (typeof window === 'undefined') return;
    try {
      const s = localStorage.getItem(ORDERS_STORAGE_KEY);
      const prev = s ? JSON.parse(s) : {};
      const next = { ...prev, [key]: value };
      localStorage.setItem(ORDERS_STORAGE_KEY, JSON.stringify(next));
    } catch {}
  }, []);

  const openOrder = useCallback((order: OrdersFoodRow) => {
    setSelectedOrder(order);
    setRightPanelOpen(true);
    updateUrlParams({ orderId: String(order.order_id || order.id) });
  }, [updateUrlParams]);

  const closeOrderPanel = useCallback(() => {
    setRightPanelOpen(false);
    setSelectedOrder(null);
    updateUrlParams({ orderId: null });
  }, [updateUrlParams]);

  // Ensure the "sidebar" never shows without a selected order.
  useEffect(() => {
    if (!selectedOrder && rightPanelOpen) setRightPanelOpen(false);
  }, [rightPanelOpen, selectedOrder]);

  const handleFilterChange = useCallback((f: string) => {
    setFilter(f);
    setRightPanelOpen(false);
    setSelectedOrder(null);
    updateUrlParams({ filter: f, orderId: null, section: 'live' });
  }, [updateUrlParams]);

  const handleSectionChange = useCallback((sec: 'live' | 'history') => {
    setOrdersSection(sec);
    setRightPanelOpen(false);
    setSelectedOrder(null);
    setOrderIdSearch('');
    updateUrlParams({ orderId: null, section: sec });
  }, [updateUrlParams]);

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

  const openDatePopover = () => {
    setRangeSel({ a: historyDateFrom, b: historyDateTo });
    setCalMonth(new Date(parseYmd(historyDateFrom).getFullYear(), parseYmd(historyDateFrom).getMonth(), 1));
    setDatePopoverOpen(true);
  };

  const applyDateRange = () => {
    if (rangeSel.a && rangeSel.b) {
      const t1 = parseYmd(rangeSel.a).getTime();
      const t2 = parseYmd(rangeSel.b).getTime();
      const [from, to] = t1 <= t2 ? [rangeSel.a, rangeSel.b] : [rangeSel.b, rangeSel.a];
      setHistoryDateFrom(from);
      setHistoryDateTo(to);
    }
    setDatePopoverOpen(false);
  };

  const openFilterModal = () => {
    setDraftUiStatus(uiKeysFromStatusSet(historyStatuses));
    setDraftOrderType('all');
    setDraftRatingCap(null);
    setFilterCategory('status');
    setFilterModalOpen(true);
  };

  const applyFilterModal = () => {
    const next = statusSetFromUiKeys(draftUiStatus);
    setHistoryStatuses(next.size === 0 ? new Set(FILTER_STATUS_OPTIONS) : next);
    setFilterModalOpen(false);
  };

  const clearFilterModal = () => {
    setDraftUiStatus(new Set());
    setDraftOrderType('all');
    setDraftRatingCap(null);
  };

  const toggleDraftUiStatus = (key: string) => {
    setDraftUiStatus((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };
  const { toast } = useToast();
  const { subscribe } = useStoreFoodOrders(storeId, storeInternalId);
  const playNewOrderSound = useNewOrderSound(notifyEnabled);

  useEffect(() => {
    const f = searchParams?.get('filter');
    if (f && ['all', 'active', 'CREATED', 'ACCEPTED', 'PREPARING', 'READY_FOR_PICKUP', 'OUT_FOR_DELIVERY', 'DELIVERED', 'RTO', 'CANCELLED'].includes(f)) {
      setFilter(f === 'NEW' ? 'CREATED' : f);
    }
  }, [searchParams]);

  const orderIdFromUrl = searchParams?.get('orderId') || null;

  useEffect(() => {
    if (loading || orders.length === 0) return;
    if (!orderIdFromUrl) return;
    const id = parseInt(orderIdFromUrl, 10);
    if (isNaN(id)) return;
    const order = orders.find((o) => o.order_id === id || o.id === id);
    if (order) {
      setSelectedOrder(order);
      setRightPanelOpen(true);
    }
  }, [loading, orderIdFromUrl, orders]);

  const fetchStoreStatus = useCallback(async () => {
    if (!storeId) return;
    try {
      const res = await fetch(`/api/merchant/stores/${storeId}/store-operations`);
      const data = await res.json();
      if (data.operational_status !== undefined) {
        if (isDelisted) {
          setIsStoreOpen(false);
        } else {
          setIsStoreOpen(data.operational_status === 'OPEN');
        }
      }
    } catch {}
  }, [storeId, isDelisted]);

  useEffect(() => {
    fetchStoreStatus();
  }, [fetchStoreStatus]);

  // Realtime: auto-update store status when it changes in DB (merchant_stores, merchant_store_availability, merchant_store_operating_hours)
  useEffect(() => {
    if (!storeInternalId || !storeId) return;
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

  const fetchOrders = useCallback(async (signal?: AbortSignal) => {
    if (!storeId) return;
    try {
      const res = await fetch(`/api/merchant/stores/${storeId}/orders?limit=200`, {
        credentials: 'include',
        signal: signal ?? null,
      });
      let data: { orders?: OrdersFoodRow[]; error?: string };
      try {
        data = await res.json();
      } catch {
        setOrders([]);
        toast('Error: Invalid response from server');
        return;
      }
      if (res.ok) {
        if (Array.isArray(data.orders)) {
          setOrders(data.orders as OrdersFoodRow[]);
        } else {
          setOrders([]);
        }
      } else {
        toast('Error: ' + (data?.error || 'Failed to load orders'));
        setOrders([]);
      }
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return;
      const isNetworkError =
        err instanceof TypeError &&
        (err.message === 'Failed to fetch' || (err as Error).message?.toLowerCase?.().includes('network'));
      if (process.env.NODE_ENV === 'development') console.error('[FoodOrders] Fetch error:', err);
      toast(isNetworkError ? 'Network error. Check connection and try again.' : 'Error: Failed to load orders');
      setOrders([]);
    } finally {
      setLoading(false);
    }
  }, [storeId]);

  const fetchStats = useCallback(async () => {
    if (!storeId) return;
    try {
      const res = await fetch(`/api/merchant/stores/${storeId}/orders/stats`, { credentials: 'include' });
      const data = await res.json().catch(() => null);
      if (res.ok && data) setStats(data);
    } catch {
      // Ignore stats fetch errors (e.g. network) to avoid console noise
    }
  }, [storeId]);

  useEffect(() => {
    const ac = new AbortController();
    fetchOrders(ac.signal);
    return () => ac.abort();
  }, [fetchOrders]);

  useEffect(() => {
    fetchStats();
    const t = setInterval(fetchStats, 15000);
    return () => clearInterval(t);
  }, [fetchStats]);

  useEffect(() => {
    if (!storeInternalId || !storeId) return;
    const unsub = subscribe(
      (row) => {
        setOrders((prev) => {
          const exists = prev.some((o) => o.id === row.id);
          if (exists) return prev.map((o) => (o.id === row.id ? row : o));
          if (row.order_status === 'CREATED' || row.order_status === 'NEW' || !row.order_status) {
            if (notifyEnabled) {
              const displayId = row.formatted_order_id || `#${row.order_id}`;
              toast(`New Order ${displayId}`);
              if (!hasNotifiedNew.current.has(row.id)) {
                hasNotifiedNew.current.add(row.id);
                playNewOrderSound();
              }
            }
          }
          return [row, ...prev];
        });
      },
      (row) => {
        setOrders((prev) =>
          prev.map((o) => (o.id === row.id ? row : o))
        );
        if (selectedOrder?.id === row.id) setSelectedOrder(row);
      }
    );
    return unsub;
  }, [storeInternalId, storeId, subscribe, notifyEnabled, playNewOrderSound, selectedOrder?.id]);

  const fetchOtp = useCallback(
    async (orderId: number) => {
      if (!storeId) return;
      try {
        const res = await fetch(`/api/merchant/stores/${storeId}/orders/${orderId}/otp`);
        const data = await res.json();
        if (res.ok && data.otp_code) {
          setOtpCache((prev) => ({ ...prev, [orderId]: { otp_code: data.otp_code, otp_type: data.otp_type || 'PICKUP' } }));
        }
      } catch {}
    },
    [storeId]
  );

  // Auto-fetch OTP for all orders when they're loaded (always visible)
  useEffect(() => {
    const orderIds = orders.map(o => o.id).filter(Boolean) as number[];
    orderIds.forEach((orderId) => {
      if (!otpCache[orderId]) {
        fetchOtp(orderId);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orders.length, fetchOtp]);

  // Auto-fetch OTP when order is selected (for header display)
  useEffect(() => {
    if (selectedOrder?.id && !otpCache[selectedOrder.id]) {
      fetchOtp(selectedOrder.id);
    }
  }, [selectedOrder?.id, fetchOtp]);

  const validateOtp = useCallback(
    async (orderId: number) => {
      if (!storeId || !otpInput.trim()) return;
      try {
        const res = await fetch(`/api/merchant/stores/${storeId}/orders/${orderId}/validate-otp`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ otp: otpInput.trim() }),
        });
        const data = await res.json();
        if (data.valid) {
          setOtpVerified((prev) => new Set(prev).add(orderId));
          toast('OTP verified');
        } else {
          toast('Error: ' + (data.error || 'Invalid OTP'));
        }
      } catch {
        toast('Error: Validation failed');
      }
    },
    [storeId, otpInput]
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
    if (isDelisted) {
      toast('This store is delisted. Relist it before opening.');
      setShowTurnOnModal(false);
      return;
    }
    setTurnOnLoading(true);
    try {
      const res = await fetch(`/api/merchant/stores/${storeId}/store-operations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'manual_open' }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setIsStoreOpen(true);
        setShowTurnOnModal(false);
        toast('Store is now OPEN. Orders are being accepted!');
      } else {
        toast('Error: ' + (data.error || 'Failed to open store'));
      }
    } catch {
      toast('Error: Failed to open store');
    } finally {
      setTurnOnLoading(false);
    }
  }, [storeId, isDelisted, toast]);

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
    fetch(`/api/merchant/stores/${storeId}/store-operations`)
      .then((res) => res.json())
      .then((data) => {
        setOpeningTimeForClose(data.today_slots?.[0]?.start ?? null);
      })
      .catch(() => {});
  }, [showStoreCloseModal, storeId]);

  const formatTimeHMS = useCallback((t: string | null) => {
    if (!t) return '--';
    const parts = t.split(':');
    if (parts.length === 2) return `${t}:00`;
    if (parts.length === 1) return `${t.padStart(2, '0')}:00:00`;
    return t;
  }, []);

  const confirmStoreClose = useCallback(async () => {
    if (!storeId || !closeClosureType) return;
    setCloseConfirmLoading(true);
    const now = new Date();
    let durationMinutes: number | undefined;
    if (closeClosureType === 'temporary') {
      const closedUntil = new Date(`${closeClosureDate}T${closeClosureTime}:00`);
      durationMinutes = Math.max(1, Math.round((closedUntil.getTime() - now.getTime()) / (1000 * 60)));
    } else if (closeClosureType === 'today' && openingTimeForClose) {
      const [h, m] = openingTimeForClose.split(':').map(Number);
      const tomorrowOpen = new Date(now);
      tomorrowOpen.setDate(tomorrowOpen.getDate() + 1);
      tomorrowOpen.setHours(h, m, 0, 0);
      durationMinutes = Math.max(1, Math.round((tomorrowOpen.getTime() - now.getTime()) / (1000 * 60)));
    }
    const baseReason = closeReason === 'Other' ? (closeReasonOther?.trim() || 'Other') : closeReason;
    const reasonText = merchantPortalCloseReasonWithSuffix(baseReason);
    const body: { action: string; closure_type: string; duration_minutes?: number; close_reason?: string } = {
      action: 'manual_close',
      closure_type: closeClosureType,
      close_reason: reasonText,
    };
    if (durationMinutes != null) body.duration_minutes = durationMinutes;
    try {
      const res = await fetch(`/api/merchant/stores/${storeId}/store-operations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setIsStoreOpen(false);
        setShowStoreCloseModal(false);
        setCloseClosureType(null);
        setCloseReason('');
        setCloseReasonOther('');
        if (closeClosureType === 'manual_hold') toast('Store closed. It will only open when you turn it ON.');
        else if (closeClosureType === 'temporary') {
          const until = new Date(`${closeClosureDate}T${closeClosureTime}:00`);
          toast(`Store closed until ${until.toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}. You can also turn it ON manually anytime.`);
        } else toast(`Store closed for today. Reopens tomorrow at ${openingTimeForClose || 'scheduled opening time'}`);
      } else {
        toast('Error: ' + (data.error || 'Failed to close store'));
      }
    } catch {
      toast('Error: Failed to close store');
    } finally {
      setCloseConfirmLoading(false);
    }
  }, [storeId, closeClosureType, closeClosureDate, closeClosureTime, closeReason, closeReasonOther, openingTimeForClose]);

  const handleStoreCloseModalConfirm = useCallback(() => {
    if (!closeClosureType) {
      toast('Error: Please select closure type');
      return;
    }
    if (closeClosureType === 'temporary') {
      if (!closeClosureDate || !closeClosureTime) {
        toast('Error: Please select date and time for reopening');
        return;
      }
      const closedUntil = new Date(`${closeClosureDate}T${closeClosureTime}:00`);
      if (closedUntil.getTime() <= Date.now()) {
        toast('Error: Reopening date and time must be in the future');
        return;
      }
    }
    if (!closeReason?.trim()) {
      toast('Error: Please select a reason for closing');
      return;
    }
    if (closeReason === 'Other' && !closeReasonOther?.trim()) {
      toast('Error: Please enter the reason in "Other"');
      return;
    }
    void confirmStoreClose();
  }, [closeClosureType, closeClosureDate, closeClosureTime, closeReason, closeReasonOther, confirmStoreClose]);

  const updateStatus = useCallback(
    async (order: OrdersFoodRow, newStatus: string, extra?: { rejected_reason?: string }) => {
      setActionLoading(order.id);
      const payload = { store_id: storeId, status: newStatus, ...extra };

      const tryUpdate = async (): Promise<{ ok: boolean; data: unknown }> => {
        const res = await fetch(`/api/merchant/stores/${storeId}/orders/${order.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        const data = await res.json();
        return { ok: res.ok, data };
      };

      try {
        let result = await tryUpdate();
        if (!result.ok) {
          await new Promise((r) => setTimeout(r, 1500));
          result = await tryUpdate();
        }
        if (!result.ok) {
          const msg =
            (result.data as { error?: string } | null)?.error ?? 'Failed to update order';
          toast('Error: ' + msg);          return;
        }
        const data = result.data as { order?: OrdersFoodRow };
        if (data?.order) {
          setOrders((prev) => prev.map((o) => (o.id === order.id ? (data.order as OrdersFoodRow) : o)));
          if (selectedOrder?.id === order.id) {
            setSelectedOrder(data.order);
            if (newStatus === 'DELIVERED') {
              closeOrderPanel();
            }
          }
          if (newStatus === 'OUT_FOR_DELIVERY') setDispatchModal(null);
        }
        toast(`Order status updated to ${newStatus}`);
      } catch {
        toast('Error: Failed to update order');
      } finally {
        setActionLoading(null);
      }
    },
    [storeId, selectedOrder, closeOrderPanel]
  );

  const norm = (s: string | null | undefined) => (s === 'NEW' ? 'CREATED' : s || 'CREATED');
  const filteredOrders =
    filter === 'all'
      ? orders
      : filter === 'active'
        ? orders.filter((o) =>
            ['CREATED', 'NEW', 'ACCEPTED', 'PREPARING', 'READY_FOR_PICKUP', 'OUT_FOR_DELIVERY', 'RTO'].includes(o.order_status || 'CREATED')
          )
        : orders.filter((o) => norm(o.order_status) === filter);

  const displayOrders = useMemo(() => {
    let rows = [...filteredOrders];
    const q = orderIdSearch.trim();
    if (q) {
      rows = rows.filter((o) => {
        const idStr = String(o.formatted_order_id ?? o.order_id ?? o.id ?? '').replace(/\s+/g, '');
        const digits = idStr.replace(/\D/g, '');
        if (!digits) return false;
        // Match last 4 digits (partner UI behavior)
        if (q.length <= 4) return digits.endsWith(q);
        return digits.includes(q);
      });
    }
    if (orderSort === 'newest') {
      rows.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    } else if (orderSort === 'oldest') {
      rows.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
    } else {
      rows.sort((a, b) => prepDeadlineMs(a) - prepDeadlineMs(b));
    }
    return rows;
  }, [filteredOrders, orderIdSearch, orderSort]);

  const historyOrders = useMemo(() => {
    const q = orderIdSearch.trim().replace(/\D/g, '');
    const from = startOfDay(parseYmd(historyDateFrom));
    const to = endOfDay(parseYmd(historyDateTo));
    let rows = [...orders].filter((o) => {
      const st = norm(o.order_status);
      if (!historyStatuses.has(st)) return false;
      const created = new Date(o.created_at);
      if (created < from || created > to) return false;
      return true;
    });
    rows.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    if (q) {
      rows = rows.filter((o) => {
        const idStr = String(o.formatted_order_id ?? o.order_id ?? o.id ?? '').replace(/\s+/g, '');
        const digits = idStr.replace(/\D/g, '');
        return digits.includes(q);
      });
    }
    return rows;
  }, [historyDateFrom, historyDateTo, historyStatuses, orderIdSearch, orders]);

  const downloadOrderHistoryCsv = useCallback(
    (scope: 'visible' | 'all') => {
      const rows = scope === 'visible' ? historyOrders : orders;
      const header = ['order_id', 'formatted_id', 'status', 'created_at', 'customer', 'total'];
      const lines = [
        header.join(','),
        ...rows.map((o) => {
          const cells = [
            o.order_id,
            o.formatted_order_id || '',
            norm(o.order_status),
            o.created_at,
            (o.customer_name || '').replace(/,/g, ' '),
            String((o as any).food_items_total_value ?? ''),
          ];
          return cells.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',');
        }),
      ];
      const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `order-history-${storeId || 'store'}-${historyDateFrom}-${historyDateTo}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      setDownloadOpen(false);
    },
    [historyOrders, historyDateFrom, historyDateTo, orders, storeId]
  );

  const downloadCustomerDetailsCsv = useCallback(() => {
    const rows = historyOrders;
    const header = ['order_id', 'formatted_id', 'created_at', 'customer_name', 'customer_phone', 'customer_email'];
    const lines = [
      header.join(','),
      ...rows.map((o) => {
        const cells = [
          o.order_id,
          o.formatted_order_id || '',
          o.created_at,
          (o.customer_name || '').replace(/,/g, ' '),
          ((o as any).customer_phone || '').replace(/,/g, ' '),
          ((o as any).customer_email || '').replace(/,/g, ' '),
        ];
        return cells.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',');
      }),
    ];
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `customer-details-${storeId || 'store'}-${historyDateFrom}-${historyDateTo}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    setDownloadOpen(false);
  }, [historyOrders, historyDateFrom, historyDateTo, storeId]);

  const counts: Record<string, number> = {};
  orders.forEach((o) => {
    const s = norm(o.order_status);
    counts[s] = (counts[s] || 0) + 1;
  });

  const emptyVariant: FoodOrdersEmptyVariant = useMemo(() => {
    if (orderIdSearch.trim() && displayOrders.length === 0) return 'search';
    if (filter === 'CREATED') return 'NEW_ORDERS';
    if (filter === 'PREPARING') return 'PREPARING';
    if (filter === 'READY_FOR_PICKUP') return 'READY_FOR_PICKUP';
    if (filter === 'OUT_FOR_DELIVERY') return 'OUT_FOR_DELIVERY';
    if (filter === 'RTO') return 'RTO';
    return 'NEW_ORDERS';
  }, [displayOrders.length, filter, orderIdSearch]);

  if (loading && orders.length === 0) {
    return <><PageSkeletonOrders /></>;
  }

  const mobileStatsExtra = stats ? (
    <div className="grid grid-cols-1 gap-2.5 text-sm">
      <div className="flex justify-between items-center">
        <span className="text-gray-500">Avg Prep</span>
        <span className="font-semibold text-gray-900">{stats.avgPreparationTimeMinutes}m</span>
      </div>
      <div className="flex justify-between items-center">
        <span className="text-gray-500">Revenue</span>
        <span className="font-semibold text-gray-900">₹{stats.totalRevenueToday.toFixed(0)}</span>
      </div>
      <div className="flex justify-between items-center">
        <span className="text-gray-500">Completion</span>
        <span className="font-semibold text-gray-900">{stats.completionRatePercent}%</span>
      </div>
    </div>
  ) : null;

  return (
    <>
      <div className="flex h-full min-h-0 bg-gray-50 relative flex-col">
        <header id="food-orders-header" className="sticky top-0 z-20 bg-white border-b border-gray-200 shrink-0">
          <div className="w-full min-w-0 px-3 sm:px-4 py-2 sm:py-3">
            {/* Mobile: 2 rows (Row 1 = Today+Active, Row 2 = Filter + status + sound). Desktop: single row */}
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2 md:gap-0 min-w-0">
              {/* Row 1 (mobile) / Left (desktop): On mobile Today+Active on right. On desktop title + all stats on left */}
              <div className="flex items-center justify-end md:justify-start md:flex-1 md:items-center md:gap-3 min-w-0 overflow-x-auto hide-scrollbar shrink-0">
                {/* Hamburger menu on left (mobile) */}
                <div className="md:hidden mr-2">
                  {null}
                </div>
                {/* Title - always visible on desktop */}
                <div className="hidden md:flex items-center gap-2 shrink-0">
                  <Sparkles className="w-5 h-5 text-orange-500 shrink-0" />
                  <h1 className="text-lg font-bold text-gray-900 whitespace-nowrap">
                    {ordersSection === 'history' ? 'Order History' : storeOrdersTitle((storeMeta as any)?.store_type)}
                  </h1>
                </div>
                {ordersSection === 'live' && stats && (
                  <div className="flex items-center gap-2 shrink-0">
                    <StatBadge label="Today" value={String(stats.ordersToday)} />
                    <StatBadge label="Active" value={String(stats.activeOrders)} accent />
                  </div>
                )}
                {ordersSection === 'live' && stats && (
                  <div className="hidden md:flex items-center gap-2 sm:gap-3 shrink-0">
                    <StatBadge label="Avg Prep" value={`${stats.avgPreparationTimeMinutes}m`} />
                    <StatBadge label="Revenue" value={`₹${stats.totalRevenueToday.toFixed(0)}`} />
                    <StatBadge label="Completion" value={`${stats.completionRatePercent}%`} />
                  </div>
                )}
              </div>
              {/* Row 2 (mobile) / Right (desktop): Filter, Store, grid/list, sound - shrink so never overlaps sidebar */}
              <div className="flex items-center justify-end gap-1.5 sm:gap-2 shrink-0 min-w-0 lg:pl-4">
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
                onClick={() => { setNotifyEnabled((v) => { const n = !v; persistLocal('notifyEnabled', n); return n; }); }}
                className={`flex items-center gap-1 sm:gap-1.5 px-2 sm:px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap ${
                  notifyEnabled ? 'bg-orange-100 text-orange-700' : 'bg-gray-100 text-gray-600'
                }`}
                title={notifyEnabled ? 'Disable new order sound' : 'Enable new order sound'}
              >
                {notifyEnabled ? <Bell size={14} /> : <BellOff size={14} />}
                <span className="hidden sm:inline">{notifyEnabled ? 'Sound On' : 'Sound Off'}</span>
              </button>
              </div>
            </div>
          </div>
          {/* Status pills + section + search (partnersite-style band) */}
          <div className="border-t border-gray-200 bg-white px-3 sm:px-4 py-3">
            <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
              {ordersSection === 'live' ? (
                <div className="flex flex-wrap items-center gap-2 min-w-0">
                  {ORDERS_TABS.map(({ id, label }) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => handleFilterChange(id)}
                      className={`px-3.5 py-2 rounded-full text-sm font-semibold border transition-colors shrink-0 ${
                        filter === id ? 'bg-orange-500 text-white border-orange-500 shadow-sm' : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                      }`}
                    >
                      {label} ({counts[id] || 0})
                    </button>
                  ))}
                </div>
              ) : (
                <div className="flex flex-wrap items-center gap-2 min-w-0">
                  <div className="min-w-0 overflow-x-auto hide-scrollbar flex items-center gap-1.5 sm:gap-2 py-0.5">
                    <button
                      type="button"
                      onClick={openDatePopover}
                      className="inline-flex items-center gap-1 sm:gap-1.5 px-2 sm:px-2.5 py-1.5 rounded-lg border border-gray-200 bg-white text-[11px] sm:text-xs text-gray-800 whitespace-nowrap hover:bg-gray-50 shrink-0"
                    >
                      <Calendar size={14} className="text-gray-500 shrink-0" />
                      <span className="font-medium tabular-nums">{formatDdMmYyyy(historyDateFrom)}</span>
                      <span className="text-gray-400">–</span>
                      <span className="font-medium tabular-nums">{formatDdMmYyyy(historyDateTo)}</span>
                      <Calendar size={14} className="text-gray-500 shrink-0" />
                    </button>
                    <span className="hidden sm:inline text-xs text-gray-500 whitespace-nowrap shrink-0">
                      {formatRangeSummary(historyDateFrom, historyDateTo)}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={openFilterModal}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-gray-200 bg-white text-xs font-medium text-gray-700 hover:bg-gray-50 whitespace-nowrap"
                  >
                    <SlidersHorizontal size={14} className="text-gray-600" />
                    Filter
                  </button>
                </div>
              )}
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full xl:w-auto xl:shrink-0">
                <div className="relative w-full sm:w-auto sm:min-w-[200px]">
                  <select
                    value={ordersSection}
                    onChange={(e) => handleSectionChange(e.target.value as 'live' | 'history')}
                    className="w-full appearance-none pl-3 pr-9 py-2 rounded-lg border border-gray-200 bg-white text-sm font-semibold text-gray-900 cursor-pointer"
                    aria-label="Orders section"
                  >
                    <option value="live">Live Orders</option>
                    <option value="history">Orders History</option>
                  </select>
                  <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-orange-500 pointer-events-none" aria-hidden />
                </div>
                {ordersSection === 'history' && (
                  <button
                    ref={downloadBtnRef}
                    type="button"
                    onClick={() => setDownloadOpen((v) => !v)}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-gray-200 bg-white text-xs font-medium text-gray-700 hover:bg-gray-50 whitespace-nowrap"
                  >
                    <Printer size={14} className="text-gray-600" />
                    Download
                    <ChevronDown size={14} className="text-gray-500" />
                  </button>
                )}
                <div className="relative flex-1 sm:min-w-[220px] lg:min-w-[300px]">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" aria-hidden />
                  <input
                    type="search"
                    inputMode="numeric"
                    placeholder={ordersSection === 'history' ? 'Search by order ID' : 'Search by the 4 digit order ID'}
                    value={orderIdSearch}
                    onChange={(e) => setOrderIdSearch(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 rounded-lg border border-gray-200 bg-white text-sm text-gray-900 placeholder:text-gray-400 shadow-sm"
                  />
                </div>
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
                      <p className="text-xs text-gray-500 mt-4">
                        Customer rating filters apply when rating data is linked to orders.
                      </p>
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

        <div className="flex flex-1 min-h-0 overflow-hidden">
          <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
          {ordersSection === 'history' ? (
            <div className="flex flex-1 min-h-0 flex-col lg:flex-row overflow-hidden">
              <aside className="w-full lg:w-[380px] shrink-0 border-b lg:border-b-0 lg:border-r border-gray-200 bg-white flex flex-col min-h-0 max-h-[45vh] lg:max-h-none">
                <div className="px-3 sm:px-4 py-3 border-b border-gray-200 flex items-center justify-between gap-2">
                  <p className="text-sm font-bold text-gray-900">Order history</p>
                  <span className="text-xs text-gray-500 tabular-nums">{historyOrders.length} orders</span>
                </div>
                <div className="flex-1 overflow-y-auto min-h-0 p-2 space-y-2 hide-scrollbar">
                  {!loading && historyOrders.length === 0 && (
                    <p className="text-sm text-gray-500 text-center py-8">No orders found.</p>
                  )}
                  {historyOrders.map((o) => {
                    const active = selectedOrder?.id === o.id;
                    return (
                      <button
                        key={o.id}
                        type="button"
                        onClick={() => openOrder(o)}
                        className={`w-full text-left rounded-xl border p-3 transition-colors ${
                          active ? 'border-blue-300 bg-blue-50/80' : 'border-gray-200 bg-white hover:bg-gray-50'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2 mb-1">
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-slate-700 text-white">
                            {(STATUS_LABEL[norm(o.order_status)] || norm(o.order_status)).toUpperCase()}
                          </span>
                          <span className="text-[10px] text-gray-500 text-right shrink-0">
                            {new Date(o.created_at).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true })}{' '}
                            | {new Date(o.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                          </span>
                        </div>
                        <p className="text-xs font-semibold text-gray-900">ID: {o.formatted_order_id || o.order_id}</p>
                        {o.customer_name && <p className="text-xs text-gray-600 mt-0.5">By {o.customer_name}</p>}
                        <p className="text-sm font-bold text-gray-900 text-right mt-2">
                          ₹{Number((o as any).food_items_total_value || (o as any).total_amount || 0).toFixed(0)}
                        </p>
                      </button>
                    );
                  })}
                </div>
              </aside>
              <main className="flex-1 min-w-0 overflow-y-auto min-h-0 bg-gray-50 p-3 sm:p-5">
                {!selectedOrder ? (
                  <div className="h-full flex items-center justify-center">
                    {orderIdSearch.trim() ? (
                      <FoodOrdersEmptyState variant="search" />
                    ) : historyOrders.length === 0 ? (
                      <div className="flex flex-col items-center justify-center py-12 sm:py-20 px-4 text-center">
                        <p className="text-base sm:text-lg font-medium text-slate-700">No orders in this range.</p>
                        <p className="mt-1 text-sm sm:text-base text-slate-500">Try changing date range or filters.</p>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center justify-center py-12 sm:py-20 px-4 text-center">
                        <p className="text-base sm:text-lg font-medium text-slate-700">No order selected</p>
                        <p className="mt-1 text-sm sm:text-base text-slate-500">Select an order from the left list to view details.</p>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="max-w-3xl mx-auto bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                    <div className="border-b border-gray-200 px-4 py-3 flex items-start justify-between gap-3">
                      <div>
                        <p className="text-base font-bold text-gray-900">
                          ID: {selectedOrder.formatted_order_id || selectedOrder.order_id}
                        </p>
                        <p className="text-xs text-gray-500 mt-0.5">{new Date(selectedOrder.created_at).toLocaleString('en-IN')}</p>
                      </div>
                      <button
                        type="button"
                        onClick={closeOrderPanel}
                        className="p-2 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 text-gray-600"
                        aria-label="Close"
                      >
                        <X size={18} />
                      </button>
                    </div>
                    <div className="p-4 text-sm text-gray-700">
                      <p className="font-semibold text-gray-900 mb-2">Status</p>
                      <p className="mb-4">{STATUS_LABEL[norm(selectedOrder.order_status)] || norm(selectedOrder.order_status)}</p>
                      {selectedOrder.customer_name && (
                        <>
                          <p className="font-semibold text-gray-900 mb-2">Customer</p>
                          <p>{selectedOrder.customer_name}</p>
                        </>
                      )}
                    </div>
                  </div>
                )}
              </main>
            </div>
          ) : (
          <div className="flex flex-col lg:flex-row flex-1 min-h-0 overflow-hidden">
            {/* Desktop (lg+): When panel open, split layout. Card shows placeholder until an order is selected. */}
            {rightPanelOpen ? (
              <>
                {/* Order details: single card, actions top-right, reject half width, space used evenly */}
                <div className="hidden lg:flex flex-1 min-w-0 border-r border-gray-200 bg-gray-50/80 flex-col overflow-hidden order-1 p-3">
                <div className="flex-1 overflow-y-auto min-h-0 hide-scrollbar overflow-x-hidden">
                  <div className="bg-white rounded-xl border border-gray-200/80 shadow-md overflow-hidden flex flex-col h-full min-h-[320px]">
                    {selectedOrder ? (
                    <>
                    {/* Single header row: Order id + OTP + status + time | Compact timeline | Close */}
                    <div className="shrink-0 flex items-center gap-3 px-4 py-2.5 bg-gradient-to-r from-gray-50 to-white border-b border-gray-200/60">
                      <div className="flex items-center gap-2.5 min-w-0 shrink-0">
                        <FormattedOrderId 
                          formattedOrderId={selectedOrder.formatted_order_id} 
                          fallbackOrderId={selectedOrder.order_id}
                          size="base"
                        />
                        <div className="flex items-center gap-2 px-3 py-1 bg-gradient-to-r from-slate-100 to-slate-50 rounded-lg border border-slate-200">
                          <span className="text-xs font-semibold text-gray-700">OTP:</span>
                          {otpCache[selectedOrder.id] ? (
                            <>
                              <span className="font-mono font-bold text-lg text-gray-900 tracking-wider">{otpCache[selectedOrder.id].otp_code}</span>
                              <span className="text-[10px] text-slate-600">({otpCache[selectedOrder.id].otp_type})</span>
                              {otpVerified.has(selectedOrder.id) && <span className="text-green-600 text-xs font-medium">✓</span>}
                            </>
                          ) : (
                            <span className="text-xs text-gray-500 animate-pulse">Loading...</span>
                          )}
                        </div>
                        <span
                          className={`shrink-0 px-2 py-0.5 rounded-md text-[10px] font-semibold tracking-wide ${
                            (selectedOrder.order_status || 'CREATED') === 'CREATED' || (selectedOrder.order_status || '') === 'NEW'
                              ? 'bg-red-100 text-red-700'
                              : (selectedOrder.order_status || '') === 'DELIVERED'
                                ? 'bg-green-100 text-green-700'
                                : (selectedOrder.order_status || '') === 'CANCELLED' || (selectedOrder.order_status || '') === 'RTO'
                                  ? 'bg-gray-100 text-gray-600'
                                  : 'bg-blue-100 text-blue-700'
                          }`}
                        >
                          {STATUS_LABEL[selectedOrder.order_status || 'CREATED'] || selectedOrder.order_status || 'CREATED'}
                        </span>
                        <span className="text-[10px] text-gray-500">{formatTimeAgo(selectedOrder.created_at)}</span>
                      </div>
                      <div className="flex-1 min-w-0 flex items-center justify-center px-2">
                        <OrderStatusTimeline order={selectedOrder} compact />
                      </div>
                      {['PREPARING', 'READY_FOR_PICKUP', 'OUT_FOR_DELIVERY'].includes(selectedOrder.order_status || '') && (
                        <div className="relative shrink-0" ref={headerRtoMenuRef}>
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); setHeaderRtoMenuOpen((o) => !o); }}
                            disabled={actionLoading === selectedOrder.id}
                            className="p-2 rounded-xl border border-gray-200 bg-white hover:bg-gray-50 text-gray-600 disabled:opacity-50 transition-colors"
                            aria-label="More actions"
                          >
                            <MoreVertical size={18} />
                          </button>
                          {headerRtoMenuOpen && (
                            <div className="absolute right-0 top-full mt-1 py-1 bg-white border border-gray-200 rounded-lg shadow-lg z-50 min-w-[100px]">
                              <button
                                type="button"
                                onClick={(e) => { e.stopPropagation(); setRtoModalOrder(selectedOrder); setHeaderRtoMenuOpen(false); }}
                                disabled={actionLoading === selectedOrder.id}
                                className="w-full text-left px-3 py-2 text-sm font-medium text-orange-700 hover:bg-orange-50 rounded-none first:rounded-t-lg last:rounded-b-lg"
                              >
                                RTO
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                      <button onClick={closeOrderPanel} className="p-1.5 hover:bg-gray-100 rounded-md shrink-0 transition-colors" aria-label="Close">
                        <X size={16} className="text-gray-500" />
                      </button>
                    </div>
                    {/* Card body: compact premium layout */}
                    <div className="flex-1 overflow-y-auto p-4 min-h-0 overflow-x-hidden">
                      <div className="flex flex-col lg:flex-row gap-4 items-start">
                        {/* Left: Customer & Rider Details - auto width based on content */}
                        <div className="flex flex-col gap-3 w-full lg:w-auto lg:min-w-[260px] lg:max-w-none lg:flex-shrink-0">
                          {/* Customer - Full Details - auto width */}
                          {selectedOrder.customer_name && (
                            <div className="rounded-lg bg-gradient-to-br from-blue-50/50 to-blue-100/30 p-3 border border-blue-100/60 shadow-sm w-full">
                              <div className="flex items-start gap-2.5">
                                <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center shrink-0">
                                  <User size={16} className="text-blue-600" />
                                </div>
                                <div className="min-w-0 flex-1 space-y-1.5">
                                  <div className="flex items-center gap-2">
                                    <p className="font-semibold text-gray-900 text-sm">{selectedOrder.customer_name}</p>
                                    {selectedOrder.customer_scores && (
                                      <span className={`px-1.5 py-0.5 rounded text-[9px] font-medium ${
                                        (selectedOrder.customer_scores.trust_score || 100) >= 80 
                                          ? 'bg-green-100 text-green-700' 
                                          : (selectedOrder.customer_scores.trust_score || 100) >= 50
                                            ? 'bg-yellow-100 text-yellow-700'
                                            : 'bg-red-100 text-red-700'
                                      }`}>
                                        {(selectedOrder.customer_scores.trust_score || 100).toFixed(0)}
                                      </span>
                                    )}
                                  </div>
                                  {selectedOrder.customer_phone && (
                                    <a href={`tel:${selectedOrder.customer_phone}`} className="flex items-center gap-1.5 text-blue-600 text-xs font-medium hover:text-blue-700">
                                      <Phone size={12} /> {selectedOrder.customer_phone}
                                    </a>
                                  )}
                                  {(selectedOrder.drop_address_raw || selectedOrder.drop_address_normalized) && (
                                    <div className="flex items-start gap-1.5 text-xs text-gray-700">
                                      <MapPin size={12} className="shrink-0 mt-0.5 text-amber-600" />
                                      <span className="leading-relaxed">{selectedOrder.drop_address_normalized || selectedOrder.drop_address_raw}</span>
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>
                          )}
                          
                          {/* Rider - Full Details with Timeline (always show if rider_id exists) - auto width */}
                          {(selectedOrder.rider_id || selectedOrder.rider_name || selectedOrder.rider_details) ? (
                            <div className="rounded-lg bg-gradient-to-br from-purple-50/50 to-purple-100/30 p-3 border border-purple-100/60 shadow-sm w-full relative">
                              <button
                                type="button"
                                onClick={() => { setRidersLogModalOrderId(selectedOrder.id); setRidersLogModalOrderLabel(selectedOrder.formatted_order_id || `#${selectedOrder.order_id}`); }}
                                className="absolute top-2 right-2 text-[10px] font-semibold text-purple-600 hover:text-purple-800 hover:underline"
                              >
                                Rider&apos;s log
                              </button>
                              <div className="space-y-2.5">
                                <div className="flex items-start gap-2.5">
                                  {selectedOrder.rider_details?.selfie_url ? (
                                    <button
                                      type="button"
                                      onClick={() => setRiderImageModalUrl(selectedOrder.rider_details?.selfie_url || null)}
                                      className="shrink-0 rounded-full border-2 border-purple-200 overflow-hidden focus:outline-none focus:ring-2 focus:ring-purple-400"
                                    >
                                      <img 
                                        src={selectedOrder.rider_details.selfie_url} 
                                        alt={selectedOrder.rider_name || 'Rider'} 
                                        className="w-8 h-8 rounded-full object-cover"
                                      />
                                    </button>
                                  ) : (
                                    <div className="w-8 h-8 rounded-full bg-purple-100 flex items-center justify-center shrink-0">
                                      <Bike size={16} className="text-purple-600" />
                                    </div>
                                  )}
                                  <div className="min-w-0 flex-1">
                                    <div className="flex items-center gap-2 mb-1">
                                      <p className="font-semibold text-gray-900 text-sm">
                                        {selectedOrder.rider_details?.name || selectedOrder.rider_name || `Rider #${selectedOrder.rider_id}`}
                                      </p>
                                      {selectedOrder.rider_details?.id && (
                                        <span className="text-[9px] text-gray-500">ID: {selectedOrder.rider_details.id}</span>
                                      )}
                                      {selectedOrder.rider_details?.status && (
                                        <span className={`px-1.5 py-0.5 rounded text-[9px] font-medium ${
                                          selectedOrder.rider_details.status === 'ACTIVE' 
                                            ? 'bg-green-100 text-green-700' 
                                            : 'bg-gray-100 text-gray-600'
                                        }`}>
                                          {selectedOrder.rider_details.status}
                                        </span>
                                      )}
                                    </div>
                                    {selectedOrder.rider_details?.mobile && (
                                      <a href={`tel:${selectedOrder.rider_details.mobile}`} className="flex items-center gap-1.5 text-purple-600 text-xs font-medium hover:text-purple-700">
                                        <Phone size={12} /> {selectedOrder.rider_details.mobile}
                                      </a>
                                    )}
                                    {selectedOrder.rider_details?.city && (
                                      <p className="text-xs text-gray-600 mt-0.5">{selectedOrder.rider_details.city}</p>
                                    )}
                                  </div>
                                </div>
                                {/* Rider Timeline */}
                                {selectedOrder.rider_id && (
                                  <div className="pt-2 border-t border-purple-100/60">
                                    <RiderTimeline storeId={storeId} riderId={selectedOrder.rider_id} orderId={selectedOrder.order_id} />
                                  </div>
                                )}
                              </div>
                            </div>
                          ) : null}
                          
                          {/* Delivery Instructions */}
                          {selectedOrder.delivery_instructions && (
                            <div className="rounded-lg bg-amber-50/60 p-2.5 border border-amber-100">
                              <div className="flex items-start gap-2">
                                <MapPin size={12} className="shrink-0 mt-0.5 text-amber-600" />
                                <p className="text-xs text-gray-700 leading-relaxed">{selectedOrder.delivery_instructions}</p>
                              </div>
                            </div>
                          )}
                          
                          {/* Flags - compact */}
                          {(selectedOrder.requires_utensils || (selectedOrder.veg_non_veg && selectedOrder.veg_non_veg !== 'na') || selectedOrder.is_fragile || selectedOrder.is_high_value) && (
                            <div className="rounded-lg bg-gray-50/60 p-2.5 border border-gray-100">
                              <div className="flex flex-wrap gap-1.5">
                                {selectedOrder.requires_utensils && (
                                  <span className="px-2 py-0.5 bg-gray-100 text-gray-700 text-[10px] rounded-md flex items-center gap-1 w-fit"><UtensilsCrossed size={10} /> Utensils</span>
                                )}
                                {selectedOrder.veg_non_veg && selectedOrder.veg_non_veg !== 'na' && (
                                  <span className="px-2 py-0.5 bg-green-100 text-green-800 text-[10px] rounded-md w-fit">{formatVegNonVeg(selectedOrder.veg_non_veg)}</span>
                                )}
                                {selectedOrder.is_fragile && <span className="px-2 py-0.5 bg-amber-100 text-amber-800 text-[10px] rounded-md">Fragile</span>}
                                {selectedOrder.is_high_value && <span className="px-2 py-0.5 bg-yellow-100 text-yellow-800 text-[10px] rounded-md">High value</span>}
                              </div>
                            </div>
                          )}
                        </div>
                        
                        {/* Center: Items & Amount - flexible width, uses remaining space */}
                        <div className="flex-1 min-w-0 space-y-3 lg:max-w-none">
                          {/* Action buttons - same width as items card; 3-dot RTO is in header */}
                          <div className="w-full flex gap-2 items-center">
                            <ActionBtns
                              order={selectedOrder}
                              onAccept={() => updateStatus(selectedOrder, 'ACCEPTED')}
                              onReject={() => { setRejectModal(selectedOrder); closeOrderPanel(); }}
                              onPreparing={() => updateStatus(selectedOrder, 'PREPARING')}
                              onReady={() => updateStatus(selectedOrder, 'READY_FOR_PICKUP')}
                              onDispatch={() => setDispatchModal(selectedOrder)}
                              onComplete={() => updateStatus(selectedOrder, 'DELIVERED')}
                              onRto={() => setRtoModalOrder(selectedOrder)}
                              onAddOrDeduct={() => setWalletAdjustmentOrder(selectedOrder)}
                              loading={actionLoading === selectedOrder.id}
                              otpVerified={otpVerified.has(selectedOrder.id)}
                              topRightLayout
                              hideRtoMenu
                            />
                          </div>
                          {/* Items - compact premium with QTY | Price | Amount */}
                          <div className="rounded-lg bg-white p-3 border border-gray-200 shadow-sm w-full">
                            <div className="flex items-center justify-between mb-2.5">
                              <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">Items</p>
                              <span className="text-xs text-gray-500">{selectedOrder.preparation_time_minutes ?? '—'}m prep</span>
                            </div>
                            {/* Header row */}
                            {selectedOrder.items && Array.isArray(selectedOrder.items) && selectedOrder.items.length > 0 && (
                              <div className="grid grid-cols-12 gap-2 text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-1.5 pb-1 border-b border-gray-200">
                                <div className="col-span-5">Item</div>
                                <div className="col-span-2 text-center">QTY</div>
                                <div className="col-span-2 text-right">Price</div>
                                <div className="col-span-3 text-right">Amount</div>
                              </div>
                            )}
                            {selectedOrder.items && Array.isArray(selectedOrder.items) && selectedOrder.items.length > 0 ? (
                              <div className="space-y-2">
                                {selectedOrder.items.map((item: any, idx: number) => {
                                  const qty = item.quantity || 1;
                                  const itemPrice = Number(item.price || 0);
                                  const amount = Number(item.total || itemPrice * qty);
                                  return (
                                    <div key={idx} className="grid grid-cols-12 gap-2 text-xs items-center py-1 border-b border-gray-100 last:border-0">
                                      <div className="col-span-5 min-w-0">
                                        <p className="font-medium text-gray-900 truncate">{item.name || `Item ${idx + 1}`}</p>
                                        {item.customizations && Array.isArray(item.customizations) && item.customizations.length > 0 && (
                                          <p className="text-[10px] text-gray-500 mt-0.5 truncate">{item.customizations.join(', ')}</p>
                                        )}
                                      </div>
                                      <div className="col-span-2 text-center">
                                        <p className="text-gray-600 font-medium">{qty}</p>
                                      </div>
                                      <div className="col-span-2 text-right">
                                        <p className="text-gray-600">₹{itemPrice.toFixed(2)}</p>
                                      </div>
                                      <div className="col-span-3 text-right">
                                        <p className="font-semibold text-gray-900">₹{amount.toFixed(2)}</p>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            ) : (
                              <p className="text-xs text-gray-500">{selectedOrder.food_items_count ?? '—'} items</p>
                            )}
                            <div className="mt-2.5 pt-2.5 border-t border-gray-100 flex justify-between items-center">
                              <span className="text-xs text-gray-600">Total</span>
                              <span className="font-bold text-gray-900">₹{Number(selectedOrder.food_items_total_value || 0).toFixed(2)}</span>
                            </div>
                          </div>
                          
                        </div>
                      </div>
                      
                      {/* Cancellation - compact */}
                      {(selectedOrder.rejected_reason || selectedOrder.cancelled_by_type) && (
                        <div className="mt-3 p-2.5 bg-red-50/80 rounded-lg border border-red-200/60">
                          <p className="text-[10px] font-semibold text-red-600 uppercase tracking-wide mb-1.5">Cancellation</p>
                          {selectedOrder.rejected_reason && (
                            <p className="text-xs text-red-800 mb-1.5 leading-relaxed">{selectedOrder.rejected_reason}</p>
                          )}
                          {selectedOrder.cancelled_by_type && (
                            <p className="text-[10px] text-red-700">
                              <span className="font-medium capitalize">{selectedOrder.cancelled_by_type}</span>
                              {selectedOrder.cancelled_at && (
                                <span className="ml-1.5 text-red-600">• {formatTimeAgo(selectedOrder.cancelled_at)}</span>
                              )}
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                    </>
                  ) : (
                    <div className="flex-1 flex items-center justify-center p-8 text-gray-500 text-sm text-center">
                      Select an order from the list to view details
                    </div>
                  )}
                  </div>
                </div>
              </div>
                {/* Mobile: Order details panel beside sidebar - card-based layout (only when order selected) */}
                {selectedOrder && (
                <div className="lg:hidden flex-1 min-w-0 flex flex-col overflow-hidden order-1">
                  <OrderDetailMobile
                    storeId={storeId}
                    order={selectedOrder}
                    onClose={closeOrderPanel}
                    statusLabel={STATUS_LABEL[selectedOrder.order_status || 'CREATED'] || selectedOrder.order_status || 'CREATED'}
                    formatVegNonVeg={formatVegNonVeg}
                    formatTimeAgo={formatTimeAgo}
                    otpCode={otpCache[selectedOrder.id]?.otp_code}
                    otpType={otpCache[selectedOrder.id]?.otp_type}
                    otpVerified={otpVerified.has(selectedOrder.id)}
                    onFetchOtp={() => fetchOtp(selectedOrder.id)}
                    onAccept={() => updateStatus(selectedOrder, 'ACCEPTED')}
                    onReject={() => { setRejectModal(selectedOrder); closeOrderPanel(); }}
                    onPreparing={() => updateStatus(selectedOrder, 'PREPARING')}
                    onReady={() => updateStatus(selectedOrder, 'READY_FOR_PICKUP')}
                    onDispatch={() => setDispatchModal(selectedOrder)}
                    onComplete={() => updateStatus(selectedOrder, 'DELIVERED')}
                    onRto={() => setRtoModalOrder(selectedOrder)}
                    actionLoading={actionLoading === selectedOrder.id}
                    onOpenRidersLog={() => { setRidersLogModalOrderId(selectedOrder.id); setRidersLogModalOrderLabel(selectedOrder.formatted_order_id || `#${selectedOrder.order_id}`); }}
                    onOpenRiderImage={(url) => setRiderImageModalUrl(url)}
                  />
                </div>
                )}

                {/* Right: Cards column - desktop only when order open (hidden on mobile) */}
                <div className="hidden lg:flex w-64 shrink-0 flex-col overflow-hidden pl-4 order-2">
                  <div className="flex-1 overflow-y-auto overflow-x-hidden min-h-0 hide-scrollbar">
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
                          onDispatch={() => {
                            fetchOtp(order.id);
                            setDispatchModal(order);
                            setOtpInput('');
                          }}
                          onRto={() => setRtoModalOrder(order)}
                          onComplete={() => updateStatus(order, 'DELIVERED')}
                          onAddOrDeduct={() => setWalletAdjustmentOrder(order)}
                          loading={actionLoading === order.id}
                          otpCode={otpCache[order.id]?.otp_code}
                          otpType={otpCache[order.id]?.otp_type}
                          otpVerified={otpVerified.has(order.id)}
                          onFetchOtp={() => fetchOtp(order.id)}
                          statusLabel={STATUS_LABEL[order.order_status || 'CREATED'] || order.order_status}
                        />
                      ))}
                    </div>
                    {displayOrders.length === 0 && (
                      <FoodOrdersEmptyState variant={emptyVariant} />
                    )}
                  </div>
                </div>
              </>
            ) : (
              <>
            {/* Main order cards / list - full width when no order open */}
            <div className="flex-1 overflow-y-auto p-3 sm:p-4 min-w-0 min-h-0 hide-scrollbar" style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom, 0px))' }}>
              {viewMode === 'card' ? (
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
                    onDispatch={() => {
                      fetchOtp(order.id);
                      setDispatchModal(order);
                      setOtpInput('');
                    }}
                    onRto={() => setRtoModalOrder(order)}
                    onComplete={() => updateStatus(order, 'DELIVERED')}
                    onAddOrDeduct={() => setWalletAdjustmentOrder(order)}
                    loading={actionLoading === order.id}
                    otpCode={otpCache[order.id]?.otp_code}
                    otpType={otpCache[order.id]?.otp_type}
                    otpVerified={otpVerified.has(order.id)}
                    onFetchOtp={() => fetchOtp(order.id)}
                    statusLabel={STATUS_LABEL[order.order_status || 'CREATED'] || order.order_status}
                  />
                ))}
              </div>
              ) : (
              // List view - only shown on large screens (lg+)
              <div className="hidden lg:block space-y-2">
                {displayOrders.map((order) => (
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
                    onAddOrDeduct={() => setWalletAdjustmentOrder(order)}
                    loading={actionLoading === order.id}
                    otpCode={otpCache[order.id]?.otp_code}
                    otpType={otpCache[order.id]?.otp_type}
                    otpVerified={otpVerified.has(order.id)}
                    onFetchOtp={() => fetchOtp(order.id)}
                    statusLabel={STATUS_LABEL[order.order_status || 'CREATED'] || order.order_status}
                  />
                ))}
                {displayOrders.length === 0 && (
                  <FoodOrdersEmptyState variant={emptyVariant} />
                )}
              </div>
              )}
              {viewMode === 'card' && displayOrders.length === 0 && (
                <FoodOrdersEmptyState variant={emptyVariant} />
              )}
            </div>
              </>
            )}
          </div>
          )}
          </div>
        </div>
      </div>

      {/* Reject modal – portaled so overlay is above sidebar (z-50); backdrop-blur covers full screen */}
      {rejectModal && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 bg-black/50 backdrop-blur-md flex items-end sm:items-center justify-center z-[100] p-3 sm:p-4">
          <div className="bg-white rounded-t-xl sm:rounded-xl shadow-xl max-w-md w-full p-4 sm:p-5 max-h-[90vh] overflow-y-auto">
            <h3 className="font-semibold text-gray-900 mb-2">
              Reject Order{' '}
              {rejectModal.formatted_order_id ? (
                <FormattedOrderId 
                  formattedOrderId={rejectModal.formatted_order_id} 
                  fallbackOrderId={rejectModal.order_id}
                  size="base"
                />
              ) : (
                `#${rejectModal.order_id}`
              )}
            </h3>
            <p className="text-sm text-gray-600 mb-3">Provide a reason (optional):</p>
            <textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              className="w-full border border-gray-200 rounded-lg p-2 text-sm min-h-[80px]"
              placeholder="e.g. Item unavailable, Store closed..."
            />
            <div className="flex gap-2 mt-3">
              <button
                onClick={() => {
                  setRejectModal(null);
                  setRejectReason('');
                }}
                className="flex-1 px-4 py-2 border border-gray-200 rounded-lg text-sm font-medium hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  await updateStatus(rejectModal, 'CANCELLED', {
                    rejected_reason: rejectReason || 'No reason provided',
                  });
                  setRejectModal(null);
                  setRejectReason('');
                }}
                className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700"
              >
                Reject
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

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
                This will mark the order as Return to Origin. The order will be considered undelivered and may affect your metrics. Are you sure you want to continue?
              </p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setRtoModalOrder(null)}
                className="flex-1 py-2.5 border border-gray-200 rounded-lg text-sm font-medium hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  updateStatus(rtoModalOrder, 'RTO');
                  setRtoModalOrder(null);
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

      {/* Wallet adjustment modal – add or deduct from order */}
      {walletAdjustmentOrder && (
        <WalletAdjustmentModal
          storeId={storeId}
          order={walletAdjustmentOrder}
          onClose={() => setWalletAdjustmentOrder(null)}
        />
      )}

      {/* Rider's log modal – all riders assigned to this order */}
      {ridersLogModalOrderId != null && typeof document !== 'undefined' && createPortal(
        <div
          className="fixed inset-0 bg-black/50 backdrop-blur-md flex items-end sm:items-center justify-center z-[100] p-3 sm:p-4"
          onClick={() => { setRidersLogModalOrderId(null); setRidersLogModalOrderLabel(null); }}
          role="dialog"
          aria-modal="true"
          aria-label="Close modal"
        >
          <div
            className="bg-white rounded-t-xl sm:rounded-xl shadow-xl max-w-md w-full max-h-[85vh] overflow-hidden flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="shrink-0 flex items-center justify-between p-4 border-b border-gray-200">
              <h3 className="font-semibold text-gray-900">
                Rider&apos;s log
                {ridersLogModalOrderLabel && <span className="text-gray-500 font-medium ml-1.5">({ridersLogModalOrderLabel})</span>}
              </h3>
              <button type="button" onClick={() => { setRidersLogModalOrderId(null); setRidersLogModalOrderLabel(null); }} className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors" aria-label="Close">
                <X size={18} className="text-gray-500" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              {ridersLogLoading ? (
                <p className="text-sm text-gray-500">Loading...</p>
              ) : ridersLogList.length === 0 ? (
                <p className="text-sm text-gray-500">No rider assignment history for this order.</p>
              ) : (
                <ul className="space-y-3">
                  {ridersLogList.map((r, idx) => {
                    const fmt = (s: string | null) => (s ? new Date(s).toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'short' }) : '—');
                    return (
                      <li key={`${r.rider_id}-${idx}`} className="p-3 rounded-lg border border-gray-200 bg-gray-50/50">
                        <div className="flex items-start gap-3">
                          {r.selfie_url ? (
                            <button
                              type="button"
                              onClick={() => setRiderImageModalUrl(r.selfie_url)}
                              className="shrink-0 w-10 h-10 rounded-full overflow-hidden border-2 border-purple-200 focus:outline-none focus:ring-2 focus:ring-purple-400"
                            >
                              <img src={r.selfie_url} alt={r.rider_name || 'Rider'} className="w-full h-full object-cover" />
                            </button>
                          ) : (
                            <div className="w-10 h-10 rounded-full bg-purple-100 flex items-center justify-center shrink-0">
                              <Bike size={18} className="text-purple-600" />
                            </div>
                          )}
                          <div className="min-w-0 flex-1 text-sm">
                            <p className="font-semibold text-gray-900">{r.rider_name || `Rider #${r.rider_id}`}</p>
                            {r.rider_mobile && (
                              <a href={`tel:${r.rider_mobile}`} className="text-purple-600 hover:underline">{r.rider_mobile}</a>
                            )}
                            <p className="text-[10px] text-gray-500 mt-1 capitalize">{r.assignment_status?.replace(/_/g, ' ')}</p>
                            <div className="mt-2 text-[10px] text-gray-600 space-y-0.5">
                              <p>Assigned: {fmt(r.assigned_at)}</p>
                              {r.accepted_at && <p>Accepted: {fmt(r.accepted_at)}</p>}
                              {r.reached_merchant_at && <p>Reached store: {fmt(r.reached_merchant_at)}</p>}
                              {r.picked_up_at && <p>Picked up: {fmt(r.picked_up_at)}</p>}
                              {r.delivered_at && <p>Delivered: {fmt(r.delivered_at)}</p>}
                              {r.rejected_at && <p>Rejected: {fmt(r.rejected_at)}</p>}
                              {r.cancelled_at && <p>Cancelled: {fmt(r.cancelled_at)}</p>}
                            </div>
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Rider image lightbox */}
      {riderImageModalUrl && typeof document !== 'undefined' && createPortal(
        <div
          className="fixed inset-0 bg-black/80 flex items-center justify-center z-[110] p-4"
          onClick={() => setRiderImageModalUrl(null)}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => e.key === 'Escape' && setRiderImageModalUrl(null)}
          aria-label="Close image"
        >
          <button type="button" onClick={() => setRiderImageModalUrl(null)} className="absolute top-3 right-3 p-2 rounded-full bg-white/20 hover:bg-white/30 text-white" aria-label="Close">
            <X size={24} />
          </button>
          <img
            src={riderImageModalUrl}
            alt="Rider"
            className="max-w-full max-h-[90vh] object-contain rounded-lg"
            onClick={(e) => e.stopPropagation()}
          />
        </div>,
        document.body
      )}

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
                  <p className="text-xs text-gray-600">Reopen tomorrow at {openingTimeForClose ? formatTimeHMS(openingTimeForClose) : 'scheduled opening time'}</p>
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
                {MERCHANT_PORTAL_CLOSE_REASONS.map((r) => (
                  <option key={r} value={r}>
                    {merchantPortalCloseReasonWithSuffix(r)}
                  </option>
                ))}
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
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div
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
  { key: 'preparing', label: 'Preparing', status: 'PREPARING', at: () => null },
  { key: 'ready', label: 'Ready', status: 'READY_FOR_PICKUP', at: (o: OrdersFoodRow) => o.prepared_at },
  { key: 'dispatch', label: 'Dispatch', status: 'OUT_FOR_DELIVERY', at: (o: OrdersFoodRow) => o.dispatched_at },
  { key: 'delivered', label: 'Delivered', status: 'DELIVERED', at: (o: OrdersFoodRow) => o.delivered_at },
] as const;

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
  { key: 'assigned', label: 'Assigned', at: (data: any) => data.assigned_at },
  { key: 'accepted', label: 'Accepted', at: (data: any) => data.accepted_at },
  { key: 'reached', label: 'Reached Store', at: (data: any) => data.reached_merchant_at },
  { key: 'picked', label: 'Picked Up', at: (data: any) => data.picked_up_at },
  { key: 'delivered', label: 'Delivered', at: (data: any) => data.delivered_at },
] as const;

function RiderTimeline({ storeId, riderId, orderId }: { storeId: string; riderId: number | null | undefined; orderId: number }) {
  const [riderAssignment, setRiderAssignment] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  
  useEffect(() => {
    if (!riderId || !orderId || !storeId) {
      setLoading(false);
      return;
    }
    
    // Fetch rider assignment details from order_rider_assignments
    const fetchRiderTimeline = async () => {
      try {
        const res = await fetch(`/api/merchant/stores/${storeId}/orders/${orderId}/rider-timeline?rider_id=${riderId}`);
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
  }, [storeId, riderId, orderId]);

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
        const isActive = i === currentStepIdx && !ts; // Active but not yet completed
        const prevDone = i > 0 && (currentStepIdx >= i - 1);
        
        return (
          <React.Fragment key={step.key}>
            {i > 0 && (
              <div className={`shrink-0 w-4 h-0.5 mt-3 ${prevDone ? 'bg-blue-400' : 'bg-gray-200'}`} />
            )}
            <div className="flex flex-col items-center shrink-0 min-w-[44px]">
              <div className={`w-6 h-6 rounded-full flex items-center justify-center ${
                done && ts 
                  ? 'bg-blue-500 text-white' // Completed step (has timestamp)
                  : isActive 
                    ? 'bg-blue-500 text-white' // Active step (rider assigned but no timestamp yet)
                    : done && !ts && i === 0
                      ? 'bg-blue-500 text-white' // Assigned step (rider exists but no timestamp)
                      : 'bg-gray-200 text-gray-500' // Future step
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
            </div>
          </React.Fragment>
        );
      })}
    </div>
  );
}

function OrderStatusTimeline({ order, compact }: { order: OrdersFoodRow; compact?: boolean }) {
  const status = order.order_status || 'CREATED';
  const isTerminal = status === 'CANCELLED' || status === 'RTO';
  const lastCompletedIdx = lastCompletedStepIndex(order);
  const currentIdx = isTerminal ? lastCompletedIdx : orderStepIndex(status);
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
                <span className="text-[9px] font-medium text-gray-600 text-center leading-tight truncate w-full" title={step.label}>{step.label}</span>
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
              const stepIdx = orderStepIndex(step.status);
              const done = currentIdx >= stepIdx || (status === step.status);
              const prevDone = i > 0 && (currentIdx >= orderStepIndex(stepsToShow[i - 1].status));
              return (
                <div key={step.key} className="flex-1 flex items-center min-w-0">
                  <div className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 ${done ? 'bg-green-500 text-white' : 'bg-gray-200 text-gray-500'}`}>
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
        const stepIdx = orderStepIndex(step.status);
        const done = currentIdx >= stepIdx || (status === step.status);
        const ts = step.at(order);
        const prevDone = i > 0 && (currentIdx >= orderStepIndex(stepsToShow[i - 1].status));
        return (
          <React.Fragment key={step.key}>
            {i > 0 && (
              <div className={`shrink-0 w-4 h-0.5 mt-3 ${prevDone ? 'bg-green-400' : 'bg-gray-200'}`} />
            )}
            <div className="flex flex-col items-center shrink-0 min-w-[44px]">
              <div className={`w-6 h-6 rounded-full flex items-center justify-center ${done ? 'bg-green-500 text-white' : 'bg-gray-200 text-gray-500'}`}>
                {done ? <Check size={12} strokeWidth={3} /> : <span className="text-[9px] font-bold">{i + 1}</span>}
              </div>
              <span className="text-[9px] font-medium text-gray-600 mt-1 text-center leading-tight">{step.label}</span>
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
  storeId,
  order,
  onClose,
  statusLabel,
  formatVegNonVeg,
  formatTimeAgo,
  otpCode,
  otpType,
  otpVerified,
  onFetchOtp,
  onAccept,
  onReject,
  onPreparing,
  onReady,
  onDispatch,
  onComplete,
  onRto,
  actionLoading,
  onOpenRidersLog,
  onOpenRiderImage,
}: {
  storeId: string;
  order: OrdersFoodRow;
  onClose: () => void;
  statusLabel: string;
  formatVegNonVeg: (v: string | null) => string;
  formatTimeAgo: (s: string) => string;
  otpCode?: string;
  otpType?: string;
  otpVerified?: boolean;
  onFetchOtp: () => void;
  onAccept: () => void;
  onReject: () => void;
  onPreparing: () => void;
  onReady: () => void;
  onDispatch: () => void;
  onComplete: () => void;
  onRto: () => void;
  actionLoading: boolean;
  onOpenRidersLog?: () => void;
  onOpenRiderImage?: (url: string) => void;
}) {
  const status = order.order_status || 'CREATED';
  const statusColor =
    status === 'CREATED' || status === 'NEW'
      ? 'bg-red-100 text-red-800'
      : status === 'DELIVERED'
        ? 'bg-green-100 text-green-800'
        : status === 'CANCELLED'
          ? 'bg-gray-100 text-gray-700'
          : 'bg-blue-100 text-blue-800';
  const totalValue = Number(order.food_items_total_value || 0).toFixed(2);
  const hasFlags =
    order.requires_utensils ||
    order.is_fragile ||
    order.is_high_value ||
    (order.veg_non_veg && order.veg_non_veg !== 'na');

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
          {/* OTP always visible - bold and big */}
          <div className="flex items-center gap-2 px-3 py-1 bg-gradient-to-r from-slate-100 to-slate-50 rounded-lg border border-slate-200">
            <span className="text-xs font-semibold text-gray-700">OTP:</span>
            {otpCode ? (
              <>
                <span className="font-mono font-bold text-lg text-gray-900 tracking-wider">{otpCode}</span>
                {otpType && <span className="text-[10px] text-slate-600">({otpType})</span>}
                {otpVerified && <span className="text-green-600 text-xs font-medium">✓</span>}
              </>
            ) : (
              <span className="text-xs text-gray-500 animate-pulse">Loading...</span>
            )}
          </div>
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
            {onOpenRidersLog && (
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
                  <RiderTimeline storeId={storeId} riderId={order.rider_id} orderId={order.order_id} />
                </div>
              )}
            </div>
          </div>
        ) : null}

        {/* Items - Detailed format with QTY | Price | Amount */}
        <div className="bg-white rounded-xl border border-gray-200 p-3 shadow-sm">
          <div className="flex items-center justify-between mb-2.5">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Items</p>
            <span className="text-xs text-gray-500">{order.preparation_time_minutes ?? '—'}m prep</span>
          </div>
          {/* Header row */}
          {order.items && Array.isArray(order.items) && order.items.length > 0 && (
            <div className="grid grid-cols-12 gap-2 text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-1.5 pb-1 border-b border-gray-200">
              <div className="col-span-5">Item</div>
              <div className="col-span-2 text-center">QTY</div>
              <div className="col-span-2 text-right">Price</div>
              <div className="col-span-3 text-right">Amount</div>
            </div>
          )}
          {order.items && Array.isArray(order.items) && order.items.length > 0 ? (
            <div className="space-y-2">
              {order.items.map((item: any, idx: number) => {
                const qty = item.quantity || 1;
                const itemPrice = Number(item.price || 0);
                const amount = Number(item.total || itemPrice * qty);
                return (
                  <div key={idx} className="grid grid-cols-12 gap-2 text-xs items-center py-1 border-b border-gray-100 last:border-0">
                    <div className="col-span-5 min-w-0">
                      <p className="font-medium text-gray-900 truncate">{item.name || `Item ${idx + 1}`}</p>
                      {item.customizations && Array.isArray(item.customizations) && item.customizations.length > 0 && (
                        <p className="text-[10px] text-gray-500 mt-0.5 truncate">{item.customizations.join(', ')}</p>
                      )}
                    </div>
                    <div className="col-span-2 text-center">
                      <p className="text-gray-600 font-medium">{qty}</p>
                    </div>
                    <div className="col-span-2 text-right">
                      <p className="text-gray-600">₹{itemPrice.toFixed(2)}</p>
                    </div>
                    <div className="col-span-3 text-right">
                      <p className="font-semibold text-gray-900">₹{amount.toFixed(2)}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-xs text-gray-500">{order.food_items_count ?? '—'} items</p>
          )}
          <div className="mt-2.5 pt-2.5 border-t border-gray-100 flex justify-between items-center">
            <span className="text-xs text-gray-600">Total</span>
            <span className="font-bold text-gray-900">₹{Number(order.food_items_total_value || 0).toFixed(2)}</span>
          </div>
        </div>

        {/* Delivery Instructions */}
        {order.delivery_instructions && (
          <div className="rounded-lg bg-amber-50/60 p-2.5 border border-amber-100">
            <div className="flex items-start gap-2">
              <MapPin size={12} className="shrink-0 mt-0.5 text-amber-600" />
              <p className="text-xs text-gray-700 leading-relaxed break-words">{order.delivery_instructions}</p>
            </div>
          </div>
        )}

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

        {/* Order Status Timeline */}
        <div className="rounded-lg bg-white p-3 border border-gray-200 shadow-sm">
          <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-2.5">Order Status Timeline</p>
          <OrderStatusTimeline order={order} />
        </div>

        {/* Cancellation - compact */}
        {(order.rejected_reason || order.cancelled_by_type) && (
          <div className="mt-3 p-2.5 bg-red-50/80 rounded-lg border border-red-200/60">
            <p className="text-[10px] font-semibold text-red-600 uppercase tracking-wide mb-1.5">Cancellation</p>
            {order.rejected_reason && (
              <p className="text-xs text-red-800 mb-1.5 leading-relaxed break-words">{order.rejected_reason}</p>
            )}
            {order.cancelled_by_type && (
              <p className="text-[10px] text-red-700">
                <span className="font-medium capitalize">{order.cancelled_by_type}</span>
                {order.cancelled_at && (
                  <span className="ml-1.5 text-red-600">• {formatTimeAgo(order.cancelled_at)}</span>
                )}
              </p>
            )}
          </div>
        )}


        {/* Action Buttons Card */}
        <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
          <ActionBtns
            order={order}
            onAccept={onAccept}
            onReject={onReject}
            onPreparing={onPreparing}
            onReady={onReady}
            onDispatch={onDispatch}
            onComplete={onComplete}
            onRto={onRto}
            loading={actionLoading}
            otpVerified={otpVerified}
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
  onDispatch,
  onComplete,
  onRto,
  onAddOrDeduct,
  loading,
  otpCode,
  otpType,
  otpVerified,
  onFetchOtp,
  statusLabel,
}: {
  order: OrdersFoodRow;
  selected: boolean;
  onClick: () => void;
  onAccept: () => void;
  onReject?: () => void;
  onPreparing: () => void;
  onReady: () => void;
  onDispatch: () => void;
  onComplete: () => void;
  onRto: () => void;
  onAddOrDeduct?: (order: OrdersFoodRow) => void;
  loading: boolean;
  otpCode?: string;
  otpType?: string;
  otpVerified?: boolean;
  onFetchOtp?: () => void;
  statusLabel?: string;
}) {
  const status = order.order_status || 'CREATED';
  const isNew = status === 'CREATED' || status === 'NEW';
  const value = Number(order.food_items_total_value || 0);
  const label = statusLabel ?? STATUS_LABEL[status] ?? status;

  return (
    <div
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(); } }}
      className={`rounded-lg border-2 p-3 sm:p-3.5 cursor-pointer transition-all overflow-hidden min-w-0 touch-manipulation active:scale-[0.99] ${
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
          <p className="text-xs text-gray-600 truncate">{order.restaurant_name || '—'}</p>
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
        <span>{order.food_items_count ?? 0} items</span>
        <span>•</span>
        <span className="font-semibold text-gray-900">₹{value.toFixed(0)}</span>
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
      {order.delivery_instructions && (
        <p className="text-xs text-amber-700 mb-2 flex items-center gap-1 truncate" title={order.delivery_instructions}>
          <AlertTriangle size={12} /> {order.delivery_instructions}
        </p>
      )}
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
      <div className="flex items-center justify-between mt-2 pt-2 border-t border-gray-100">
        <button
          onClick={(e) => {
            e.stopPropagation();
            onClick();
          }}
          className="text-xs font-medium text-orange-600 hover:text-orange-700 flex items-center gap-0.5"
        >
          Details <ChevronRight size={14} />
        </button>
        <ActionBtns
          order={order}
          onAccept={onAccept}
          onReject={onReject}
          onPreparing={onPreparing}
          onReady={onReady}
          onDispatch={onDispatch}
          onComplete={onComplete}
          onRto={onRto}
          onAddOrDeduct={onAddOrDeduct}
          loading={loading}
          otpVerified={otpVerified}
          compact
        />
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
  onDispatch,
  onRto,
  onComplete,
  onAddOrDeduct,
  loading,
  otpCode,
  otpType,
  otpVerified,
  onFetchOtp,
  statusLabel,
}: {
  order: OrdersFoodRow;
  selected: boolean;
  onClick: () => void;
  onAccept: () => void;
  onReject?: () => void;
  onPreparing: () => void;
  onReady: () => void;
  onDispatch: () => void;
  onRto: () => void;
  onComplete: () => void;
  onAddOrDeduct?: (order: OrdersFoodRow) => void;
  loading: boolean;
  otpCode?: string;
  otpType?: string;
  otpVerified?: boolean;
  onFetchOtp?: () => void;
  statusLabel?: string;
}) {
  const status = order.order_status || 'CREATED';
  const value = Number(order.food_items_total_value || 0);
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
        <p className="text-sm font-semibold text-gray-900 truncate">{order.restaurant_name || '—'}</p>
        <div className="flex items-center gap-3 mt-1">
          <span className="text-xs text-gray-500 flex items-center gap-1">
            <Clock size={11} />
            {formatTimeAgo(order.created_at)}
          </span>
          <span className="text-xs text-gray-600 font-medium">
            {order.food_items_count ?? 0} {order.food_items_count === 1 ? 'item' : 'items'}
          </span>
          <span className="text-xs font-bold text-gray-900">
            ₹{value.toFixed(0)}
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
          onDispatch={onDispatch}
          onComplete={onComplete}
          onRto={onRto}
          onAddOrDeduct={onAddOrDeduct}
          loading={loading}
          otpVerified={otpVerified}
          compact
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
  onDispatch,
  onComplete,
  onRto,
  onAddOrDeduct,
  loading,
  compact,
  otpVerified,
  topRightLayout,
  hideRtoMenu,
}: {
  order: OrdersFoodRow;
  onAccept: () => void;
  onReject?: () => void;
  onPreparing: () => void;
  onReady: () => void;
  onDispatch: () => void;
  onComplete: () => void;
  onRto?: () => void;
  onAddOrDeduct?: (order: OrdersFoodRow) => void;
  loading: boolean;
  compact?: boolean;
  otpVerified?: boolean;
  /** When true: actions at top-right, primary button full width, Reject/secondary half width */
  topRightLayout?: boolean;
  /** When true: do not render 3-dot RTO menu (e.g. when RTO is in header) */
  hideRtoMenu?: boolean;
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
          disabled={dis}
          className={`${btnBase} ${compact ? 'px-4 py-2 text-sm font-semibold' : 'px-5 py-2.5 text-base font-semibold'} ${primaryFull} bg-green-600 text-white hover:bg-green-700 hover:shadow-md border-green-700/20`}
        >
          Accept
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
  if (status === 'ACCEPTED') {
    return (
      <button
        onClick={(e) => { e.stopPropagation(); onPreparing(); }}
        disabled={dis}
        className={`${btnBase} ${topRightLayout ? 'w-full px-4 py-2.5 text-sm font-semibold' : ''} ${compact ? 'px-2.5 py-1.5 text-xs' : 'px-4 py-2 text-sm'} bg-amber-500 text-white hover:bg-amber-600 hover:shadow-md border-amber-600/20`}
      >
        Preparing
      </button>
    );
  }
  const RtoMenu = () => {
    if (!onRto || hideRtoMenu) return null;
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

  if (status === 'PREPARING') {
    return (
      <div className={`flex gap-2 items-center ${topRightLayout ? 'w-full' : 'flex-wrap'}`}>
        <button
          onClick={(e) => { e.stopPropagation(); onReady(); }}
          disabled={dis}
          className={`${btnBase} ${topRightLayout ? 'flex-[2] px-4 py-2.5 text-sm font-semibold' : ''} ${compact ? 'px-2.5 py-1.5 text-xs' : 'px-4 py-2 text-sm'} bg-emerald-600 text-white hover:bg-emerald-700 hover:shadow-md border-emerald-700/20`}
        >
          Ready
        </button>
        <RtoMenu />
      </div>
    );
  }
  if (status === 'READY_FOR_PICKUP') {
    return (
      <div className={`flex gap-2 items-center ${topRightLayout ? 'w-full' : 'flex-wrap'}`}>
        <button
          onClick={(e) => { e.stopPropagation(); onDispatch(); }}
          disabled={dis}
          className={`${btnBase} ${topRightLayout ? 'flex-[2] px-4 py-2.5 text-sm font-semibold' : ''} ${compact ? 'px-2.5 py-1.5 text-xs' : 'px-4 py-2 text-sm'} bg-purple-600 text-white hover:bg-purple-700 hover:shadow-md border-purple-700/20`}
        >
          Dispatch
        </button>
        <RtoMenu />
      </div>
    );
  }
  if (status === 'OUT_FOR_DELIVERY') {
    return (
      <div className={`flex gap-2 items-center ${topRightLayout ? 'w-full' : 'flex-wrap'}`}>
        <button
          onClick={(e) => { e.stopPropagation(); onComplete(); }}
          disabled={dis}
          className={`${btnBase} ${topRightLayout ? 'flex-[2] px-4 py-2.5 text-sm font-semibold' : ''} ${compact ? 'px-2.5 py-1.5 text-xs' : 'px-4 py-2 text-sm'} bg-green-600 text-white hover:bg-green-700 hover:shadow-md border-green-700/20`}
        >
          Complete
        </button>
        <RtoMenu />
      </div>
    );
  }
  if ((status === 'DELIVERED' || status === 'CANCELLED') && onAddOrDeduct) {
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
          <div className="absolute right-0 top-full mt-1 py-1 bg-white border border-gray-200 rounded-lg shadow-lg z-50 min-w-[180px]">
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onAddOrDeduct(order); setMenuOpen(false); }}
              disabled={dis}
              className="w-full text-left px-3 py-2 text-sm font-medium text-indigo-700 hover:bg-indigo-50 rounded-none first:rounded-t-lg last:rounded-b-lg flex items-center gap-2"
            >
              <Wallet size={16} />
              Add or deduct amount
            </button>
          </div>
        )}
      </div>
    );
  }
  return null;
}

export function StoreOrdersClient({ storeId }: { storeId: string }) {
  return (
    <Suspense fallback={<PageSkeletonOrders />}>
      <OrdersPageContent storeId={storeId} />
    </Suspense>
  );
}
