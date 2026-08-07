"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  AlertCircle,
  Ban,
  Car,
  CheckCircle2,
  ChevronDown,
  Clock,
  Crown,
  ExternalLink,
  Globe,
  Mail,
  MapPin,
  MessageSquare,
  Navigation,
  Package,
  Phone,
  Search,
  Share2,
  Shield,
  Ticket,
  TrendingUp,
  User,
  UtensilsCrossed,
  Wallet,
} from "lucide-react";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import {
  TRUST_TIER_LABEL,
  trustTierBadgeClass,
  type CustomerTrustTier,
} from "@/lib/customers/trust-tier";
import { R2Image } from "@/components/ui/R2Image";
import { CustomerProfilePhotoModal } from "@/components/customers/CustomerProfilePhotoModal";
import { resolveAttachmentProxyUrl } from "@/lib/attachments/resolve-attachment-proxy-url";
import {
  getCustomerNameInitials,
  isCustomCustomerProfileImage,
} from "@/lib/customers/customer-profile-image";
import { customerServiceLabel } from "@/lib/customers/customer-home-services";
import type {
  CustomerActivityDay,
  CustomerAddressRow,
  CustomerOrderStats,
} from "@/lib/db/operations/customers";

export type CustomerOrderRow = {
  id: number;
  formattedOrderId: string | null;
  orderType: string;
  status: string;
  paymentStatus: string | null;
  grandTotal: number | null;
  fareAmount: number | null;
  createdAt: string;
  dropAddressRaw: string | null;
};

export type CustomerTicketRow = {
  id: number;
  ticketId: string;
  status: string;
  priority: string;
  serviceType: string;
  subject: string;
  createdAt: string;
};

export type CustomerWalletTxnRow = {
  id: number;
  transactionId: string;
  transactionType: string;
  amount: number | string;
  balanceBefore: number | string;
  balanceAfter: number | string;
  description: string;
  status: string | null;
  referenceId: string | null;
  referenceType: string | null;
  createdAt: string;
};

type CustomerDetailPremiumViewProps = {
  customer: {
    id: number;
    customerId: string;
    fullName: string;
    email?: string | null;
    emailVerified?: boolean | null;
    primaryMobile: string;
    mobileVerified?: boolean | null;
    gender?: string | null;
    dateOfBirth?: string | null;
    ageGroup?: string | null;
    preferredLanguage?: string | null;
    bio?: string | null;
    profileImageUrl?: string | null;
    accountStatus: string;
    riskFlag?: string | null;
    isGlobalActive?: boolean | null;
    trustScore?: number | string | null;
    fraudScore?: number | string | null;
    walletBalance?: number | string | null;
    walletLockedAmount?: number | string | null;
    gmitraPlusActive?: boolean | null;
    gmitraPlusActivatedAt?: Date | string | null;
    gmitraPlusExpiresAt?: Date | string | null;
    referralCode?: string | null;
    referredBy?: string | null;
    referrerCustomerId?: number | null;
    referralInstallCount?: number;
    lastLoginAt?: Date | string | null;
    lastOrderAt?: Date | string | null;
    lastActivityAt?: Date | string | null;
    createdAt: Date | string;
    updatedAt?: Date | string | null;
    createdVia?: string | null;
    smsPermission?: boolean | null;
    locationPermission?: boolean | null;
    contactsPermission?: boolean | null;
    latitude?: number | string | null;
    longitude?: number | string | null;
    addresses?: CustomerAddressRow[];
  };
  orderStats: CustomerOrderStats[];
  activityDaily: CustomerActivityDay[];
  tier: CustomerTrustTier;
  trustNum: number | null;
  fraudNum: number | null;
  idLinkSuffix: string;
  formatAddressDisplay: (a: CustomerAddressRow) => string;
  formatShortDateTime: (d: Date | string | null | undefined) => string;
  formatIsoDateTime: (d: Date | string | null | undefined) => string;
  formatDateOnly: (d: string | null | undefined) => string;
  formatCoord: (n: number | string | null | undefined) => string;
  formatCurrency: (amount: number | string | null | undefined) => string;
  fmtText: (v: unknown) => string;
  addresses: CustomerAddressRow[];
  safeAddrIdx: number;
  otherAddressIndices: number[];
  addressMenuOpen: boolean;
  setAddressMenuOpen: (open: boolean | ((o: boolean) => boolean)) => void;
  setAddressIndex: (i: number) => void;
  addressMenuRef: React.RefObject<HTMLDivElement | null>;
  navActive: (key: string) => boolean;
  toggleOrderPillNav: (key: "food-orders" | "parcel-orders" | "person-ride") => void;
  toggleTicketsNav: () => void;
  toggleTransactionsNav: () => void;
  showPanelSearch: boolean;
  panelSearchPlaceholder: string;
  panelQuery: string;
  setPanelQuery: (q: string) => void;
  ctaNavRef: React.RefObject<HTMLElement | null>;
  showOrdersPanel: boolean;
  showTicketsPanel: boolean;
  showTransactionsPanel: boolean;
  ordersLoading: boolean;
  ordersError: string | null;
  customerOrders: CustomerOrderRow[];
  filteredOrders: CustomerOrderRow[];
  ticketsLoading: boolean;
  ticketsError: string | null;
  customerTickets: CustomerTicketRow[];
  filteredTickets: CustomerTicketRow[];
  txnsLoading: boolean;
  txnsError: string | null;
  customerTxns: CustomerWalletTxnRow[];
  filteredTxns: CustomerWalletTxnRow[];
  controlPortalOrderUrl: (formattedOrderId: string | null | undefined) => string | null;
  activeServiceBlocks?: import("@/lib/db/operations/customer-service-blocks").CustomerServiceBlockRow[];
  onOpenBlockSheet?: () => void;
};

const TEAL = "#0d9488";
const TEAL_DARK = "#0d5c4a";
const MINT = "#E6F6F5";
const INK = "#0f2d42";

const CHART_COLORS = {
  food: "#f97316",
  parcel: "#8b5cf6",
  person_ride: "#22c55e",
  orders: TEAL,
  spending: "#6366f1",
};

const NAV_ITEMS = [
  { key: "food-orders", label: "Food Orders", icon: UtensilsCrossed, kind: "order" as const },
  { key: "parcel-orders", label: "Parcel", icon: Package, kind: "order" as const },
  { key: "person-ride", label: "Person Ride", icon: Car, kind: "order" as const },
  { key: "tickets", label: "Tickets", icon: Ticket, kind: "tickets" as const },
  { key: "transactions", label: "Transactions", icon: Wallet, kind: "txns" as const },
];

type ActivityRange = "7D" | "30D" | "90D";

function cardClass() {
  return "rounded-xl border border-gray-200/90 bg-white shadow-[0_1px_3px_rgba(15,45,66,0.06)]";
}

function BoolPill({ v, invertRisk }: { v: boolean | null | undefined; invertRisk?: boolean }) {
  if (v === true) {
    return (
      <span className="font-semibold text-emerald-600">
        {invertRisk ? "true" : "Yes"}
      </span>
    );
  }
  if (v === false) {
    return (
      <span className="font-semibold text-rose-600">
        {invertRisk ? "false" : "No"}
      </span>
    );
  }
  return <span className="text-gray-400">—</span>;
}

function MetricCard({
  label,
  value,
  sub,
  icon: Icon,
  onClick,
}: {
  label: string;
  value: React.ReactNode;
  sub?: string;
  icon: React.ComponentType<{ className?: string }>;
  onClick?: () => void;
}) {
  const Wrapper = onClick ? "button" : "div";
  return (
    <Wrapper
      type={onClick ? "button" : undefined}
      onClick={onClick}
      className={`${cardClass()} flex min-h-[88px] flex-col justify-between p-3.5 text-left sm:p-4 ${onClick ? "cursor-pointer transition hover:border-teal-200 hover:shadow-md" : ""}`}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-[11px] font-medium uppercase tracking-wide text-gray-500">{label}</p>
        <span className="inline-flex rounded-lg p-1.5" style={{ backgroundColor: MINT, color: TEAL_DARK }}>
          <Icon className="h-3.5 w-3.5" aria-hidden />
        </span>
      </div>
      <div>
        <p className="text-lg font-semibold tabular-nums tracking-tight text-gray-900 sm:text-xl">{value}</p>
        {sub ? <p className="mt-0.5 text-[11px] text-gray-500">{sub}</p> : null}
      </div>
    </Wrapper>
  );
}

function MetaRow({
  icon: Icon,
  label,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-w-0 items-start gap-2 py-1.5">
      <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-teal-600/80" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-medium text-gray-500">{label}</p>
        <div className="mt-0.5 text-sm font-medium text-gray-900 [overflow-wrap:anywhere]">{children}</div>
      </div>
    </div>
  );
}

function PanelTable({
  loading,
  error,
  empty,
  noMatch,
  children,
}: {
  loading: boolean;
  error: string | null;
  empty: boolean;
  noMatch: boolean;
  children: React.ReactNode;
}) {
  if (loading) {
    return (
      <div className="space-y-3 py-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-11 animate-pulse rounded-xl bg-gray-100" />
        ))}
      </div>
    );
  }
  if (error) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
        <AlertCircle className="h-4 w-4 shrink-0" />
        {error}
      </div>
    );
  }
  if (empty) {
    return <p className="py-8 text-center text-sm text-gray-500">No records found.</p>;
  }
  if (noMatch) {
    return <p className="py-8 text-center text-sm text-gray-500">No results match your search.</p>;
  }
  return <>{children}</>;
}

function CustomerCharts({
  activityDaily,
  orderStats,
  activityRange,
  setActivityRange,
  formatCurrency,
}: {
  activityDaily: CustomerActivityDay[];
  orderStats: CustomerOrderStats[];
  activityRange: ActivityRange;
  setActivityRange: (r: ActivityRange) => void;
  formatCurrency: (amount: number | string | null | undefined) => string;
}) {
  const rangeDays = activityRange === "7D" ? 7 : activityRange === "30D" ? 30 : 90;

  const filteredActivity = useMemo(() => {
    const cutoff = new Date();
    cutoff.setHours(0, 0, 0, 0);
    cutoff.setDate(cutoff.getDate() - (rangeDays - 1));
    const cutoffStr = cutoff.toISOString().slice(0, 10);
    return activityDaily
      .filter((d) => d.date >= cutoffStr)
      .map((d) => ({
        ...d,
        label: d.date.slice(5).replace("-", "/"),
        spending: Number(d.spending.toFixed(2)),
      }));
  }, [activityDaily, rangeDays]);

  const donutData = useMemo(() => {
    const labels: Record<string, string> = {
      food: "Food",
      parcel: "Parcel",
      person_ride: "Person Ride",
    };
    return orderStats
      .filter((s) => s.orderType && s.totalOrders > 0)
      .map((s) => ({
        name: labels[s.orderType!] ?? s.orderType!,
        value: s.totalOrders,
        color: CHART_COLORS[s.orderType as keyof typeof CHART_COLORS] ?? TEAL,
      }));
  }, [orderStats]);

  const totalOrders = donutData.reduce((sum, d) => sum + d.value, 0);
  const totalSpending = filteredActivity.reduce((sum, d) => sum + d.spending, 0);

  const rangeButtons: ActivityRange[] = ["7D", "30D", "90D"];

  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
      {/* Activity Overview */}
      <section className={`${cardClass()} p-4 sm:p-5`}>
        <div className="mb-3 flex items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-gray-900">Activity Overview</h3>
          <div className="flex rounded-lg border border-gray-200 bg-gray-50 p-0.5">
            {rangeButtons.map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setActivityRange(r)}
                className={`rounded-md px-2 py-0.5 text-[10px] font-semibold transition ${
                  activityRange === r ? "bg-white text-teal-700 shadow-sm" : "text-gray-500 hover:text-gray-700"
                }`}
              >
                {r}
              </button>
            ))}
          </div>
        </div>
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={filteredActivity}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis dataKey="label" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
            <YAxis yAxisId="left" tick={{ fontSize: 10 }} width={28} />
            <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10 }} width={36} />
            <Tooltip
              contentStyle={{ fontSize: 12, borderRadius: 8 }}
              formatter={(value, name) =>
                name === "Spending" ? formatCurrency(Number(value)) : value
              }
            />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Line yAxisId="left" type="monotone" dataKey="orders" stroke={CHART_COLORS.orders} strokeWidth={2} dot={false} name="Orders" />
            <Line yAxisId="right" type="monotone" dataKey="spending" stroke={CHART_COLORS.spending} strokeWidth={2} dot={false} name="Spending" />
          </LineChart>
        </ResponsiveContainer>
      </section>

      {/* Order Distribution */}
      <section className={`${cardClass()} p-4 sm:p-5`}>
        <h3 className="mb-3 text-sm font-semibold text-gray-900">Order Distribution</h3>
        {donutData.length === 0 ? (
          <p className="flex h-[220px] items-center justify-center text-sm text-gray-400">No orders yet</p>
        ) : (
          <div className="relative">
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie
                  data={donutData}
                  cx="50%"
                  cy="50%"
                  innerRadius={52}
                  outerRadius={78}
                  paddingAngle={3}
                  dataKey="value"
                >
                  {donutData.map((entry) => (
                    <Cell key={entry.name} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
              </PieChart>
            </ResponsiveContainer>
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-2xl font-bold tabular-nums text-gray-900">{totalOrders}</span>
              <span className="text-[10px] font-medium uppercase tracking-wide text-gray-500">Total</span>
            </div>
          </div>
        )}
        <div className="mt-1 flex flex-wrap justify-center gap-x-4 gap-y-1">
          {donutData.map((d) => (
            <span key={d.name} className="inline-flex items-center gap-1.5 text-[11px] text-gray-600">
              <span className="size-2 rounded-full" style={{ backgroundColor: d.color }} />
              {d.name} ({d.value})
            </span>
          ))}
        </div>
      </section>

      {/* Spending Overview */}
      <section className={`${cardClass()} p-4 sm:p-5`}>
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-900">Spending Overview</h3>
          <span className="text-xs font-semibold tabular-nums text-teal-700">{formatCurrency(totalSpending)}</span>
        </div>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={filteredActivity}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />
            <XAxis dataKey="label" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
            <YAxis tick={{ fontSize: 10 }} width={36} />
            <Tooltip
              contentStyle={{ fontSize: 12, borderRadius: 8 }}
              formatter={(value) => formatCurrency(Number(value))}
            />
            <Bar dataKey="spending" fill={TEAL} radius={[4, 4, 0, 0]} name="Spending" />
          </BarChart>
        </ResponsiveContainer>
      </section>
    </div>
  );
}

export function CustomerDetailPremiumView(props: CustomerDetailPremiumViewProps) {
  const {
    customer,
    orderStats,
    activityDaily,
    tier,
    trustNum,
    fraudNum,
    idLinkSuffix,
    formatAddressDisplay,
    formatShortDateTime,
    formatIsoDateTime,
    formatDateOnly,
    formatCoord,
    formatCurrency,
    fmtText,
    addresses,
    safeAddrIdx,
    otherAddressIndices,
    addressMenuOpen,
    setAddressMenuOpen,
    setAddressIndex,
    addressMenuRef,
    navActive,
    toggleOrderPillNav,
    toggleTicketsNav,
    toggleTransactionsNav,
    showPanelSearch,
    panelSearchPlaceholder,
    panelQuery,
    setPanelQuery,
    ctaNavRef,
    showOrdersPanel,
    showTicketsPanel,
    showTransactionsPanel,
    ordersLoading,
    ordersError,
    filteredOrders,
    customerOrders,
    ticketsLoading,
    ticketsError,
    filteredTickets,
    customerTickets,
    txnsLoading,
    txnsError,
    filteredTxns,
    customerTxns,
    controlPortalOrderUrl,
    activeServiceBlocks = [],
    onOpenBlockSheet,
  } = props;

  const [activityRange, setActivityRange] = useState<ActivityRange>("30D");
  const [profilePhotoOpen, setProfilePhotoOpen] = useState(false);

  const initials = getCustomerNameInitials(customer.fullName, customer.email);
  const hasCustomProfilePhoto = isCustomCustomerProfileImage(customer.profileImageUrl);
  const profilePhotoSrc = hasCustomProfilePhoto
    ? resolveAttachmentProxyUrl(customer.profileImageUrl ?? "") || null
    : null;

  const gmitraActive = customer.gmitraPlusActive === true;
  const isBlocked =
    customer.accountStatus.toLowerCase() === "blocked" ||
    customer.accountStatus.toLowerCase() === "suspended" ||
    customer.isGlobalActive === false ||
    activeServiceBlocks.length > 0;

  const totalOrders = orderStats.reduce((sum, s) => sum + s.totalOrders, 0);
  const totalSpent = orderStats.reduce((sum, s) => sum + s.totalSpent, 0);
  const lastOrderFromStats = orderStats.reduce<Date | string | null>((latest, s) => {
    if (!s.lastOrderAt) return latest;
    if (!latest) return s.lastOrderAt;
    return new Date(s.lastOrderAt) > new Date(latest) ? s.lastOrderAt : latest;
  }, null);
  const lastOrderAt = lastOrderFromStats ?? customer.lastOrderAt ?? null;

  const riskLabel = customer.riskFlag?.trim() || (fraudNum != null && fraudNum <= 25 ? "LOW" : fraudNum != null && fraudNum <= 65 ? "MEDIUM" : "HIGH");
  const riskLow = riskLabel.toUpperCase() === "LOW";

  return (
    <div className="flex w-full min-w-0 max-w-full flex-1 flex-col gap-4 pb-6 pt-1 sm:gap-5 sm:pt-2">
      {/* Profile card — reference layout */}
      <section className={`${cardClass()} p-4 sm:p-5`}>
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex min-w-0 flex-1 gap-4">
            <div className="relative shrink-0">
              <button
                type="button"
                className={`block rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 ${
                  hasCustomProfilePhoto && profilePhotoSrc ? "cursor-zoom-in" : "cursor-default"
                }`}
                onClick={() => {
                  if (hasCustomProfilePhoto && profilePhotoSrc) setProfilePhotoOpen(true);
                }}
                disabled={!hasCustomProfilePhoto || !profilePhotoSrc}
                aria-label={
                  hasCustomProfilePhoto && profilePhotoSrc
                    ? `View ${customer.fullName} profile photo`
                    : `${customer.fullName} avatar`
                }
              >
                {hasCustomProfilePhoto && profilePhotoSrc ? (
                  <R2Image
                    src={profilePhotoSrc}
                    alt=""
                    className="size-[4.5rem] rounded-full object-cover ring-2 ring-teal-100 sm:size-20"
                  />
                ) : (
                  <div
                    className="flex size-[4.5rem] items-center justify-center rounded-full text-xl font-bold text-white sm:size-20"
                    style={{ background: `linear-gradient(135deg, ${TEAL} 0%, ${TEAL_DARK} 100%)` }}
                  >
                    {initials || "?"}
                  </div>
                )}
              </button>
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-xl font-semibold tracking-tight text-gray-900 sm:text-2xl">{customer.fullName}</h1>
                <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${trustTierBadgeClass(tier)}`}>
                  {TRUST_TIER_LABEL[tier]}
                </span>
              </div>
              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-600">
                <span>
                  <span className="font-medium text-gray-500">Customer ID:</span>{" "}
                  <Link
                    href={`/dashboard/customers/${customer.id}${idLinkSuffix}`}
                    className="font-semibold text-teal-700 hover:underline"
                  >
                    {customer.customerId}
                  </Link>
                </span>
                <span>
                  <span className="font-medium text-gray-500">Gender:</span> {fmtText(customer.gender)}
                </span>
                <span>
                  <span className="font-medium text-gray-500">Age Group:</span> {fmtText(customer.ageGroup)}
                </span>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-4 text-sm">
                <span className="inline-flex items-center gap-1.5">
                  <Shield className="h-4 w-4 text-teal-600" aria-hidden />
                  <span className="text-gray-500">Trust Score</span>
                  <span className="font-semibold tabular-nums text-gray-900">
                    {trustNum != null && !Number.isNaN(trustNum) ? trustNum.toFixed(2) : "—"}
                  </span>
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <AlertCircle className="h-4 w-4 text-amber-600" aria-hidden />
                  <span className="text-gray-500">Fraud Score</span>
                  <span className="font-semibold tabular-nums text-gray-900">
                    {fraudNum != null && !Number.isNaN(fraudNum) ? fraudNum.toFixed(2) : "—"}
                  </span>
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="text-gray-500">Risk</span>
                  <span className={`rounded px-1.5 py-0.5 text-xs font-bold uppercase ${riskLow ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"}`}>
                    {riskLabel}
                  </span>
                </span>
              </div>
            </div>
          </div>

          {/* Current address + actions */}
          <div className="flex w-full shrink-0 flex-col gap-3 lg:max-w-md">
            {onOpenBlockSheet ? (
              <div className="flex flex-wrap items-center justify-end gap-2">
                {activeServiceBlocks.length > 0 ? (
                  <div className="flex max-w-full flex-wrap justify-end gap-1.5">
                    {activeServiceBlocks.map((block) => (
                      <span
                        key={block.id}
                        className="rounded-full bg-rose-50 px-2.5 py-1 text-[11px] font-semibold text-rose-700 ring-1 ring-rose-200"
                      >
                        {customerServiceLabel(block.serviceType)} blocked
                      </span>
                    ))}
                  </div>
                ) : null}
                <button
                  type="button"
                  onClick={onOpenBlockSheet}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-800 transition hover:bg-rose-100"
                >
                  <Ban className="h-3.5 w-3.5" aria-hidden />
                  Block User
                </button>
              </div>
            ) : null}
            <div className="rounded-xl border border-gray-100 bg-gray-50/80 p-3.5">
              <div className="mb-2 flex items-center justify-between gap-2">
                <span className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-gray-500">
                  <MapPin className="h-3.5 w-3.5 text-teal-600" aria-hidden />
                  Current Address
                </span>
                {addresses.length > 1 ? (
                  <button
                    type="button"
                    aria-expanded={addressMenuOpen}
                    onClick={() => setAddressMenuOpen((o) => !o)}
                    className="rounded p-0.5 text-gray-400 hover:bg-white hover:text-gray-600"
                  >
                    <ChevronDown className={`h-4 w-4 transition ${addressMenuOpen ? "rotate-180" : ""}`} />
                  </button>
                ) : null}
              </div>
              {addresses.length === 0 ? (
                <p className="text-sm text-gray-400">No saved address</p>
              ) : (
                <div className="relative" ref={addressMenuRef}>
                  <p className="text-sm leading-relaxed text-gray-800 [overflow-wrap:anywhere]">
                    {formatAddressDisplay(addresses[safeAddrIdx])}
                  </p>
                  {addressMenuOpen && addresses.length > 1 ? (
                    <ul className="absolute left-0 right-0 z-50 mt-2 max-h-48 overflow-auto rounded-lg border border-gray-200 bg-white py-1 shadow-lg">
                      {otherAddressIndices.map((i) => (
                        <li key={addresses[i].id}>
                          <button
                            type="button"
                            className="w-full px-3 py-2 text-left text-sm text-gray-800 hover:bg-teal-50"
                            onClick={() => {
                              setAddressIndex(i);
                              setAddressMenuOpen(false);
                            }}
                          >
                            {formatAddressDisplay(addresses[i])}
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* 6 metric cards */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <MetricCard
          label="Account Status"
          value={<span className="capitalize text-emerald-600">{customer.accountStatus.toLowerCase()}</span>}
          sub={`Joined ${formatDateOnly(String(customer.createdAt).slice(0, 10))}`}
          icon={User}
        />
        <MetricCard
          label="Wallet Balance"
          value={formatCurrency(customer.walletBalance)}
          sub={`Locked ${formatCurrency(customer.walletLockedAmount)}`}
          icon={Wallet}
          onClick={toggleTransactionsNav}
        />
        <MetricCard
          label="GMitra Plus"
          value={gmitraActive ? "Active" : "Inactive"}
          sub={
            gmitraActive && customer.gmitraPlusExpiresAt
              ? `Expires ${formatShortDateTime(customer.gmitraPlusExpiresAt).split(" ")[0]}`
              : undefined
          }
          icon={Crown}
        />
        <MetricCard label="Total Orders" value={totalOrders} icon={TrendingUp} />
        <MetricCard label="Total Spent" value={formatCurrency(totalSpent)} icon={Package} />
        <MetricCard
          label="Last Order"
          value={lastOrderAt ? formatShortDateTime(lastOrderAt).split(" ")[0] ?? "—" : "—"}
          sub={lastOrderAt ? formatShortDateTime(lastOrderAt) : "No orders yet"}
          icon={Clock}
        />
      </div>

      {/* Charts row */}
      <CustomerCharts
        activityDaily={activityDaily}
        orderStats={orderStats}
        activityRange={activityRange}
        setActivityRange={setActivityRange}
        formatCurrency={formatCurrency}
      />

      {/* Metadata grid — 5 columns like reference */}
      <section className={`${cardClass()} p-4 sm:p-5`}>
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 xl:gap-4">
          <div>
            <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">Contact</h4>
            <MetaRow icon={Phone} label="Primary Mobile">
              <span className="inline-flex flex-wrap items-center gap-1.5">
                {customer.primaryMobile}
                {customer.mobileVerified ? (
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" aria-label="Verified" />
                ) : null}
              </span>
            </MetaRow>
            <MetaRow icon={Phone} label="Mobile Verified">
              <BoolPill v={customer.mobileVerified} />
            </MetaRow>
            <MetaRow icon={Mail} label="Email">
              {fmtText(customer.email)}
            </MetaRow>
            <MetaRow icon={Mail} label="Email Verified">
              <BoolPill v={customer.emailVerified} />
            </MetaRow>
          </div>

          <div>
            <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">Geo / Lang</h4>
            <MetaRow icon={Navigation} label="Latitude">
              <span className="tabular-nums">{formatCoord(customer.latitude)}</span>
            </MetaRow>
            <MetaRow icon={Navigation} label="Longitude">
              <span className="tabular-nums">{formatCoord(customer.longitude)}</span>
            </MetaRow>
            <MetaRow icon={Globe} label="Preferred Language">
              {fmtText(customer.preferredLanguage)}
            </MetaRow>
            <MetaRow icon={Ban} label="Blocked">
              <BoolPill v={isBlocked} invertRisk />
            </MetaRow>
          </div>

          <div>
            <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">Permissions</h4>
            <MetaRow icon={MessageSquare} label="SMS Permission">
              <BoolPill v={customer.smsPermission} invertRisk />
            </MetaRow>
            <MetaRow icon={MapPin} label="Location Permission">
              <BoolPill v={customer.locationPermission} invertRisk />
            </MetaRow>
            <MetaRow icon={User} label="Contacts Permission">
              <BoolPill v={customer.contactsPermission} invertRisk />
            </MetaRow>
            <MetaRow icon={Share2} label="App Installs via Referral">
              <span className="tabular-nums">{customer.referralInstallCount ?? 0}</span>
            </MetaRow>
          </div>

          <div>
            <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">Referral</h4>
            <MetaRow icon={Share2} label="Referral Code">
              {fmtText(customer.referralCode)}
            </MetaRow>
            <MetaRow icon={Share2} label="Referred By (Code)">
              {fmtText(customer.referredBy)}
            </MetaRow>
            <MetaRow icon={User} label="Referrer Customer ID">
              {customer.referrerCustomerId != null ? String(customer.referrerCustomerId) : "—"}
            </MetaRow>
            <MetaRow icon={User} label="Referral Customer ID">
              —
            </MetaRow>
          </div>

          <div>
            <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">Timestamps</h4>
            <MetaRow icon={Clock} label="Last Login">
              <span className="tabular-nums text-xs">{formatIsoDateTime(customer.lastLoginAt)}</span>
            </MetaRow>
            <MetaRow icon={Clock} label="Last Activity">
              <span className="tabular-nums text-xs">{formatIsoDateTime(customer.lastActivityAt)}</span>
            </MetaRow>
            <MetaRow icon={Clock} label="Created At">
              <span className="tabular-nums text-xs">{formatIsoDateTime(customer.createdAt)}</span>
            </MetaRow>
            <MetaRow icon={Clock} label="Updated At">
              <span className="tabular-nums text-xs">{formatIsoDateTime(customer.updatedAt)}</span>
            </MetaRow>
          </div>
        </div>
      </section>

      {/* Data tabs */}
      <nav
        ref={ctaNavRef}
        className={`${cardClass()} sticky top-0 z-40 px-2 py-2 backdrop-blur-sm sm:px-3`}
        aria-label="Customer data sections"
      >
        <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 gap-1 overflow-x-auto [-webkit-overflow-scrolling:touch] [scrollbar-width:thin]">
            {NAV_ITEMS.map(({ key, label, icon: Icon, kind }) => {
              const active = navActive(key);
              const onClick =
                kind === "order"
                  ? () => toggleOrderPillNav(key as "food-orders" | "parcel-orders" | "person-ride")
                  : kind === "tickets"
                    ? toggleTicketsNav
                    : toggleTransactionsNav;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={onClick}
                  className={`inline-flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold transition ${
                    active ? "text-white shadow-sm" : "text-gray-600 hover:bg-teal-50 hover:text-teal-800"
                  }`}
                  style={active ? { backgroundColor: INK } : undefined}
                >
                  <Icon className="h-3.5 w-3.5" aria-hidden />
                  {label}
                </button>
              );
            })}
          </div>
          {showPanelSearch ? (
            <form className="flex w-full shrink-0 items-center gap-2 sm:w-auto sm:max-w-xs" onSubmit={(e) => e.preventDefault()}>
              <input
                type="search"
                value={panelQuery}
                onChange={(e) => setPanelQuery(e.target.value)}
                placeholder={panelSearchPlaceholder}
                className="h-9 min-w-0 flex-1 rounded-lg border border-gray-200 bg-gray-50 px-3 text-xs text-gray-900 placeholder:text-gray-400 focus:border-teal-400 focus:outline-none focus:ring-2 focus:ring-teal-400/20 sm:w-44 sm:flex-none"
              />
              <button
                type="submit"
                className="inline-flex h-9 shrink-0 items-center gap-1 rounded-lg px-3 text-xs font-semibold text-white"
                style={{ backgroundColor: TEAL_DARK }}
              >
                <Search className="h-3.5 w-3.5" aria-hidden />
              </button>
            </form>
          ) : null}
        </div>
      </nav>

      {showOrdersPanel ? (
        <section className={`${cardClass()} p-4 sm:p-5`} aria-label="Customer orders">
          <PanelTable
            loading={ordersLoading}
            error={ordersError}
            empty={customerOrders.length === 0}
            noMatch={filteredOrders.length === 0}
          >
            <div className="overflow-x-auto">
              <table className="min-w-[640px] w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-gray-100 text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                    <th className="py-2.5 pr-4">Order</th>
                    <th className="py-2.5 pr-4">Status</th>
                    <th className="py-2.5 pr-4">Payment</th>
                    <th className="py-2.5 pr-4 text-right">Total</th>
                    <th className="py-2.5 pr-4">Created</th>
                    <th className="py-2.5">Drop address</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {filteredOrders.map((row) => {
                    const orderLabel = row.formattedOrderId ?? `#${row.id}`;
                    const orderHref = controlPortalOrderUrl(row.formattedOrderId);
                    return (
                      <tr key={row.id} className="align-top transition hover:bg-teal-50/40">
                        <td className="py-3 pr-4 font-medium">
                          {orderHref ? (
                            <a href={orderHref} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-teal-700 hover:underline">
                              {orderLabel}
                              <ExternalLink className="h-3.5 w-3.5 opacity-60" />
                            </a>
                          ) : (
                            orderLabel
                          )}
                        </td>
                        <td className="py-3 pr-4 capitalize">{row.status}</td>
                        <td className="py-3 pr-4 capitalize">{row.paymentStatus ?? "—"}</td>
                        <td className="py-3 pr-4 text-right tabular-nums font-medium">
                          {row.grandTotal != null
                            ? `₹${Number(row.grandTotal).toFixed(2)}`
                            : row.fareAmount != null
                              ? `₹${Number(row.fareAmount).toFixed(2)}`
                              : "—"}
                        </td>
                        <td className="py-3 pr-4 whitespace-nowrap text-gray-500">{formatShortDateTime(row.createdAt)}</td>
                        <td className="py-3 max-w-md text-gray-700 [overflow-wrap:anywhere]">{row.dropAddressRaw ?? "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </PanelTable>
        </section>
      ) : null}

      {showTicketsPanel ? (
        <section className={`${cardClass()} p-4 sm:p-5`} aria-label="Customer tickets">
          <PanelTable
            loading={ticketsLoading}
            error={ticketsError}
            empty={customerTickets.length === 0}
            noMatch={filteredTickets.length === 0}
          >
            <div className="overflow-x-auto">
              <table className="min-w-[640px] w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-gray-100 text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                    <th className="py-2.5 pr-4">Ticket</th>
                    <th className="py-2.5 pr-4">Status</th>
                    <th className="py-2.5 pr-4">Priority</th>
                    <th className="py-2.5 pr-4">Service</th>
                    <th className="py-2.5 pr-4">Created</th>
                    <th className="py-2.5">Subject</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {filteredTickets.map((row) => (
                    <tr key={row.id} className="align-top transition hover:bg-teal-50/40">
                      <td className="py-3 pr-4 font-medium">
                        <a href={`/dashboard/tickets/${row.id}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-teal-700 hover:underline">
                          {row.ticketId}
                          <ExternalLink className="h-3.5 w-3.5 opacity-60" />
                        </a>
                      </td>
                      <td className="py-3 pr-4 capitalize">{row.status}</td>
                      <td className="py-3 pr-4 capitalize">{row.priority}</td>
                      <td className="py-3 pr-4 capitalize">{row.serviceType ?? "—"}</td>
                      <td className="py-3 pr-4 whitespace-nowrap text-gray-500">{formatShortDateTime(row.createdAt)}</td>
                      <td className="py-3 max-w-md [overflow-wrap:anywhere]">{row.subject ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </PanelTable>
        </section>
      ) : null}

      {showTransactionsPanel ? (
        <section className={`${cardClass()} p-4 sm:p-5`} aria-label="Wallet transactions">
          <PanelTable
            loading={txnsLoading}
            error={txnsError}
            empty={customerTxns.length === 0}
            noMatch={filteredTxns.length === 0}
          >
            <div className="overflow-x-auto">
              <table className="min-w-[720px] w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-gray-100 text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                    <th className="py-2.5 pr-4">Txn ID</th>
                    <th className="py-2.5 pr-4">Type</th>
                    <th className="py-2.5 pr-4 text-right">Amount</th>
                    <th className="py-2.5 pr-4 text-right">Balance</th>
                    <th className="py-2.5 pr-4">Status</th>
                    <th className="py-2.5 pr-4">Created</th>
                    <th className="py-2.5">Description</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {filteredTxns.map((row) => (
                    <tr key={row.id} className="align-top transition hover:bg-teal-50/40">
                      <td className="py-3 pr-4 font-medium tabular-nums text-teal-700">{row.transactionId}</td>
                      <td className="py-3 pr-4 capitalize">{row.transactionType}</td>
                      <td className="py-3 pr-4 text-right tabular-nums font-medium">₹{Number(row.amount).toFixed(2)}</td>
                      <td className="py-3 pr-4 text-right tabular-nums">₹{Number(row.balanceAfter).toFixed(2)}</td>
                      <td className="py-3 pr-4 capitalize">{row.status ?? "—"}</td>
                      <td className="py-3 pr-4 whitespace-nowrap text-gray-500">{formatShortDateTime(row.createdAt)}</td>
                      <td className="py-3 max-w-md [overflow-wrap:anywhere]">{row.description || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </PanelTable>
        </section>
      ) : null}

      <CustomerProfilePhotoModal
        open={profilePhotoOpen}
        imageSrc={profilePhotoSrc}
        customerName={customer.fullName}
        onClose={() => setProfilePhotoOpen(false)}
      />
    </div>
  );
}

export function CustomerDetailSkeleton() {
  return (
    <div className="flex w-full flex-1 flex-col gap-4 pb-6 pt-1 animate-pulse sm:gap-5">
      <div className={`${cardClass()} h-40`} />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className={`${cardClass()} h-24`} />
        ))}
      </div>
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className={`${cardClass()} h-64`} />
        ))}
      </div>
      <div className={`${cardClass()} h-56`} />
    </div>
  );
}
