"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useSearchParams, usePathname } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/rider-dashboard/supabaseClient";
import { useRiderDashboardOptional } from "@/context/RiderDashboardContext";
import { buildRiderDetailUrl } from "@/lib/riders/rider-dashboard-navigation";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { useRiderAccessQuery } from "@/hooks/queries/useRiderAccessQuery";
import { useRiderSummaryQuery } from "@/hooks/queries/useRiderSummaryQuery";
import { invalidateRiderSummary } from "@/lib/cache-invalidation";
import type { RiderSummaryParams } from "@/lib/queryKeys";
import {
  parseNumericRiderIdFromSearch,
  riderSearchNeedsSupabaseResolve,
} from "@/lib/riders/resolve-rider-search";
import {
  resolveRiderServiceRestriction,
  serviceSlotLabel,
  type NegativeWalletBlockRow,
  type RiderServiceSlot,
} from "@/lib/rider-restriction-display";
import type { RiderSummary } from "@/types/rider-dashboard";
import Link from "next/link";
import {
  ShieldCheck,
  ShieldOff,
  Clock,
  Filter,
  UtensilsCrossed,
  Package,
  User,
  AlertTriangle,
  Lock,
  RefreshCw,
  Calendar,
  Bot,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
} from "lucide-react";

const HISTORY_PAGE_SIZE = 10;

const BLACKLIST_SUMMARY_PARAMS: RiderSummaryParams = {
  ordersLimit: 1,
  ordersFrom: "",
  ordersTo: "",
  ordersOrderType: "all",
  ordersStatus: "all",
  ordersOrderId: "",
  withdrawalsLimit: 1,
  withdrawalsFrom: "",
  withdrawalsTo: "",
  ticketsLimit: 1,
  ticketsFrom: "",
  ticketsTo: "",
  ticketsStatus: "all",
  ticketsCategory: "all",
  ticketsPriority: "all",
  penaltiesLimit: 1,
  penaltiesFrom: "",
  penaltiesTo: "",
  penaltiesStatus: "all",
  penaltiesServiceType: "all",
  penaltiesOrderId: "",
};

const SERVICE_TABLE_ROWS: Array<{
  service: RiderServiceSlot;
  description: string;
  subtitle?: string;
  icon: typeof ShieldCheck;
  iconWrapClass: string;
  iconClass: string;
}> = [
  {
    service: "all",
    description: "Master control for all services",
    subtitle: "Applies to all services",
    icon: ShieldCheck,
    iconWrapClass: "bg-violet-100",
    iconClass: "text-violet-600",
  },
  {
    service: "food",
    description: "Food delivery service",
    icon: UtensilsCrossed,
    iconWrapClass: "bg-emerald-100",
    iconClass: "text-emerald-600",
  },
  {
    service: "parcel",
    description: "Parcel & courier delivery",
    icon: Package,
    iconWrapClass: "bg-sky-100",
    iconClass: "text-sky-600",
  },
  {
    service: "person_ride",
    description: "Ride booking service",
    icon: User,
    iconWrapClass: "bg-orange-100",
    iconClass: "text-orange-600",
  },
];

interface RiderInfo {
  id: number;
  name: string | null;
  mobile: string;
}

interface BlacklistStatus {
  isBanned?: boolean;
  isPermanent?: boolean;
  expiresAt?: string;
  reason?: string;
  source?: string;
  actorEmail?: string;
  actorName?: string;
  remainingMs?: number;
  partiallyAllowedServices?: string[];
}

interface BlacklistHistoryEntry {
  id: number;
  serviceType: string;
  banned: boolean;
  reason: string;
  source: string;
  isPermanent: boolean;
  expiresAt: string | null;
  createdAt: string;
  actorEmail: string | null;
  actorName: string | null;
  restrictionType?: "agent_blacklist" | "wallet_auto_block";
}

interface SummaryResponse {
  blacklistStatusByService: RiderSummary["blacklistStatusByService"];
  blacklistHistory?: BlacklistHistoryEntry[];
  restrictionHistory?: BlacklistHistoryEntry[];
  negativeWalletBlocks?: NegativeWalletBlockRow[];
  wallet?: {
    globalWalletBlock?: boolean;
    totalBalance?: string;
  } | null;
}

function getLocalDateIso(date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function toLocalDateIsoFromTimestamp(iso: string): string {
  return getLocalDateIso(new Date(iso));
}

function formatHistoryRangeLabel(fromIso: string, toIso: string): string {
  const fmt = (iso: string) =>
    new Date(`${iso}T12:00:00`).toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  const fromLabel = fmt(fromIso);
  const toLabel = fmt(toIso);
  return fromIso === toIso ? fromLabel : `${fromLabel} - ${toLabel}`;
}

function isHistoryEntryInDateRange(entryIso: string, fromIso: string, toIso: string): boolean {
  const entryDate = toLocalDateIsoFromTimestamp(entryIso);
  return entryDate >= fromIso && entryDate <= toIso;
}

function formatHistoryDateTime(iso: string): string {
  const d = new Date(iso);
  const date = d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
  const time = d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true });
  return `${date}, ${time}`;
}

function historyServiceLabel(serviceType: string): string {
  if (serviceType === "person_ride") return "Person Ride";
  if (serviceType === "all") return "All Services";
  return serviceType.charAt(0).toUpperCase() + serviceType.slice(1);
}

function getUnlockConditionText(
  isBlocked: boolean,
  isBlockedByWalletOnly: boolean,
  globalWalletBlock: boolean,
  service: RiderServiceSlot
): string {
  if (!isBlocked) return "—";
  if (isBlockedByWalletOnly) {
    return globalWalletBlock || service === "all" ? "Balance ≥ ₹0" : "Balance > -₹50";
  }
  return "Agent whitelist";
}

function serviceIconForHistory(serviceType: string) {
  if (serviceType === "food") return UtensilsCrossed;
  if (serviceType === "parcel") return Package;
  if (serviceType === "person_ride") return User;
  return ShieldCheck;
}

function serviceIconColors(serviceType: string) {
  if (serviceType === "food") return { wrap: "bg-emerald-50", icon: "text-emerald-600" };
  if (serviceType === "parcel") return { wrap: "bg-sky-50", icon: "text-sky-600" };
  if (serviceType === "person_ride") return { wrap: "bg-orange-50", icon: "text-orange-600" };
  return { wrap: "bg-violet-50", icon: "text-violet-600" };
}
function formatRemaining(ms: number): string {
  if (ms <= 0) return "";
  const hours = Math.floor(ms / (60 * 60 * 1000));
  const days = Math.floor(hours / 24);
  if (days >= 1) return `${days} day${days !== 1 ? "s" : ""}`;
  return `${hours} hour${hours !== 1 ? "s" : ""}`;
}

export function RiderBlacklistClient() {
  const queryClient = useQueryClient();
  const searchParams = useSearchParams();
  const riderContext = useRiderDashboardOptional();
  const searchValue = (searchParams.get("search") || "").trim();
  const parsedRiderId = useMemo(() => parseNumericRiderIdFromSearch(searchValue), [searchValue]);

  const [rider, setRider] = useState<RiderInfo | null>(null);
  const [resolveLoading, setResolveLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [blacklistModal, setBlacklistModal] = useState<{ service: "food" | "parcel" | "person_ride" | "all"; action: "blacklist" | "whitelist" } | null>(null);
  const [blacklistReason, setBlacklistReason] = useState("");
  const [blacklistPermanent, setBlacklistPermanent] = useState(true);
  const [blacklistDurationHours, setBlacklistDurationHours] = useState(24);
  const [blacklistError, setBlacklistError] = useState<string | null>(null);
  const [blacklistSubmitting, setBlacklistSubmitting] = useState(false);
  const [blacklistLoadingService, setBlacklistLoadingService] = useState<string | null>(null);

  type ActionFilter = "all" | "blacklist" | "whitelist";
  type ServiceFilter = "all" | "food" | "parcel" | "person_ride";
  const [historyActionFilter, setHistoryActionFilter] = useState<ActionFilter>("all");
  const [historyServiceFilter, setHistoryServiceFilter] = useState<ServiceFilter>("all");
  const [historyFiltersOpen, setHistoryFiltersOpen] = useState(true);
  const [historyPage, setHistoryPage] = useState(1);
  const [historyFrom, setHistoryFrom] = useState(getLocalDateIso);
  const [historyTo, setHistoryTo] = useState(getLocalDateIso);
  const [historyCalendarOpen, setHistoryCalendarOpen] = useState(false);
  const historyCalendarRef = useRef<HTMLDivElement>(null);

  const { data: riderAccess } = useRiderAccessQuery();
  const canActForService = (s: "food" | "parcel" | "person_ride" | "all", action: "block" | "unblock") => {
    if (action === "block") {
      return s === "all"
        ? (riderAccess?.canBlock?.food || riderAccess?.canBlock?.parcel || riderAccess?.canBlock?.person_ride) ?? false
        : (riderAccess?.canBlock?.[s] ?? false);
    }
    return s === "all"
      ? (riderAccess?.canUnblock?.food || riderAccess?.canUnblock?.parcel || riderAccess?.canUnblock?.person_ride) ?? false
      : (riderAccess?.canUnblock?.[s] ?? false);
  };

  const resolveRiderByPhone = useCallback(async (value: string) => {
    if (!value.trim()) {
      setRider(null);
      return;
    }
    setResolveLoading(true);
    setError(null);
    try {
      if (!supabase) throw new Error("Database not available");
      let query = supabase.from("riders").select("id, name, mobile");
      const isPhone = /^\d{10,}$/.test(value.replace(/^\+?91/, ""));
      if (isPhone) {
        query = query.eq("mobile", value.replace(/^\+?91/, ""));
      } else {
        query = query.ilike("mobile", `%${value}%`);
      }
      const { data, error: e } = await query.limit(1).single();
      if (e || !data) {
        setRider(null);
        setError("No rider found");
        return;
      }
      setRider({ id: data.id, name: data.name, mobile: data.mobile });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to resolve rider");
      setRider(null);
    } finally {
      setResolveLoading(false);
    }
  }, []);

  const riderFromContext = useMemo<RiderInfo | null>(() => {
    const info = riderContext?.currentRiderInfo;
    if (!info) return null;
    return { id: info.id, name: info.name, mobile: info.mobile };
  }, [
    riderContext?.currentRiderInfo?.id,
    riderContext?.currentRiderInfo?.name,
    riderContext?.currentRiderInfo?.mobile,
  ]);

  useEffect(() => {
    if (!searchValue) {
      if (riderFromContext) {
        setRider(riderFromContext);
        setError(null);
      } else {
        setRider(null);
        setError(null);
      }
      return;
    }

    if (parsedRiderId != null) {
      if (riderFromContext?.id === parsedRiderId) {
        setRider(riderFromContext);
      } else {
        setRider((prev) =>
          prev?.id === parsedRiderId ? prev : { id: parsedRiderId, name: null, mobile: "" }
        );
      }
      setError(null);
      return;
    }

    if (riderSearchNeedsSupabaseResolve(searchValue)) {
      void resolveRiderByPhone(searchValue);
    }
  }, [searchValue, parsedRiderId, riderFromContext, resolveRiderByPhone]);

  const riderId = rider?.id ?? parsedRiderId ?? riderFromContext?.id ?? null;
  const contextSummary =
    riderContext?.riderSummary?.rider?.id === riderId ? riderContext.riderSummary : null;

  const { data: summaryData, isFetching: summaryFetching, refetch: refetchSummary } =
    useRiderSummaryQuery(riderId, BLACKLIST_SUMMARY_PARAMS);

  const summary: SummaryResponse | null = useMemo(() => {
    const source = summaryData ?? contextSummary;
    if (!source) return null;
    return {
      blacklistStatusByService: source.blacklistStatusByService,
      blacklistHistory: source.blacklistHistory,
      restrictionHistory: source.restrictionHistory ?? source.blacklistHistory,
      negativeWalletBlocks: source.negativeWalletBlocks,
      wallet: source.wallet,
    };
  }, [summaryData, contextSummary]);

  useEffect(() => {
    if (!summaryData?.rider || riderId == null) return;
    const r = summaryData.rider;
    setRider((prev) => {
      if (prev?.id === r.id && prev.name === r.name && prev.mobile === r.mobile) return prev;
      return { id: r.id, name: r.name, mobile: r.mobile };
    });
  }, [summaryData?.rider, riderId]);

  const handleBlacklistSubmit = async () => {
    if (!rider || !blacklistModal) return;
    const reason = blacklistReason.trim();
    if (!reason) {
      setBlacklistError("Reason is required.");
      return;
    }
    if (blacklistModal.action === "blacklist" && blacklistModal.service !== "all" && !blacklistPermanent && (!blacklistDurationHours || blacklistDurationHours < 1)) {
      setBlacklistError("For temporary blacklist, enter duration (hours).");
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
      if (blacklistModal.action === "blacklist") {
        body.isPermanent = blacklistModal.service === "all" ? true : blacklistPermanent;
        if (!body.isPermanent) body.durationHours = blacklistDurationHours;
      }
      const res = await fetch(`/api/riders/${rider.id}/blacklist`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        setBlacklistError(data.error || "Request failed");
        return;
      }
      setBlacklistModal(null);
      setBlacklistReason("");
      setBlacklistPermanent(true);
      setBlacklistDurationHours(24);
      if (rider.id) {
        invalidateRiderSummary(queryClient, rider.id);
        await refetchSummary();
      }
    } catch (e) {
      setBlacklistError(e instanceof Error ? e.message : "Request failed");
    } finally {
      setBlacklistSubmitting(false);
      setBlacklistLoadingService(null);
    }
  };

  const hasSearch = searchValue.length > 0;

  const negativeWalletBlocks = summary?.negativeWalletBlocks ?? [];
  const globalWalletBlock = summary?.wallet?.globalWalletBlock === true;
  const restrictionHistory =
    summary?.restrictionHistory ?? summary?.blacklistHistory ?? [];

  const filteredHistory = restrictionHistory.filter((h) => {
    if (!isHistoryEntryInDateRange(h.createdAt, historyFrom, historyTo)) return false;
    if (historyActionFilter !== "all") {
      if (historyActionFilter === "blacklist") {
        if (!h.banned) return false;
      }
      if (historyActionFilter === "whitelist" && h.banned) return false;
    }
    if (historyServiceFilter !== "all") {
      if (h.serviceType !== historyServiceFilter) return false;
    }
    return true;
  });

  const serviceStats = useMemo(() => {
    if (!summary?.blacklistStatusByService) {
      return { blocked: 0, walletAuto: 0, whitelisted: SERVICE_TABLE_ROWS.length };
    }
    let blocked = 0;
    let walletAuto = 0;
    let whitelisted = 0;
    for (const row of SERVICE_TABLE_ROWS) {
      const restriction = resolveRiderServiceRestriction({
        service: row.service,
        blacklist: summary.blacklistStatusByService[row.service],
        globalWalletBlock,
        negativeWalletBlocks,
      });
      if (restriction.isBlocked) {
        blocked += 1;
        if (restriction.isBlockedByWalletOnly) walletAuto += 1;
      } else {
        whitelisted += 1;
      }
    }
    return { blocked, walletAuto, whitelisted };
  }, [summary?.blacklistStatusByService, globalWalletBlock, negativeWalletBlocks]);

  const historyDateLabel = useMemo(
    () => formatHistoryRangeLabel(historyFrom, historyTo),
    [historyFrom, historyTo]
  );

  const historyTotalPages = Math.max(1, Math.ceil(filteredHistory.length / HISTORY_PAGE_SIZE));
  const paginatedHistory = useMemo(() => {
    const start = (historyPage - 1) * HISTORY_PAGE_SIZE;
    return filteredHistory.slice(start, start + HISTORY_PAGE_SIZE);
  }, [filteredHistory, historyPage]);
  const historyRangeStart =
    filteredHistory.length === 0 ? 0 : (historyPage - 1) * HISTORY_PAGE_SIZE + 1;
  const historyRangeEnd = Math.min(historyPage * HISTORY_PAGE_SIZE, filteredHistory.length);

  useEffect(() => {
    setHistoryPage(1);
  }, [historyActionFilter, historyServiceFilter, restrictionHistory.length, historyFrom, historyTo]);

  useEffect(() => {
    if (!historyCalendarOpen) return;
    const handleClickOutside = (event: MouseEvent) => {
      if (historyCalendarRef.current && !historyCalendarRef.current.contains(event.target as Node)) {
        setHistoryCalendarOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [historyCalendarOpen]);

  useEffect(() => {
    if (historyPage > historyTotalPages) setHistoryPage(historyTotalPages);
  }, [historyPage, historyTotalPages]);

  const pathname = usePathname();
  const riderCardReturnTo = riderId
    ? `${pathname}?search=${encodeURIComponent(searchValue || `GMR${riderId}`)}`
    : pathname;

  const handleRefreshHistory = () => {
    if (riderId) void refetchSummary();
  };

  const handleHistoryFromChange = (value: string) => {
    setHistoryFrom(value);
    if (value > historyTo) setHistoryTo(value);
  };

  const handleHistoryToChange = (value: string) => {
    setHistoryTo(value);
    if (value < historyFrom) setHistoryFrom(value);
  };

  return (
    <div className="space-y-5 w-full max-w-full overflow-x-hidden">
      {resolveLoading && (
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <LoadingSpinner size="sm" />
          Resolving rider…
        </div>
      )}
      {error && hasSearch && !resolveLoading ? (
        <p className="text-sm text-red-600 font-medium">{error}</p>
      ) : null}

      {riderId && (
        <>
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0">
              <h1 className="text-xl font-bold text-gray-900 tracking-tight">Service Access Control</h1>
              <p className="text-sm text-gray-500 mt-1">
                Manage rider service restrictions, wallet rules, and blacklist history.
              </p>
            </div>
            {rider ? (
              <div className="flex items-center gap-2 shrink-0">
                <div className="inline-flex flex-nowrap items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2 shadow-sm ring-1 ring-gray-900/5">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gray-100 text-gray-600">
                    <User className="h-4 w-4" aria-hidden />
                  </div>
                  <div className="text-sm whitespace-nowrap">
                    <span className="font-medium text-gray-900">GMR{rider.id}</span>
                    <span className="text-gray-400 mx-1.5">·</span>
                    <span className="text-gray-700">{rider.name || "—"}</span>
                    <span className="text-gray-400 mx-1.5">·</span>
                    <span className="text-gray-600">{rider.mobile || "—"}</span>
                  </div>
                  <div className="flex items-center gap-2 ml-1 shrink-0">
                    <Link
                      href={buildRiderDetailUrl(rider.id, riderCardReturnTo)}
                      className="text-xs font-medium text-blue-600 hover:text-blue-700 whitespace-nowrap"
                    >
                      View details
                    </Link>
                  </div>
                </div>
              </div>
            ) : null}
          </div>

          <div className="rounded-xl border border-gray-200/90 bg-white shadow-sm ring-1 ring-gray-900/5 relative overflow-hidden">
            {summaryFetching && summary?.blacklistStatusByService ? (
              <div className="absolute top-0 left-0 right-0 h-0.5 bg-gray-100 z-10 overflow-hidden">
                <div className="h-full w-1/3 bg-violet-500 animate-pulse rounded-r" />
              </div>
            ) : null}

            <div className={`p-4 sm:p-5 transition-opacity duration-200 ${summaryFetching ? "opacity-95" : ""}`}>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-4">
                <h2 className="text-base font-bold text-gray-900">Status by Service</h2>
                <div className="flex flex-wrap items-center gap-2 sm:gap-3 shrink-0">
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-red-50 px-3 py-1.5 text-sm font-semibold text-red-700 ring-1 ring-red-200/80">
                    <ShieldOff className="h-4 w-4" aria-hidden />
                    All Blocked: {serviceStats.blocked}
                  </span>
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-3 py-1.5 text-sm font-semibold text-amber-800 ring-1 ring-amber-200/80">
                    Auto-block (Wallet): {serviceStats.walletAuto}
                  </span>
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1.5 text-sm font-semibold text-emerald-700 ring-1 ring-emerald-200/80">
                    <ShieldCheck className="h-4 w-4" aria-hidden />
                    Whitelisted: {serviceStats.whitelisted}
                  </span>
                </div>
              </div>

              {(globalWalletBlock || negativeWalletBlocks.length > 0) && (
                <div className="mb-4 flex items-center gap-2 rounded-lg border border-amber-200/80 bg-amber-50 px-3 py-2">
                  <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600" aria-hidden />
                  <p className="text-xs font-medium text-amber-900">
                    {globalWalletBlock
                      ? "All services blocked. Balance below -₹200. Unlock at ₹0."
                      : `Wallet blocks active: ${negativeWalletBlocks
                          .map((b) =>
                            b.serviceType === "person_ride"
                              ? "Person ride"
                              : b.serviceType.charAt(0).toUpperCase() + b.serviceType.slice(1)
                          )
                          .join(", ")} — unlocks when balance > -50 per service`}
                  </p>
                </div>
              )}

              <div className="rounded-lg border border-gray-200 overflow-hidden">
                <div className="hidden lg:grid lg:grid-cols-[minmax(0,1.35fr)_minmax(0,0.85fr)_minmax(0,1.1fr)_minmax(0,0.75fr)_minmax(0,0.55fr)] gap-3 px-4 py-2.5 bg-gray-50/90 border-b border-gray-200">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">Service</span>
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">Status</span>
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">Description</span>
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">Unlock Condition</span>
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-500 text-center">Wallet Rule</span>
                </div>

                <div className="divide-y divide-gray-100">
                  {SERVICE_TABLE_ROWS.map((row) => {
                    const service = row.service;
                    const bl = summary?.blacklistStatusByService?.[service];
                    const restriction = resolveRiderServiceRestriction({
                      service,
                      blacklist: bl,
                      globalWalletBlock,
                      negativeWalletBlocks,
                    });
                    const { isBlocked, isBlockedByWalletOnly, statusLabel } = restriction;
                    const serviceLabel = serviceSlotLabel(service);
                    const isLoading = blacklistLoadingService === service;
                    const remaining = bl?.remainingMs != null ? formatRemaining(bl.remainingMs) : null;
                    const canToggle =
                      !isBlockedByWalletOnly &&
                      (isBlocked
                        ? canActForService(service, "unblock")
                        : canActForService(service, "block"));
                    const openModal = (action: "blacklist" | "whitelist") => {
                      setBlacklistModal({ service, action });
                      setBlacklistReason("");
                      setBlacklistError(null);
                    };
                    const Icon = row.icon;
                    const unlockText = getUnlockConditionText(
                      isBlocked,
                      isBlockedByWalletOnly,
                      globalWalletBlock,
                      service
                    );
                    const statusPillClass = isBlockedByWalletOnly
                      ? "bg-orange-50 text-orange-800 ring-orange-200/80"
                      : isBlocked
                        ? "bg-red-50 text-red-700 ring-red-200/80"
                        : "bg-emerald-50 text-emerald-700 ring-emerald-200/80";
                    const statusPillLabel = isBlockedByWalletOnly
                      ? "Auto-blocked"
                      : isBlocked
                        ? statusLabel
                        : "Allowed";

                    return (
                      <div
                        key={service}
                        className={`relative px-4 py-3 ${isLoading ? "pointer-events-none opacity-80" : ""}`}
                      >
                        {isLoading && (
                          <div className="absolute inset-0 flex items-center justify-center bg-white/70 z-10">
                            <LoadingSpinner size="md" />
                          </div>
                        )}
                        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,0.85fr)_minmax(0,1.1fr)_minmax(0,0.75fr)_minmax(0,0.55fr)] gap-2.5 lg:gap-3 lg:items-center">
                          <div className="flex items-center gap-2.5 min-w-0">
                            <div
                              className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${row.iconWrapClass}`}
                            >
                              <Icon className={`h-4 w-4 ${row.iconClass}`} aria-hidden />
                            </div>
                            <div className="min-w-0">
                              <p className="text-sm font-semibold text-gray-900">{serviceLabel}</p>
                              {row.subtitle ? (
                                <p className="text-[11px] text-gray-500">{row.subtitle}</p>
                              ) : (
                                <p className="text-[11px] text-gray-500">{row.description}</p>
                              )}
                            </div>
                          </div>

                          <div>
                            <span className="lg:hidden text-[10px] font-semibold uppercase tracking-wide text-gray-400 mb-1 block">
                              Status
                            </span>
                            <span
                              className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ${statusPillClass}`}
                            >
                              {isBlockedByWalletOnly ? (
                                <Lock className="h-3 w-3 shrink-0" aria-hidden />
                              ) : isBlocked ? (
                                <ShieldOff className="h-3 w-3 shrink-0" aria-hidden />
                              ) : (
                                <ShieldCheck className="h-3 w-3 shrink-0" aria-hidden />
                              )}
                              {statusPillLabel}
                            </span>
                            {isBlocked && !isBlockedByWalletOnly && !bl?.isPermanent && remaining ? (
                              <p className="text-[10px] text-amber-700 mt-1 flex items-center gap-1">
                                <Clock className="h-3 w-3" /> {remaining} left
                              </p>
                            ) : null}
                          </div>

                          <div className="min-w-0">
                            <span className="lg:hidden text-[10px] font-semibold uppercase tracking-wide text-gray-400 mb-1 block">
                              Description
                            </span>
                            <p className="text-xs text-gray-600">{row.description}</p>
                            {bl?.reason && !isBlockedByWalletOnly ? (
                              <p className="text-[11px] text-gray-500 mt-0.5 line-clamp-1" title={bl.reason}>
                                {bl.reason}
                              </p>
                            ) : null}
                          </div>

                          <div>
                            <span className="lg:hidden text-[10px] font-semibold uppercase tracking-wide text-gray-400 mb-1 block">
                              Unlock Condition
                            </span>
                            <p
                              className={`text-xs font-semibold ${
                                unlockText.startsWith("Balance") ? "text-emerald-600" : "text-gray-500"
                              }`}
                            >
                              {unlockText}
                            </p>
                          </div>

                          <div className="flex lg:justify-center items-center">
                            <span className="lg:hidden text-[10px] font-semibold uppercase tracking-wide text-gray-400 mr-2">
                              Wallet Rule
                            </span>
                            {isBlockedByWalletOnly ? (
                              <div
                                aria-label={`Auto-blocked – ${serviceLabel}`}
                                className="relative inline-flex h-5 w-9 shrink-0 rounded-full border-2 border-gray-300 bg-gray-200 cursor-not-allowed"
                                title="Blocked by wallet balance rule (not an agent blacklist toggle)."
                              >
                                <span className="pointer-events-none inline-block h-4 w-4 transform translate-x-0.5 rounded-full bg-white shadow mt-px" />
                              </div>
                            ) : canToggle ? (
                              <button
                                type="button"
                                onClick={() => openModal(isBlocked ? "whitelist" : "blacklist")}
                                className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:ring-violet-500 ${
                                  isBlocked
                                    ? "border-red-400 bg-red-500"
                                    : "border-emerald-400 bg-emerald-500"
                                }`}
                                aria-checked={!isBlocked}
                                role="switch"
                                aria-label={isBlocked ? `Whitelist ${serviceLabel}` : `Blacklist ${serviceLabel}`}
                              >
                                <span
                                  className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform mt-px ${
                                    isBlocked ? "translate-x-0.5" : "translate-x-4"
                                  }`}
                                />
                              </button>
                            ) : (
                              <span className="text-[11px] text-gray-400">—</span>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
            <div className="px-4 sm:px-5 pt-4 sm:pt-5 pb-3 border-b border-gray-100">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0">
                  <h2 className="text-base sm:text-lg font-bold text-gray-900">Blacklist / Whitelist History</h2>
                  <p className="text-xs sm:text-sm text-gray-500 mt-0.5">
                    Recent actions with performer and reason.
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  <div className="relative" ref={historyCalendarRef}>
                    <div className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-medium text-gray-700 shadow-sm">
                      <button
                        type="button"
                        onClick={() => setHistoryCalendarOpen((open) => !open)}
                        className="inline-flex items-center justify-center text-gray-400 hover:text-gray-700 transition-colors"
                        aria-label="Select date range"
                        aria-expanded={historyCalendarOpen}
                      >
                        <Calendar className="h-4 w-4 shrink-0" aria-hidden />
                      </button>
                      <span className="whitespace-nowrap">{historyDateLabel}</span>
                      <button
                        type="button"
                        onClick={handleRefreshHistory}
                        disabled={summaryFetching}
                        className="inline-flex items-center justify-center text-gray-500 hover:text-gray-800 disabled:opacity-50 transition-colors"
                        aria-label="Refresh history"
                      >
                        <RefreshCw className={`h-3.5 w-3.5 ${summaryFetching ? "animate-spin" : ""}`} />
                      </button>
                    </div>

                    {historyCalendarOpen ? (
                      <div className="absolute right-0 top-full z-30 mt-2 w-72 rounded-xl border border-gray-200 bg-white p-4 shadow-lg ring-1 ring-gray-900/5">
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500 mb-3">
                          Date range
                        </p>
                        <div className="space-y-3">
                          <label className="block">
                            <span className="mb-1 block text-xs font-medium text-gray-600">From</span>
                            <input
                              type="date"
                              value={historyFrom}
                              onChange={(e) => handleHistoryFromChange(e.target.value)}
                              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                            />
                          </label>
                          <label className="block">
                            <span className="mb-1 block text-xs font-medium text-gray-600">To</span>
                            <input
                              type="date"
                              value={historyTo}
                              onChange={(e) => handleHistoryToChange(e.target.value)}
                              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                            />
                          </label>
                        </div>
                        <button
                          type="button"
                          onClick={() => setHistoryCalendarOpen(false)}
                          className="mt-4 w-full rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-700 transition-colors"
                        >
                          Apply
                        </button>
                      </div>
                    ) : null}
                  </div>
                  <button
                    type="button"
                    onClick={() => setHistoryFiltersOpen((o) => !o)}
                    className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-semibold transition-colors ${
                      historyFiltersOpen
                        ? "border-gray-300 bg-gray-50 text-gray-800"
                        : "border-gray-200 bg-white text-gray-700 hover:bg-gray-50"
                    }`}
                  >
                    <Filter className="h-3.5 w-3.5" />
                    Filters
                  </button>
                </div>
              </div>

              {historyFiltersOpen ? (
                <div className="mt-4 flex flex-wrap items-center gap-4 sm:gap-6">
                  <label className="inline-flex items-center gap-1.5 text-sm text-gray-600">
                    <span>Action:</span>
                    <span className="relative inline-flex items-center">
                      <select
                        value={historyActionFilter}
                        onChange={(e) => setHistoryActionFilter(e.target.value as ActionFilter)}
                        className="appearance-none cursor-pointer bg-transparent py-0.5 pl-0 pr-5 text-sm font-semibold text-gray-900 focus:outline-none focus:ring-0"
                        aria-label="Filter by action"
                      >
                        <option value="all">All</option>
                        <option value="blacklist">Blacklist</option>
                        <option value="whitelist">Whitelist</option>
                      </select>
                      <ChevronDown className="pointer-events-none absolute right-0 h-3.5 w-3.5 text-gray-400" aria-hidden />
                    </span>
                  </label>
                  <label className="inline-flex items-center gap-1.5 text-sm text-gray-600">
                    <span>Service:</span>
                    <span className="relative inline-flex items-center">
                      <select
                        value={historyServiceFilter}
                        onChange={(e) => setHistoryServiceFilter(e.target.value as ServiceFilter)}
                        className="appearance-none cursor-pointer bg-transparent py-0.5 pl-0 pr-5 text-sm font-semibold text-gray-900 focus:outline-none focus:ring-0"
                        aria-label="Filter by service"
                      >
                        <option value="all">All Services</option>
                        <option value="food">Food</option>
                        <option value="parcel">Parcel</option>
                        <option value="person_ride">Person Ride</option>
                      </select>
                      <ChevronDown className="pointer-events-none absolute right-0 h-3.5 w-3.5 text-gray-400" aria-hidden />
                    </span>
                  </label>
                </div>
              ) : null}
            </div>

            <div className="overflow-x-auto">
              {paginatedHistory.length > 0 ? (
                <table className="min-w-full">
                  <thead>
                    <tr className="border-b border-gray-100 bg-gray-50/60">
                      <th className="px-4 sm:px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-gray-500">
                        Date &amp; Time
                      </th>
                      <th className="px-4 sm:px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-gray-500">
                        Service
                      </th>
                      <th className="px-4 sm:px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-gray-500">
                        Action
                      </th>
                      <th className="px-4 sm:px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-gray-500">
                        Reason
                      </th>
                      <th className="px-4 sm:px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-gray-500">
                        Performed By
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {paginatedHistory.map((h) => {
                      const HistIcon = serviceIconForHistory(h.serviceType);
                      const colors = serviceIconColors(h.serviceType);
                      const isAutomated =
                        h.restrictionType === "wallet_auto_block" ||
                        h.source === "system" ||
                        (!h.actorEmail && !h.actorName);
                      const performerLabel =
                        h.source === "agent" && (h.actorEmail || h.actorName)
                          ? h.actorName || h.actorEmail || "Agent"
                          : "Automated";

                      return (
                        <tr key={h.id} className="hover:bg-gray-50/50 transition-colors">
                          <td className="px-4 sm:px-5 py-3.5 text-sm text-gray-800 whitespace-nowrap">
                            <span className="inline-flex items-center gap-2">
                              <Clock className="h-4 w-4 text-gray-400 shrink-0" aria-hidden />
                              {formatHistoryDateTime(h.createdAt)}
                            </span>
                          </td>
                          <td className="px-4 sm:px-5 py-3.5">
                            <span className="inline-flex items-center gap-2.5 text-sm font-medium text-gray-900">
                              <span
                                className={`flex h-8 w-8 items-center justify-center rounded-full ${colors.wrap}`}
                              >
                                <HistIcon className={`h-4 w-4 ${colors.icon}`} aria-hidden />
                              </span>
                              {historyServiceLabel(h.serviceType)}
                            </span>
                          </td>
                          <td className="px-4 sm:px-5 py-3.5">
                            {h.restrictionType === "wallet_auto_block" ? (
                              <span className="inline-flex items-center rounded-md bg-orange-50 px-2.5 py-1 text-xs font-semibold text-orange-700 ring-1 ring-orange-200/80">
                                Wallet auto-block
                              </span>
                            ) : h.banned ? (
                              <span className="inline-flex items-center rounded-md bg-red-50 px-2.5 py-1 text-xs font-semibold text-red-700 ring-1 ring-red-200/80">
                                Blacklist
                              </span>
                            ) : (
                              <span className="inline-flex items-center rounded-md bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-200/80">
                                Whitelist
                              </span>
                            )}
                          </td>
                          <td className="px-4 sm:px-5 py-3.5 text-sm text-gray-600 max-w-[280px] truncate" title={h.reason}>
                            {h.reason}
                          </td>
                          <td className="px-4 sm:px-5 py-3.5 text-sm text-gray-700">
                            {isAutomated ? (
                              <span className="inline-flex items-center gap-2">
                                <Bot className="h-4 w-4 text-gray-400 shrink-0" aria-hidden />
                                {performerLabel}
                              </span>
                            ) : (
                              performerLabel
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              ) : (
                <div className="py-12 text-center text-sm text-gray-500">
                  {restrictionHistory.length === 0
                    ? "No blacklist, whitelist, or wallet auto-block history yet for this rider."
                    : "No entries match the current filters."}
                </div>
              )}
            </div>

            {filteredHistory.length > 0 && (
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-t border-gray-100 px-4 sm:px-5 py-3 bg-white">
                <p className="text-xs sm:text-sm text-gray-500">
                  Showing {historyRangeStart} to {historyRangeEnd} of {filteredHistory.length} entries
                </p>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setHistoryPage((p) => Math.max(1, p - 1))}
                    disabled={historyPage <= 1}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-500 hover:bg-gray-50 hover:text-gray-800 disabled:opacity-40 disabled:pointer-events-none transition-colors"
                    aria-label="Previous page"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  <span className="inline-flex h-8 min-w-8 items-center justify-center rounded-lg bg-blue-600 px-2 text-xs font-semibold text-white">
                    {historyPage}
                  </span>
                  <button
                    type="button"
                    onClick={() => setHistoryPage((p) => Math.min(historyTotalPages, p + 1))}
                    disabled={historyPage >= historyTotalPages}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-500 hover:bg-gray-50 hover:text-gray-800 disabled:opacity-40 disabled:pointer-events-none transition-colors"
                    aria-label="Next page"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              </div>
            )}
          </div>
        </>
      )}

      {/* Blacklist / Whitelist modal */}
      {blacklistModal && rider && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={() => !blacklistSubmitting && setBlacklistModal(null)}>
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 space-y-5 border border-gray-100" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-3 pb-2 border-b border-gray-100">
              {blacklistModal.action === "whitelist" ? (
                <ShieldCheck className="h-8 w-8 text-emerald-500 shrink-0" />
              ) : (
                <ShieldOff className="h-8 w-8 text-red-500 shrink-0" />
              )}
              <h4 className="font-semibold text-gray-900 text-lg">
                {blacklistModal.action === "whitelist" ? "Whitelist" : "Blacklist"} — {blacklistModal.service === "all" ? "All Services" : blacklistModal.service.replace("_", " ")}
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
            {blacklistModal.action === "blacklist" && blacklistModal.service !== "all" && (
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
              <button type="button" onClick={() => !blacklistSubmitting && setBlacklistModal(null)} className="px-4 py-2 text-sm font-medium text-gray-900 bg-gray-200 hover:bg-gray-300 rounded-xl transition-colors">
                Cancel
              </button>
              <button
                type="button"
                onClick={handleBlacklistSubmit}
                disabled={blacklistSubmitting}
                className="px-4 py-2 text-sm font-medium bg-blue-600 text-white rounded-xl hover:bg-blue-700 disabled:opacity-50 transition-colors shadow-sm"
              >
                {blacklistSubmitting ? "Submitting..." : "Submit"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
