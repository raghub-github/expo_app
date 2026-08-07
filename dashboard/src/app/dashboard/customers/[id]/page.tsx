"use client";

import { useState, useEffect, useRef, useMemo, useCallback, Suspense } from "react";
import { useAppParams, useAppPathname, useAppSearchParams } from "@/hooks/useAppSearchParams";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { AlertCircle } from "lucide-react";
import {
  resolveTrustTier,
  type CustomerTrustTier,
} from "@/lib/customers/trust-tier";
import type { CustomerAddressRow, CustomerActivityDay, CustomerOrderStats } from "@/lib/db/operations/customers";
import {
  CustomerDetailPremiumView,
  CustomerDetailSkeleton,
} from "@/components/customers/CustomerDetailPremiumView";
import { CustomerBlockSideSheet } from "@/components/customers/CustomerBlockSideSheet";
import type {
  CustomerServiceBlockHistoryRow,
  CustomerServiceBlockRow,
} from "@/lib/db/operations/customer-service-blocks";

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
  orderStats?: CustomerOrderStats[];
  activityDaily?: CustomerActivityDay[];
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
  const [blockSheetOpen, setBlockSheetOpen] = useState(false);
  const [activeServiceBlocks, setActiveServiceBlocks] = useState<CustomerServiceBlockRow[]>([]);
  const [serviceBlockHistory, setServiceBlockHistory] = useState<CustomerServiceBlockHistoryRow[]>([]);
  const ctaNavRef = useRef<HTMLElement>(null);
  const router = useRouter();
  const pathname = useAppPathname();

  const searchQs = searchParams.get("search");
  const idLinkSuffix =
    searchQs && searchQs.length > 0
      ? `?search=${encodeURIComponent(searchQs)}`
      : "";

  const fetchServiceBlocks = useCallback(async () => {
    if (!customerId) return;
    try {
      const res = await fetch(`/api/customers/${encodeURIComponent(customerId)}/service-blocks`);
      const json = (await res.json()) as {
        success?: boolean;
        data?: {
          activeBlocks?: CustomerServiceBlockRow[];
          history?: CustomerServiceBlockHistoryRow[];
        };
      };
      if (json.success && json.data) {
        if (json.data.activeBlocks) setActiveServiceBlocks(json.data.activeBlocks);
        if (json.data.history) setServiceBlockHistory(json.data.history);
      }
    } catch {
      /* non-fatal */
    }
  }, [customerId]);

  useEffect(() => {
    setAddressIndex(0);
    setAddressMenuOpen(false);
    if (customerId) {
      void fetchCustomer();
      void fetchServiceBlocks();
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
    return <CustomerDetailSkeleton />;
  }

  if (error || !customer) {
    const backHref = searchQs
      ? `/dashboard/customers/all?search=${encodeURIComponent(searchQs)}`
      : "/dashboard/customers/all";
    return (
      <div className="w-full max-w-full overflow-x-hidden py-2">
        <div
          className="fixed inset-0 z-[12000] flex items-center justify-center bg-slate-900/45 p-4 backdrop-blur-[1px]"
          role="dialog"
          aria-modal="true"
          aria-labelledby="customer-fetch-error-title"
        >
          <div className="w-full max-w-md rounded-xl border border-red-100 bg-white p-6 shadow-xl">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h3
                  id="customer-fetch-error-title"
                  className="flex items-center gap-2 text-base font-semibold text-gray-900"
                >
                  <AlertCircle className="h-5 w-5 shrink-0 text-red-600" />
                  Couldn’t load customer
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-gray-600">
                  {error || "Customer not found"}
                </p>
              </div>
              <Link
                href={backHref}
                className="shrink-0 rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                aria-label="Close"
              >
                ×
              </Link>
            </div>
            <div className="mt-6 flex flex-wrap justify-end gap-2">
              <Link
                href={backHref}
                className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Back to search
              </Link>
              <button
                type="button"
                onClick={() => void fetchCustomer()}
                className="rounded-lg bg-[#0d5c4a] px-4 py-2 text-sm font-semibold text-white hover:bg-[#0a4a3c]"
              >
                Retry
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const tier = resolveTrustTier(
    customer.trustTier,
    customer.trustScore == null ? null : Number(customer.trustScore)
  ) as CustomerTrustTier;

  const trustNum =
    customer.trustScore == null ? null : Number(customer.trustScore);
  const fraudNum =
    customer.fraudScore == null ? null : Number(customer.fraudScore);

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
    <>
    <CustomerDetailPremiumView
      customer={customer}
      orderStats={customer.orderStats ?? []}
      activityDaily={customer.activityDaily ?? []}
      tier={tier}
      trustNum={trustNum}
      fraudNum={fraudNum}
      idLinkSuffix={idLinkSuffix}
      formatAddressDisplay={formatAddressDisplay}
      formatShortDateTime={formatShortDateTime}
      formatIsoDateTime={formatIsoDateTime}
      formatDateOnly={formatDateOnly}
      formatCoord={formatCoord}
      formatCurrency={formatCurrency}
      fmtText={fmtText}
      addresses={addresses}
      safeAddrIdx={safeAddrIdx}
      otherAddressIndices={otherAddressIndices}
      addressMenuOpen={addressMenuOpen}
      setAddressMenuOpen={setAddressMenuOpen}
      setAddressIndex={setAddressIndex}
      addressMenuRef={addressMenuRef}
      navActive={navActive}
      toggleOrderPillNav={toggleOrderPillNav}
      toggleTicketsNav={toggleTicketsNav}
      toggleTransactionsNav={toggleTransactionsNav}
      showPanelSearch={showPanelSearch}
      panelSearchPlaceholder={panelSearchPlaceholder}
      panelQuery={panelQuery}
      setPanelQuery={setPanelQuery}
      ctaNavRef={ctaNavRef}
      showOrdersPanel={showOrdersPanel}
      showTicketsPanel={showTicketsPanel}
      showTransactionsPanel={showTransactionsPanel}
      ordersLoading={ordersLoading}
      ordersError={ordersError}
      customerOrders={customerOrders}
      filteredOrders={filteredOrders}
      ticketsLoading={ticketsLoading}
      ticketsError={ticketsError}
      customerTickets={customerTickets}
      filteredTickets={filteredTickets}
      txnsLoading={txnsLoading}
      txnsError={txnsError}
      customerTxns={customerTxns}
      filteredTxns={filteredTxns}
      controlPortalOrderUrl={controlPortalOrderUrl}
      activeServiceBlocks={activeServiceBlocks}
      onOpenBlockSheet={() => setBlockSheetOpen(true)}
    />
    <CustomerBlockSideSheet
      open={blockSheetOpen}
      onClose={() => setBlockSheetOpen(false)}
      customerId={customerId}
      customerName={customer.fullName}
      activeBlocks={activeServiceBlocks}
      blockHistory={serviceBlockHistory}
      onUpdated={() => void fetchServiceBlocks()}
    />
  </>
  );
}

export default function CustomerDetailsPage() {
  return (
    <Suspense fallback={<CustomerDetailSkeleton />}>
      <CustomerDetailsContent />
    </Suspense>
  );
}
