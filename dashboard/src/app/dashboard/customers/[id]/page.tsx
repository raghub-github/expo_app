"use client";

import { useState, useEffect, useRef, useMemo, Suspense } from "react";
import { useAppParams, useAppPathname, useAppSearchParams } from "@/hooks/useAppSearchParams";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { AlertCircle, ChevronDown, ExternalLink, Search } from "lucide-react";
import {
  resolveTrustTier,
  TRUST_TIER_LABEL,
  trustTierUserTypeClass,
  type CustomerTrustTier,
} from "@/lib/customers/trust-tier";
import type { CustomerAddressRow } from "@/lib/db/operations/customers";

interface CustomerDetail {
  id: number;
  customerId: string;
  customerUuid?: string | null;
  fullName: string;
  email?: string | null;
  emailVerified?: boolean | null;
  primaryMobile: string;
  primaryMobileNormalized?: string | null;
  primaryMobileCountryCode?: string | null;
  mobileVerified?: boolean | null;
  alternateMobile?: string | null;
  whatsappNumber?: string | null;
  workPhone?: string | null;
  gender?: string | null;
  dateOfBirth?: string | null;
  profileImageUrl?: string | null;
  bio?: string | null;
  preferredLanguage?: string | null;
  ageGroup?: string | null;
  profileCompleted?: boolean | null;
  referralCode?: string | null;
  referredBy?: string | null;
  referrerCustomerId?: number | null;
  accountStatus: string;
  statusReason?: string | null;
  riskFlag?: string | null;
  isGlobalActive?: boolean | null;
  trustScore?: number | string | null;
  fraudScore?: number | string | null;
  trustTier?: string | null;
  walletBalance?: number | string | null;
  walletLockedAmount?: number | string | null;
  isIdentityVerified?: boolean | null;
  isEmailVerified?: boolean | null;
  isMobileVerified?: boolean | null;
  emailVerifiedAt?: Date | string | null;
  smsPermission?: boolean | null;
  locationPermission?: boolean | null;
  contactsPermission?: boolean | null;
  gmitraPlusActive?: boolean | null;
  gmitraPlusActivatedAt?: Date | string | null;
  gmitraPlusExpiresAt?: Date | string | null;
  gmitraPlusSubscriptionStatus?: string | null;
  lastLoginAt?: Date | string | null;
  lastOrderAt?: Date | string | null;
  lastActivityAt?: Date | string | null;
  sessionsInvalidBefore?: Date | string | null;
  deletedAt?: Date | string | null;
  deletedBy?: number | null;
  deletionReason?: string | null;
  createdAt: Date | string;
  updatedAt?: Date | string | null;
  createdVia?: string | null;
  updatedBy?: string | null;
  addressLine1?: string | null;
  addressLine2?: string | null;
  city?: string | null;
  state?: string | null;
  pincode?: string | null;
  country?: string | null;
  latitude?: number | string | null;
  longitude?: number | string | null;
  facebookId?: string | null;
  twitterId?: string | null;
  twitterVerified?: boolean | null;
  twitterFollowerCount?: number | null;
  timeZone?: string | null;
  jobTitle?: string | null;
  uniqueExternalId?: string | null;
  contactTags?: string[] | null;
  referralInstallCount?: number;
  addresses?: CustomerAddressRow[];
}

/** Drop redundant "Current location: " prefix from saved label + address strings. */
function stripCurrentLocationPrefix(s: string): string {
  const t = s.replace(/^\s*current\s+location\s*:\s*/i, "").trim();
  return t.length > 0 ? t : s;
}

function formatAddressDisplay(a: CustomerAddressRow): string {
  const label = a.customLabel?.trim() || a.label?.trim() || "";
  const line = [a.addressLine1, a.addressLine2].filter(Boolean).join(", ");
  const cityPart = [a.city, a.state, a.postalCode].filter(Boolean).join(", ");
  const joined = [line, cityPart].filter(Boolean).join(" · ");
  let raw: string;
  if (a.landmark?.trim()) {
    const withLm = joined ? `${joined} (${a.landmark.trim()})` : a.landmark.trim();
    if (a.addressAuto?.trim()) {
      const base = `${a.addressAuto.trim()} · ${withLm}`;
      raw = label ? `${label}: ${base}` : base;
    } else {
      raw = label ? `${label}: ${withLm}` : withLm;
    }
  } else if (a.addressAuto?.trim()) {
    const base = a.addressAuto.trim();
    raw = label ? `${label}: ${base}` : joined ? `${base} · ${joined}` : base;
  } else if (label && joined) {
    raw = `${label}: ${joined}`;
  } else {
    raw = joined || label || "—";
  }
  return stripCurrentLocationPrefix(raw);
}

function formatShortDateTime(d: Date | string | null | undefined): string {
  if (!d) return "—";
  const x = new Date(d);
  const dd = String(x.getDate()).padStart(2, "0");
  const mm = String(x.getMonth() + 1).padStart(2, "0");
  const yy = String(x.getFullYear()).slice(-2);
  let h = x.getHours();
  const m = String(x.getMinutes()).padStart(2, "0");
  const ampm = h >= 12 ? "PM" : "AM";
  h = h % 12 || 12;
  return `${dd}-${mm}-${yy} ${h}:${m} ${ampm}`;
}

function formatIsoDateTime(d: Date | string | null | undefined): string {
  if (!d) return "—";
  const x = new Date(d);
  const y = x.getFullYear();
  const mo = String(x.getMonth() + 1).padStart(2, "0");
  const da = String(x.getDate()).padStart(2, "0");
  const hh = String(x.getHours()).padStart(2, "0");
  const mm = String(x.getMinutes()).padStart(2, "0");
  const ss = String(x.getSeconds()).padStart(2, "0");
  return `${y}-${mo}-${da} ${hh}:${mm}:${ss}`;
}

function formatDateOnly(d: string | null | undefined): string {
  if (!d) return "—";
  const s = String(d).trim();
  if (s.length >= 10 && /^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  return s || "—";
}

function formatCoord(n: number | string | null | undefined): string {
  if (n === null || n === undefined || n === "") return "—";
  const x = Number(n);
  if (Number.isNaN(x)) return "—";
  return x.toFixed(5);
}

function fmtText(v: unknown): string {
  if (v === null || v === undefined) return "—";
  const s = String(v).trim();
  return s.length > 0 ? s : "—";
}

function BoolVal({ v }: { v: boolean | null | undefined }) {
  if (v === true) return <span className="font-semibold text-emerald-600">true</span>;
  if (v === false) return <span className="font-semibold text-red-600">false</span>;
  return <span className="text-[#0f2d42]/55">—</span>;
}

function FieldItem({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <span className="min-w-0 max-w-full">
      <span className="text-[#0f2d42]/70">{label}: </span>
      {children}
    </span>
  );
}

function DetailRow({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap gap-x-8 gap-y-2.5 py-3.5 text-sm text-[#0f2d42]">{children}</div>
  );
}

/** GatiMitra control app (order detail pages). Override with NEXT_PUBLIC_CONTROL_APP_URL if needed. */
const CONTROL_APP_BASE = (
  typeof process !== "undefined" && process.env.NEXT_PUBLIC_CONTROL_APP_URL?.trim()
    ? process.env.NEXT_PUBLIC_CONTROL_APP_URL.trim().replace(/\/$/, "")
    : "https://control.gatimitra.com"
) as string;

function controlPortalOrderUrl(formattedOrderId: string | null | undefined): string | null {
  const id = formattedOrderId?.trim();
  if (!id) return null;
  return `${CONTROL_APP_BASE}/order/${encodeURIComponent(id)}`;
}

/** URL `nav` values for inline orders_core table (Food / Parcel / Person Ride). */
const ORDER_NAV_KEYS = ["food-orders", "parcel-orders", "person-ride"] as const;

type CustomerOrderRow = {
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

type CustomerTicketRow = {
  id: number;
  ticketId: string;
  status: string;
  priority: string;
  serviceType: string;
  subject: string;
  createdAt: string;
};

type CustomerWalletTxnRow = {
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

/** Compact pills for sticky nav strip (smaller hit target, premium tight spacing). */
function customerNavPillStripClass(active: boolean, disabled?: boolean) {
  const base =
    "inline-flex !w-auto shrink-0 items-center justify-center gap-0.5 rounded-full px-2.5 py-1.5 text-center text-[10px] font-medium leading-snug sm:px-3 sm:py-1.5 sm:text-[11px] sm:leading-tight";
  if (disabled) {
    return `${base} min-h-8 cursor-not-allowed border border-slate-200/90 bg-slate-50 text-[#0f2d42]/45`;
  }
  if (active) {
    return `${base} min-h-8 border-2 border-[#0d5c4a] bg-[#E6F6F5] font-semibold text-[#0f2d42] shadow-sm ring-1 ring-[#0d5c4a]/15`;
  }
  return `${base} min-h-8 border border-teal-200/70 bg-white text-[#0f2d42] shadow-sm transition hover:border-teal-300/90 hover:bg-[#f0fdf9]`;
}

/** Min width per pill; labels fit without forcing full-width grid. */
const NAV_PILL_MIN = "min-w-[7.25rem] max-w-[11rem] sm:min-w-[7.75rem]";

/** Orders/tickets panel — plain block, no card border (matches dashboard main surface). */
const RESULT_CARD_SHELL = "mt-[2px] w-full shrink-0 px-4 py-4 sm:px-6";

function CustomerDetailsContent() {
  const params = useAppParams();
  const searchParams = useAppSearchParams();
  const customerId = params.id as string;
  const [customer, setCustomer] = useState<CustomerDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [addressIndex, setAddressIndex] = useState(0);
  const [addressMenuOpen, setAddressMenuOpen] = useState(false);
  const addressMenuRef = useRef<HTMLDivElement>(null);
  const [customerOrders, setCustomerOrders] = useState<CustomerOrderRow[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [ordersError, setOrdersError] = useState<string | null>(null);
  const [customerTickets, setCustomerTickets] = useState<CustomerTicketRow[]>([]);
  const [ticketsLoading, setTicketsLoading] = useState(false);
  const [ticketsError, setTicketsError] = useState<string | null>(null);
  const [customerTxns, setCustomerTxns] = useState<CustomerWalletTxnRow[]>([]);
  const [txnsLoading, setTxnsLoading] = useState(false);
  const [txnsError, setTxnsError] = useState<string | null>(null);
  const [panelQuery, setPanelQuery] = useState("");
  const ctaNavRef = useRef<HTMLElement>(null);
  const router = useRouter();
  const pathname = useAppPathname();

  const searchQs = searchParams.get("search");
  const idLinkSuffix =
    searchQs && searchQs.length > 0
      ? `?search=${encodeURIComponent(searchQs)}`
      : "";

  useEffect(() => {
    setAddressIndex(0);
    setAddressMenuOpen(false);
    if (customerId) {
      void fetchCustomer();
    } else {
      setError("Invalid customer ID");
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- refetch when path id or search identity changes
  }, [customerId, searchQs]);

  const activeNavFromUrl = searchParams.get("nav");

  useEffect(() => {
    setPanelQuery("");
  }, [activeNavFromUrl]);

  useEffect(() => {
    const nav = activeNavFromUrl;
    const orderType =
      nav === "food-orders"
        ? "food"
        : nav === "parcel-orders"
          ? "parcel"
          : nav === "person-ride"
            ? "person_ride"
            : null;

    if (!orderType || !customerId) {
      setCustomerOrders([]);
      setOrdersError(null);
      setOrdersLoading(false);
      return;
    }

    let cancelled = false;
    setOrdersLoading(true);
    setOrdersError(null);

    void (async () => {
      try {
        const res = await fetch(
          `/api/customers/${encodeURIComponent(customerId)}/orders-core?orderType=${orderType}&limit=50`
        );
        const json: unknown = await res.json();
        const body = json as { success?: boolean; error?: string; data?: CustomerOrderRow[] };
        if (!res.ok) {
          throw new Error(body.error || "Failed to load orders");
        }
        if (!body.success) {
          throw new Error(body.error || "Failed to load orders");
        }
        if (!cancelled) {
          setCustomerOrders(Array.isArray(body.data) ? body.data : []);
        }
      } catch (e) {
        if (!cancelled) {
          setOrdersError(e instanceof Error ? e.message : "Failed to load orders");
          setCustomerOrders([]);
        }
      } finally {
        if (!cancelled) setOrdersLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [activeNavFromUrl, customerId]);

  useEffect(() => {
    if (activeNavFromUrl !== "tickets" || !customerId) {
      setCustomerTickets([]);
      setTicketsError(null);
      setTicketsLoading(false);
      return;
    }

    let cancelled = false;
    setTicketsLoading(true);
    setTicketsError(null);

    void (async () => {
      try {
        const res = await fetch(
          `/api/customers/${encodeURIComponent(customerId)}/unified-tickets?limit=50`
        );
        const json: unknown = await res.json();
        const body = json as {
          success?: boolean;
          error?: string;
          data?: CustomerTicketRow[];
        };
        if (!res.ok) {
          throw new Error(body.error || "Failed to load tickets");
        }
        if (!body.success) {
          throw new Error(body.error || "Failed to load tickets");
        }
        if (!cancelled) {
          setCustomerTickets(Array.isArray(body.data) ? body.data : []);
        }
      } catch (e) {
        if (!cancelled) {
          setTicketsError(e instanceof Error ? e.message : "Failed to load tickets");
          setCustomerTickets([]);
        }
      } finally {
        if (!cancelled) setTicketsLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [activeNavFromUrl, customerId]);

  useEffect(() => {
    if (activeNavFromUrl !== "transactions" || !customerId) {
      setCustomerTxns([]);
      setTxnsError(null);
      setTxnsLoading(false);
      return;
    }

    let cancelled = false;
    setTxnsLoading(true);
    setTxnsError(null);

    void (async () => {
      try {
        const res = await fetch(
          `/api/customers/${encodeURIComponent(customerId)}/wallet-transactions?limit=50`
        );
        const json: unknown = await res.json();
        const body = json as {
          success?: boolean;
          error?: string;
          data?: CustomerWalletTxnRow[];
        };
        if (!res.ok) {
          throw new Error(body.error || "Failed to load transactions");
        }
        if (!body.success) {
          throw new Error(body.error || "Failed to load transactions");
        }
        if (!cancelled) {
          setCustomerTxns(Array.isArray(body.data) ? body.data : []);
        }
      } catch (e) {
        if (!cancelled) {
          setTxnsError(e instanceof Error ? e.message : "Failed to load transactions");
          setCustomerTxns([]);
        }
      } finally {
        if (!cancelled) setTxnsLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [activeNavFromUrl, customerId]);

  useEffect(() => {
    if (!addressMenuOpen) return;
    function handlePointerDown(e: MouseEvent) {
      if (
        addressMenuRef.current &&
        !addressMenuRef.current.contains(e.target as Node)
      ) {
        setAddressMenuOpen(false);
      }
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") setAddressMenuOpen(false);
    }
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKey);
    };
  }, [addressMenuOpen]);

  const fetchCustomer = async () => {
    try {
      setLoading(true);
      setError(null);

      const response = await fetch(`/api/customers/${customerId}`);

      if (!response.ok) {
        const errorText = await response.text();
        let errorMessage = "Failed to fetch customer";
        try {
          const errorData = JSON.parse(errorText);
          errorMessage = errorData.error || errorMessage;
        } catch {
          errorMessage = errorText || errorMessage;
        }
        setError(errorMessage);
        setLoading(false);
        return;
      }

      const result = await response.json();

      if (result.success) {
        const loaded = result.data as CustomerDetail;
        const searchWant = (searchQs || "").trim().replace(/\s/g, "");
        // If URL still has a stale numeric path from a previous bug, but search asks for a different GM… id — re-resolve.
        if (
          /^GM\d+$/i.test(searchWant) &&
          loaded?.customerId &&
          loaded.customerId.toLowerCase() !== searchWant.toLowerCase()
        ) {
          router.replace(
            `/dashboard/customers/${encodeURIComponent(searchWant)}?search=${encodeURIComponent(searchWant)}`
          );
          return;
        }
        setCustomer(loaded);
      } else {
        setError(result.error || "Failed to fetch customer");
      }
    } catch (err) {
      console.error("Error fetching customer:", err);
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (amount: number | string | null | undefined) => {
    if (amount === null || amount === undefined) return "—";
    return `₹${Number(amount).toFixed(2)}`;
  };

  const panelSearchNeedle = panelQuery.trim().toLowerCase();

  const filteredOrders = useMemo(() => {
    if (!panelSearchNeedle) return customerOrders;
    return customerOrders.filter((row) => {
      const hay = [
        row.formattedOrderId,
        String(row.id),
        row.status,
        row.paymentStatus,
        row.dropAddressRaw,
        row.grandTotal != null ? String(row.grandTotal) : "",
        row.fareAmount != null ? String(row.fareAmount) : "",
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(panelSearchNeedle);
    });
  }, [customerOrders, panelSearchNeedle]);

  const filteredTickets = useMemo(() => {
    if (!panelSearchNeedle) return customerTickets;
    return customerTickets.filter((row) => {
      const hay = [
        row.ticketId,
        String(row.id),
        row.status,
        row.priority,
        row.serviceType,
        row.subject,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(panelSearchNeedle);
    });
  }, [customerTickets, panelSearchNeedle]);

  const filteredTxns = useMemo(() => {
    if (!panelSearchNeedle) return customerTxns;
    return customerTxns.filter((row) => {
      const hay = [
        row.transactionId,
        row.transactionType,
        row.status,
        row.description,
        row.referenceId,
        String(row.amount),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(panelSearchNeedle);
    });
  }, [customerTxns, panelSearchNeedle]);

  if (loading) {
    return (
      <div className="w-full max-w-full overflow-x-hidden py-2">
        <div className="flex items-center justify-center py-16">
          <div className="text-[#0f2d42]/70">Loading customer…</div>
        </div>
      </div>
    );
  }

  if (error || !customer) {
    return (
      <div className="w-full max-w-full overflow-x-hidden py-2">
        <div className="rounded-xl border border-red-200/80 bg-red-50/90 p-6">
          <div className="flex items-center gap-2 text-red-800">
            <AlertCircle className="h-5 w-5 shrink-0" />
            <p className="font-medium">Error: {error || "Customer not found"}</p>
          </div>
          <div className="mt-4">
            <Link
              href={
                searchQs
                  ? `/dashboard/customers/all?search=${encodeURIComponent(searchQs)}`
                  : "/dashboard/customers/all"
              }
              className="inline-flex items-center gap-2 text-sm font-medium text-[#0d5c4a] hover:underline"
            >
              Back to search
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const tier = resolveTrustTier(
    customer.trustTier,
    customer.trustScore == null ? null : Number(customer.trustScore)
  ) as CustomerTrustTier;
  const tierLabel = TRUST_TIER_LABEL[tier];
  const tierClass = trustTierUserTypeClass(tier);

  const trustNum =
    customer.trustScore == null ? null : Number(customer.trustScore);
  const fraudNum =
    customer.fraudScore == null ? null : Number(customer.fraudScore);

  const gmitraActive = customer.gmitraPlusActive === true;

  const addresses = customer.addresses ?? [];
  const safeAddrIdx =
    addresses.length === 0 ? 0 : Math.min(addressIndex, addresses.length - 1);
  const otherAddressIndices = addresses
    .map((_, i) => i)
    .filter((i) => i !== safeAddrIdx);

  const searchParam = encodeURIComponent(customer.customerId);

  const toggleOrderPillNav = (key: (typeof ORDER_NAV_KEYS)[number]) => {
    const p = new URLSearchParams(searchParams.toString());
    if (activeNavFromUrl === key) {
      p.delete("nav");
    } else {
      p.set("nav", key);
    }
    router.replace(`${pathname}?${p.toString()}`, { scroll: false });
  };

  const toggleTicketsNav = () => {
    const p = new URLSearchParams(searchParams.toString());
    if (activeNavFromUrl === "tickets") {
      p.delete("nav");
    } else {
      p.set("nav", "tickets");
    }
    router.replace(`${pathname}?${p.toString()}`, { scroll: false });
  };

  const toggleTransactionsNav = () => {
    const p = new URLSearchParams(searchParams.toString());
    if (activeNavFromUrl === "transactions") {
      p.delete("nav");
    } else {
      p.set("nav", "transactions");
    }
    router.replace(`${pathname}?${p.toString()}`, { scroll: false });
  };

  const navActive = (key: string) => activeNavFromUrl === key;

  const showOrdersPanel =
    activeNavFromUrl != null &&
    (ORDER_NAV_KEYS as readonly string[]).includes(activeNavFromUrl);

  const showTicketsPanel = activeNavFromUrl === "tickets";
  const showTransactionsPanel = activeNavFromUrl === "transactions";

  const showPanelSearch =
    (showOrdersPanel && !ordersLoading && !ordersError && customerOrders.length > 0) ||
    (showTicketsPanel && !ticketsLoading && !ticketsError && customerTickets.length > 0) ||
    (showTransactionsPanel && !txnsLoading && !txnsError && customerTxns.length > 0);

  const panelSearchPlaceholder = showOrdersPanel
    ? "Search orders…"
    : showTicketsPanel
      ? "Search tickets…"
      : "Search transactions…";

  return (
    <div className="flex w-full min-w-0 max-w-full flex-1 flex-col pt-3 sm:pt-4">
      <div className="mb-3 rounded-2xl border border-teal-200/35 bg-gradient-to-br from-[#E6F6F5] via-white to-[#f0fdf9] shadow-sm ring-1 ring-[#0f2d42]/5 sm:mb-4">
        {/* User Stats header + scrollable detail grid */}
        <div className="px-4 py-5 sm:px-6">
          <div className="flex flex-col gap-3">
          <div className="flex flex-row items-baseline justify-between gap-4">
            <p className="text-sm font-semibold uppercase tracking-[0.12em] text-[#0f2d42]/80">
              User Stats
            </p>
            <span className="shrink-0 text-xs font-medium text-[#0f2d42]/70 text-right">
              Current Addresses
            </span>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
            <p className="min-w-0 flex-1 text-[11px] leading-snug text-[#0f2d42]/55 sm:text-xs sm:pr-2">
              GatiMitra customer profile — trust & risk at a glance
            </p>
            <div className="flex min-w-0 w-full max-w-full shrink-0 flex-col items-stretch text-left sm:w-auto sm:max-w-[min(100%,42rem)]">
              {addresses.length === 0 ? (
                <span className="text-[11px] text-[#0f2d42]/80 sm:text-xs">—</span>
              ) : addresses.length === 1 ? (
                <span className="text-[11px] leading-snug text-[#0f2d42] [overflow-wrap:anywhere] break-words whitespace-normal sm:text-xs">
                  {formatAddressDisplay(addresses[0])}
                </span>
              ) : (
                <div className="relative w-full min-w-0" ref={addressMenuRef}>
                  <button
                    type="button"
                    aria-expanded={addressMenuOpen}
                    aria-haspopup="listbox"
                    aria-label="Select saved address"
                    onClick={() => setAddressMenuOpen((o) => !o)}
                    className="flex w-full min-w-0 flex-row items-start gap-2 rounded-md bg-white/70 px-2 py-1.5 text-left text-[11px] leading-snug text-[#0f2d42] outline-none ring-0 transition hover:bg-white/90 focus-visible:ring-2 focus-visible:ring-[#4EE5C1]/40 sm:text-xs"
                  >
                    <span className="min-w-0 flex-1 [overflow-wrap:anywhere] break-words whitespace-normal">
                      {formatAddressDisplay(addresses[safeAddrIdx])}
                    </span>
                    <ChevronDown
                      className={`mt-0.5 h-4 w-4 shrink-0 text-[#0f2d42]/55 transition ${addressMenuOpen ? "rotate-180" : ""}`}
                      aria-hidden
                    />
                  </button>
                  {addressMenuOpen ? (
                    <ul
                      role="listbox"
                      aria-label="Other saved addresses"
                      className="absolute left-0 right-0 z-[100] mt-1 max-h-56 overflow-auto rounded-md bg-white py-1 text-[#0f2d42] shadow-[0_8px_24px_-4px_rgba(15,45,66,0.12)] ring-1 ring-[#0f2d42]/12"
                    >
                      {otherAddressIndices.map((i) => {
                        const a = addresses[i];
                        return (
                          <li key={a.id} role="option" aria-selected={false}>
                            <button
                              type="button"
                              className="w-full px-2 py-2 text-left text-[11px] font-medium leading-snug text-[#0f2d42] [overflow-wrap:anywhere] break-words whitespace-normal hover:bg-[#E6F6F5]/90 hover:text-[#0f2d42] sm:text-xs"
                              onClick={() => {
                                setAddressIndex(i);
                                setAddressMenuOpen(false);
                              }}
                            >
                              {formatAddressDisplay(a)}
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  ) : null}
                </div>
              )}
            </div>
          </div>
        </div>
        </div>

        <div className="divide-y divide-teal-200/60 border-t border-teal-200/60 px-4 sm:px-6 pb-4">
          <DetailRow>
            <FieldItem label="User Id">
              <Link
                href={`/dashboard/customers/${customer.id}${idLinkSuffix}`}
                className="font-semibold text-[#0d5c4a] underline decoration-[#4EE5C1]/80 decoration-2 underline-offset-2 hover:text-[#0f2d42]"
              >
                {customer.customerId}
              </Link>
            </FieldItem>
            <FieldItem label="Full name">
              <span className="font-medium text-[#0f2d42]">{customer.fullName}</span>
            </FieldItem>
            <FieldItem label="Gender">{fmtText(customer.gender)}</FieldItem>
            <FieldItem label="Date of birth">
              <span className="tabular-nums">{formatDateOnly(customer.dateOfBirth ?? null)}</span>
            </FieldItem>
            <FieldItem label="Age group">{fmtText(customer.ageGroup)}</FieldItem>
            <FieldItem label="Preferred language">{fmtText(customer.preferredLanguage)}</FieldItem>
            <FieldItem label="Bio">
              <span className="[overflow-wrap:anywhere] break-words whitespace-normal">
                {fmtText(customer.bio)}
              </span>
            </FieldItem>
          </DetailRow>

          <DetailRow>
            <FieldItem label="Primary mobile">
              <span className="font-medium">{customer.primaryMobile}</span>
            </FieldItem>
            <FieldItem label="Mobile verified">
              <BoolVal v={customer.mobileVerified} />
            </FieldItem>
            <FieldItem label="Email">{fmtText(customer.email)}</FieldItem>
            <FieldItem label="Latitude">
              <span className="tabular-nums">{formatCoord(customer.latitude)}</span>
            </FieldItem>
            <FieldItem label="Longitude">
              <span className="tabular-nums">{formatCoord(customer.longitude)}</span>
            </FieldItem>
          </DetailRow>

          <DetailRow>
            <FieldItem label="User type ">
              <span className={tierClass}>{tierLabel}</span>
            </FieldItem>
            <FieldItem label="Trust score">
              <span className="tabular-nums font-medium">
                {trustNum != null && !Number.isNaN(trustNum) ? trustNum.toFixed(2) : "—"}
              </span>
            </FieldItem>
            <FieldItem label="Fraud score">
              <span className="tabular-nums font-medium">
                {fraudNum != null && !Number.isNaN(fraudNum) ? fraudNum.toFixed(2) : "—"}
              </span>
            </FieldItem>
            <FieldItem label="Risk flag">{fmtText(customer.riskFlag)}</FieldItem>
            <FieldItem label="Account status">{customer.accountStatus.toLowerCase()}</FieldItem>
            <FieldItem label="Global active">
              <BoolVal v={customer.isGlobalActive} />
            </FieldItem>
            <FieldItem label="Wallet balance">{formatCurrency(customer.walletBalance)}</FieldItem>
            <FieldItem label="Wallet locked">{formatCurrency(customer.walletLockedAmount)}</FieldItem>
          </DetailRow>

          <DetailRow>
            <FieldItem label="GMitra Plus">
              {gmitraActive ? (
                <span className="font-semibold text-emerald-600">Active</span>
              ) : (
                <span className="font-semibold text-red-600">Not active</span>
              )}
            </FieldItem>
            <FieldItem label="Activated date">
              {formatIsoDateTime(customer.gmitraPlusActivatedAt)}
            </FieldItem>
            <FieldItem label="Expiry date">
              {formatIsoDateTime(customer.gmitraPlusExpiresAt)}
            </FieldItem>
            <FieldItem label="Referral code">{fmtText(customer.referralCode)}</FieldItem>
            <FieldItem label="Referred by (code)">{fmtText(customer.referredBy)}</FieldItem>
            <FieldItem label="Referrer customer id">
              {customer.referrerCustomerId != null ? (
                <span className="tabular-nums font-medium">{customer.referrerCustomerId}</span>
              ) : (
                "—"
              )}
            </FieldItem>
            <FieldItem label="App installs with referral">
              <span className="tabular-nums font-medium">
                {typeof customer.referralInstallCount === "number"
                  ? customer.referralInstallCount
                  : "—"}
              </span>
            </FieldItem>
          </DetailRow>

          <DetailRow>
            <FieldItem label="Last login">{formatIsoDateTime(customer.lastLoginAt)}</FieldItem>
            <FieldItem label="Last order">{formatIsoDateTime(customer.lastOrderAt)}</FieldItem>
            <FieldItem label="Last activity">{formatIsoDateTime(customer.lastActivityAt)}</FieldItem>
            <FieldItem label="Created at">{formatIsoDateTime(customer.createdAt)}</FieldItem>
            <FieldItem label="Updated at">{formatIsoDateTime(customer.updatedAt)}</FieldItem>
            <FieldItem label="Created via">{fmtText(customer.createdVia)}</FieldItem>
          </DetailRow>

          <DetailRow>
            <FieldItem label="SMS permission">
              <BoolVal v={customer.smsPermission} />
            </FieldItem>
            <FieldItem label="Location permission">
              <BoolVal v={customer.locationPermission} />
            </FieldItem>
            <FieldItem label="Contacts permission">
              <BoolVal v={customer.contactsPermission} />
            </FieldItem>
          </DetailRow>

          <DetailRow>
            <FieldItem label="Customer account">
              <Link
                href={`/dashboard/customers/${customer.id}/edit`}
                className="font-medium text-[#0d5c4a] hover:underline"
              >
                Edit profile
              </Link>
              <ExternalLink className="inline h-3.5 w-3.5 ml-0.5 text-[#0d5c4a]" aria-hidden />
            </FieldItem>
            <FieldItem label="Customer notification">
              <span className="inline-flex items-center gap-0.5 font-medium text-[#0d5c4a] cursor-pointer hover:underline">
                link
                <ExternalLink className="h-3.5 w-3.5" aria-hidden />
              </span>
            </FieldItem>
          </DetailRow>
        </div>
      </div>

      <nav
        ref={ctaNavRef}
        className="sticky top-0 z-40 w-full min-w-0 shrink-0 border-b border-[#121212]/08 bg-white py-2 sm:py-2.5"
        aria-label="Order and account shortcuts"
      >
        <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
          <div className="max-w-full min-w-0 overflow-x-auto overflow-y-visible [-webkit-overflow-scrolling:touch] [scrollbar-width:thin]">
            <div className="flex w-max min-w-full flex-nowrap items-center justify-start gap-2 sm:gap-2.5 sm:justify-center">
              <button
                type="button"
                onClick={() => toggleOrderPillNav("food-orders")}
                className={`${NAV_PILL_MIN} cursor-pointer ${customerNavPillStripClass(navActive("food-orders"))}`}
              >
                Food · Orders
              </button>
              <button
                type="button"
                onClick={() => toggleOrderPillNav("parcel-orders")}
                className={`${NAV_PILL_MIN} cursor-pointer ${customerNavPillStripClass(navActive("parcel-orders"))}`}
              >
                Parcel · Orders
              </button>
              <button
                type="button"
                onClick={() => toggleOrderPillNav("person-ride")}
                className={`${NAV_PILL_MIN} cursor-pointer ${customerNavPillStripClass(navActive("person-ride"))}`}
              >
                Person · Ride
              </button>
              <button
                type="button"
                onClick={toggleTicketsNav}
                className={`${NAV_PILL_MIN} cursor-pointer ${customerNavPillStripClass(navActive("tickets"))}`}
              >
                Tickets
              </button>
              <button
                type="button"
                onClick={toggleTransactionsNav}
                className={`${NAV_PILL_MIN} cursor-pointer ${customerNavPillStripClass(navActive("transactions"))}`}
              >
                Transactions
              </button>
            </div>
          </div>

          {showPanelSearch ? (
            <form
              className="flex w-full min-w-0 shrink-0 items-center gap-1.5 sm:w-auto sm:max-w-xs"
              onSubmit={(e) => e.preventDefault()}
              role="search"
              aria-label="Filter panel results"
            >
              <input
                type="search"
                value={panelQuery}
                onChange={(e) => setPanelQuery(e.target.value)}
                placeholder={panelSearchPlaceholder}
                className="h-8 min-w-0 flex-1 rounded-[10px] border border-[#121212]/10 bg-white px-2.5 text-[11px] text-[#121212] placeholder:text-[#121212]/40 shadow-sm focus:border-[#121212]/25 focus:outline-none focus:ring-2 focus:ring-[#121212]/15 sm:w-44 sm:flex-none"
              />
              <button
                type="submit"
                className="inline-flex h-8 shrink-0 cursor-pointer items-center justify-center gap-1 rounded-[10px] bg-[#121212] px-2.5 text-[11px] font-medium text-white transition-colors hover:bg-black"
                aria-label="Search results"
              >
                <Search className="h-3.5 w-3.5" aria-hidden />
                <span className="hidden sm:inline">Search</span>
              </button>
            </form>
          ) : null}
        </div>
      </nav>

      {showOrdersPanel ? (
        <section
          className={`${RESULT_CARD_SHELL} min-h-[55vh] overflow-x-hidden`}
          aria-label="Customer orders from orders_core"
        >
          {ordersLoading ? (
            <p className="text-sm text-[#0f2d42]/65">Loading orders…</p>
          ) : ordersError ? (
            <p className="text-sm font-medium text-red-700">{ordersError}</p>
          ) : customerOrders.length === 0 ? (
            <p className="text-sm text-[#0f2d42]/65">No orders found for this type.</p>
          ) : filteredOrders.length === 0 ? (
            <p className="text-sm text-[#0f2d42]/65">No orders match your search.</p>
          ) : (
            <div className="overflow-x-auto -mx-1 px-1">
              <table className="min-w-[640px] w-full border-collapse text-left text-sm text-[#0f2d42]">
                <thead>
                  <tr className="border-b border-teal-200/70 text-xs font-semibold uppercase tracking-wide text-[#0f2d42]/70">
                    <th className="whitespace-nowrap py-2 pr-4">Order id</th>
                    <th className="whitespace-nowrap py-2 pr-4">Status</th>
                    <th className="whitespace-nowrap py-2 pr-4">Payment</th>
                    <th className="whitespace-nowrap py-2 pr-4 text-right">Total</th>
                    <th className="whitespace-nowrap py-2 pr-4">Created</th>
                    <th className="py-2 min-w-[12rem]">Drop address</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-teal-100/90">
                  {filteredOrders.map((row) => {
                    const orderLabel = row.formattedOrderId ?? `#${row.id}`;
                    const orderHref = controlPortalOrderUrl(row.formattedOrderId);
                    return (
                      <tr key={row.id} className="align-top hover:bg-[#f0fdf9]/80">
                        <td className="py-2.5 pr-4 font-medium">
                          {orderHref ? (
                            <a
                              href={orderHref}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-[#0d5c4a] underline decoration-[#4EE5C1]/70 underline-offset-2 hover:text-[#0f2d42]"
                            >
                              {orderLabel}
                              <ExternalLink className="h-3.5 w-3.5 shrink-0 opacity-70" aria-hidden />
                            </a>
                          ) : (
                            <span className="text-[#0f2d42]/90">{orderLabel}</span>
                          )}
                        </td>
                        <td className="py-2.5 pr-4 capitalize">{row.status}</td>
                        <td className="py-2.5 pr-4 capitalize">
                          {row.paymentStatus ?? "—"}
                        </td>
                        <td className="py-2.5 pr-4 text-right tabular-nums">
                          {row.grandTotal != null
                            ? `₹${Number(row.grandTotal).toFixed(2)}`
                            : row.fareAmount != null
                              ? `₹${Number(row.fareAmount).toFixed(2)}`
                              : "—"}
                        </td>
                        <td className="py-2.5 pr-4 whitespace-nowrap text-[#0f2d42]/85">
                          {formatShortDateTime(row.createdAt)}
                        </td>
                        <td className="py-2.5 max-w-md text-[#0f2d42]/90 [overflow-wrap:anywhere]">
                          {row.dropAddressRaw ?? "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ) : null}

      {showTicketsPanel ? (
        <section
          className={`${RESULT_CARD_SHELL} min-h-[55vh] overflow-x-hidden`}
          aria-label="Customer tickets from unified_tickets"
        >
          {ticketsLoading ? (
            <p className="text-sm text-[#0f2d42]/65">Loading tickets…</p>
          ) : ticketsError ? (
            <p className="text-sm font-medium text-red-700">{ticketsError}</p>
          ) : customerTickets.length === 0 ? (
            <p className="text-sm text-[#0f2d42]/65">No tickets found for this customer.</p>
          ) : filteredTickets.length === 0 ? (
            <p className="text-sm text-[#0f2d42]/65">No tickets match your search.</p>
          ) : (
            <div className="overflow-x-auto -mx-1 px-1">
              <table className="min-w-[640px] w-full border-collapse text-left text-sm text-[#0f2d42]">
                <thead>
                  <tr className="border-b border-teal-200/70 text-xs font-semibold uppercase tracking-wide text-[#0f2d42]/70">
                    <th className="whitespace-nowrap py-2 pr-4">Ticket id</th>
                    <th className="whitespace-nowrap py-2 pr-4">Status</th>
                    <th className="whitespace-nowrap py-2 pr-4">Priority</th>
                    <th className="whitespace-nowrap py-2 pr-4">Service</th>
                    <th className="whitespace-nowrap py-2 pr-4">Created</th>
                    <th className="py-2 min-w-[12rem]">Subject</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-teal-100/90">
                  {filteredTickets.map((row) => (
                    <tr key={row.id} className="align-top hover:bg-[#f0fdf9]/80">
                      <td className="py-2.5 pr-4 font-medium">
                        <a
                          href={`/dashboard/tickets/${row.id}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-[#0d5c4a] underline decoration-[#4EE5C1]/70 underline-offset-2 hover:text-[#0f2d42]"
                        >
                          {row.ticketId}
                          <ExternalLink className="h-3.5 w-3.5 shrink-0 opacity-70" aria-hidden />
                        </a>
                      </td>
                      <td className="py-2.5 pr-4 capitalize">{row.status}</td>
                      <td className="py-2.5 pr-4 capitalize">{row.priority}</td>
                      <td className="py-2.5 pr-4 capitalize">{row.serviceType ?? "—"}</td>
                      <td className="py-2.5 pr-4 whitespace-nowrap text-[#0f2d42]/85">
                        {formatShortDateTime(row.createdAt)}
                      </td>
                      <td className="py-2.5 max-w-md text-[#0f2d42]/90 [overflow-wrap:anywhere]">
                        {row.subject ?? "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ) : null}

      {showTransactionsPanel ? (
        <section
          className={`${RESULT_CARD_SHELL} min-h-[55vh] overflow-x-hidden`}
          aria-label="Customer wallet transactions"
        >
          {txnsLoading ? (
            <p className="text-sm text-[#0f2d42]/65">Loading transactions…</p>
          ) : txnsError ? (
            <p className="text-sm font-medium text-red-700">{txnsError}</p>
          ) : customerTxns.length === 0 ? (
            <p className="text-sm text-[#0f2d42]/65">No wallet transactions found for this customer.</p>
          ) : filteredTxns.length === 0 ? (
            <p className="text-sm text-[#0f2d42]/65">No transactions match your search.</p>
          ) : (
            <div className="overflow-x-auto -mx-1 px-1">
              <table className="min-w-[720px] w-full border-collapse text-left text-sm text-[#0f2d42]">
                <thead>
                  <tr className="border-b border-teal-200/70 text-xs font-semibold uppercase tracking-wide text-[#0f2d42]/70">
                    <th className="whitespace-nowrap py-2 pr-4">Txn id</th>
                    <th className="whitespace-nowrap py-2 pr-4">Type</th>
                    <th className="whitespace-nowrap py-2 pr-4 text-right">Amount</th>
                    <th className="whitespace-nowrap py-2 pr-4 text-right">Balance after</th>
                    <th className="whitespace-nowrap py-2 pr-4">Status</th>
                    <th className="whitespace-nowrap py-2 pr-4">Created</th>
                    <th className="py-2 min-w-[12rem]">Description</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-teal-100/90">
                  {filteredTxns.map((row) => (
                    <tr key={row.id} className="align-top hover:bg-[#f0fdf9]/80">
                      <td className="py-2.5 pr-4 font-medium tabular-nums text-[#0d5c4a]">
                        {row.transactionId}
                      </td>
                      <td className="py-2.5 pr-4 capitalize">{row.transactionType}</td>
                      <td className="py-2.5 pr-4 text-right tabular-nums">
                        ₹{Number(row.amount).toFixed(2)}
                      </td>
                      <td className="py-2.5 pr-4 text-right tabular-nums">
                        ₹{Number(row.balanceAfter).toFixed(2)}
                      </td>
                      <td className="py-2.5 pr-4 capitalize">{row.status ?? "—"}</td>
                      <td className="py-2.5 pr-4 whitespace-nowrap text-[#0f2d42]/85">
                        {formatShortDateTime(row.createdAt)}
                      </td>
                      <td className="py-2.5 max-w-md text-[#0f2d42]/90 [overflow-wrap:anywhere]">
                        {row.description || "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ) : null}
    </div>
  );
}

export default function CustomerDetailsPage() {
  return (
    <Suspense
      fallback={
        <div className="w-full max-w-full py-16 text-center text-[#0f2d42]/60">Loading…</div>
      }
    >
      <CustomerDetailsContent />
    </Suspense>
  );
}
