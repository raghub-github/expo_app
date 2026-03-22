"use client";
import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useSearchParams, useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/rider-dashboard/supabaseClient';
import { useDashboardAccessQuery } from '@/hooks/queries/useDashboardAccessQuery';
import { usePermissionsQuery } from '@/hooks/queries/usePermissionsQuery';
import { useRiderDashboard } from '@/context/RiderDashboardContext';
import { queryKeys } from '@/lib/queryKeys';
import { invalidateRiderSummary } from '@/lib/cache-invalidation';
import { useRiderSummaryQuery } from '@/hooks/queries/useRiderSummaryQuery';
import { useRiderAccessQuery } from '@/hooks/queries/useRiderAccessQuery';
import type { RiderListEntry, RiderSummary } from '@/types/rider-dashboard';
import { ONBOARDING_STAGE_LABELS } from '@/types/rider-dashboard';
import type { RiderSummaryParams } from '@/lib/queryKeys';
import Link from 'next/link';
import { CheckCircle, Circle, Filter, ChevronDown, ChevronUp, ShieldCheck, ShieldOff, Clock, User, Wallet, Lock, Unlock, History, Plus, RotateCcw, RefreshCw, MoreVertical, Banknote, Trash2, Check, X } from 'lucide-react';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { TablePagination } from '@/components/riders/TablePagination';
import { AddAmountModal } from '@/components/riders/AddAmountModal';

// Simple in-memory cache for rider search results across renders/sessions.
const riderSearchCache = new Map<string, RiderListEntry[]>();

function useDebouncedValue<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const handle = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(handle);
  }, [value, delay]);

  return debounced;
}

/** Wallet credit request row (add amount) for display on rider info */
interface WalletCreditRequestRow {
  id: number;
  riderId: number;
  orderId?: number;
  serviceType?: string;
  amount: number;
  reason: string;
  status: string;
  requestedBySystemUserId?: number;
  requestedByEmail?: string;
  requestedAt: string;
  reviewedByEmail?: string;
  reviewedAt?: string;
  reviewNote?: string;
}

export default function RidersPage() {
  // ALL HOOKS MUST BE CALLED FIRST - BEFORE ANY CONDITIONAL RETURNS
  const { data: permissionsData, isLoading: permissionsLoading, error: permissionsError } = usePermissionsQuery();
  const { data: dashboardAccessData, isLoading: dashboardAccessLoading, error: dashboardAccessError } = useDashboardAccessQuery();
  const searchParams = useSearchParams();
  const router = useRouter();
  const queryClient = useQueryClient();

  const isSuperAdmin = permissionsData?.isSuperAdmin ?? false;
  const exists = permissionsData?.exists ?? false;

  // Server layout already ran requireDashboardAccess("RIDER"); we use client data only for "User not found" and granular UI.
  const hasCachedPermissions = permissionsData != null;
  const hasCachedDashboardAccess = dashboardAccessData != null;
  const accessLoading = (permissionsLoading && !hasCachedPermissions) || (dashboardAccessLoading && !hasCachedDashboardAccess);

  // Rider state lives in context so it persists when navigating to Penalties, Orders, etc.
  const {
    riders,
    riderSummary,
    loading,
    summaryLoading,
    loadingSection,
    error,
    hasSearched,
    showDefault,
    setRiders,
    setRiderSummary,
    setLoading,
    setSummaryLoading,
    setLoadingSection,
    setError,
    setHasSearched,
    setShowDefault,
    setCurrentRiderFromSearch,
    clearRider,
  } = useRiderDashboard();

  // Filter states for each section
  const [ordersLimit, setOrdersLimit] = useState(10);
  const [ordersFrom, setOrdersFrom] = useState('');
  const [ordersTo, setOrdersTo] = useState('');
  const [showOrdersFilters, setShowOrdersFilters] = useState(false);
  const [showOrdersMoreFilters, setShowOrdersMoreFilters] = useState(false);
  const [ordersOrderType, setOrdersOrderType] = useState<string>('all');
  const [ordersStatus, setOrdersStatus] = useState<string>('all');
  const [ordersOrderIdSearch, setOrdersOrderIdSearch] = useState('');
  const [withdrawalsLimit, setWithdrawalsLimit] = useState(10);
  const [withdrawalsFrom, setWithdrawalsFrom] = useState('');
  const [withdrawalsTo, setWithdrawalsTo] = useState('');
  const [ticketsLimit, setTicketsLimit] = useState(10);
  const [ticketsFrom, setTicketsFrom] = useState('');
  const [ticketsTo, setTicketsTo] = useState('');
  const [showTicketsFilters, setShowTicketsFilters] = useState(false);
  const [showTicketsMoreFilters, setShowTicketsMoreFilters] = useState(false);
  const [ticketsStatus, setTicketsStatus] = useState<string>('all');
  const [ticketsCategory, setTicketsCategory] = useState<string>('all');
  const [ticketsPriority, setTicketsPriority] = useState<string>('all');
  const [ticketsSearch, setTicketsSearch] = useState('');
  const [penaltiesLimit, setPenaltiesLimit] = useState(10);
  const [penaltiesFrom, setPenaltiesFrom] = useState('');
  const [penaltiesTo, setPenaltiesTo] = useState('');
  const [showPenaltiesFilters, setShowPenaltiesFilters] = useState(false);
  const [showPenaltiesMoreFilters, setShowPenaltiesMoreFilters] = useState(false);
  const [penaltiesStatus, setPenaltiesStatus] = useState<string>('all'); // 'all' | 'reverted' | 'not'
  const [penaltiesServiceType, setPenaltiesServiceType] = useState<string>('all'); // 'all' | 'food' | 'parcel' | 'person_ride'
  const [penaltiesOrderIdSearch, setPenaltiesOrderIdSearch] = useState('');
  const [vehicleOpen, setVehicleOpen] = useState(false);
  const [ordersPage, setOrdersPage] = useState(1);
  const [ordersPageSize, setOrdersPageSize] = useState(10);
  const [ticketsPage, setTicketsPage] = useState(1);
  const [ticketsPageSize, setTicketsPageSize] = useState(10);
  const [penaltiesPage, setPenaltiesPage] = useState(1);
  const [penaltiesPageSize, setPenaltiesPageSize] = useState(10);
  const [withdrawalsPage, setWithdrawalsPage] = useState(1);
  const [withdrawalsPageSize, setWithdrawalsPageSize] = useState(10);

  useEffect(() => { setOrdersPage(1); }, [ordersPageSize, ordersFrom, ordersTo, ordersOrderType, ordersStatus, ordersOrderIdSearch]);
  useEffect(() => { setTicketsPage(1); }, [ticketsPageSize, ticketsFrom, ticketsTo, ticketsStatus, ticketsCategory, ticketsPriority, ticketsSearch]);
  useEffect(() => { setPenaltiesPage(1); }, [penaltiesPageSize, penaltiesFrom, penaltiesTo, penaltiesStatus, penaltiesServiceType, penaltiesOrderIdSearch]);
  useEffect(() => { setWithdrawalsPage(1); }, [withdrawalsPageSize, withdrawalsFrom, withdrawalsTo]);

  const formatWalletNum = (v: string | number | null | undefined) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  };

  // Check if user has rider access
  const hasRiderAccess = dashboardAccessData?.dashboards.some(
    (d) => d.dashboardType === "RIDER" && d.isActive
  ) ?? false;

  const riderId = riders[0]?.id ?? null;
  // Use page size (Rows dropdown) as API limit so changing Rows refetches with new limit
  const summaryParams: RiderSummaryParams = {
    ordersLimit: ordersPageSize,
    ordersFrom,
    ordersTo,
    ordersOrderType,
    ordersStatus,
    ordersOrderId: ordersOrderIdSearch.trim() || '',
    withdrawalsLimit: withdrawalsPageSize,
    withdrawalsFrom,
    withdrawalsTo,
    ticketsLimit: ticketsPageSize,
    ticketsFrom,
    ticketsTo,
    ticketsStatus,
    ticketsCategory,
    ticketsPriority,
    penaltiesLimit: penaltiesPageSize,
    penaltiesFrom,
    penaltiesTo,
    penaltiesStatus,
    penaltiesServiceType,
    penaltiesOrderId: penaltiesOrderIdSearch.trim() || '',
  };

  // TanStack Query: rider summary (cached by riderId + params; refetches when params change)
  const {
    data: summaryData,
    isLoading: summaryQueryLoading,
    isFetching: summaryQueryFetching,
    refetch: refetchRiderSummary,
  } = useRiderSummaryQuery(riderId, summaryParams);

  const { data: riderAccess } = useRiderAccessQuery();
  const canAddPenaltyAny =
    (riderAccess?.canAddPenalty?.food ||
      riderAccess?.canAddPenalty?.parcel ||
      riderAccess?.canAddPenalty?.person_ride) ??
    false;
  const canAddPenaltyForService = (s: string) => {
    const svc = s === 'person_ride' ? 'person_ride' : s === 'parcel' ? 'parcel' : 'food';
    return riderAccess?.canAddPenalty?.[svc] ?? false;
  };
  const canRevertPenaltyForService = (s: string) => {
    const svc = s === 'person_ride' ? 'person_ride' : s === 'parcel' ? 'parcel' : 'food';
    return riderAccess?.canRevertPenalty?.[svc] ?? false;
  };
  const canBlockForService = (s: 'food' | 'parcel' | 'person_ride' | 'all') =>
    s === 'all'
      ? (riderAccess?.canBlock?.food || riderAccess?.canBlock?.parcel || riderAccess?.canBlock?.person_ride) ?? false
      : (riderAccess?.canBlock?.[s] ?? false);
  const canUnblockForService = (s: 'food' | 'parcel' | 'person_ride' | 'all') =>
    s === 'all'
      ? (riderAccess?.canUnblock?.food || riderAccess?.canUnblock?.parcel || riderAccess?.canUnblock?.person_ride) ?? false
      : (riderAccess?.canUnblock?.[s] ?? false);
  const canFreezeWallet = riderAccess?.canFreezeWallet ?? false;

  // Blacklist modal: which service and action (whitelist / blacklist)
  const [blacklistModal, setBlacklistModal] = useState<{
    service: 'food' | 'parcel' | 'person_ride' | 'all';
    action: 'blacklist' | 'whitelist';
  } | null>(null);
  const [blacklistReason, setBlacklistReason] = useState('');
  const [blacklistPermanent, setBlacklistPermanent] = useState(true);
  const [blacklistDurationHours, setBlacklistDurationHours] = useState<number>(24);
  const [blacklistSubmitting, setBlacklistSubmitting] = useState(false);
  const [blacklistError, setBlacklistError] = useState<string | null>(null);
  const [blacklistLoadingService, setBlacklistLoadingService] = useState<'food' | 'parcel' | 'person_ride' | 'all' | null>(null);

  // Wallet freeze: modal and action state
  const [walletFreezeModal, setWalletFreezeModal] = useState<'freeze' | 'unfreeze' | null>(null);
  const [walletFreezeReason, setWalletFreezeReason] = useState('');
  const [walletFreezeSubmitting, setWalletFreezeSubmitting] = useState(false);
  const [walletFreezeError, setWalletFreezeError] = useState<string | null>(null);
  const [walletFreezeHistoryOpen, setWalletFreezeHistoryOpen] = useState(false);
  const [walletFreezeHistory, setWalletFreezeHistory] = useState<{ action: string; reason: string | null; createdAt: string; performedByEmail: string | null; performedByName: string | null }[]>([]);

  // Add Penalty modal (home dashboard)
  const [addPenaltyModalOpen, setAddPenaltyModalOpen] = useState(false);
  const [addPenaltyForm, setAddPenaltyForm] = useState({ amount: '', reason: '', serviceType: '' as string, penaltyType: 'other' as string, orderId: '', penaltyPercent: 100 });
  const [addPenaltySubmitting, setAddPenaltySubmitting] = useState(false);
  const [addPenaltyError, setAddPenaltyError] = useState<string | null>(null);
  // Add Penalty from order (pre-fill orderId + serviceType + orderValue for % flow)
  const [addPenaltyFromOrder, setAddPenaltyFromOrder] = useState<{ orderId: number; orderType: string; orderValue?: number } | null>(null);
  // Revert penalty modal
  const [revertPenaltyId, setRevertPenaltyId] = useState<number | null>(null);
  const [revertReason, setRevertReason] = useState('');
  const [revertSubmitting, setRevertSubmitting] = useState(false);
  const [revertError, setRevertError] = useState<string | null>(null);
  const [expandedPenaltyId, setExpandedPenaltyId] = useState<number | null>(null);
  // Order row menu (3-dot)
  const [openOrderMenuId, setOpenOrderMenuId] = useState<number | null>(null);
  const [orderMenuPosition, setOrderMenuPosition] = useState<{ top: number; left: number } | null>(null);
  // Add Amount (wallet credit request) from order
  const [addAmountFromOrder, setAddAmountFromOrder] = useState<{ orderId: number; orderType: string } | null>(null);
  // Add Amount (wallet credit request) manual (non-order)
  const [addAmountManualOpen, setAddAmountManualOpen] = useState(false);
  const [pendingCreditOrderIds, setPendingCreditOrderIds] = useState<Set<number>>(new Set());
  // Add amount requests for current rider (all statuses) – shown on rider home behind "View" option
  const [creditRequestsForRider, setCreditRequestsForRider] = useState<WalletCreditRequestRow[]>([]);
  const [creditRequestsLoading, setCreditRequestsLoading] = useState(false);
  const [deletingCreditRequestId, setDeletingCreditRequestId] = useState<number | null>(null);
  const [actioningCreditRequestId, setActioningCreditRequestId] = useState<number | null>(null);
  const [rejectCreditRequestModal, setRejectCreditRequestModal] = useState<{ id: number; reason: string } | null>(null);
  const [creditRequestsModalOpen, setCreditRequestsModalOpen] = useState(false);

  const PENALTY_TYPES = ['cancellation', 'fraud', 'extra_charges', 'late_delivery', 'customer_complaint', 'order_mistake', 'other'] as const;

  const handleAddPenaltySubmit = useCallback(async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!riderId) return;
    const reason = addPenaltyForm.reason.trim();
    if (!reason) {
      setAddPenaltyError('Reason for imposing the penalty is required.');
      return;
    }
    const fromOrder = addPenaltyFromOrder?.orderValue != null;
    const amount = fromOrder
      ? (addPenaltyFromOrder!.orderValue! * addPenaltyForm.penaltyPercent) / 100
      : parseFloat(addPenaltyForm.amount);
    if (!(amount > 0)) {
      setAddPenaltyError(fromOrder ? 'Order value is zero; cannot impose penalty.' : 'Amount must be positive.');
      return;
    }
    const orderId = fromOrder
      ? addPenaltyFromOrder!.orderId
      : (() => { const raw = addPenaltyForm.orderId.trim(); return raw ? parseInt(raw, 10) : undefined; })();
    if (orderId !== undefined && (Number.isNaN(orderId) || orderId < 1)) {
      setAddPenaltyError('Order ID must be a positive number if provided.');
      return;
    }
    if (!fromOrder) {
      const svc = addPenaltyForm.serviceType?.trim();
      if (!svc || !['food', 'parcel', 'person_ride'].includes(svc)) {
        setAddPenaltyError('Please select a service (Food, Parcel, or Person Ride).');
        return;
      }
    }
    setAddPenaltyError(null);
    setAddPenaltySubmitting(true);
    try {
      const res = await fetch(`/api/riders/${riderId}/penalties`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          amount: Math.round(amount * 100) / 100,
          reason,
          serviceType: fromOrder ? addPenaltyFromOrder!.orderType : (addPenaltyForm.serviceType && ['food', 'parcel', 'person_ride'].includes(addPenaltyForm.serviceType) ? addPenaltyForm.serviceType : null),
          penaltyType: 'other',
          ...(orderId != null && !Number.isNaN(orderId) ? { orderId } : {}),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setAddPenaltyError(data.error || 'Failed to add penalty');
        return;
      }
      setAddPenaltyModalOpen(false);
      setAddPenaltyFromOrder(null);
      setAddPenaltyForm({ amount: '', reason: '', serviceType: '', penaltyType: 'other', orderId: '', penaltyPercent: 100 });
      if (riderId) invalidateRiderSummary(queryClient, riderId);
      await refetchRiderSummary();
    } catch (err) {
      setAddPenaltyError(err instanceof Error ? err.message : 'Failed to add penalty');
    } finally {
      setAddPenaltySubmitting(false);
    }
  }, [riderId, queryClient, addPenaltyForm, addPenaltyFromOrder, refetchRiderSummary]);

  const handleRevertSubmit = useCallback(async () => {
    if (!riderId || revertPenaltyId == null) return;
    const reason = revertReason.trim();
    if (!reason) {
      setRevertError('Reason for revert is required.');
      return;
    }
    setRevertError(null);
    setRevertSubmitting(true);
    try {
      const res = await fetch(`/api/riders/${riderId}/penalties/${revertPenaltyId}/revert`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ reason }),
      });
      const data = await res.json();
      if (!res.ok) {
        setRevertError(data.error || 'Failed to revert penalty');
        return;
      }
      setRevertPenaltyId(null);
      setRevertReason('');
      if (riderId) invalidateRiderSummary(queryClient, riderId);
      await refetchRiderSummary();
    } catch (err) {
      setRevertError(err instanceof Error ? err.message : 'Failed to revert penalty');
    } finally {
      setRevertSubmitting(false);
    }
  }, [riderId, queryClient, revertPenaltyId, revertReason, refetchRiderSummary]);

  // Sync query data to context so sub-pages (Penalties, Orders, etc.) get currentRiderInfo
  useEffect(() => {
    if (summaryData) setRiderSummary(summaryData as RiderSummary);
  }, [summaryData, setRiderSummary]);

  // Fetch pending wallet credit request order IDs for badge
  useEffect(() => {
    if (!riderId) {
      setPendingCreditOrderIds(new Set());
      return;
    }
    fetch(`/api/wallet-credit-requests?riderId=${riderId}&status=pending`, { credentials: "include" })
      .then(async (res) => {
        const ct = res.headers.get("content-type") ?? "";
        if (!ct.includes("application/json")) return { success: false, data: [] };
        const text = await res.text();
        try {
          return text ? JSON.parse(text) : { success: false, data: [] };
        } catch {
          return { success: false, data: [] };
        }
      })
      .then((json) => {
        if (json?.success && Array.isArray(json.data)) {
          const ids = new Set<number>();
          for (const r of json.data) {
            if (r.orderId != null) ids.add(r.orderId);
          }
          setPendingCreditOrderIds(ids);
        } else {
          setPendingCreditOrderIds(new Set());
        }
      })
      .catch(() => setPendingCreditOrderIds(new Set()));
  }, [riderId]);

  // Fetch all add amount (wallet credit) requests for current rider – so agents see who already requested
  const refetchCreditRequestsForRider = useCallback(() => {
    if (!riderId) {
      setCreditRequestsForRider([]);
      return;
    }
    setCreditRequestsLoading(true);
    fetch(`/api/wallet-credit-requests?riderId=${riderId}&limit=50`, { credentials: 'include' })
      .then(async (res) => {
        const ct = res.headers.get('content-type') ?? '';
        if (!ct.includes('application/json')) return { success: false, data: [] };
        const text = await res.text();
        try {
          return text ? JSON.parse(text) : { success: false, data: [] };
        } catch {
          return { success: false, data: [] };
        }
      })
      .then((json) => {
        if (json?.success && Array.isArray(json.data)) {
          setCreditRequestsForRider(json.data as WalletCreditRequestRow[]);
        } else {
          setCreditRequestsForRider([]);
        }
      })
      .catch(() => setCreditRequestsForRider([]))
      .finally(() => setCreditRequestsLoading(false));
  }, [riderId]);
  useEffect(() => {
    if (!riderId) {
      setCreditRequestsForRider([]);
      return;
    }
    refetchCreditRequestsForRider();
  }, [riderId, refetchCreditRequestsForRider]);

  // Approved, order-linked "extra amounts" to display under order fare/earning
  const approvedExtraByOrderId = useMemo(() => {
    const map = new Map<number, number>();
    for (const r of creditRequestsForRider) {
      if (r.status !== "approved") continue;
      if (r.orderId == null) continue;
      const prev = map.get(r.orderId) ?? 0;
      map.set(r.orderId, prev + (Number(r.amount) || 0));
    }
    return map;
  }, [creditRequestsForRider]);

  const handleDeleteCreditRequest = useCallback(
    async (requestId: number, orderId?: number) => {
      setDeletingCreditRequestId(requestId);
      try {
        const res = await fetch(`/api/wallet-credit-requests/${requestId}/delete`, {
          method: "DELETE",
          credentials: "include",
        });
        const json = await res.json();
        if (!res.ok || !json.success) throw new Error(json.error || "Failed to delete");
        setCreditRequestsForRider((prev) => prev.filter((r) => r.id !== requestId));
        if (orderId != null) {
          setPendingCreditOrderIds((prev) => {
            const next = new Set(prev);
            next.delete(orderId);
            return next;
          });
        }
        if (riderId) invalidateRiderSummary(queryClient, riderId);
        refetchCreditRequestsForRider();
        await refetchRiderSummary();
      } catch (err) {
        console.error(err);
        setError(err instanceof Error ? err.message : "Failed to delete request");
      } finally {
        setDeletingCreditRequestId(null);
      }
    },
    [riderId, queryClient, refetchCreditRequestsForRider, refetchRiderSummary]
  );

  const handleApproveCreditRequest = useCallback(
    async (requestId: number) => {
      setActioningCreditRequestId(requestId);
      try {
        const res = await fetch(`/api/wallet-credit-requests/${requestId}/approve`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
          credentials: "include",
        });
        const json = await res.json();
        if (!res.ok || !json.success) throw new Error(json.error || "Failed to approve");
        if (riderId) invalidateRiderSummary(queryClient, riderId);
        await refetchCreditRequestsForRider();
        refetchRiderSummary();
      } catch (err) {
        console.error(err);
        setError(err instanceof Error ? err.message : "Failed to approve request");
      } finally {
        setActioningCreditRequestId(null);
      }
    },
    [riderId, queryClient, refetchCreditRequestsForRider, refetchRiderSummary]
  );

  const handleRejectCreditRequest = useCallback(
    async (requestId: number, reviewNote?: string) => {
      setActioningCreditRequestId(requestId);
      try {
        const res = await fetch(`/api/wallet-credit-requests/${requestId}/reject`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reviewNote: (reviewNote ?? "").trim() || undefined }),
          credentials: "include",
        });
        const json = await res.json();
        if (!res.ok || !json.success) throw new Error(json.error || "Failed to reject");
        setRejectCreditRequestModal(null);
        if (riderId) invalidateRiderSummary(queryClient, riderId);
        await refetchCreditRequestsForRider();
        await refetchRiderSummary();
      } catch (err) {
        console.error(err);
        setError(err instanceof Error ? err.message : "Failed to reject request");
      } finally {
        setActioningCreditRequestId(null);
      }
    },
    [riderId, queryClient, refetchCreditRequestsForRider, refetchRiderSummary]
  );

  // Use fresh query data for block/blacklist UI so toggles update immediately after penalty/revert (no one-render delay)
  const displaySummary = summaryData ?? riderSummary;

  // Clear section-specific loading when query settles
  useEffect(() => {
    if (!summaryQueryFetching) setLoadingSection(null);
  }, [summaryQueryFetching, setLoadingSection]);

  const effectiveSummaryLoading = summaryQueryLoading;

  // Single search function - debounced + cached via riderSearchCache.
  const runSearch = useCallback(async (searchValue: string) => {
    if (!searchValue.trim()) {
      clearRider();
      setLoading(false);
      return;
    }

    setShowDefault(false);
    setHasSearched(true);
    setError(null);

    // If we have cached results for this query, show them instantly and revalidate in background.
    const cached = riderSearchCache.get(searchValue);
    if (cached) {
      // Use context helper so "selected rider" (currentRiderId / info) is in one place.
      setCurrentRiderFromSearch(cached, null);
      setLoading(false);
    } else {
      setRiders([]);
      setRiderSummary(null);
    }

    let spinnerTimeout: NodeJS.Timeout | null = null;
    spinnerTimeout = setTimeout(() => {
      setLoading(true);
    }, 300);

    try {
      // Check if supabase is properly initialized
      if (!supabase) {
        setError("Database connection not available. Please check your configuration.");
        return;
      }
      
      let query = supabase.from("riders").select("*");
      
      // Priority order: Mobile number (10+ digits) > Rider ID
      const isPhoneWith91 = /^(\+91|91)\d{10}$/.test(searchValue);
      const isPhone = /^\d{10,}$/.test(searchValue);
      const isRiderId = /^GMR(\d+)$/i.test(searchValue);
      const isNumericId = /^\d{1,9}$/.test(searchValue);

      if (isPhoneWith91) {
        let phone = searchValue.replace(/^\+?91/, "");
        query = query.eq('mobile', phone);
      } else if (isPhone) {
        query = query.eq('mobile', searchValue);
      } else if (isRiderId) {
        const idNum = searchValue.replace(/^GMR/i, "");
        if (/^\d+$/.test(idNum)) {
          query = query.eq('id', Number(idNum));
        } else {
          query = query.eq('id', -1);
        }
      } else if (isNumericId) {
        query = query.eq('id', Number(searchValue));
      } else {
        query = query.ilike('mobile', `%${searchValue}%`);
      }

      const { data, error: supabaseError } = await query;

      if (supabaseError && supabaseError.message && supabaseError.message.includes('out of range')) {
        setRiders([]);
        setError(null);
        return;
      }
      if (supabaseError) {
        setRiders([]);
        setError(supabaseError.message || "Search failed. Please try again.");
        return;
      }

      if (data && data.length > 0) {
        const list = data as RiderListEntry[];
        riderSearchCache.set(searchValue, list);
        // Single source of truth: update context via helper so main UI and sidebar agree.
        setCurrentRiderFromSearch(list, null);
        setError(null);
        router.replace(`/dashboard/riders?search=GMR${list[0].id}`, { scroll: false });
        // Summary is fetched by useRiderSummaryQuery when riderId is set
      } else {
        riderSearchCache.set(searchValue, []);
        setRiders([]);
        setRiderSummary(null);
        setError(null);
      }
    } catch (err: any) {
      if (err && err.message && err.message.includes('out of range')) {
        setRiders([]);
        setError(null);
        return;
      }
      setRiders([]);
      setError(err?.message || "Search failed. Please try again.");
    } finally {
      if (spinnerTimeout) clearTimeout(spinnerTimeout);
      setLoading(false);
    }
  }, [router, setShowDefault, setHasSearched, setError, setRiders, setRiderSummary, setLoading, clearRider, setCurrentRiderFromSearch]);

  // Track the last search we actually ran to avoid re-running when effect re-fires.
  const lastRanSearchRef = useRef<string | null>(null);
  const debouncedSearchParam = useDebouncedValue(
    searchParams.get('search')?.trim() ?? '',
    400
  );

  // Run search only when URL has ?search= and it's a *different* rider than already in context.
  // When returning to Rider Information from Orders/Penalties/etc., same rider in URL + context → skip search.
  // When we have a rider in context but no search in URL, sync URL so refresh and sub-route links keep the rider.
  useEffect(() => {
    const searchValue = debouncedSearchParam;
    if (!searchValue) {
      if (riders.length > 0 && riders[0]) {
        router.replace(`/dashboard/riders?search=GMR${riders[0].id}`, { scroll: false });
        return;
      }
      lastRanSearchRef.current = null;
      return;
    }

    const currentRider = riders[0];
    const matchesCurrentRider =
      currentRider &&
      (searchValue === String(currentRider.id) ||
        searchValue === `GMR${currentRider.id}` ||
        currentRider.mobile === searchValue ||
        currentRider.mobile === searchValue.replace(/^\+?91/, ''));

    if (matchesCurrentRider) {
      lastRanSearchRef.current = searchValue;
      return;
    }
    // Prevent loop: runSearch sets riders to [], effect re-runs with new riders ref → don't run same search again.
    if (lastRanSearchRef.current === searchValue) return;
    lastRanSearchRef.current = searchValue;
    runSearch(searchValue);
  }, [debouncedSearchParam, runSearch, riders, router]);


  // When rider changes (new search), reset so section effects don’t refetch until user changes a filter

  // Wrapped setters: set section loading when user changes a filter (TanStack Query refetches when params change)
  const handleOrdersLimitChange = useCallback((v: number) => { setLoadingSection('orders'); setOrdersLimit(v); }, [setLoadingSection]);
  const handleOrdersFromChange = useCallback((v: string) => { setLoadingSection('orders'); setOrdersFrom(v); }, [setLoadingSection]);
  const handleOrdersToChange = useCallback((v: string) => { setLoadingSection('orders'); setOrdersTo(v); }, [setLoadingSection]);
  const handleWithdrawalsLimitChange = useCallback((v: number) => { setLoadingSection('withdrawals'); setWithdrawalsPageSize(v); setWithdrawalsPage(1); }, [setLoadingSection]);
  const handleWithdrawalsFromChange = useCallback((v: string) => { setLoadingSection('withdrawals'); setWithdrawalsFrom(v); }, [setLoadingSection]);
  const handleWithdrawalsToChange = useCallback((v: string) => { setLoadingSection('withdrawals'); setWithdrawalsTo(v); }, [setLoadingSection]);
  const handleTicketsLimitChange = useCallback((v: number) => { setLoadingSection('tickets'); setTicketsLimit(v); }, [setLoadingSection]);
  const handleTicketsFromChange = useCallback((v: string) => { setLoadingSection('tickets'); setTicketsFrom(v); }, [setLoadingSection]);
  const handleTicketsToChange = useCallback((v: string) => { setLoadingSection('tickets'); setTicketsTo(v); }, [setLoadingSection]);
  const handleTicketsStatusChange = useCallback((v: string) => { setLoadingSection('tickets'); setTicketsStatus(v); }, [setLoadingSection]);
  const handleTicketsCategoryChange = useCallback((v: string) => { setLoadingSection('tickets'); setTicketsCategory(v); }, [setLoadingSection]);
  const handleTicketsPriorityChange = useCallback((v: string) => { setLoadingSection('tickets'); setTicketsPriority(v); }, [setLoadingSection]);
  const handlePenaltiesLimitChange = useCallback((v: number) => { setLoadingSection('penalties'); setPenaltiesLimit(v); }, [setLoadingSection]);
  const handlePenaltiesFromChange = useCallback((v: string) => { setLoadingSection('penalties'); setPenaltiesFrom(v); }, [setLoadingSection]);
  const handlePenaltiesToChange = useCallback((v: string) => { setLoadingSection('penalties'); setPenaltiesTo(v); }, [setLoadingSection]);

  const clearOrdersFilters = useCallback(() => {
    setOrdersPage(1);
    setLoadingSection('orders');
    setOrdersFrom('');
    setOrdersTo('');
    setOrdersOrderType('all');
    setOrdersStatus('all');
    setOrdersOrderIdSearch('');
  }, []);
  const clearTicketsFilters = useCallback(() => {
    setTicketsPage(1);
    setLoadingSection('tickets');
    setTicketsFrom('');
    setTicketsTo('');
    setTicketsStatus('all');
    setTicketsCategory('all');
    setTicketsPriority('all');
    setTicketsSearch('');
  }, []);
  const clearPenaltiesFilters = useCallback(() => {
    setPenaltiesPage(1);
    setLoadingSection('penalties');
    setPenaltiesFrom('');
    setPenaltiesTo('');
    setPenaltiesStatus('all');
    setPenaltiesServiceType('all');
    setPenaltiesOrderIdSearch('');
  }, []);
  const clearWithdrawalsFilters = useCallback(() => {
    setWithdrawalsPage(1);
    setLoadingSection('withdrawals');
    setWithdrawalsFrom('');
    setWithdrawalsTo('');
  }, []);

  const handleRefreshSection = useCallback((section: 'orders' | 'withdrawals' | 'tickets' | 'penalties') => {
    setLoadingSection(section);
    refetchRiderSummary();
  }, [setLoadingSection, refetchRiderSummary]);

  const handleRetryAccess = () => {
    queryClient.invalidateQueries({ queryKey: queryKeys.permissions() });
    queryClient.invalidateQueries({ queryKey: queryKeys.dashboardAccess() });
  };

  // Only show error when we have no cached data (keeps page usable on refetch failure)
  if ((permissionsError || dashboardAccessError) && !hasCachedPermissions && !hasCachedDashboardAccess) {
    const msg = permissionsError instanceof Error ? permissionsError.message : dashboardAccessError instanceof Error ? dashboardAccessError.message : "Failed to load access.";
    return (
      <div className="space-y-6">
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-6">
          <p className="text-amber-800 font-semibold">Could not load permissions</p>
          <p className="text-amber-700 text-sm mt-2">{msg}</p>
          <button
            type="button"
            onClick={handleRetryAccess}
            className="mt-4 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  // Server layout already verified RIDER access; don't block content on client permission load.
  // Only show "User not found" once we have permission data and user isn't in system.
  if (hasCachedPermissions && !exists) {
    return (
      <div className="space-y-6">
        <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-6">
          <p className="text-yellow-600 font-semibold">User Not Found</p>
          <p className="text-yellow-500 text-sm mt-2">
            Your account is not registered in the system. Please contact your administrator.
          </p>
        </div>
      </div>
    );
  }

  // Safety net only: server already enforces RIDER access; show only when we have data and it says no access
  if (hasCachedDashboardAccess && !isSuperAdmin && !hasRiderAccess) {
    return (
      <div className="space-y-6">
        <div className="rounded-lg border border-red-200 bg-red-50 p-6">
          <p className="text-red-600 font-semibold">Access Denied</p>
          <p className="text-red-500 text-sm mt-2">
            You don't have permission to access the Rider Dashboard. Please contact your administrator.
          </p>
        </div>
      </div>
    );
  }

  const rider = riders[0];
  const isFullyOnboarded =
    rider &&
    rider.status === 'ACTIVE' &&
    rider.kyc_status === 'APPROVED' &&
    rider.onboarding_stage === 'ACTIVE';

  const needsVerification = rider && !isFullyOnboarded;

  return (
    <div className="space-y-6 w-full max-w-full min-w-0 overflow-x-hidden px-2 sm:px-4 md:px-6">

      {/* Loading Spinner */}
      {loading && (
        <div className="flex items-center justify-center py-12">
          <LoadingSpinner
            size="lg"
            variant="default"
            text="Searching..."
            className="text-blue-600"
          />
        </div>
      )}

      {/* No Results */}
      {!loading && hasSearched && !error && riders.length === 0 && (
        <div className="rounded-lg border border-gray-200 bg-white p-12 text-center">
          <p className="text-lg text-gray-700 font-medium">
            We couldn't locate a delivery partner with the given details.
          </p>
        </div>
      )}

      {/* Default Message */}
      {showDefault && !loading && (
        <div className="rounded-lg border border-gray-200 bg-white p-12 text-center">
          <p className="text-lg text-gray-700 font-medium">
            One search. Complete rider context —{' '}
            <span className="font-bold bg-gradient-to-r from-blue-500 via-purple-500 to-pink-500 bg-clip-text text-transparent">
              powered by GatiMitra
            </span>
          </p>
          <p className="mt-2 text-sm text-gray-500">
            Enter a Rider ID (e.g., GMR123 or 123) or Mobile number (10+ digits) to search
          </p>
        </div>
      )}

      {/* Error Message */}
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4">
          <p className="text-red-600">Error: {error}</p>
        </div>
      )}

      {/* Rider Information */}
      {hasSearched && !loading && rider && (
        <div className="space-y-6">
          {/* Rider Info Card – compact, modern; full details via View Full Details */}
          <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
            {/* Top row: avatar + rider name (not "Rider Information") + ID/phone + actions + wallet */}
            <div className="flex flex-wrap items-center gap-3 px-4 py-3 bg-gradient-to-r from-gray-50/80 to-white border-b border-gray-100">
              <div className="flex items-center gap-3 min-w-0 flex-1">
                <div className="relative shrink-0">
                  <div className="w-11 h-11 rounded-full overflow-hidden ring-2 ring-white shadow-sm bg-gray-100 flex items-center justify-center">
                    {(riderSummary?.rider as { selfieUrl?: string | null })?.selfieUrl ? (
                      <img
                        src={(riderSummary?.rider as { selfieUrl?: string | null })?.selfieUrl ?? ""}
                        alt=""
                        className="w-full h-full object-cover"
                      />                    ) : rider.name?.trim() ? (
                      <span className="text-sm font-semibold text-gray-400">{rider.name.trim().split(/\s+/).map(n => n[0]).slice(0, 2).join("").toUpperCase()}</span>
                    ) : (
                      <User className="w-5 h-5 text-gray-400" />
                    )}
                  </div>
                  {riderSummary?.rider?.isOnline && <span className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-green-500 border-2 border-white" />}
                </div>
                <div className="min-w-0">
                  <h2 className="text-base font-bold text-gray-900 truncate">{rider.name || "—"}</h2>
                  <p className="text-xs text-gray-500 truncate">GMR{rider.id} · {rider.mobile}</p>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {needsVerification && (
                  <button onClick={() => router.push(`/dashboard/riders/${rider.id}/onboarding`)} className="px-2.5 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-xs font-medium flex items-center gap-1 cursor-pointer">
                    <CheckCircle className="h-3.5 w-3.5" /> Verify
                  </button>
                )}
                <button onClick={() => router.push(`/dashboard/riders/${rider.id}`)} className="px-3 py-1.5 bg-gray-800 text-white rounded-lg hover:bg-gray-900 text-xs font-medium cursor-pointer">
                  View Full Details
                </button>
              </div>
              {riderSummary?.wallet && (
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-3 py-1.5 rounded-lg bg-emerald-50 border border-emerald-200/80 text-xs">
                  <Wallet className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                  <span className="text-gray-600">Total <span className="font-semibold text-gray-900 tabular-nums">₹{formatWalletNum(riderSummary.wallet.totalBalance).toFixed(2)}</span></span>
                  <span className="text-gray-300">|</span>
                  <span className="text-gray-600">Withdrawable <span className="text-emerald-700 font-medium tabular-nums">₹{formatWalletNum(riderSummary.wallet.withdrawable).toFixed(2)}</span></span>
                  <span className="text-gray-300">|</span>
                  <span className="text-gray-600">Locked <span className="text-amber-600 font-medium tabular-nums">₹{formatWalletNum(riderSummary.wallet.locked).toFixed(2)}</span></span>
                  <span className="text-gray-300">|</span>
                  <span className="text-gray-600">Security <span className="text-slate-600 font-medium tabular-nums">₹{formatWalletNum(riderSummary.wallet.securityBalance).toFixed(2)}</span></span>
                </div>
              )}
            </div>

            {/* Dense info row – single row on large screens, minimal vertical space */}
            <div className="px-4 py-2.5">
              <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1.5 text-sm">
                  <InfoInline label="City" value={rider.city || "—"} />
                  <InfoInline label="Status" value={(riderSummary?.rider?.status ?? rider.status) === "BLOCKED" ? <span className="font-medium text-red-600">BLOCKED</span> : (riderSummary?.rider?.status ?? rider.status)} />
                  <InfoInline label="Onboarding" value={ONBOARDING_STAGE_LABELS[rider.onboarding_stage] ?? rider.onboarding_stage} />
                  {needsVerification && riderSummary?.onboardingFees && Number(riderSummary.onboardingFees.totalPaid) > 0 && (
                    <InfoInline label="Onboarding fee paid" value={<span className="font-medium text-emerald-700 tabular-nums">₹{Number(riderSummary.onboardingFees.totalPaid).toFixed(2)}</span>} />
                  )}
                  <InfoInline
                    label="Online"
                    value={
                      riderSummary && isFullyOnboarded ? (
                        <span className="flex items-center gap-1.5">
                          <Circle className={`h-2.5 w-2.5 ${riderSummary.rider.isOnline ? "text-green-500 fill-green-500" : "text-gray-400 fill-gray-400"}`} />
                          {riderSummary.rider.isOnline ? "Online" : "Offline"}
                        </span>
                      ) : (
                        <span className="flex items-center gap-1.5">
                          <Circle className="h-2.5 w-2.5 text-gray-400 fill-gray-400" />
                          Offline
                          {!isFullyOnboarded && <span className="text-[10px] text-gray-500">(incomplete)</span>}
                        </span>
                      )
                    }
                  />
                  <InfoInline
                    label="On duty"
                    value={
                      (() => {
                        const services = (riderSummary?.rider as any)?.currentDutyServiceTypes ?? [];
                        const isOnline = riderSummary?.rider?.isOnline ?? false;
                        if (!isOnline) return "—";
                        if (!Array.isArray(services) || services.length === 0) return "None";
                        return services
                          .map((s: string) => (s === "person_ride" ? "Person ride" : s ? s.charAt(0).toUpperCase() + s.slice(1) : ""))
                          .filter(Boolean)
                          .join(", ");
                      })()
                    }
                  />
                  <InfoInline
                    label="Blocked"
                    value={
                      (() => {
                        const byService = displaySummary?.blacklistStatusByService;
                        const negWallet = (displaySummary as { negativeWalletBlocks?: { serviceType: string }[] })?.negativeWalletBlocks ?? [];
                        const globalWalletBlock = (displaySummary as { wallet?: { globalWalletBlock?: boolean } })?.wallet?.globalWalletBlock === true;
                        const banned: string[] = [];
                        if (globalWalletBlock) return <span className="font-medium text-red-600">All services (wallet ≤ -200)</span>;
                        if (byService) {
                          const all = byService.all as { isBanned?: boolean; partiallyAllowedServices?: string[] } | null;
                          const allFullyBanned = all?.isBanned === true && !(all?.partiallyAllowedServices?.length);
                          if (allFullyBanned) return <span className="font-medium text-red-600">All services (blacklist)</span>;
                          if (byService.food?.isBanned) banned.push("Food (blacklist)");
                          if (byService.parcel?.isBanned) banned.push("Parcel (blacklist)");
                          if (byService.person_ride?.isBanned) banned.push("Person ride (blacklist)");
                        }
                        negWallet.forEach((b: { serviceType: string }) => {
                          const label = b.serviceType === "person_ride" ? "Person ride" : b.serviceType ? b.serviceType.charAt(0).toUpperCase() + b.serviceType.slice(1) : "";
                          if (label && !banned.some((x) => x.startsWith(label))) banned.push(`${label} (negative wallet)`);
                        });
                        if (banned.length === 0) return "—";
                        return <span className="text-amber-700">{banned.join(", ")}</span>;
                      })()
                    }
                  />
                  {(riderSummary?.vehicle || riderSummary?.rider?.vehicleChoice) && (
                    <div className="flex items-center gap-1.5">
                      <span className="text-[11px] font-medium text-gray-500 uppercase tracking-wide">Vehicle</span>
                      <button
                        type="button"
                        onClick={() => setVehicleOpen((o) => !o)}
                        className="flex items-center gap-1 text-sm font-semibold text-gray-900 hover:text-gray-700 cursor-pointer"
                      >
                        {riderSummary?.vehicle?.vehicleType
                          ? String(riderSummary.vehicle.vehicleType).charAt(0).toUpperCase() + String(riderSummary.vehicle.vehicleType).slice(1).toLowerCase()
                          : riderSummary?.rider?.vehicleChoice || "—"}
                        {vehicleOpen ? <ChevronUp className="h-3 w-3 text-gray-500" /> : <ChevronDown className="h-3 w-3 text-gray-500" />}
                      </button>
                    </div>
                  )}
                </div>

                {/* Vehicle details: inline line(s) in dropdown when expanded */}
                {vehicleOpen && (riderSummary?.vehicle || riderSummary?.rider?.vehicleChoice) && (
                  <div className="mt-2 w-full max-w-2xl rounded border border-gray-200 bg-gray-50/80 px-3 py-2 text-xs">
                    {riderSummary?.vehicle ? (
                      <div className="flex flex-wrap items-baseline gap-x-1 gap-y-1">
                        <span className="text-gray-500 shrink-0">Type:</span>
                        <span className="font-medium text-gray-900 shrink-0">{String(riderSummary.vehicle.vehicleType ?? "—").replace(/_/g, " ")}</span>
                        <span className="text-gray-300 shrink-0 mx-0.5" aria-hidden>•</span>
                        <span className="text-gray-500 shrink-0">Fuel:</span>
                        <span className="font-medium text-gray-900 shrink-0">{riderSummary.vehicle.fuelType || "—"}</span>
                        <span className="text-gray-300 shrink-0 mx-0.5" aria-hidden>•</span>
                        <span className="text-gray-500 shrink-0">Make:</span>
                        <span className="font-medium text-gray-900 shrink-0">{riderSummary.vehicle.make || "—"}</span>
                        <span className="text-gray-300 shrink-0 mx-0.5" aria-hidden>•</span>
                        <span className="text-gray-500 shrink-0">Model:</span>
                        <span className="font-medium text-gray-900 shrink-0">{riderSummary.vehicle.model || "—"}</span>
                        <span className="text-gray-300 shrink-0 mx-0.5" aria-hidden>•</span>
                        <span className="text-gray-500 shrink-0">Category:</span>
                        <span className="font-medium text-gray-900 shrink-0">{riderSummary.vehicle.vehicleCategory ? String(riderSummary.vehicle.vehicleCategory).replace(/_/g, " ") : "—"}</span>
                        <span className="text-gray-300 shrink-0 mx-0.5" aria-hidden>•</span>
                        <span className="text-gray-500 shrink-0">RC:</span>
                        <span className="font-medium text-gray-900 font-mono shrink-0">{riderSummary.vehicle.registrationNumber || "—"}</span>
                      </div>
                    ) : (
                      <p className="text-gray-600">No vehicle on file. Type: {riderSummary?.rider?.vehicleChoice}.</p>
                    )}
                  </div>
                )}
              </div>
            </div>

          {/* Recent Data Sections: Orders, Tickets, Penalties = full width; Withdrawals and rest = two per row. Use displaySummary (query cache ?? context) for smooth back-navigation. */}
          {displaySummary && (() => {
            type SectionId = 'orders' | 'withdrawals' | 'tickets' | 'penalties' | 'blacklist' | 'metrics' | 'walletFreeze';
            const summary = displaySummary;
            const ordersList = summary.recentOrders ?? [];
            const totalOrders = ordersList.length;
            const displayedOrders = ordersList.slice((ordersPage - 1) * ordersPageSize, ordersPage * ordersPageSize);
            const ticketsList = (() => {
              const list = summary.recentTickets ?? [];
              const q = ticketsSearch.trim().toLowerCase();
              return q ? list.filter((t: { id: number; orderId?: number; subject: string; message?: string }) => (String(t.id) === q || (t.orderId != null && String(t.orderId) === q) || (t.subject?.toLowerCase().includes(q)) || (t.message?.toLowerCase().includes(q)))) : list;
            })();
            const totalTickets = ticketsList.length;
            const displayedTickets = ticketsList.slice((ticketsPage - 1) * ticketsPageSize, ticketsPage * ticketsPageSize);
            const penaltiesList = summary.recentPenalties ?? [];
            const totalPenalties = penaltiesList.length;
            const displayedPenalties = penaltiesList.slice((penaltiesPage - 1) * penaltiesPageSize, penaltiesPage * penaltiesPageSize);
            const withdrawalsList = summary.recentWithdrawals ?? [];
            const totalWithdrawals = withdrawalsList.length;
            const displayedWithdrawals = withdrawalsList.slice((withdrawalsPage - 1) * withdrawalsPageSize, withdrawalsPage * withdrawalsPageSize);
            const ordersSection = (
              <div className="rounded-2xl border border-gray-200/90 bg-white p-4 sm:p-5 lg:p-6 shadow-sm hover:shadow-md transition-shadow h-full min-h-0 flex flex-col ring-1 ring-gray-900/5">
                <div className="flex flex-wrap items-center gap-2 mb-2 shrink-0">
                  <h3 className="text-md font-semibold text-gray-800 shrink-0">Recent Orders</h3>
                  <button type="button" onClick={() => handleRefreshSection('orders')} disabled={summaryQueryFetching} className="p-1.5 rounded border border-gray-200 bg-gray-50 text-gray-600 hover:bg-gray-100 hover:text-gray-900 disabled:opacity-50 cursor-pointer" title="Refresh orders"><RefreshCw className={`h-3.5 w-3.5 ${summaryQueryFetching ? 'animate-spin' : ''}`} /></button>
                  {showOrdersFilters && (
                    <>
                      <input
                        type="date"
                        value={ordersFrom}
                        onChange={(e) => { setLoadingSection('orders'); handleOrdersFromChange(e.target.value); }}
                        className="px-2 py-1 text-xs border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 focus:border-blue-500 bg-white text-gray-900 w-[7.5rem] max-w-[110px]"
                        title="From date"
                      />
                      <input
                        type="date"
                        value={ordersTo}
                        onChange={(e) => { setLoadingSection('orders'); handleOrdersToChange(e.target.value); }}
                        className="px-2 py-1 text-xs border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 focus:border-blue-500 bg-white text-gray-900 w-[7.5rem] max-w-[110px]"
                        title="To date"
                      />
                      <button
                        type="button"
                        onClick={() => setShowOrdersMoreFilters((v) => !v)}
                        className={`flex items-center gap-1 px-2 py-1 text-xs font-medium rounded border transition-colors cursor-pointer ${showOrdersMoreFilters ? "border-blue-300 bg-blue-50 text-blue-700" : "border-gray-200 bg-gray-50 text-gray-600 hover:bg-gray-100 hover:text-gray-800"}`}
                        title={showOrdersMoreFilters ? "Hide more filters" : "Show more filters"}
                      >
                        More filters
                        {showOrdersMoreFilters ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                      </button>
                      <button type="button" onClick={clearOrdersFilters} className="w-full sm:w-auto shrink-0 px-2 py-1 text-xs font-medium rounded border border-gray-300 text-gray-700 bg-white hover:bg-gray-50 transition-colors cursor-pointer" title="Clear all filters">Clear filters</button>
                    </>
                  )}
                  {(summary.recentOrders?.length ?? 0) > 0 && (
                    <>
                      <span className="text-[10px] sm:text-xs text-gray-600 whitespace-nowrap">Rows</span>
                      <select value={ordersPageSize} onChange={(e) => { setOrdersPageSize(Number(e.target.value)); setOrdersPage(1); }} className="h-6 sm:h-7 min-w-0 w-10 sm:w-12 rounded border border-gray-300 bg-white px-1 text-[10px] sm:text-xs text-gray-900 focus:ring-1 focus:ring-blue-500 cursor-pointer" aria-label="Rows per page">
                        <option value={5}>5</option>
                        <option value={10}>10</option>
                        <option value={20}>20</option>
                        <option value={50}>50</option>
                      </select>
                      <TablePagination page={ordersPage} pageSize={ordersPageSize} total={totalOrders} onPageChange={setOrdersPage} disabled={summaryQueryFetching} ariaLabel="Orders" compact />
                    </>
                  )}
                  <button
                    type="button"
                    onClick={() => { setShowOrdersFilters((v) => !v); if (!showOrdersFilters) setLoadingSection('orders'); }}
                    className={`flex items-center gap-1.5 px-2 py-1 text-xs font-medium rounded border transition-colors ml-auto sm:ml-0 cursor-pointer ${showOrdersFilters ? "border-blue-300 bg-blue-50 text-blue-700" : "border-gray-200 bg-gray-50 text-gray-600 hover:bg-gray-100 hover:text-gray-800"}`}
                  >
                    <Filter className="h-3.5 w-3.5 shrink-0" />
                    Filters
                  </button>
                </div>
                {showOrdersFilters && showOrdersMoreFilters && (
                  <div className="flex flex-wrap items-center gap-3 mb-4 p-3 rounded-lg border border-gray-200 bg-gray-50/80 shrink-0">
                    <span className="text-xs font-medium text-gray-600">Type:</span>
                    <select
                      value={ordersOrderType}
                      onChange={(e) => { setLoadingSection('orders'); setOrdersOrderType(e.target.value); }}
                      className="px-2 py-1 text-xs border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 focus:border-blue-500 bg-white text-gray-900 cursor-pointer"
                      title="Order type"
                    >
                      <option value="all">All</option>
                      <option value="food">Food</option>
                      <option value="parcel">Parcel</option>
                      <option value="person_ride">Person ride</option>
                    </select>
                    <span className="text-xs font-medium text-gray-600">Status:</span>
                    <select
                      value={ordersStatus}
                      onChange={(e) => { setLoadingSection('orders'); setOrdersStatus(e.target.value); }}
                      className="px-2 py-1 text-xs border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 focus:border-blue-500 bg-white text-gray-900 cursor-pointer"
                      title="Order status"
                    >
                      <option value="all">All</option>
                      <option value="assigned">Assigned</option>
                      <option value="accepted">Accepted</option>
                      <option value="reached_store">Reached store</option>
                      <option value="picked_up">Picked up</option>
                      <option value="in_transit">In transit</option>
                      <option value="delivered">Delivered</option>
                      <option value="cancelled">Cancelled</option>
                      <option value="failed">Failed</option>
                    </select>
                    <span className="text-xs font-medium text-gray-600">Order ID:</span>
                    <input
                      type="text"
                      inputMode="numeric"
                      placeholder="Search by order ID"
                      value={ordersOrderIdSearch}
                      onChange={(e) => { setLoadingSection('orders'); setOrdersOrderIdSearch(e.target.value.replace(/\D/g, '').slice(0, 12)); }}
                      className="px-2 py-1 text-xs border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 focus:border-blue-500 bg-white text-gray-900 w-28 placeholder:text-gray-400"
                      title="Search order by ID"
                    />
                  </div>
                )}
                <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
                  {loadingSection === 'orders' && summaryQueryFetching ? (
                    <div className="flex justify-center py-8">
                      <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-500" />
                    </div>
                  ) : (summary.recentOrders?.length ?? 0) > 0 ? (
                    <>
                    <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
                      {displayedOrders.map((order: { id: number; orderType: string; status: string; riderEarning?: number; createdAt: string }) => (
                        <div key={order.id} className="flex justify-between items-center p-3 bg-gray-50 rounded-lg hover:bg-gray-100/80 transition-colors group">
                          <div className="min-w-0 flex-1">
                            <p className="font-medium text-gray-900">Order #{order.id}</p>
                            <p className="text-sm text-gray-500">{order.orderType} • {order.status}</p>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <div className="flex flex-col items-end leading-tight">
                              <p className="font-semibold text-gray-900">₹{Number(order.riderEarning || 0).toFixed(2)}</p>
                              {(() => {
                                const extra = approvedExtraByOrderId.get(order.id) ?? 0;
                                if (!(extra > 0)) return null;
                                return (
                                  <span
                                    className="mt-1 inline-flex items-center rounded-md bg-green-50 px-2 py-0.5 text-[11px] font-semibold text-green-700 border border-green-200"
                                    title="Approved extra amount (add amount) for this order"
                                  >
                                    Extra +₹{extra.toFixed(2)}
                                  </span>
                                );
                              })()}
                            </div>
                            <p className="text-xs text-gray-500">{new Date(order.createdAt).toLocaleDateString()}</p>
                            <div className="relative">
                              <button
                                type="button"
                                onClick={(e) => {
                                  if (openOrderMenuId === order.id) {
                                    setOpenOrderMenuId(null);
                                    setOrderMenuPosition(null);
                                    return;
                                  }
                                  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                                  const menuWidth = 176;
                                  const menuHeight = 120;
                                  const spaceBelow = window.innerHeight - rect.bottom;
                                  if (spaceBelow >= menuHeight + 8) {
                                    setOrderMenuPosition({
                                      top: rect.bottom + 4,
                                      left: Math.min(rect.right - menuWidth, window.innerWidth - menuWidth - 8),
                                    });
                                  } else {
                                    setOrderMenuPosition({
                                      top: rect.top - menuHeight - 4,
                                      left: Math.min(rect.right - menuWidth, window.innerWidth - menuWidth - 8),
                                    });
                                  }
                                  setOpenOrderMenuId(order.id);
                                }}
                                className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-200 hover:text-gray-800 transition-colors cursor-pointer"
                                aria-label="Order actions"
                              >
                                <MoreVertical className="h-4 w-4" />
                              </button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                    </>
                  ) : (
                    <p className="text-gray-500 text-sm text-center py-4">No orders found</p>
                  )}
                </div>
                {typeof document !== "undefined" &&
                  openOrderMenuId != null &&
                  orderMenuPosition != null &&
                  (() => {
                    const order = summary.recentOrders?.find((o: { id: number }) => o.id === openOrderMenuId);
                    if (!order) return null;
                    return createPortal(
                      <>
                        <div
                          className="fixed inset-0 z-40"
                          onClick={() => {
                            setOpenOrderMenuId(null);
                            setOrderMenuPosition(null);
                          }}
                          aria-hidden
                        />
                        <div
                          className="fixed z-[100] py-1 w-44 bg-white border border-gray-200 rounded-lg shadow-lg"
                          style={{ top: orderMenuPosition.top, left: orderMenuPosition.left }}
                        >
                          {pendingCreditOrderIds.has(order.id) ? (
                            <div
                              className="px-3 py-2 text-sm text-amber-700 bg-amber-50 border-b border-amber-100"
                              title="An add amount request is already pending for this order"
                            >
                              Add amount — request pending
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => {
                                setAddAmountFromOrder({ orderId: order.id, orderType: order.orderType || "food" });
                                setOpenOrderMenuId(null);
                                setOrderMenuPosition(null);
                              }}
                              className="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-blue-50 hover:text-blue-800 font-medium cursor-pointer"
                            >
                              Add Amount
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => {
                              const orderValue = Number(order.riderEarning || 0) || 0;
                              setAddPenaltyFromOrder({
                                orderId: order.id,
                                orderType: order.orderType || "food",
                                orderValue,
                              });
                              setAddPenaltyForm((f) => ({
                                ...f,
                                orderId: String(order.id),
                                serviceType: order.orderType || "food",
                                penaltyPercent: 100,
                              }));
                              setAddPenaltyModalOpen(true);
                              setOpenOrderMenuId(null);
                              setOrderMenuPosition(null);
                            }}
                            className="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-amber-50 hover:text-amber-800 font-medium cursor-pointer"
                          >
                            Add Penalty
                          </button>
                        </div>
                      </>,
                      document.body
                    );
                  })()}
              </div>
            );
            const withdrawalsSection = (
              <RecentDataSection
                title="Recent Withdrawals"
                data={summary.recentWithdrawals ?? []}
                limit={withdrawalsPageSize}
                onLimitChange={handleWithdrawalsLimitChange}
                fromDate={withdrawalsFrom}
                toDate={withdrawalsTo}
                onFromDateChange={handleWithdrawalsFromChange}
                onToDateChange={handleWithdrawalsToChange}
                loading={loadingSection === 'withdrawals' && summaryQueryFetching}
                onRefresh={() => handleRefreshSection('withdrawals')}
                refreshing={summaryQueryFetching}
                page={withdrawalsPage}
                pageSize={withdrawalsPageSize}
                onPageChange={setWithdrawalsPage}
                onPageSizeChange={(s) => { setWithdrawalsPageSize(s); setWithdrawalsPage(1); }}
                onClearFilters={clearWithdrawalsFilters}
                renderItem={(withdrawal) => (
                  <div className="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
                    <div>
                      <p className="font-medium text-gray-900">₹{Number(withdrawal.amount || 0).toFixed(2)}</p>
                      <p className="text-sm text-gray-500">{withdrawal.bankAcc} • {withdrawal.status}</p>
                    </div>
                    <div className="text-right">
                      <StatusBadge status={withdrawal.status} />
                      <p className="text-xs text-gray-500 mt-1">{new Date(withdrawal.createdAt).toLocaleDateString()}</p>
                    </div>
                  </div>
                )}
                emptyMessage="No withdrawals found"
              />
            );
            const ticketsSection = (
              <div className="rounded-2xl border border-gray-200/90 bg-white p-4 sm:p-5 lg:p-6 shadow-sm hover:shadow-md transition-shadow h-full min-h-0 flex flex-col ring-1 ring-gray-900/5">
                <div className="flex flex-wrap items-center gap-2 mb-2 shrink-0">
                  <h3 className="text-md font-semibold text-gray-800 shrink-0">Recent Tickets</h3>
                  <button type="button" onClick={() => handleRefreshSection('tickets')} disabled={summaryQueryFetching} className="p-1.5 rounded border border-gray-200 bg-gray-50 text-gray-600 hover:bg-gray-100 hover:text-gray-900 disabled:opacity-50 cursor-pointer" title="Refresh tickets"><RefreshCw className={`h-3.5 w-3.5 ${summaryQueryFetching ? 'animate-spin' : ''}`} /></button>
                  {showTicketsFilters && (
                    <>
                      <input type="date" value={ticketsFrom} onChange={(e) => { setLoadingSection('tickets'); handleTicketsFromChange(e.target.value); }} className="px-2 py-1 text-xs border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 bg-white text-gray-900 w-[7.5rem] max-w-[110px]" title="From" />
                      <input type="date" value={ticketsTo} onChange={(e) => { setLoadingSection('tickets'); handleTicketsToChange(e.target.value); }} className="px-2 py-1 text-xs border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 bg-white text-gray-900 w-[7.5rem] max-w-[110px]" title="To" />
                      <button type="button" onClick={() => setShowTicketsMoreFilters((v) => !v)} className={`flex items-center gap-1 px-2 py-1 text-xs font-medium rounded border cursor-pointer ${showTicketsMoreFilters ? "border-blue-300 bg-blue-50 text-blue-700" : "border-gray-200 bg-gray-50 text-gray-600 hover:bg-gray-100"}`}>More filters {showTicketsMoreFilters ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}</button>
                      <button type="button" onClick={clearTicketsFilters} className="w-full sm:w-auto shrink-0 px-2 py-1 text-xs font-medium rounded border border-gray-300 text-gray-700 bg-white hover:bg-gray-50 transition-colors cursor-pointer" title="Clear all filters">Clear filters</button>
                    </>
                  )}
                  {summary.recentTickets?.length ? (
                    <>
                      <span className="text-[10px] sm:text-xs text-gray-600 whitespace-nowrap">Rows</span>
                      <select value={ticketsPageSize} onChange={(e) => { setTicketsPageSize(Number(e.target.value)); setTicketsPage(1); }} className="h-6 sm:h-7 min-w-0 w-10 sm:w-12 rounded border border-gray-300 bg-white px-1 text-[10px] sm:text-xs text-gray-900 focus:ring-1 focus:ring-blue-500 cursor-pointer" aria-label="Rows per page">
                        <option value={5}>5</option>
                        <option value={10}>10</option>
                        <option value={20}>20</option>
                        <option value={50}>50</option>
                      </select>
                      <TablePagination page={ticketsPage} pageSize={ticketsPageSize} total={totalTickets} onPageChange={setTicketsPage} disabled={summaryQueryFetching} ariaLabel="Tickets" compact />
                    </>
                  ) : null}
                  <button type="button" onClick={() => { setShowTicketsFilters((v) => !v); if (!showTicketsFilters) setLoadingSection('tickets'); }} className={`flex items-center gap-1.5 px-2 py-1 text-xs font-medium rounded border ml-auto sm:ml-0 cursor-pointer ${showTicketsFilters ? "border-blue-300 bg-blue-50 text-blue-700" : "border-gray-200 bg-gray-50 text-gray-600 hover:bg-gray-100"}`}><Filter className="h-3.5 w-3.5" /> Filters</button>
                </div>
                {showTicketsFilters && showTicketsMoreFilters && (
                  <div className="flex flex-wrap items-center gap-3 mb-4 p-3 rounded-lg border border-gray-200 bg-gray-50/80 shrink-0">
                    <span className="text-xs font-medium text-gray-600">Search:</span>
                    <input
                      type="search"
                      value={ticketsSearch}
                      onChange={(e) => setTicketsSearch(e.target.value)}
                      placeholder="Ticket ID, Order ID, title…"
                      className="px-2.5 py-1.5 text-xs border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white text-gray-900 w-44 sm:w-52 placeholder:text-gray-400"
                      title="Search by ticket ID, order ID, or title"
                    />
                    <span className="text-xs font-medium text-gray-600">Status:</span>
                    <select value={ticketsStatus} onChange={(e) => handleTicketsStatusChange(e.target.value)} className="px-2 py-1 text-xs border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 bg-white text-gray-900 cursor-pointer"><option value="all">All</option><option value="open">Open</option><option value="in_progress">In progress</option><option value="resolved">Resolved</option><option value="closed">Closed</option></select>
                    <span className="text-xs font-medium text-gray-600">Category:</span>
                    <select value={ticketsCategory} onChange={(e) => handleTicketsCategoryChange(e.target.value)} className="px-2 py-1 text-xs border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 bg-white text-gray-900 cursor-pointer"><option value="all">All</option><option value="payment">Payment</option><option value="order">Order</option><option value="technical">Technical</option><option value="account">Account</option></select>
                    <span className="text-xs font-medium text-gray-600">Priority:</span>
                    <select value={ticketsPriority} onChange={(e) => handleTicketsPriorityChange(e.target.value)} className="px-2 py-1 text-xs border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 bg-white text-gray-900 cursor-pointer"><option value="all">All</option><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option><option value="urgent">Urgent</option></select>
                  </div>
                )}
                <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
                  {loadingSection === 'tickets' && summaryQueryFetching ? (
                    <div className="flex justify-center py-8"><div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-500" /></div>
                  ) : !summary.recentTickets?.length ? (
                    <p className="text-gray-500 text-sm py-6 text-center">No tickets found</p>
                  ) : (
                    <>
                    <div className="overflow-x-auto max-h-80 overflow-y-auto rounded-lg border border-gray-200 -mr-1">
                      <table className="min-w-full text-sm border-collapse">
                        <thead className="bg-gray-50 sticky top-0 z-10">
                          <tr>
                            <th className="px-3 py-2 text-left text-xs font-semibold text-gray-600 uppercase tracking-wide whitespace-nowrap">ID</th>
                            <th className="px-3 py-2 text-left text-xs font-semibold text-gray-600 uppercase tracking-wide whitespace-nowrap">Order</th>
                            <th className="px-3 py-2 text-left text-xs font-semibold text-gray-600 uppercase tracking-wide whitespace-nowrap">Status</th>
                            <th className="px-3 py-2 text-left text-xs font-semibold text-gray-600 uppercase tracking-wide min-w-[100px]">Title</th>
                            <th className="px-3 py-2 text-left text-xs font-semibold text-gray-600 uppercase tracking-wide whitespace-nowrap">Concern</th>
                            <th className="px-3 py-2 text-left text-xs font-semibold text-gray-600 uppercase tracking-wide min-w-[120px]">First message</th>
                            <th className="px-3 py-2 text-left text-xs font-semibold text-gray-600 uppercase tracking-wide whitespace-nowrap">Time</th>
                          </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-100">
                          {displayedTickets.map((ticket: { id: number; orderId?: number; subject: string; category: string; priority: string; status: string; message?: string; createdAt: string }) => (
                            <tr key={ticket.id} className="hover:bg-gray-50/80 transition-colors">
                              <td className="px-3 py-2 font-mono text-gray-900">{ticket.id}</td>
                              <td className="px-3 py-2 text-gray-700">{ticket.orderId != null ? `#${ticket.orderId}` : "—"}</td>
                              <td className="px-3 py-2"><StatusBadge status={ticket.status} /></td>
                              <td className="px-3 py-2 font-medium text-gray-900 max-w-[140px] truncate" title={ticket.subject}>{ticket.subject}</td>
                              <td className="px-3 py-2 text-gray-700 whitespace-nowrap">{ticket.category}</td>
                              <td className="px-3 py-2 text-gray-600 max-w-[180px] truncate" title={ticket.message ?? ""}>{ticket.message ?? "—"}</td>
                              <td className="px-3 py-2 text-gray-600 whitespace-nowrap">{new Date(ticket.createdAt).toLocaleString()}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    </>
                  )}
                </div>
              </div>
            );
            const penaltiesSection = (
              <div className="rounded-2xl border border-gray-200/90 bg-white p-4 sm:p-5 lg:p-6 shadow-sm hover:shadow-md transition-shadow h-full min-h-0 flex flex-col ring-1 ring-gray-900/5">
                <div className="flex flex-wrap items-center gap-2 mb-2 shrink-0">
                  <h3 className="text-md font-semibold text-gray-800 shrink-0">Recent Penalties</h3>
                  <button type="button" onClick={() => handleRefreshSection('penalties')} disabled={summaryQueryFetching} className="p-1.5 rounded border border-gray-200 bg-gray-50 text-gray-600 hover:bg-gray-100 hover:text-gray-900 disabled:opacity-50 cursor-pointer" title="Refresh penalties"><RefreshCw className={`h-3.5 w-3.5 ${summaryQueryFetching ? 'animate-spin' : ''}`} /></button>
                  {showPenaltiesFilters && (
                    <>
                      <input
                        type="date"
                        value={penaltiesFrom}
                        onChange={(e) => handlePenaltiesFromChange(e.target.value)}
                        className="px-2 py-1 text-xs border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 focus:border-blue-500 bg-white text-gray-900 w-[7.5rem] max-w-[110px]"
                        title="From date"
                      />
                      <input
                        type="date"
                        value={penaltiesTo}
                        onChange={(e) => handlePenaltiesToChange(e.target.value)}
                        className="px-2 py-1 text-xs border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 focus:border-blue-500 bg-white text-gray-900 w-[7.5rem] max-w-[110px]"
                        title="To date"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPenaltiesMoreFilters((v) => !v)}
                        className={`flex items-center gap-1 px-2 py-1 text-xs font-medium rounded border transition-colors cursor-pointer ${showPenaltiesMoreFilters ? "border-blue-300 bg-blue-50 text-blue-700" : "border-gray-200 bg-gray-50 text-gray-600 hover:bg-gray-100 hover:text-gray-800"}`}
                        title={showPenaltiesMoreFilters ? "Hide more filters" : "Show more filters"}
                      >
                        More filters
                        {showPenaltiesMoreFilters ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                      </button>
                      <button type="button" onClick={clearPenaltiesFilters} className="w-full sm:w-auto shrink-0 px-2 py-1 text-xs font-medium rounded border border-gray-300 text-gray-700 bg-white hover:bg-gray-50 transition-colors cursor-pointer" title="Clear all filters">Clear filters</button>
                    </>
                  )}
                  {(summary.recentPenalties?.length ?? 0) > 0 && (
                    <>
                      <span className="text-[10px] sm:text-xs text-gray-600 whitespace-nowrap">Rows</span>
                      <select value={penaltiesPageSize} onChange={(e) => { setPenaltiesPageSize(Number(e.target.value)); setPenaltiesPage(1); }} className="h-6 sm:h-7 min-w-0 w-10 sm:w-12 rounded border border-gray-300 bg-white px-1 text-[10px] sm:text-xs text-gray-900 focus:ring-1 focus:ring-blue-500 cursor-pointer" aria-label="Rows per page">
                        <option value={5}>5</option>
                        <option value={10}>10</option>
                        <option value={20}>20</option>
                        <option value={50}>50</option>
                      </select>
                      <TablePagination page={penaltiesPage} pageSize={penaltiesPageSize} total={totalPenalties} onPageChange={setPenaltiesPage} disabled={summaryQueryFetching} ariaLabel="Penalties" compact />
                    </>
                  )}
                  <button
                    type="button"
                    onClick={() => setShowPenaltiesFilters((v) => !v)}
                    className={`flex items-center gap-1.5 px-2 py-1 text-xs font-medium rounded border transition-colors ml-auto sm:ml-0 cursor-pointer ${showPenaltiesFilters ? "border-blue-300 bg-blue-50 text-blue-700" : "border-gray-200 bg-gray-50 text-gray-600 hover:bg-gray-100 hover:text-gray-800"}`}
                  >
                    <Filter className="h-3.5 w-3.5 shrink-0" />
                    Filters
                  </button>
                  {canAddPenaltyAny && (
                    <button
                      type="button"
                      onClick={() => { setAddPenaltyFromOrder(null); setAddPenaltyForm((f) => ({ ...f, orderId: '' })); setAddPenaltyModalOpen(true); setAddPenaltyError(null); }}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-amber-600 hover:bg-amber-700 rounded-lg transition-colors shadow-sm cursor-pointer"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      Add Penalty
                    </button>
                  )}

                  {/* Manual Add Amount (non-order) */}
                  {(riderAccess?.canRequestWalletCredit || riderAccess?.isSuperAdmin) && (
                    <button
                      type="button"
                      onClick={() => setAddAmountManualOpen(true)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors shadow-sm cursor-pointer"
                      title="Create a manual wallet credit request (non-order)"
                    >
                      <Banknote className="h-3.5 w-3.5" />
                      Add Amount
                    </button>
                  )}

                  {/* Add Amount Requests list (opens modal) */}
                  <button
                    type="button"
                    onClick={() => { setCreditRequestsModalOpen(true); refetchCreditRequestsForRider(); }}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors border border-blue-200 cursor-pointer"
                    title="View add amount requests (pending/approved/rejected)"
                  >
                    <Banknote className="h-3.5 w-3.5" />
                    Requests{creditRequestsForRider.length ? ` (${creditRequestsForRider.length})` : ""}
                  </button>
                </div>
                {showPenaltiesFilters && showPenaltiesMoreFilters && (
                  <div className="flex flex-wrap items-center gap-3 mb-4 p-3 rounded-lg border border-gray-200 bg-gray-50/80 shrink-0">
                    <span className="text-xs font-medium text-gray-600">Status:</span>
                    <select
                      value={penaltiesStatus}
                      onChange={(e) => setPenaltiesStatus(e.target.value)}
                      className="px-2 py-1 text-xs border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 focus:border-blue-500 bg-white text-gray-900 cursor-pointer"
                      title="Reverted or not"
                    >
                      <option value="all">All</option>
                      <option value="reverted">Reverted</option>
                      <option value="not">Not reverted</option>
                    </select>
                    <span className="text-xs font-medium text-gray-600">Service:</span>
                    <select
                      value={penaltiesServiceType}
                      onChange={(e) => setPenaltiesServiceType(e.target.value)}
                      className="px-2 py-1 text-xs border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 focus:border-blue-500 bg-white text-gray-900 cursor-pointer"
                      title="Service type"
                    >
                      <option value="all">All</option>
                      <option value="food">Food</option>
                      <option value="parcel">Parcel</option>
                      <option value="person_ride">Person ride</option>
                    </select>
                    <span className="text-xs font-medium text-gray-600">Order ID:</span>
                    <input
                      type="text"
                      inputMode="numeric"
                      placeholder="Search by order ID"
                      value={penaltiesOrderIdSearch}
                      onChange={(e) => setPenaltiesOrderIdSearch(e.target.value.replace(/\D/g, '').slice(0, 12))}
                      className="px-2 py-1 text-xs border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 focus:border-blue-500 bg-white text-gray-900 w-28 placeholder:text-gray-400"
                      title="Search penalty by order ID"
                    />
                  </div>
                )}
                <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
                  {loadingSection === 'penalties' && summaryQueryFetching ? (
                    <div className="flex justify-center py-8">
                      <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-500" />
                    </div>
                  ) : (summary.recentPenalties?.length ?? 0) > 0 ? (
                    <>
                    <div className="min-h-0 flex-1 overflow-auto rounded-lg border border-gray-200">
                      <table className="w-full max-w-full text-xs table-fixed border-collapse">
                        <thead className="bg-gray-50 border-b border-gray-200 sticky top-0 z-10">
                          <tr>
                            <th className="text-left py-1.5 px-1.5 font-semibold text-gray-600 uppercase tracking-wide w-[6%] min-w-0">ID</th>
                            <th className="text-left py-1.5 px-1.5 font-semibold text-gray-600 uppercase tracking-wide w-[7%] min-w-0">Order</th>
                            <th className="text-left py-1.5 px-1.5 font-semibold text-gray-600 uppercase tracking-wide w-[14%] min-w-0">Type</th>
                            <th className="text-left py-1.5 px-1.5 font-semibold text-gray-600 uppercase tracking-wide w-[18%] min-w-0">Reason</th>
                            <th className="text-right py-1.5 px-1.5 font-semibold text-gray-600 uppercase tracking-wide w-[10%] min-w-0">Amount</th>
                            <th className="text-left py-1.5 px-1.5 font-semibold text-gray-600 uppercase tracking-wide w-[12%] min-w-0">Status</th>
                            <th className="text-left py-1.5 px-1.5 font-semibold text-gray-600 uppercase tracking-wide w-[10%] min-w-0">Date</th>
                            <th className="text-right py-1.5 px-1.5 font-semibold text-gray-600 uppercase tracking-wide w-[8%] min-w-0">Action</th>
                            <th className="text-center py-1.5 px-1.5 font-semibold text-gray-600 uppercase tracking-wide w-[6%] min-w-0">Details</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100 bg-white">
                          {displayedPenalties.map((penalty: { id: number; orderId?: number | null; serviceType: string | null; penaltyType: string; amount: string; reason: string; status: string; imposedAt: string; resolvedAt?: string | null; imposedByEmail?: string | null; reversedByEmail?: string | null }) => {
                            const canRevert = penalty.status === "active" || penalty.status === "paid";                            const imposedDate = penalty.imposedAt ? new Date(penalty.imposedAt).toLocaleDateString() : '—';
                            const resolvedDate = penalty.resolvedAt ? new Date(penalty.resolvedAt).toLocaleDateString() : null;
                            const isReversed = penalty.status === 'reversed';
                            const statusLabel = isReversed ? 'Reverted' : (penalty.status === 'paid' ? 'Paid' : 'Active');
                            const statusClass = isReversed ? 'bg-green-100 text-green-800' : 'bg-red-50 text-red-700';
                            const isExpanded = expandedPenaltyId === penalty.id;
                            const typeLabel = `${String(penalty.penaltyType).replace(/_/g, ' ')} • ${penalty.serviceType ? penalty.serviceType.replace(/_/g, ' ') : '—'}`;
                            return (
                              <React.Fragment key={penalty.id}>
                                <tr className="hover:bg-gray-50/80 transition-colors">
                                  <td className="py-1.5 px-1.5 align-middle min-w-0">
                                    <span className="font-mono font-semibold text-gray-900">{penalty.id}</span>
                                  </td>
                                  <td className="py-1.5 px-1.5 align-middle min-w-0">
                                    <span className="font-mono text-gray-600">{penalty.orderId != null ? penalty.orderId : '—'}</span>
                                  </td>
                                  <td className="py-1.5 px-1.5 align-middle min-w-0 overflow-hidden">
                                    <span className="block capitalize text-gray-900 truncate" title={typeLabel}>{typeLabel}</span>
                                  </td>
                                  <td className="py-1.5 px-1.5 align-middle min-w-0 overflow-hidden">
                                    <span className="block text-gray-700 truncate" title={penalty.reason || ''}>{penalty.reason || '—'}</span>
                                  </td>
                                  <td className="py-1.5 px-1.5 align-middle min-w-0 text-right">
                                    <span className="font-semibold text-red-600">₹{Number(penalty.amount).toFixed(2)}</span>
                                  </td>
                                  <td className="py-1.5 px-1.5 align-middle min-w-0">
                                    <span className={`inline-flex px-1.5 py-0.5 text-[11px] font-medium rounded-full ${statusClass}`}>{statusLabel}</span>
                                  </td>
                                  <td className="py-1.5 px-1.5 align-middle text-gray-500 whitespace-nowrap min-w-0">{imposedDate}</td>
                                  <td className="py-1.5 px-1.5 align-middle text-right min-w-0">
                                    {canRevert && canRevertPenaltyForService(penalty.serviceType ?? 'parcel') ? (
                                      <button
                                        type="button"
                                        onClick={() => { setRevertPenaltyId(penalty.id); setRevertReason(''); setRevertError(null); }}
                                        className="inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[11px] font-medium text-amber-700 bg-amber-100 hover:bg-amber-200 rounded transition-colors cursor-pointer"
                                      >
                                        <RotateCcw className="h-3 w-3" />
                                        Revert
                                      </button>
                                    ) : canRevert ? (
                                      <span className="text-[11px] text-gray-400">View only</span>
                                    ) : (
                                      <span className="text-gray-400">—</span>
                                    )}
                                  </td>
                                  <td className="py-1.5 px-1.5 align-middle text-center min-w-0">
                                    <button
                                      type="button"
                                      onClick={() => setExpandedPenaltyId((prev) => (prev === penalty.id ? null : penalty.id))}
                                      className="inline-flex items-center justify-center p-1 rounded border border-gray-200 bg-gray-50 hover:bg-gray-100 text-gray-600 hover:text-gray-800 transition-colors cursor-pointer"
                                      aria-expanded={isExpanded}
                                      title={isExpanded ? 'Hide agent details' : 'Show agent details'}
                                    >
                                      {isExpanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                                    </button>
                                  </td>
                                </tr>
                                {isExpanded && (
                                  <tr className="bg-gray-50/80">
                                    <td colSpan={9} className="py-2 px-3 text-xs">
                                      <div className="rounded-lg border border-gray-200 bg-white p-3 space-y-2">
                                        <p className="font-semibold text-gray-700 mb-2">Agent details</p>
                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                          <div>
                                            <span className="text-gray-500">Imposed by:</span>{' '}
                                            <span className="text-gray-900">{penalty.imposedByEmail ?? '—'}</span>
                                            <span className="block text-gray-500 mt-0.5">Date: {imposedDate}</span>
                                          </div>
                                          {isReversed && penalty.reversedByEmail && (
                                            <div>
                                              <span className="text-gray-500">Reverted by:</span>{' '}
                                              <span className="text-gray-900">{penalty.reversedByEmail}</span>
                                              {resolvedDate && <span className="block text-gray-500 mt-0.5">Date: {resolvedDate}</span>}
                                            </div>
                                          )}
                                        </div>
                                      </div>
                                    </td>
                                  </tr>
                                )}
                              </React.Fragment>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                    </>
                  ) : (
                    <p className="text-gray-500 text-sm text-center py-4">No penalties found</p>
                  )}
                </div>
              </div>
            );
            const formatRemaining = (ms: number | null | undefined) => {
              if (ms == null || ms <= 0) return null;
              const hours = Math.floor(ms / (60 * 60 * 1000));
              const days = Math.floor(hours / 24);
              if (days >= 1) return `${days} day${days !== 1 ? 's' : ''}`;
              return `${hours} hour${hours !== 1 ? 's' : ''}`;
            };
            const handleBlacklistSubmit = async () => {
              if (!riderId || !blacklistModal) return;
              const reason = blacklistReason.trim();
              if (!reason) {
                setBlacklistError('Reason is required.');
                return;
              }
              if (blacklistModal.action === 'blacklist' && blacklistModal.service !== 'all' && !blacklistPermanent && (!blacklistDurationHours || blacklistDurationHours < 1)) {
                setBlacklistError('For temporary blacklist, enter duration (hours).');
                return;
              }
              setBlacklistError(null);
              setBlacklistSubmitting(true);
              setBlacklistLoadingService(blacklistModal.service);
              try {
                const body: Record<string, unknown> = {
                  action: blacklistModal.action,
                  serviceType: blacklistModal.service,
                  reason,
                };
                if (blacklistModal.action === 'blacklist') {
                  body.isPermanent = blacklistModal.service === 'all' ? true : blacklistPermanent;
                  if (!body.isPermanent) {
                    body.durationHours = blacklistDurationHours;
                  }
                }
                const res = await fetch(`/api/riders/${riderId}/blacklist`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  credentials: 'include',
                  body: JSON.stringify(body),
                });
                const data = await res.json();
                if (!res.ok) {
                  setBlacklistError(data.error || 'Request failed');
                  return;
                }
                setBlacklistModal(null);
                setBlacklistReason('');
                setBlacklistPermanent(true);
                setBlacklistDurationHours(24);
                if (riderId) invalidateRiderSummary(queryClient, riderId);
                await refetchRiderSummary();
              } catch (e) {
                setBlacklistError(e instanceof Error ? e.message : 'Request failed');
              } finally {
                setBlacklistSubmitting(false);
                setBlacklistLoadingService(null);
              }
            };
            const handleWalletFreezeSubmit = async () => {
              if (!riderId || !walletFreezeModal) return;
              setWalletFreezeError(null);
              setWalletFreezeSubmitting(true);
              try {
                const res = await fetch(`/api/riders/${riderId}/wallet-freeze`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  credentials: 'include',
                  body: JSON.stringify({ action: walletFreezeModal, reason: walletFreezeReason.trim() || undefined }),
                });
                const data = await res.json();
                if (!res.ok) {
                  setWalletFreezeError(data.error || 'Request failed');
                  return;
                }
                setWalletFreezeModal(null);
                setWalletFreezeReason('');
                if (riderId) invalidateRiderSummary(queryClient, riderId);
                await refetchRiderSummary();
              } catch (e) {
                setWalletFreezeError(e instanceof Error ? e.message : 'Request failed');
              } finally {
                setWalletFreezeSubmitting(false);
              }
            };

            const fetchWalletFreezeHistory = async () => {
              if (!riderId) return;
              try {
                const res = await fetch(`/api/riders/${riderId}/wallet-freeze-history?limit=20`, { credentials: 'include' });
                const data = await res.json();
                if (res.ok && data.data?.history) setWalletFreezeHistory(data.data.history);
              } catch {
                setWalletFreezeHistory([]);
              }
            };

            const wallet = summary?.wallet ?? null;
            const isFrozen = Boolean(wallet?.isFrozen);
            const latestFreeze = wallet?.latestFreezeAction != null && typeof wallet.latestFreezeAction === 'object' ? wallet.latestFreezeAction : null;
            const createdAtRaw = latestFreeze?.createdAt;
            const latestFreezeDate =
              createdAtRaw != null ? new Date(createdAtRaw as string | number | Date) : null;
            const negativeWalletBlocks = (displaySummary as { negativeWalletBlocks?: { serviceType: string }[] })?.negativeWalletBlocks ?? [];
            const globalWalletBlock = (displaySummary as { wallet?: { globalWalletBlock?: boolean } })?.wallet?.globalWalletBlock === true;
            const blacklistSection = (
              <div className="rounded-2xl border border-gray-200/90 bg-gradient-to-b from-white to-gray-50/50 p-4 sm:p-5 lg:p-6 shadow-sm hover:shadow-md transition-shadow h-full min-h-0 flex flex-col ring-1 ring-gray-900/5">
                <div className="shrink-0 mb-4">
                  <h3 className="text-base font-semibold text-gray-900 mb-1">Blacklist Status by Service</h3>
                  <p className="text-xs text-gray-500 mb-2">Toggle to blacklist or whitelist; reason required for each action.</p>
                  <p className="text-xs text-amber-700/90">Permanent blacklist on any one service applies to all services. You can whitelist manually from this dashboard with a reason to allow specific services again.</p>
                  {((displaySummary as { wallet?: { globalWalletBlock?: boolean } })?.wallet?.globalWalletBlock === true || negativeWalletBlocks.length > 0) && (
                    <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
                      <p className="text-xs font-medium text-amber-900">
                        {(displaySummary as { wallet?: { globalWalletBlock?: boolean } })?.wallet?.globalWalletBlock === true
                          ? "All services blocked (wallet ≤ -200). Unlock when balance ≥ 0."
                          : `Blocked: ${negativeWalletBlocks.map((b: { serviceType: string }) => b.serviceType === "person_ride" ? "Person ride" : b.serviceType?.charAt(0).toUpperCase() + b.serviceType?.slice(1)).join(", ")} — unlocks when balance &gt; -50 per service`}
                      </p>
                    </div>
                  )}
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5 flex-1 min-h-0 overflow-y-auto pr-1 content-start">
                  {(['food', 'parcel', 'person_ride', 'all'] as const).map((service) => {
                    const blacklist = summary?.blacklistStatusByService?.[service];
                    const isBannedByBlacklist = blacklist?.isBanned ?? false;
                    const hasNegativeWalletBlock = globalWalletBlock || (service !== 'all' && negativeWalletBlocks.some((b: { serviceType: string }) => b.serviceType === service));
                    const isBlocked = isBannedByBlacklist || hasNegativeWalletBlock;
                    const isBlockedByNegativeWalletOnly = hasNegativeWalletBlock && !isBannedByBlacklist;
                    const serviceLabel = service === 'all' ? 'All Services' : service.replace('_', ' ');
                    const isLoading = blacklistLoadingService === service;
                    const remaining = blacklist?.remainingMs != null ? formatRemaining(blacklist.remainingMs) : null;
                    const openModal = (action: 'blacklist' | 'whitelist') => {
                      setBlacklistModal({ service, action });
                      setBlacklistReason('');
                      setBlacklistError(null);
                    };
                    return (
                      <div
                        key={service}
                        className={`relative rounded-xl border-2 p-4 transition-all duration-200 ${
                          isBlocked
                            ? 'bg-gradient-to-br from-red-50 to-rose-50/80 border-red-200/80 shadow-sm'
                            : 'bg-gradient-to-br from-emerald-50/80 to-green-50/80 border-emerald-200/80 shadow-sm'
                        } ${isLoading ? 'pointer-events-none opacity-80' : ''}`}
                      >
                        {isLoading && (
                          <div className="absolute inset-0 flex items-center justify-center rounded-xl bg-white/70 z-10">
                            <LoadingSpinner size="md" />
                          </div>
                        )}
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 mb-2">
                              {isBlocked ? (
                                <ShieldOff className="h-5 w-5 text-red-600 shrink-0" aria-hidden />
                              ) : (
                                <ShieldCheck className="h-5 w-5 text-emerald-600 shrink-0" aria-hidden />
                              )}
                              <p className="text-sm font-semibold text-gray-900 capitalize">{serviceLabel}</p>
                            </div>
                            <p className={`text-xs font-medium ${isBlocked ? 'text-red-700' : 'text-emerald-700'}`}>
                              {service === 'all' && (blacklist as { partiallyAllowedServices?: string[] })?.partiallyAllowedServices?.length ? (
                                <>Partially allowed ({((blacklist as { partiallyAllowedServices: string[] }).partiallyAllowedServices).map(s => s.replace('_', ' ')).join(', ')})</>
                              ) : (
                                <>
                                  {isBlocked ? (isBlockedByNegativeWalletOnly ? 'Blocked' : 'Banned') : 'Allowed'}
                                  {isBlocked && !isBlockedByNegativeWalletOnly && (blacklist?.isPermanent ? ' (Permanent)' : blacklist?.expiresAt ? ` (Until ${new Date(blacklist.expiresAt).toLocaleDateString()})` : ' (Temporary)')}
                                </>
                              )}
                            </p>
                            {blacklist?.reason && !isBlockedByNegativeWalletOnly && (
                              <p className="text-xs text-gray-600 mt-1 line-clamp-2">
                                <span className="font-medium text-gray-700">Latest: </span>
                                {blacklist.source === 'agent' && (blacklist.actorEmail || blacklist.actorName) ? (
                                  <span>{blacklist.actorEmail ?? blacklist.actorName} – {blacklist.reason}</span>
                                ) : (
                                  <span>{blacklist.source === 'system' ? 'System' : blacklist.source === 'automated' ? 'Automated' : 'Agent'} – {blacklist.reason}</span>
                                )}
                              </p>
                            )}
                            {isBlockedByNegativeWalletOnly && (
                              <p className="text-[11px] text-amber-700 mt-0.5">{globalWalletBlock ? "Unlocks when balance ≥ 0" : "Unlocks when balance > -50 for this service"}</p>
                            )}
                            {isBlocked && !isBlockedByNegativeWalletOnly && !blacklist?.isPermanent && remaining && (
                              <p className="text-xs text-amber-700 mt-1 flex items-center gap-1">
                                <Clock className="h-3 w-3" />
                                Remaining: {remaining}
                              </p>
                            )}
                          </div>
                          {riderId && !isLoading && (
                            <div className="shrink-0 flex flex-col items-end">
                              {isBlockedByNegativeWalletOnly ? (
                                <>
                                  <span className="text-[10px] font-medium text-gray-500 uppercase tracking-wide mb-1.5">Blocked</span>
                                  <div
                                    aria-label={`Blocked – ${serviceLabel}`}
                                    className="relative inline-flex h-5 w-9 shrink-0 rounded-full border-2 border-red-400 bg-red-500 cursor-not-allowed opacity-90"
                                    title="Blocked (negative wallet). Unlocks when balance ≥ 0."
                                  >
                                    <span className="pointer-events-none inline-block h-4 w-4 transform translate-x-4 rounded-full bg-white shadow ring-0" style={{ marginTop: 2 }} />
                                  </div>
                                </>
                              ) : (isBlocked ? canUnblockForService(service) : canBlockForService(service)) ? (
                                <>
                                  <span className="text-[10px] font-medium text-gray-500 uppercase tracking-wide mb-1.5">
                                    {isBlocked ? 'Whitelist' : 'Blacklist'}
                                  </span>
                                  <button
                                    type="button"
                                    role="switch"
                                    aria-checked={isBlocked}
                                    aria-label={isBlocked ? `Whitelist ${serviceLabel}` : `Blacklist ${serviceLabel}`}
                                    onClick={() => openModal(isBlocked ? 'whitelist' : 'blacklist')}
                                    className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:ring-blue-500 ${
                                      isBlocked
                                        ? 'border-red-400 bg-red-500'
                                        : 'border-emerald-400 bg-emerald-500'
                                    }`}
                                  >
                                    <span
                                      className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition-transform ${
                                        isBlocked ? 'translate-x-4' : 'translate-x-0.5'
                                      }`}
                                      style={{ marginTop: 2 }}
                                    />
                                  </button>
                                  <p className="text-[10px] text-gray-500 mt-1">
                                    {isBlocked ? 'Click to allow' : 'Click to ban'}
                                  </p>
                                </>
                              ) : (
                                <span className="text-[10px] text-gray-400">No permission</span>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
                {/* Blacklist / Whitelist modal */}
                {blacklistModal && (
                  <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={() => !blacklistSubmitting && setBlacklistModal(null)}>
                    <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 space-y-5 border border-gray-100" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center gap-3 pb-2 border-b border-gray-100">
                        {blacklistModal.action === 'whitelist' ? (
                          <ShieldCheck className="h-8 w-8 text-emerald-500 shrink-0" aria-hidden />
                        ) : (
                          <ShieldOff className="h-8 w-8 text-red-500 shrink-0" aria-hidden />
                        )}
                        <h4 className="font-semibold text-gray-900 text-lg">
                          {blacklistModal.action === 'whitelist' ? 'Whitelist' : 'Blacklist'} — {blacklistModal.service === 'all' ? 'All Services' : blacklistModal.service.replace('_', ' ')}
                        </h4>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-900 mb-1.5">Reason (required)</label>
                        <textarea
                          value={blacklistReason}
                          onChange={(e) => setBlacklistReason(e.target.value)}
                          rows={3}
                          className="w-full rounded-xl border border-gray-300 px-3 py-2.5 text-sm text-gray-900 placeholder:text-gray-500 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                          placeholder="Enter reason for this action"
                        />
                      </div>
                      {blacklistModal.action === 'blacklist' && blacklistModal.service !== 'all' && (
                        <div className="space-y-3 rounded-xl bg-gray-100 p-4">
                          <label className="block text-sm font-medium text-gray-900">Type</label>
                          <div className="flex gap-6">
                            <label className="flex items-center gap-2 cursor-pointer">
                              <input type="radio" checked={blacklistPermanent} onChange={() => setBlacklistPermanent(true)} className="rounded text-red-600 focus:ring-red-500" />
                              <span className="text-sm font-medium text-gray-900">Permanent</span>
                            </label>
                            <label className="flex items-center gap-2 cursor-pointer">
                              <input type="radio" checked={!blacklistPermanent} onChange={() => setBlacklistPermanent(false)} className="rounded text-blue-600 focus:ring-blue-500" />
                              <span className="text-sm font-medium text-gray-900">Temporary</span>
                            </label>
                          </div>
                          {!blacklistPermanent && (
                            <div>
                              <label className="block text-sm font-medium text-gray-900 mb-1">Duration (hours)</label>
                              <input
                                type="number"
                                min={1}
                                value={blacklistDurationHours}
                                onChange={(e) => setBlacklistDurationHours(Number(e.target.value) || 24)}
                                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:ring-2 focus:ring-blue-500"
                              />
                            </div>
                          )}
                        </div>
                      )}
                      {blacklistError && <p className="text-sm text-red-700 bg-red-50 px-3 py-2 rounded-lg font-medium">{blacklistError}</p>}
                      <div className="flex justify-end gap-3 pt-2">
                        <button type="button" onClick={() => !blacklistSubmitting && setBlacklistModal(null)} className="px-4 py-2 text-sm font-medium text-gray-900 bg-gray-200 hover:bg-gray-300 rounded-xl transition-colors cursor-pointer">Cancel</button>
                        <button type="button" onClick={handleBlacklistSubmit} disabled={blacklistSubmitting} className="px-4 py-2 text-sm font-medium bg-blue-600 text-white rounded-xl hover:bg-blue-700 disabled:opacity-50 transition-colors shadow-sm cursor-pointer">
                          {blacklistSubmitting ? 'Submitting...' : 'Submit'}
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
            const hasOrderMetrics = summary.orderMetrics && typeof summary.orderMetrics === 'object';
            const orderMetricsAndWalletSection = (
              <div className="rounded-2xl border border-gray-200/90 bg-white p-4 sm:p-5 lg:p-6 shadow-sm hover:shadow-md transition-shadow h-full min-h-0 flex flex-col ring-1 ring-gray-900/5">
                <h3 className="text-md font-semibold mb-4 text-gray-800 shrink-0">Order Metrics by Service</h3>
                {hasOrderMetrics ? (
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 shrink-0">
                    {(['food', 'parcel', 'person_ride'] as const).map((service) => {
                      const metrics = summary.orderMetrics?.[service] ?? { sent: 0, accepted: 0, completed: 0, rejected: 0 };
                      return (
                        <div key={service} className="p-4 bg-gradient-to-br from-blue-50 to-purple-50 rounded-lg border border-blue-200">
                          <p className="text-sm font-bold text-gray-800 capitalize mb-3">{service.replace('_', ' ')}</p>
                          <div className="space-y-2">
                            <div className="flex justify-between text-xs">
                              <span className="text-gray-600">Sent:</span>
                              <span className="font-semibold text-gray-900">{Number(metrics.sent) ?? 0}</span>
                            </div>
                            <div className="flex justify-between text-xs">
                              <span className="text-gray-600">Accepted:</span>
                              <span className="font-semibold text-green-600">{Number(metrics.accepted) ?? 0}</span>
                            </div>
                            <div className="flex justify-between text-xs">
                              <span className="text-gray-600">Completed:</span>
                              <span className="font-semibold text-blue-600">{Number(metrics.completed) ?? 0}</span>
                            </div>
                            <div className="flex justify-between text-xs">
                              <span className="text-gray-600">Rejected:</span>
                              <span className="font-semibold text-red-600">{Number(metrics.rejected) ?? 0}</span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-xs text-gray-500 mb-4">No order metrics available.</p>
                )}
                {/* Wallet Freeze: inline in same section */}
                <div className="mt-5 pt-5 border-t border-gray-200">
                  <h4 className="text-sm font-semibold text-gray-800 mb-1">Wallet Freeze</h4>
                  <p className="text-xs text-gray-500 mb-3">Freeze rider wallet to block withdrawals. All actions are tracked with agent email.</p>
                  <div className={`rounded-lg border-2 p-3 mb-3 ${isFrozen ? 'bg-red-50/80 border-red-200' : 'bg-emerald-50/80 border-emerald-200'}`}>
                    <div className="flex items-center gap-2 mb-1">
                      {isFrozen ? <Lock className="h-4 w-4 text-red-600 shrink-0" /> : <Unlock className="h-4 w-4 text-emerald-600 shrink-0" />}
                      <span className={`text-sm font-semibold ${isFrozen ? 'text-red-800' : 'text-emerald-800'}`}>
                        {isFrozen ? 'Wallet frozen' : 'Wallet active'}
                      </span>
                    </div>
                    {latestFreeze && (
                      <p className="text-xs text-gray-700 mt-1">
                        <span className="font-medium">Latest: </span>
                        {String(latestFreeze.action) === 'freeze' ? 'Frozen' : 'Unfrozen'} by{' '}
                        <span className="font-medium">{latestFreeze.performedByEmail ?? latestFreeze.performedByName ?? 'Agent'}</span>
                        {latestFreezeDate && !Number.isNaN(latestFreezeDate.getTime()) ? ` on ${latestFreezeDate.toLocaleString()}` : ''}
                        {latestFreeze.reason ? ` — ${latestFreeze.reason}` : ''}
                      </p>
                    )}
                    {!latestFreeze && <p className="text-xs text-gray-500 mt-1">No freeze/unfreeze history yet.</p>}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {canFreezeWallet && (
                      <>
                        <button
                          type="button"
                          onClick={() => { setWalletFreezeModal('freeze'); setWalletFreezeError(null); setWalletFreezeReason(''); }}
                          disabled={isFrozen || walletFreezeSubmitting}
                          className="px-3 py-1.5 text-sm font-medium bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors cursor-pointer"
                        >
                          Freeze wallet
                        </button>
                        <button
                          type="button"
                          onClick={() => { setWalletFreezeModal('unfreeze'); setWalletFreezeError(null); setWalletFreezeReason(''); }}
                          disabled={!isFrozen || walletFreezeSubmitting}
                          className="px-3 py-1.5 text-sm font-medium bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors cursor-pointer"
                        >
                          Unfreeze wallet
                        </button>
                      </>
                    )}
                    <button
                      type="button"
                      onClick={() => { setWalletFreezeHistoryOpen(!walletFreezeHistoryOpen); if (!walletFreezeHistoryOpen) fetchWalletFreezeHistory(); }}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors cursor-pointer"
                    >
                      <History className="h-4 w-4" /> View history
                    </button>
                  </div>
                  {walletFreezeHistoryOpen && (
                    <div className="mt-3 rounded-lg border border-gray-200 bg-gray-50 p-3 max-h-40 overflow-y-auto">
                      <p className="text-xs font-semibold text-gray-800 mb-2">Freeze / Unfreeze history</p>
                      {walletFreezeHistory.length === 0 ? (
                        <p className="text-xs text-gray-600">No history or loading…</p>
                      ) : (
                        <ul className="space-y-2 text-xs text-gray-800">
                          {walletFreezeHistory.map((h, i) => (
                            <li key={i} className="flex flex-wrap gap-x-2 gap-y-0.5 items-baseline">
                              <span className="font-semibold text-gray-900">{h.action === 'freeze' ? 'Frozen' : 'Unfrozen'}</span>
                              <span className="text-gray-800">by {h.performedByEmail ?? h.performedByName ?? '—'}</span>
                              <span className="text-gray-700">{new Date(h.createdAt).toLocaleString()}</span>
                              {h.reason && <span className="text-gray-800">— {h.reason}</span>}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )}
                </div>
                {/* Wallet freeze/unfreeze modal */}
                {walletFreezeModal && (
                  <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={() => !walletFreezeSubmitting && setWalletFreezeModal(null)}>
                    <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6 space-y-4 border border-gray-100" onClick={(e) => e.stopPropagation()}>
                      <h4 className="font-semibold text-gray-900 text-lg flex items-center gap-2">
                        {walletFreezeModal === 'freeze' ? <Lock className="h-5 w-5 text-red-500" /> : <Unlock className="h-5 w-5 text-emerald-500" />}
                        {walletFreezeModal === 'freeze' ? 'Freeze wallet' : 'Unfreeze wallet'}
                      </h4>
                      <p className="text-sm text-gray-600">
                        {walletFreezeModal === 'freeze'
                          ? 'Rider will not be able to request or complete withdrawals until unfrozen.'
                          : 'Rider will be able to request withdrawals again.'}
                      </p>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Reason (optional)</label>
                        <input
                          type="text"
                          value={walletFreezeReason}
                          onChange={(e) => setWalletFreezeReason(e.target.value)}
                          placeholder="e.g. Suspicious activity on ID"
                          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-500 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        />
                      </div>
                      {walletFreezeError && <p className="text-sm text-red-700 bg-red-50 px-3 py-2 rounded-lg">{walletFreezeError}</p>}
                      <div className="flex justify-end gap-3 pt-2">
                        <button type="button" onClick={() => !walletFreezeSubmitting && setWalletFreezeModal(null)} className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-200 hover:bg-gray-300 rounded-lg cursor-pointer">Cancel</button>
                        <button type="button" onClick={handleWalletFreezeSubmit} disabled={walletFreezeSubmitting} className="px-4 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 cursor-pointer">
                          {walletFreezeSubmitting ? 'Submitting...' : 'Confirm'}
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );

            // Layout: Recent Orders, Recent Tickets, Recent Penalties = full width (one per row).
            // Recent Withdrawals, Blacklist, Order Metrics & Wallet = two per row.
            const twoColSections: { id: SectionId; content: React.ReactNode }[] = [
              { id: 'withdrawals', content: withdrawalsSection },
              { id: 'blacklist', content: blacklistSection },
              { id: 'metrics' as SectionId, content: orderMetricsAndWalletSection },
            ];

            return (
              <>
                <div className="flex flex-col gap-4 sm:gap-5 lg:gap-6 w-full min-w-0">
                  {/* Full-width rows: one section per row */}
                  <div className="w-full min-w-0 flex flex-col">
                    {ordersSection}
                  </div>
                  <div className="w-full min-w-0 flex flex-col">
                    {ticketsSection}
                  </div>
                  <div className="w-full min-w-0 flex flex-col">
                    {penaltiesSection}
                  </div>
                  {/* Two-per-row: order-related and other sections */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-5 lg:gap-6 items-stretch w-full min-w-0">
                    {twoColSections.map(({ id, content }) => (
                      <div key={id} className="w-full min-w-0 min-h-0 flex flex-col">
                        {content}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Add Amount Requests modal (opened from Recent Penalties header) */}
                {creditRequestsModalOpen && riderId && (() => {
                  const systemUserId = permissionsData?.systemUserId ?? null;
                  const canApproveRejectWalletCredit = riderAccess?.canApproveRejectWalletCredit ?? riderAccess?.isSuperAdmin ?? false;
                  const canDeleteCreditRequest = (r: WalletCreditRequestRow) =>
                    r.status === "pending" &&
                    (r.requestedBySystemUserId === systemUserId || canApproveRejectWalletCredit);

                  return (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/50 backdrop-blur-sm" onClick={() => !rejectCreditRequestModal && setCreditRequestsModalOpen(false)}>
                      <div className="bg-white rounded-xl shadow-xl w-full max-w-5xl max-h-[90vh] sm:max-h-[85vh] overflow-hidden border border-gray-200 relative flex flex-col" onClick={(e) => e.stopPropagation()}>
                        <div className="p-3 sm:p-4 border-b border-gray-200 flex flex-wrap items-center gap-2 sm:gap-3 shrink-0">
                          <h3 className="text-base sm:text-lg font-bold text-gray-900 flex items-center gap-2">
                            <Banknote className="h-5 w-5 text-blue-600 shrink-0" />
                            <span>Add amount requests (wallet credit)</span>
                          </h3>
                          <span className="text-xs sm:text-sm text-gray-500">Rider: GMR{riderId}</span>
                          <div className="ml-auto flex items-center gap-2 shrink-0">
                            <Link href="/dashboard/riders/pending-actions" className="text-xs font-medium text-blue-600 hover:underline">
                              Open Pending Actions
                            </Link>
                            <button
                              type="button"
                              onClick={() => setCreditRequestsModalOpen(false)}
                              className="px-3 py-1.5 text-xs font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg cursor-pointer"
                            >
                              Close
                            </button>
                          </div>
                        </div>

                        <div className="p-3 sm:p-4 overflow-hidden flex flex-col min-h-0">
                          {creditRequestsLoading ? (
                            <div className="flex justify-center py-10">
                              <div className="animate-spin rounded-full h-7 w-7 border-2 border-blue-500 border-t-transparent rounded-full" />
                            </div>
                          ) : creditRequestsForRider.length === 0 ? (
                            <div className="rounded-lg border border-gray-200 bg-gray-50 p-6 sm:p-8 text-center text-sm text-gray-600">
                              No add amount requests for this rider.
                            </div>
                          ) : (
                            <div className="overflow-auto border border-gray-200 rounded-lg max-h-[50vh] sm:max-h-[60vh] min-h-0">
                              <table className="min-w-full text-sm border-collapse">
                                <thead className="bg-gray-50 sticky top-0 z-10">
                                  <tr>
                                    <th className="px-2 py-2 text-left text-[11px] font-semibold text-gray-600 uppercase tracking-wide">ID</th>
                                    <th className="px-2 py-2 text-left text-[11px] font-semibold text-gray-600 uppercase tracking-wide">Order</th>
                                    <th className="px-2 py-2 text-right text-[11px] font-semibold text-gray-600 uppercase tracking-wide">Amount</th>
                                    <th className="px-2 py-2 text-left text-[11px] font-semibold text-gray-600 uppercase tracking-wide">Reason</th>
                                    <th className="px-2 py-2 text-left text-[11px] font-semibold text-gray-600 uppercase tracking-wide">Requested by</th>
                                    <th className="px-2 py-2 text-left text-[11px] font-semibold text-gray-600 uppercase tracking-wide">Status</th>
                                    <th className="px-2 py-2 text-left text-[11px] font-semibold text-gray-600 uppercase tracking-wide">Approved/Rejected by</th>
                                    <th className="px-2 py-2 text-left text-[11px] font-semibold text-gray-600 uppercase tracking-wide">Review note</th>
                                    <th className="px-2 py-2 text-right text-xs font-medium text-gray-600 uppercase whitespace-nowrap">Action</th>
                                  </tr>
                                </thead>
                                <tbody className="bg-white divide-y divide-gray-100">
                                  {creditRequestsForRider.map((r) => (
                                    <tr key={r.id} className="text-gray-900 hover:bg-gray-50/50 transition-colors">
                                      <td className="px-2 py-1.5 font-mono text-xs align-middle">{r.id}</td>
                                      <td className="px-2 py-1.5 font-mono text-xs align-middle">{r.orderId ?? "—"}</td>
                                      <td className="px-2 py-1.5 text-right font-medium text-xs align-middle">₹{Number(r.amount).toFixed(2)}</td>
                                      <td className="px-2 py-1.5 max-w-[160px] truncate text-gray-700 text-xs align-middle" title={r.reason}>{r.reason}</td>
                                      <td className="px-2 py-1.5 align-middle">
                                        <div className="flex flex-col leading-tight min-w-0">
                                          <span className="text-gray-700 text-xs truncate">{r.requestedByEmail ?? "—"}</span>
                                          <span className="text-[11px] text-gray-500">{new Date(r.requestedAt).toLocaleString()}</span>
                                        </div>
                                      </td>
                                      <td className="px-2 py-1.5 align-middle">
                                        <span className={`inline-flex px-1.5 py-0.5 rounded text-[11px] font-medium ${r.status === "approved" ? "bg-green-100 text-green-800" : r.status === "rejected" ? "bg-red-100 text-red-800" : "bg-amber-100 text-amber-800"}`}>
                                          {r.status}
                                        </span>
                                      </td>
                                      <td className="px-2 py-1.5 align-middle">
                                        <div className="flex flex-col leading-tight min-w-0">
                                          <span className="text-gray-700 text-xs truncate">{r.reviewedByEmail ?? "—"}</span>
                                          <span className="text-[11px] text-gray-500">{r.reviewedAt ? new Date(r.reviewedAt).toLocaleString() : "—"}</span>
                                        </div>
                                      </td>
                                      <td className="px-2 py-1.5 max-w-[140px] truncate text-gray-700 text-xs align-middle" title={r.reviewNote ?? ""}>{r.reviewNote ?? "—"}</td>
                                      <td className="px-2 py-1.5 align-middle">
                                        <div className="flex items-center justify-end gap-1 flex-nowrap">
                                          {r.status === "pending" && canApproveRejectWalletCredit && (
                                            <>
                                              <button
                                                type="button"
                                                onClick={() => handleApproveCreditRequest(r.id)}
                                                disabled={actioningCreditRequestId !== null || deletingCreditRequestId !== null}
                                                className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium text-white bg-emerald-600 hover:bg-emerald-700 rounded disabled:opacity-50 transition-colors cursor-pointer"
                                                title="Approve request"
                                                aria-label="Approve request"
                                              >
                                                {actioningCreditRequestId === r.id ? (
                                                  <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-white border-t-transparent" />
                                                ) : (
                                                  <Check className="h-3.5 w-3.5 shrink-0" />
                                                )}
                                                <span>Approve</span>
                                              </button>
                                              <button
                                                type="button"
                                                onClick={() => setRejectCreditRequestModal({ id: r.id, reason: "" })}
                                                disabled={actioningCreditRequestId !== null || deletingCreditRequestId !== null}
                                                className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium text-white bg-red-600 hover:bg-red-700 rounded disabled:opacity-50 transition-colors cursor-pointer"
                                                title="Reject request"
                                                aria-label="Reject request"
                                              >
                                                <X className="h-3.5 w-3.5 shrink-0" />
                                                <span>Reject</span>
                                              </button>
                                            </>
                                          )}
                                          {r.status === "pending" && !canApproveRejectWalletCredit && (
                                            <span className="text-[11px] text-gray-500 italic">View only</span>
                                          )}
                                          {canDeleteCreditRequest(r) && (
                                            <button
                                              type="button"
                                              onClick={() => handleDeleteCreditRequest(r.id, r.orderId)}
                                              disabled={deletingCreditRequestId !== null || actioningCreditRequestId !== null}
                                              className="inline-flex items-center gap-0.5 p-1 rounded text-red-600 hover:bg-red-50 disabled:opacity-50 transition-colors cursor-pointer"
                                              title="Delete request"
                                              aria-label="Delete request"
                                            >
                                              {deletingCreditRequestId === r.id ? (
                                                <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-red-400 border-t-transparent" />
                                              ) : (
                                                <Trash2 className="h-3.5 w-3.5" />
                                              )}
                                              <span className="text-[11px] font-medium">Del</span>
                                            </button>
                                          )}
                                        </div>
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          )}
                        </div>

                        {/* Reject request sub-modal – only for users with approve/reject access */}
                        {rejectCreditRequestModal && canApproveRejectWalletCredit && (
                          <div className="absolute inset-0 z-10 flex items-center justify-center p-4 bg-black/40 rounded-b-xl" onClick={() => !actioningCreditRequestId && setRejectCreditRequestModal(null)}>
                            <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-5 border border-gray-200" onClick={(e) => e.stopPropagation()}>
                              <h4 className="text-base font-semibold text-gray-900 mb-2">Reject request #{rejectCreditRequestModal.id}</h4>
                              <p className="text-sm text-gray-600 mb-3">Optional: add a note for the requester.</p>
                              <textarea
                                rows={3}
                                value={rejectCreditRequestModal.reason}
                                onChange={(e) => setRejectCreditRequestModal((m) => m ? { ...m, reason: e.target.value } : null)}
                                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg text-gray-900 bg-white placeholder:text-gray-500 focus:ring-2 focus:ring-red-500 focus:border-red-500"
                                placeholder="Reason for rejection (optional)"
                              />
                              <div className="flex gap-2 mt-4">
                                <button
                                  type="button"
                                  onClick={() => setRejectCreditRequestModal(null)}
                                  disabled={!!actioningCreditRequestId}
                                  className="flex-1 px-3 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg disabled:opacity-50 transition-colors cursor-pointer"
                                >
                                  Cancel
                                </button>
                                <button
                                  type="button"
                                  onClick={() => rejectCreditRequestModal && handleRejectCreditRequest(rejectCreditRequestModal.id, rejectCreditRequestModal.reason)}
                                  disabled={!!actioningCreditRequestId}
                                  className="flex-1 px-3 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-lg disabled:opacity-50 transition-colors inline-flex items-center justify-center gap-1.5 cursor-pointer"
                                >
                                  {actioningCreditRequestId === rejectCreditRequestModal?.id ? (
                                    <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                                  ) : (
                                    <X className="h-4 w-4" />
                                  )}
                                  Reject
                                </button>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })()}

                {/* Add Amount (wallet credit request) modal */}
                {addAmountFromOrder && riderId && (
                  <AddAmountModal
                    riderId={riderId}
                    riderLabel={`Order #${addAmountFromOrder.orderId}`}
                    open={true}
                    onClose={() => setAddAmountFromOrder(null)}
                    onSuccess={() => {
                      setPendingCreditOrderIds((prev) => new Set(prev).add(addAmountFromOrder.orderId));
                      if (riderId) invalidateRiderSummary(queryClient, riderId);
                      refetchCreditRequestsForRider();
                      refetchRiderSummary();
                    }}
                    orderId={addAmountFromOrder.orderId}
                    serviceType={addAmountFromOrder.orderType as 'food' | 'parcel' | 'person_ride'}
                  />
                )}

                {/* Add Amount (manual/non-order) modal */}
                {addAmountManualOpen && riderId && (
                  <AddAmountModal
                    riderId={riderId}
                    riderLabel={`GMR${riderId}`}
                    open={true}
                    onClose={() => setAddAmountManualOpen(false)}
                    onSuccess={() => {
                      if (riderId) invalidateRiderSummary(queryClient, riderId);
                      refetchCreditRequestsForRider();
                      refetchRiderSummary();
                    }}
                  />
                )}

                {/* Add Penalty modal */}
                {addPenaltyModalOpen && riderId && (
                  <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" onClick={() => !addPenaltySubmitting && (setAddPenaltyModalOpen(false), setAddPenaltyFromOrder(null), setAddPenaltyError(null))}>
                    <div className="bg-white rounded-xl shadow-xl max-w-md w-full max-h-[90vh] overflow-y-auto border border-gray-100" onClick={(e) => e.stopPropagation()}>
                      <div className="p-4 border-b border-gray-200">
                        <h2 className="text-lg font-semibold text-gray-900">Add Penalty</h2>
                        <p className="text-sm text-gray-500 mt-0.5">{addPenaltyFromOrder?.orderValue != null ? `Order #${addPenaltyFromOrder.orderId} • Choose % of order value` : 'Manually impose a penalty for this rider. Reason is required.'}</p>
                      </div>
                      <form onSubmit={(e) => { e.preventDefault(); handleAddPenaltySubmit(e); }} className="p-4 space-y-4">
                        {addPenaltyFromOrder?.orderValue != null ? (
                          <>
                            <div className="rounded bg-gray-50 px-3 py-2 text-sm text-gray-700">
                              Order ID: <strong className="text-gray-900">{addPenaltyFromOrder.orderId}</strong> • Service: <strong className="text-gray-900">{addPenaltyFromOrder.orderType.replace('_', ' ')}</strong> • Order value: <strong className="text-gray-900">₹{addPenaltyFromOrder.orderValue.toFixed(2)}</strong>
                            </div>
                            <div>
                              <label className="block text-sm font-medium text-gray-700 mb-1">Percentage of order value *</label>
                              <select value={addPenaltyForm.penaltyPercent} onChange={(e) => setAddPenaltyForm((f) => ({ ...f, penaltyPercent: Number(e.target.value) }))} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500 bg-white text-gray-900 cursor-pointer">
                                <option value={25} className="text-gray-900 bg-white">25%</option>
                                <option value={50} className="text-gray-900 bg-white">50%</option>
                                <option value={75} className="text-gray-900 bg-white">75%</option>
                                <option value={100} className="text-gray-900 bg-white">100% (default)</option>
                              </select>
                              <p className="mt-1 text-xs text-gray-600">Penalty amount: <strong className="text-gray-900">₹{((addPenaltyFromOrder.orderValue * addPenaltyForm.penaltyPercent) / 100).toFixed(2)}</strong></p>
                            </div>
                            <div>
                              <label className="block text-sm font-medium text-gray-700 mb-1">Reason *</label>
                              <textarea rows={2} required value={addPenaltyForm.reason} onChange={(e) => setAddPenaltyForm((f) => ({ ...f, reason: e.target.value }))} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500 bg-white text-gray-900 placeholder:text-gray-500" placeholder="e.g. Order cancellation, late delivery..." />
                            </div>
                          </>
                        ) : (
                          <>
                            <div>
                              <label className="block text-sm font-medium text-gray-700 mb-1">Amount (₹) *</label>
                              <input type="number" step="0.01" min="0.01" required value={addPenaltyForm.amount} onChange={(e) => setAddPenaltyForm((f) => ({ ...f, amount: e.target.value }))} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500 bg-white text-gray-900" />
                            </div>
                            <div>
                              <label className="block text-sm font-medium text-gray-700 mb-1">Reason for imposing penalty *</label>
                              <textarea rows={2} required value={addPenaltyForm.reason} onChange={(e) => setAddPenaltyForm((f) => ({ ...f, reason: e.target.value }))} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500 bg-white text-gray-900 placeholder:text-gray-500" placeholder="e.g. Order cancellation, fraud, extra charges..." />
                            </div>
                            <div>
                              <label className="block text-sm font-medium text-gray-700 mb-1">Service (optional)</label>
                              <select value={addPenaltyForm.serviceType} onChange={(e) => setAddPenaltyForm((f) => ({ ...f, serviceType: e.target.value }))} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500 bg-white text-gray-900 cursor-pointer">
                                <option value="" className="text-gray-900 bg-white">— Not specified</option>
                                <option value="food" className="text-gray-900 bg-white">Food</option>
                                <option value="parcel" className="text-gray-900 bg-white">Parcel</option>
                                <option value="person_ride" className="text-gray-900 bg-white">Person Ride</option>
                              </select>
                            </div>
                            <div>
                              <label className="block text-sm font-medium text-gray-700 mb-1">Penalty Type</label>
                              <select value={addPenaltyForm.penaltyType} onChange={(e) => setAddPenaltyForm((f) => ({ ...f, penaltyType: e.target.value }))} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500 bg-white text-gray-900 cursor-pointer">
                                {PENALTY_TYPES.map((t) => <option key={t} value={t} className="text-gray-900 bg-white">{t.replace(/_/g, ' ')}</option>)}
                              </select>
                            </div>
                            <div>
                              <label className="block text-sm font-medium text-gray-700 mb-1">Order ID (optional)</label>
                              <input type="number" min="1" value={addPenaltyForm.orderId} onChange={(e) => setAddPenaltyForm((f) => ({ ...f, orderId: e.target.value }))} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 bg-white text-gray-900 placeholder:text-gray-500" placeholder="Leave empty if not linked to an order" />
                            </div>
                          </>
                        )}
                        {addPenaltyError && <p className="text-sm text-red-700 bg-red-50 px-3 py-2 rounded-lg">{addPenaltyError}</p>}
                        <div className="flex gap-2 pt-2">
                          <button type="button" onClick={() => { setAddPenaltyModalOpen(false); setAddPenaltyFromOrder(null); setAddPenaltyError(null); }} className="flex-1 px-3 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg cursor-pointer">Cancel</button>
                          <button type="submit" disabled={addPenaltySubmitting} className="flex-1 px-3 py-2 text-sm font-medium text-white bg-amber-600 hover:bg-amber-700 disabled:opacity-50 rounded-lg cursor-pointer">{addPenaltySubmitting ? 'Adding...' : 'Add Penalty'}</button>
                        </div>
                      </form>
                    </div>
                  </div>
                )}
                {/* Revert penalty modal */}
                {revertPenaltyId != null && riderId && (
                  <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" onClick={() => !revertSubmitting && (setRevertPenaltyId(null), setRevertReason(''), setRevertError(null))}>
                    <div className="bg-white rounded-xl shadow-xl max-w-md w-full overflow-hidden border border-gray-100" onClick={(e) => e.stopPropagation()}>
                      <div className="p-5 border-b border-gray-100 bg-gradient-to-r from-amber-50 to-orange-50">
                        <div className="flex items-center gap-3">
                          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-100 text-amber-700"><RotateCcw className="h-5 w-5" /></div>
                          <div>
                            <h2 className="text-lg font-semibold text-gray-900">Revert penalty</h2>
                            <p className="text-sm text-gray-600 mt-0.5">Reason for reverting is required for audit.</p>
                          </div>
                        </div>
                      </div>
                      <div className="p-5 space-y-4">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1.5">Reason for revert *</label>
                          <textarea rows={3} required value={revertReason} onChange={(e) => setRevertReason(e.target.value)} className="w-full px-3 py-2.5 text-sm text-gray-900 bg-white border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500 placeholder:text-gray-400" placeholder="e.g. Mistaken penalty, order was delivered on time..." />
                        </div>
                        {revertError && <p className="text-sm text-red-700 bg-red-50 px-3 py-2 rounded-lg">{revertError}</p>}
                        <div className="flex gap-3 pt-1">
                          <button type="button" onClick={() => { setRevertPenaltyId(null); setRevertReason(''); setRevertError(null); }} disabled={revertSubmitting} className="flex-1 px-4 py-2.5 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg disabled:opacity-50 cursor-pointer">Cancel</button>
                          <button type="button" onClick={() => handleRevertSubmit()} disabled={revertSubmitting || !revertReason.trim()} className="flex-1 px-4 py-2.5 text-sm font-medium text-white bg-amber-600 hover:bg-amber-700 rounded-lg disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer">{revertSubmitting ? 'Reverting…' : <><RotateCcw className="h-4 w-4" /> Confirm revert</>}</button>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </>
            );
          })()}
        </div>
      )}
    </div>
  );
}

// Recent Data Section Component
interface RecentDataSectionProps {
  title: string;
  data: any[];
  limit: number;
  onLimitChange: (limit: number) => void;
  fromDate: string;
  toDate: string;
  onFromDateChange: (date: string) => void;
  onToDateChange: (date: string) => void;
  loading: boolean;
  renderItem: (item: any) => React.ReactNode;
  emptyMessage: string;
  /** When provided, show "More filters" button and expandable content (section-specific filters) */
  showMoreFilters?: boolean;
  onToggleMoreFilters?: () => void;
  moreFiltersContent?: React.ReactNode;
  onRefresh?: () => void;
  refreshing?: boolean;
  /** When provided, enable client-side pagination (slice data and show TablePagination) */
  page?: number;
  pageSize?: number;
  onPageChange?: (page: number) => void;
  onPageSizeChange?: (size: number) => void;
  /** When provided, show Clear filters button when filters are visible */
  onClearFilters?: () => void;
}

function RecentDataSection({
  title,
  data,
  limit,
  onLimitChange,
  fromDate,
  toDate,
  onFromDateChange,
  onToDateChange,
  loading,
  renderItem,
  emptyMessage,
  showMoreFilters = false,
  onToggleMoreFilters,
  moreFiltersContent,
  onRefresh,
  refreshing = false,
  page,
  pageSize = 10,
  onPageChange,
  onPageSizeChange,
  onClearFilters,
}: RecentDataSectionProps) {
  const [showFilters, setShowFilters] = useState(false);
  const total = data.length;
  const displayData = page != null && pageSize != null ? data.slice((page - 1) * pageSize, page * pageSize) : data;
  return (
    <div className="rounded-2xl border border-gray-200/90 bg-white p-4 sm:p-5 lg:p-6 shadow-sm hover:shadow-md transition-shadow h-full min-h-0 flex flex-col ring-1 ring-gray-900/5">
      {/* Single line: title, refresh, filters (when open), rows per page, pagination, Filters button — compact */}
      <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 mb-2 shrink-0">
        <h3 className="text-sm sm:text-md font-semibold text-gray-800 shrink-0">{title}</h3>
        {onRefresh && (
          <button type="button" onClick={onRefresh} disabled={refreshing} className="p-1 rounded border border-gray-200 bg-gray-50 text-gray-600 hover:bg-gray-100 disabled:opacity-50 cursor-pointer" title="Refresh"><RefreshCw className={`h-3 w-3 sm:h-3.5 sm:w-3.5 ${refreshing ? 'animate-spin' : ''}`} /></button>
        )}
        {showFilters && (
          <>
            {page == null && (
              <select
                value={limit}
                onChange={(e) => onLimitChange(Number(e.target.value))}
                className="px-1.5 py-0.5 text-[10px] sm:text-xs border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 bg-white text-gray-900 w-12 sm:w-14 cursor-pointer"
                title="Number of records"
              >
                <option value={5}>5</option>
                <option value={10}>10</option>
                <option value={20}>20</option>
                <option value={50}>50</option>
              </select>
            )}
            <input type="date" value={fromDate} onChange={(e) => onFromDateChange(e.target.value)} className="px-1.5 py-0.5 text-[10px] sm:text-xs border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 bg-white text-gray-900 w-24 sm:w-28" title="From" />
            <input type="date" value={toDate} onChange={(e) => onToDateChange(e.target.value)} className="px-1.5 py-0.5 text-[10px] sm:text-xs border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 bg-white text-gray-900 w-24 sm:w-28" title="To" />
            {onClearFilters && (
              <button type="button" onClick={onClearFilters} className="shrink-0 px-1.5 py-0.5 text-[10px] sm:text-xs font-medium rounded border border-gray-300 text-gray-700 bg-white hover:bg-gray-50 cursor-pointer" title="Clear filters">Clear filters</button>
            )}
            {onToggleMoreFilters != null && moreFiltersContent != null && (
              <button type="button" onClick={onToggleMoreFilters} className={`flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] sm:text-xs font-medium rounded border cursor-pointer ${showMoreFilters ? "border-blue-300 bg-blue-50 text-blue-700" : "border-gray-200 bg-gray-50 text-gray-600 hover:bg-gray-100"}`} title={showMoreFilters ? "Hide more filters" : "More filters"}>More {showMoreFilters ? <ChevronUp className="h-2.5 w-2.5" /> : <ChevronDown className="h-2.5 w-2.5" />}</button>
            )}
          </>
        )}
        {page != null && onPageChange != null && (
          <>
            <span className="text-[10px] sm:text-xs text-gray-600 whitespace-nowrap">Rows</span>
            <select value={pageSize} onChange={(e) => { onPageSizeChange?.(Number(e.target.value)); onPageChange(1); }} className="h-6 min-w-0 w-10 sm:w-12 rounded border border-gray-300 bg-white px-1 text-[10px] sm:text-xs text-gray-900 focus:ring-1 focus:ring-blue-500 cursor-pointer" aria-label="Rows per page">
              <option value={5}>5</option>
              <option value={10}>10</option>
              <option value={20}>20</option>
              <option value={50}>50</option>
            </select>
            <TablePagination page={page} pageSize={pageSize ?? 10} total={total} onPageChange={onPageChange} disabled={refreshing} ariaLabel={title} compact />
          </>
        )}
        <button type="button" onClick={() => setShowFilters((v) => !v)} className={`flex items-center gap-1 px-1.5 py-0.5 text-[10px] sm:text-xs font-medium rounded border ml-auto sm:ml-0 cursor-pointer ${showFilters ? "border-blue-300 bg-blue-50 text-blue-700" : "border-gray-200 bg-gray-50 text-gray-600 hover:bg-gray-100"}`}>
          <Filter className="h-3 w-3 sm:h-3.5 sm:w-3.5 shrink-0" /> Filters
        </button>
      </div>
      {showFilters && showMoreFilters && moreFiltersContent != null && (
        <div className="mb-4 shrink-0 p-3 rounded-lg border border-gray-200 bg-gray-50/80">{moreFiltersContent}</div>
      )}

      <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-500"></div>
          </div>
        ) : data.length > 0 ? (
          <>
          <div className="space-y-2 min-h-0 overflow-y-auto pr-1 flex-1">
            {displayData.map((item, index) => (
              <div key={item.id || index}>
                {renderItem(item)}
              </div>
            ))}
          </div>
          </>
        ) : (
          <p className="text-gray-500 text-sm text-center py-4">{emptyMessage}</p>
        )}
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const statusColors: Record<string, string> = {
    pending: 'bg-yellow-100 text-yellow-800',
    approved: 'bg-green-100 text-green-800',
    rejected: 'bg-red-100 text-red-800',
    completed: 'bg-blue-100 text-blue-800',
    open: 'bg-orange-100 text-orange-800',
    closed: 'bg-gray-100 text-gray-800',
    processing: 'bg-blue-100 text-blue-800',
    paid: 'bg-green-100 text-green-800',
    active: 'bg-amber-100 text-amber-800',
    reversed: 'bg-gray-100 text-gray-700',
  };

  const colorClass = statusColors[status.toLowerCase()] || 'bg-gray-100 text-gray-800';

  return (
    <span className={`px-2 py-1 text-xs font-medium rounded-full ${colorClass}`}>
      {status}
    </span>
  );
}

// Flower spinner loading animation
// (Legacy FlowerSpinner removed; using shared LoadingSpinner instead)

function InfoRow({ label, value }: { label: string; value: string | React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[11px] font-medium text-gray-500 uppercase tracking-wide">{label}</span>
      <span className="text-sm font-semibold text-gray-900 break-words leading-tight">{value}</span>
    </div>
  );
}

function InfoInline({ label, value }: { label: string; value: string | React.ReactNode }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className="text-[11px] font-medium text-gray-500 uppercase tracking-wide shrink-0">{label}:</span>
      <span className="text-sm font-semibold text-gray-900">{value}</span>
    </span>
  );
}
