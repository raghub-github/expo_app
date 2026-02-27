'use client';

import React, { useEffect, useState, useCallback, useRef, Suspense } from 'react';
import { createPortal } from 'react-dom';
import { useSearchParams, useRouter } from 'next/navigation';
import { MXLayoutWhite } from '@/components/MXLayoutWhite';
import { Toaster, toast } from 'sonner';
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
  Sparkles,
  LayoutGrid,
  List,
  Phone,
  MapPin,
  SlidersHorizontal,
  Loader2,
  Power,
  Check,
  User,
  Bike,
  MoreVertical,
} from 'lucide-react';
import { useFoodOrders, type OrdersFoodRow, type FoodOrderStats } from '@/hooks/useFoodOrders';
import { PageSkeletonOrders } from '@/components/PageSkeleton';
import { fetchStoreById } from '@/lib/database';
import { MerchantStore } from '@/lib/merchantStore';
import { DEMO_RESTAURANT_ID } from '@/lib/constants';
import { createClient } from '@/lib/supabase/client';
import { MobileHamburgerButton } from '@/components/MobileHamburgerButton';

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
  const [store, setStore] = useState<MerchantStore | null>(null);
  const [storeId, setStoreId] = useState<string | null>(null);
  const [storeInternalId, setStoreInternalId] = useState<number | null>(null);
  const [orders, setOrders] = useState<OrdersFoodRow[]>([]);
  const [stats, setStats] = useState<FoodOrderStats | null>(null);
  const [filter, setFilter] = useState<string>('all');
  const [selectedOrder, setSelectedOrder] = useState<OrdersFoodRow | null>(null);
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
  const [openingTimeForClose, setOpeningTimeForClose] = useState('09:00');
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

  const [filterDrawerOpen, setFilterDrawerOpen] = useState(false);
  const hasNotifiedNew = useRef<Set<number>>(new Set());

  const updateUrlParams = useCallback((updates: { filter?: string; orderId?: string | null }) => {
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

  const handleFilterChange = useCallback((f: string) => {
    setFilter(f);
    setRightPanelOpen(false);
    setSelectedOrder(null);
    setFilterDrawerOpen(false);
    updateUrlParams({ filter: f, orderId: null });
  }, [updateUrlParams]);
  const { subscribe } = useFoodOrders(storeId, storeInternalId);
  const playNewOrderSound = useNewOrderSound(notifyEnabled);

  useEffect(() => {
    let id = searchParams?.get('storeId') || searchParams?.get('store_id');
    if (!id && typeof window !== 'undefined') id = localStorage.getItem('selectedStoreId');
    if (!id) id = DEMO_RESTAURANT_ID;
    setStoreId(id);
  }, [searchParams]);

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

  useEffect(() => {
    if (!storeId) return;
    (async () => {
      const s = await fetchStoreById(storeId);
      if (s) {
        setStore(s as MerchantStore);
        setStoreInternalId((s as MerchantStore).id);
        const ms = s as MerchantStore;
        setIsStoreOpen(ms.operational_status === 'OPEN' || !!ms.is_accepting_orders);
      }
    })();
  }, [storeId]);

  const fetchStoreStatus = useCallback(async () => {
    if (!storeId) return;
    try {
      const res = await fetch(`/api/store-operations?store_id=${encodeURIComponent(storeId)}`);
      const data = await res.json();
      if (data.operational_status !== undefined) {
        setIsStoreOpen(data.operational_status === 'OPEN');
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
    try {
      const res = await fetch(`/api/food-orders?store_id=${encodeURIComponent(storeId)}&limit=200`);
      const data = await res.json();
      if (res.ok) {
        if (Array.isArray(data.orders)) {
          console.log(`[FoodOrders] Loaded ${data.orders.length} orders for store ${storeId}`);
          setOrders(data.orders);
        } else {
          console.warn('[FoodOrders] Invalid response format:', data);
          setOrders([]);
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
  }, [storeId]);

  const fetchStats = useCallback(async () => {
    if (!storeId) return;
    try {
      const res = await fetch(`/api/food-orders/stats?store_id=${encodeURIComponent(storeId)}`);
      const data = await res.json();
      if (res.ok) setStats(data);
    } catch {}
  }, [storeId]);

  useEffect(() => {
    fetchOrders();
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
              toast.success(`New Order ${displayId}`, { duration: 5000 });
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
        const res = await fetch(`/api/food-orders/${orderId}/otp?store_id=${encodeURIComponent(storeId)}`);
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
        const res = await fetch(`/api/food-orders/${orderId}/validate-otp`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ store_id: storeId, otp: otpInput.trim() }),
        });
        const data = await res.json();
        if (data.valid) {
          setOtpVerified((prev) => new Set(prev).add(orderId));
          toast.success('OTP verified');
        } else {
          toast.error(data.error || 'Invalid OTP');
        }
      } catch {
        toast.error('Validation failed');
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
        toast.error(data.error || 'Failed to open store');
      }
    } catch {
      toast.error('Failed to open store');
    } finally {
      setTurnOnLoading(false);
    }
  }, [storeId]);

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
    fetch(`/api/store-operations?store_id=${encodeURIComponent(storeId)}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.today_slots?.[0]?.start) setOpeningTimeForClose(data.today_slots[0].start);
      })
      .catch(() => {});
  }, [showStoreCloseModal, storeId]);

  const formatTimeHMS = useCallback((t: string) => {
    if (!t) return '00:00:00';
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
    } else if (closeClosureType === 'today') {
      const [h, m] = openingTimeForClose.split(':').map(Number);
      const tomorrowOpen = new Date(now);
      tomorrowOpen.setDate(tomorrowOpen.getDate() + 1);
      tomorrowOpen.setHours(h, m, 0, 0);
      durationMinutes = Math.max(1, Math.round((tomorrowOpen.getTime() - now.getTime()) / (1000 * 60)));
    }
    const reasonText = closeReason === 'Other' ? (closeReasonOther?.trim() || 'Other') : closeReason;
    const body: { store_id: string; action: string; closure_type: string; duration_minutes?: number; close_reason?: string } = {
      store_id: storeId,
      action: 'manual_close',
      closure_type: closeClosureType,
      close_reason: reasonText,
    };
    if (durationMinutes != null) body.duration_minutes = durationMinutes;
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
        } else toast.success(`Store closed for today. Reopens tomorrow at ${openingTimeForClose}`);
      } else {
        toast.error(data.error || 'Failed to close store');
      }
    } catch {
      toast.error('Failed to close store');
    } finally {
      setCloseConfirmLoading(false);
    }
  }, [storeId, closeClosureType, closeClosureDate, closeClosureTime, closeReason, closeReasonOther, openingTimeForClose]);

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

  const updateStatus = useCallback(
    async (order: OrdersFoodRow, newStatus: string, extra?: { rejected_reason?: string }) => {
      setActionLoading(order.id);
      const payload = { store_id: storeId, status: newStatus, ...extra };

      const tryUpdate = async (): Promise<{ ok: boolean; data: unknown }> => {
        const res = await fetch(`/api/food-orders/${order.id}`, {
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
          toast.error((result.data as { error?: string })?.error || 'Failed to update');
          return;
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
        toast.success(`Order status updated to ${newStatus}`);
      } catch {
        toast.error('Failed to update order');
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

  const counts: Record<string, number> = {};
  orders.forEach((o) => {
    const s = norm(o.order_status);
    counts[s] = (counts[s] || 0) + 1;
  });

  if (loading && orders.length === 0) {
    return (
      <MXLayoutWhite restaurantName={store?.store_name} restaurantId={storeId || ''} leftSidebarCollapsed>
        <PageSkeletonOrders />
      </MXLayoutWhite>
    );
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
    <MXLayoutWhite restaurantName={store?.store_name} restaurantId={storeId || ''} leftSidebarCollapsed mobileMenuExtra={mobileStatsExtra}>
      <Toaster position="top-right" richColors />
      <div className="flex h-full min-h-0 bg-gray-50 relative flex-col">
        {/* Header: full width, extends over sidebar area so controls align with right sidebar */}
        <header id="food-orders-header" className="sticky top-0 z-20 bg-white border-b border-gray-200 shrink-0">
          <div className="w-full px-3 sm:px-4 py-2 sm:py-3">
            {/* Mobile: 2 rows (Row 1 = Today+Active, Row 2 = Filter + status + sound). Desktop: single row */}
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2 md:gap-0">
              {/* Row 1 (mobile) / Left (desktop): On mobile Today+Active on right. On desktop title + all stats on left */}
              <div className="flex items-center justify-end md:justify-start md:flex-1 md:items-center md:gap-3 min-w-0 overflow-x-auto hide-scrollbar">
                {/* Hamburger menu on left (mobile) */}
                <div className="md:hidden mr-2">
                  <MobileHamburgerButton />
                </div>
                {/* Title - always visible on desktop */}
                <div className="hidden md:flex items-center gap-2 shrink-0">
                  <Sparkles className="w-5 h-5 text-orange-500 shrink-0" />
                  <h1 className="text-lg font-bold text-gray-900 whitespace-nowrap">Food Orders</h1>
                </div>
                {stats && (
                  <div className="flex items-center gap-2 shrink-0">
                    <StatBadge label="Today" value={String(stats.ordersToday)} />
                    <StatBadge label="Active" value={String(stats.activeOrders)} accent />
                  </div>
                )}
                {stats && (
                  <div className="hidden md:flex items-center gap-2 sm:gap-3 shrink-0">
                    <StatBadge label="Avg Prep" value={`${stats.avgPreparationTimeMinutes}m`} />
                    <StatBadge label="Revenue" value={`₹${stats.totalRevenueToday.toFixed(0)}`} />
                    <StatBadge label="Completion" value={`${stats.completionRatePercent}%`} />
                  </div>
                )}
              </div>
              {/* Row 2 (mobile) / Right (desktop): Filter, status button, sound (+ grid toggle on desktop) */}
              <div className="flex items-center justify-end gap-1.5 sm:gap-2 shrink-0 lg:w-64 lg:pl-4">
                <button
                  onClick={() => setFilterDrawerOpen(true)}
                  className="lg:hidden flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-gray-100 text-gray-700 hover:bg-gray-200 border border-gray-200 whitespace-nowrap"
                  title="Filter orders"
                >
                  <SlidersHorizontal size={14} />
                  Filter
                </button>
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
        </header>

        <div className="flex flex-1 min-h-0 lg:pr-64 overflow-hidden">
          <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
          <div className="flex flex-col lg:flex-row flex-1 min-h-0 overflow-hidden">
            {/* Desktop (lg+): When order open, split layout. Mobile: full-screen overlay on card click */}
            {rightPanelOpen && selectedOrder ? (
              <>
                {/* Order details: single card, actions top-right, reject half width, space used evenly */}
                <div className="hidden lg:flex flex-1 min-w-0 border-r border-gray-200 bg-gray-50/80 flex-col overflow-hidden order-1 p-3">
                <div className="flex-1 overflow-y-auto min-h-0 hide-scrollbar overflow-x-hidden">
                  <div className="bg-white rounded-xl border border-gray-200/80 shadow-md overflow-hidden flex flex-col h-full min-h-[320px]">
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
                                    <RiderTimeline riderId={selectedOrder.rider_id} orderId={selectedOrder.order_id} />
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
                  </div>
                </div>
              </div>

                {/* Mobile: Order details panel beside sidebar - card-based layout */}
                <div className="lg:hidden flex-1 min-w-0 flex flex-col overflow-hidden order-1">
                  <OrderDetailMobile
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

                {/* Right: Cards column - desktop only when order open (hidden on mobile) */}
                <div className="hidden lg:flex w-64 shrink-0 flex-col overflow-hidden pl-4 order-2">
                  <div className="flex-1 overflow-y-auto overflow-x-hidden min-h-0 hide-scrollbar">
                    <div className="space-y-3 pr-1">
                      {filteredOrders.map((order) => (
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
                          loading={actionLoading === order.id}
                          otpCode={otpCache[order.id]?.otp_code}
                          otpType={otpCache[order.id]?.otp_type}
                          otpVerified={otpVerified.has(order.id)}
                          onFetchOtp={() => fetchOtp(order.id)}
                          statusLabel={STATUS_LABEL[order.order_status || 'CREATED'] || order.order_status}
                        />
                      ))}
                    </div>
                    {filteredOrders.length === 0 && (
                      <div className="flex flex-col items-center justify-center py-16 text-gray-500">
                        <Package className="w-12 h-12 mb-3 opacity-50" />
                        <p className="text-sm font-medium">No orders in this filter</p>
                      </div>
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
                {filteredOrders.map((order) => (
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
                {filteredOrders.map((order) => (
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
                    otpCode={otpCache[order.id]?.otp_code}
                    otpType={otpCache[order.id]?.otp_type}
                    otpVerified={otpVerified.has(order.id)}
                    onFetchOtp={() => fetchOtp(order.id)}
                    statusLabel={STATUS_LABEL[order.order_status || 'CREATED'] || order.order_status}
                  />
                ))}
                {filteredOrders.length === 0 && (
                  <div className="flex flex-col items-center justify-center py-16 text-gray-500">
                    <Package className="w-12 h-12 mb-3 opacity-50" />
                    <p className="text-sm font-medium">No orders in this filter</p>
                  </div>
                )}
              </div>
              )}
              {filteredOrders.length === 0 && (
                <div className="flex flex-col items-center justify-center py-16 text-gray-500">
                  <Package className="w-12 h-12 mb-3 opacity-50" />
                  <p className="text-sm font-medium">No orders in this filter</p>
                </div>
              )}
            </div>
              </>
            )}

            {/* Right filters sidebar - fixed on right, starts below header */}
            <div className="hidden lg:flex fixed right-0 top-16 bottom-0 w-64 flex-col border-l border-gray-200 bg-white shadow-lg z-30">
              <div className="flex-1 overflow-y-auto hide-scrollbar p-3 pb-20 space-y-1">
                <button
                  onClick={() => handleFilterChange('all')}
                  className={`w-full text-left px-3 py-2 rounded-lg text-sm font-medium ${
                    filter === 'all' ? 'bg-orange-100 text-orange-700' : 'text-gray-700 hover:bg-gray-100'
                  }`}
                >
                  All ({orders.length})
                </button>
                <button
                  onClick={() => handleFilterChange('active')}
                  className={`w-full text-left px-3 py-2 rounded-lg text-sm font-medium flex items-center justify-between ${
                    filter === 'active' ? 'bg-orange-100 text-orange-700' : 'text-gray-700 hover:bg-gray-100'
                  }`}
                >
                  Active
                  <span className="bg-orange-500 text-white text-xs px-2 py-0.5 rounded-full">
                    {orders.filter((o) =>
                      ['CREATED', 'NEW', 'ACCEPTED', 'PREPARING', 'READY_FOR_PICKUP', 'OUT_FOR_DELIVERY', 'RTO'].includes(
                        o.order_status || 'CREATED'
                      )
                    ).length}
                  </span>
                </button>
                {STATUS_FILTERS.map((f) => (
                  <button
                    key={f.id}
                    onClick={() => handleFilterChange(f.id)}
                    className={`w-full text-left px-3 py-2 rounded-lg text-sm font-medium flex items-center justify-between ${
                      filter === f.id ? 'bg-orange-100 text-orange-700' : 'text-gray-600 hover:bg-gray-100'
                    }`}
                  >
                    {f.label}
                    {(counts[f.id] || 0) > 0 && (
                      <span className="text-xs bg-gray-200 text-gray-700 px-1.5 py-0.5 rounded">
                        {counts[f.id]}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </div>
          </div>
          </div>
        </div>
      </div>

      {/* Mobile filter drawer */}
      {filterDrawerOpen && (
        <>
          <div className="fixed inset-0 bg-black/40 z-40 lg:hidden" onClick={() => setFilterDrawerOpen(false)} />
          <div className="fixed top-0 right-0 bottom-0 w-64 max-w-[85vw] min-w-[240px] bg-white border-l border-gray-200 z-50 lg:hidden overflow-y-auto hide-scrollbar shadow-xl" style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom, 0px))' }}>
            <div className="p-4 flex items-center justify-between border-b border-gray-200 sticky top-0 bg-white">
              <h3 className="font-semibold text-gray-900">Filter by status</h3>
              <button onClick={() => setFilterDrawerOpen(false)} className="p-2 hover:bg-gray-100 rounded-lg">
                <X size={18} />
              </button>
            </div>
            <div className="p-3 space-y-1">
              <button
                onClick={() => handleFilterChange('all')}
                className={`w-full text-left px-3 py-2 rounded-lg text-sm font-medium ${
                  filter === 'all' ? 'bg-orange-100 text-orange-700' : 'text-gray-700 hover:bg-gray-100'
                }`}
              >
                All ({orders.length})
              </button>
              <button
                onClick={() => handleFilterChange('active')}
                className={`w-full text-left px-3 py-2 rounded-lg text-sm font-medium flex items-center justify-between ${
                  filter === 'active' ? 'bg-orange-100 text-orange-700' : 'text-gray-700 hover:bg-gray-100'
                }`}
              >
                Active
                <span className="bg-orange-500 text-white text-xs px-2 py-0.5 rounded-full">
                  {orders.filter((o) =>
                    ['CREATED', 'NEW', 'ACCEPTED', 'PREPARING', 'READY_FOR_PICKUP', 'OUT_FOR_DELIVERY', 'RTO'].includes(
                      o.order_status || 'CREATED'
                    )
                  ).length}
                </span>
              </button>
              {STATUS_FILTERS.map((f) => (
                <button
                  key={f.id}
                  onClick={() => handleFilterChange(f.id)}
                  className={`w-full text-left px-3 py-2 rounded-lg text-sm font-medium flex items-center justify-between ${
                    filter === f.id ? 'bg-orange-100 text-orange-700' : 'text-gray-600 hover:bg-gray-100'
                  }`}
                >
                  {f.label}
                  {(counts[f.id] || 0) > 0 && (
                    <span className="text-xs bg-gray-200 text-gray-700 px-1.5 py-0.5 rounded">
                      {counts[f.id]}
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>
        </>
      )}

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
                  <p className="text-xs text-gray-600">Reopen tomorrow at {formatTimeHMS(openingTimeForClose)}</p>
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

function RiderTimeline({ riderId, orderId }: { riderId: number | null | undefined; orderId: number }) {
  const [riderAssignment, setRiderAssignment] = useState<any>(null);
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
                  <RiderTimeline riderId={order.rider_id} orderId={order.order_id} />
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
