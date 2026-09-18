"use client";

import { useEffect, useMemo, useState, type ComponentType } from "react";
import {
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
} from "recharts";
import {
  ChevronDown,
  Loader2,
  MapPin,
  MessageCircle,
  Package,
  Phone,
  Plus,
  Search,
  ShoppingBag,
  Star,
  TrendingUp,
  Wallet,
  X,
} from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { useCoreData } from "@/lib/hooks/useCoreData";
import { formatCount, formatDateTime, formatInr } from "@/lib/format";
import { parsePeriod, type Period } from "@/lib/period";
import { useDashboardIdentity } from "@/components/auth/DashboardIdentity";
import { ErrorState, LoadingGrid } from "@/components/ui/Primitives";
import type { CustomerDetailData, CustomersData } from "@/lib/data-types";
import { orderDetailHref } from "@/lib/order-links";

type CustomerRow = CustomersData["recent"][number];
type OrderRow = CustomerDetailData["orderHistory"][number];
type Segment = "ALL" | "ACTIVE" | "PLUS" | "LATEST";
type StatsRange = "W" | "M" | "6M" | "Y";

const RANGE_TO_PERIOD: Record<StatsRange, Period> = {
  W: "7d",
  M: "30d",
  "6M": "90d",
  Y: "90d",
};

function periodToRange(period: Period): StatsRange {
  if (period === "30d") return "M";
  if (period === "90d") return "6M";
  return "W";
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "C";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
}

function prettyType(type: string) {
  const t = type.toLowerCase();
  if (t === "food" || t === "grocery" || t === "mart" || t === "pharmacy") return "Food";
  if (t === "parcel") return "Parcel";
  if (t === "person_ride" || t === "ride" || t === "cab") return "Ride";
  return type.replace(/_/g, " ") || "Order";
}

function shortAddress(value: string) {
  if (!value || value === "—") return "—";
  return value.length > 48 ? `${value.slice(0, 46)}…` : value;
}

function SlidingPillToggle<T extends string>({
  options,
  value,
  onChange,
  className = "",
}: {
  options: readonly T[];
  value: T;
  onChange: (next: T) => void;
  className?: string;
}) {
  const idx = Math.max(0, options.indexOf(value));
  const n = options.length || 1;
  return (
    <div className={`relative flex rounded-full bg-[#F3F4F6] p-0.5 ${className}`}>
      <span
        aria-hidden
        className="pointer-events-none absolute top-0.5 bottom-0.5 rounded-md bg-white shadow-sm transition-all duration-200 ease-out"
        style={{
          width: `calc((100% - 4px) / ${n})`,
          left: `calc(2px + ${idx} * ((100% - 4px) / ${n}))`,
        }}
      />
      {options.map((opt) => (
        <button
          key={opt}
          type="button"
          onClick={() => onChange(opt)}
          className={`relative z-[1] flex-1 cursor-pointer rounded-md px-2.5 py-1 text-[11px] font-semibold transition-colors ${
            value === opt ? "text-[#111827]" : "text-[#9CA3AF]"
          }`}
        >
          {opt}
        </button>
      ))}
    </div>
  );
}

function CustomerAvatar({
  name,
  src,
  size = 40,
}: {
  name: string;
  src: string | null | undefined;
  size?: number;
}) {
  const [broken, setBroken] = useState(false);
  useEffect(() => {
    setBroken(false);
  }, [src]);
  const px = `${size}px`;
  if (src && !broken) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt={name}
        width={size}
        height={size}
        onError={() => setBroken(true)}
        className="shrink-0 rounded-full object-cover"
        style={{ width: px, height: px }}
      />
    );
  }
  return (
    <div
      className="flex shrink-0 items-center justify-center rounded-full bg-[#E0E7FF] text-[12px] font-semibold text-[#4338CA]"
      style={{ width: px, height: px }}
    >
      {initials(name)}
    </div>
  );
}

function StatusBadge({ status, plus }: { status: string; plus?: boolean }) {
  const s = status.toUpperCase();
  if (plus) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-[#FEF3C7] px-2 py-0.5 text-[10px] font-semibold tracking-wide text-[#B45309]">
        <Star className="h-2.5 w-2.5 fill-current" />
        PLUS
      </span>
    );
  }
  if (s === "ACTIVE") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-[#DCFCE7] px-2 py-0.5 text-[10px] font-semibold tracking-wide text-[#15803D]">
        <span className="h-1.5 w-1.5 rounded-full bg-[#22C55E]" />
        ACTIVE
      </span>
    );
  }
  if (s === "BLOCKED" || s === "SUSPENDED" || s === "BANNED") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-[#FEE2E2] px-2 py-0.5 text-[10px] font-semibold tracking-wide text-[#E11D48]">
        {s}
      </span>
    );
  }
  return <span className="text-[10px] font-semibold tracking-wide text-[#9CA3AF]">{s || "—"}</span>;
}

function MixColor(type: string) {
  const t = type.toLowerCase();
  if (t === "food") return "#F97316";
  if (t === "parcel") return "#3B82F6";
  if (t === "ride") return "#22C55E";
  return "#9CA3AF";
}

function ServiceFunnel({
  total,
  food,
  parcel,
  ride,
}: {
  total: number;
  food: number;
  parcel: number;
  ride: number;
}) {
  const services = [
    { key: "food", label: "Food", count: Math.max(food, 0), color: "#F97316" },
    { key: "parcel", label: "Parcel", count: Math.max(parcel, 0), color: "#3B82F6" },
    { key: "ride", label: "Ride", count: Math.max(ride, 0), color: "#22C55E" },
  ].sort((a, b) => b.count - a.count);

  const stages = [
    { key: "all", label: "All orders", count: Math.max(total, 0), color: "#7C3AED" },
    ...services,
  ];
  const base = stages[0].count || 1;
  // Visual top → bottom (narrow → wide)
  const topDown = [...stages].reverse();

  const BAR_H = 54;
  const GAP = 12;
  const W = 420;
  const padY = 6;
  const maxBarW = W * 0.92;
  const H = padY * 2 + topDown.length * BAR_H + (topDown.length - 1) * GAP;
  const cx = W / 2;

  const bars = topDown.map((stage, index) => {
    const ofInitial = Math.round((stage.count / base) * 100);
    const logicalIndex = stages.findIndex((s) => s.key === stage.key);
    const prevCount = logicalIndex <= 0 ? stage.count : stages[logicalIndex - 1].count;
    const ofPrev = prevCount > 0 ? Math.round((stage.count / prevCount) * 100) : 0;
    const frac = Math.max(0.4, Math.min(1, stage.count / base || 0.4));
    const bw = maxBarW * frac;
    const y = padY + index * (BAR_H + GAP);
    return {
      ...stage,
      ofInitial,
      ofPrev,
      x: cx - bw / 2,
      y,
      w: bw,
      h: BAR_H,
    };
  });

  // Continuous medium-grey funnel body (rear silhouette)
  const silhouette = (() => {
    if (bars.length === 0) return "";
    const pts: string[] = [];
    // left edge top→bottom
    bars.forEach((b, i) => {
      pts.push(`${b.x},${b.y}`);
      if (i < bars.length - 1) {
        const next = bars[i + 1];
        pts.push(`${b.x},${b.y + b.h}`);
        pts.push(`${next.x},${next.y}`);
      } else {
        pts.push(`${b.x},${b.y + b.h}`);
      }
    });
    // right edge bottom→top
    for (let i = bars.length - 1; i >= 0; i--) {
      const b = bars[i];
      pts.push(`${b.x + b.w},${b.y + b.h}`);
      pts.push(`${b.x + b.w},${b.y}`);
      if (i > 0) {
        const prev = bars[i - 1];
        pts.push(`${prev.x + prev.w},${prev.y + prev.h}`);
      }
    }
    return pts.join(" ");
  })();

  return (
    <div className="mt-4">
      <div className="mb-2 flex items-center justify-between px-1 text-[11px] font-medium text-[#9CA3AF]">
        <span>Touchpoints</span>
        <span>Count · % total · % prev</span>
      </div>
      <div className="flex gap-2 rounded-xl bg-[#DDE5EF] px-2 py-2.5 sm:gap-3 sm:px-3">
        <div className="relative w-[78px] shrink-0" style={{ height: H }}>
          {bars.map((b) => (
            <p
              key={b.key}
              className="absolute right-0 flex items-center text-right text-[12px] font-medium leading-tight text-[#334155]"
              style={{ top: b.y, height: b.h }}
            >
              {b.label}
            </p>
          ))}
        </div>

        <div className="min-w-0 flex-1">
          <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label="Service funnel">
            <polygon points={silhouette} fill="#7F8694" />

            {/* Hard geometric side walls between stages — charcoal bevels */}
            {bars.slice(0, -1).map((b, i) => {
              const next = bars[i + 1];
              const yTop = b.y + b.h;
              const yBot = next.y;
              return (
                <g key={`wall-${b.key}`}>
                  {/* Recessed step floor between bars */}
                  <polygon
                    points={`${b.x},${yTop} ${b.x + b.w},${yTop} ${next.x + next.w},${yBot} ${next.x},${yBot}`}
                    fill="#6B7280"
                  />
                  {/* Charcoal side faces (hard geometric shadow) */}
                  <polygon
                    points={`${b.x},${yTop} ${next.x},${yBot} ${next.x},${yTop}`}
                    fill="#4A5560"
                  />
                  <polygon
                    points={`${b.x + b.w},${yTop} ${next.x + next.w},${yBot} ${next.x + next.w},${yTop}`}
                    fill="#4A5560"
                  />
                </g>
              );
            })}

            {bars.map((b) => (
              <g key={b.key}>
                {/* Tight underside cast onto the grey step */}
                <rect
                  x={b.x + 2}
                  y={b.y + b.h - 0.5}
                  width={Math.max(b.w - 4, 0)}
                  height={3.5}
                  fill="rgba(0,0,0,0.32)"
                />
                <rect x={b.x} y={b.y} width={b.w} height={b.h} fill={b.color} />
                {/* Top thickness edge */}
                <rect x={b.x} y={b.y} width={b.w} height={2.5} fill="rgba(0,0,0,0.2)" />
                <text
                  x={cx}
                  y={b.y + b.h / 2 - 10}
                  textAnchor="middle"
                  fill="#fff"
                  fontSize="14"
                  fontWeight="700"
                >
                  {formatCount(b.count)}
                </text>
                <text
                  x={cx}
                  y={b.y + b.h / 2 + 5}
                  textAnchor="middle"
                  fill="rgba(255,255,255,0.95)"
                  fontSize="10"
                >
                  {b.ofInitial}% of total
                </text>
                <text
                  x={cx}
                  y={b.y + b.h / 2 + 18}
                  textAnchor="middle"
                  fill="rgba(255,255,255,0.9)"
                  fontSize="10"
                >
                  {b.ofPrev}% of previous
                </text>
              </g>
            ))}
          </svg>
        </div>
      </div>
    </div>
  );
}

function OrderHistoryList({ items }: { items: OrderRow[] }) {
  if (items.length === 0) {
    return <p className="text-[13px] text-[#9CA3AF]">No orders yet.</p>;
  }
  return (
    <div className="space-y-3">
      {items.map((o) => (
        <div key={o.id} className="flex gap-3">
          <div
            className="mt-1.5 h-2 w-2 shrink-0 rounded-full"
            style={{ background: MixColor(o.type) }}
          />
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-2">
              <p className="text-[13px] text-[#6B7280]">
                <a
                  href={orderDetailHref(o.code)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-semibold text-[#7C3AED] hover:underline"
                  onClick={(e) => e.stopPropagation()}
                >
                  {o.code}
                </a>
                {" · "}
                {prettyType(o.type)}
              </p>
              <span className="shrink-0 text-[12px] font-semibold tabular-nums text-[#111827]">
                {formatInr(o.payable)}
              </span>
            </div>
            <p className="truncate text-[13px] font-medium text-[#111827]">
              {shortAddress(o.pickup)} → {shortAddress(o.dropoff)}
            </p>
            <p className="mt-0.5 text-[11px] text-[#9CA3AF]">
              {o.status.replace(/_/g, " ")} · {formatDateTime(o.createdAt)}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}

function addressLabel(label: string, customLabel: string | null) {
  const custom = customLabel?.trim();
  if (custom) return custom;
  const t = label.toUpperCase();
  if (t === "HOME") return "Home";
  if (t === "WORK" || t === "OFFICE") return "Work";
  if (t === "OTHER") return "Other";
  return label.replace(/_/g, " ") || "Address";
}

function SavedAddressList({ items }: { items: CustomerDetailData["savedAddresses"] }) {
  if (items.length === 0) {
    return <p className="text-[13px] text-[#9CA3AF]">No saved addresses.</p>;
  }
  return (
    <div className="space-y-3">
      {items.map((a) => {
        const line = [a.line1, a.line2, a.landmark, a.city, a.state, a.postalCode]
          .map((s) => (s || "").trim())
          .filter(Boolean)
          .join(", ");
        return (
          <div key={a.id} className="rounded-xl border border-[#EEF0F4] bg-[#F9FAFB] px-3.5 py-3">
            <div className="flex items-start justify-between gap-2">
              <div className="flex min-w-0 items-center gap-2">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#EEF2FF] text-[#4F46E5]">
                  <MapPin className="h-3.5 w-3.5" />
                </span>
                <div className="min-w-0">
                  <p className="truncate text-[13px] font-semibold text-[#111827]">
                    {addressLabel(a.label, a.customLabel)}
                  </p>
                  <div className="mt-0.5 flex flex-wrap gap-1.5">
                    {a.isDefault ? (
                      <span className="rounded-full bg-[#DCFCE7] px-1.5 py-0.5 text-[10px] font-semibold text-[#15803D]">
                        Default
                      </span>
                    ) : null}
                    {a.isLastUsed ? (
                      <span className="rounded-full bg-[#EDE9FE] px-1.5 py-0.5 text-[10px] font-semibold text-[#6D28D9]">
                        Last used
                      </span>
                    ) : null}
                  </div>
                </div>
              </div>
            </div>
            <p className="mt-2 text-[13px] leading-snug text-[#374151]">{line || "—"}</p>
            {a.contactName || a.contactMobile ? (
              <p className="mt-1.5 text-[12px] text-[#6B7280]">
                {[a.contactName, a.contactMobile].filter(Boolean).join(" · ")}
              </p>
            ) : null}
            {a.lastUsedAt ? (
              <p className="mt-1 text-[11px] text-[#9CA3AF]">
                Last used {formatDateTime(a.lastUsedAt)}
              </p>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

export function FleetCustomersPage() {
  const { data, loading, error, reload, period } = useCoreData<CustomersData>("/api/customers");
  const searchParams = useSearchParams();
  const router = useRouter();
  const { userId } = useDashboardIdentity();
  const [q, setQ] = useState("");
  const [segment, setSegment] = useState<Segment>("ALL");
  const urlCustomer = searchParams.get("customer");
  const [selectedId, setSelectedId] = useState<string | null>(urlCustomer);
  const [detail, setDetail] = useState<CustomerDetailData | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyQuery, setHistoryQuery] = useState("");
  const [addressesOpen, setAddressesOpen] = useState(false);
  const [walletOpen, setWalletOpen] = useState(false);
  const [ledgerOpen, setLedgerOpen] = useState(false);
  const [detailNonce, setDetailNonce] = useState(0);
  const statsRange = periodToRange(period);

  function setStatsRange(next: StatsRange) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("period", RANGE_TO_PERIOD[next]);
    router.replace(`/customers?${params.toString()}`);
  }

  function selectCustomer(id: string) {
    setSelectedId(id);
    const params = new URLSearchParams(searchParams.toString());
    if (params.get("customer") === id) return;
    params.set("customer", id);
    router.replace(`/customers?${params.toString()}`, { scroll: false });
  }

  const customers = useMemo(() => {
    if (!data) return [];
    let list = [...data.recent];
    if (segment === "ACTIVE") list = list.filter((c) => c.status.toUpperCase() === "ACTIVE");
    if (segment === "PLUS") list = list.filter((c) => c.plus);
    if (segment === "LATEST") {
      list = [...list].sort((a, b) => {
        const ta = new Date(a.createdAt).getTime();
        const tb = new Date(b.createdAt).getTime();
        return (Number.isFinite(tb) ? tb : 0) - (Number.isFinite(ta) ? ta : 0);
      });
    }
    const needle = q.trim().toLowerCase();
    if (!needle) return list;
    return list.filter((c) =>
      [c.name, c.mobile, c.email, c.city, c.state, c.status, c.id]
        .join(" ")
        .toLowerCase()
        .includes(needle)
    );
  }, [data, q, segment]);

  const customerIdsKey = useMemo(() => customers.map((c) => c.id).join("|"), [customers]);

  /** Platform-first customer (earliest join) — used when URL has no valid selection. */
  const firstCustomerId = useMemo(() => {
    if (!data?.recent.length) return null;
    const sorted = [...data.recent].sort((a, b) => {
      const ta = new Date(a.createdAt).getTime();
      const tb = new Date(b.createdAt).getTime();
      const na = Number.isFinite(ta) ? ta : Number.POSITIVE_INFINITY;
      const nb = Number.isFinite(tb) ? tb : Number.POSITIVE_INFINITY;
      if (na !== nb) return na - nb;
      return a.id.localeCompare(b.id);
    });
    return sorted[0]?.id ?? null;
  }, [data]);

  useEffect(() => {
    if (!customers.length) {
      setSelectedId(null);
      return;
    }
    // Honor explicit URL only when that customer is in the current list
    if (urlCustomer && customers.some((c) => c.id === urlCustomer)) {
      setSelectedId(urlCustomer);
      return;
    }
    // Default: first joined customer (not last-active / random)
    const fallback =
      (firstCustomerId && customers.some((c) => c.id === firstCustomerId)
        ? firstCustomerId
        : null) || customers[0].id;
    setSelectedId(fallback);
    const params = new URLSearchParams(searchParams.toString());
    if (params.get("customer") !== fallback) {
      params.set("customer", fallback);
      router.replace(`/customers?${params.toString()}`, { scroll: false });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- sync from URL + stable keys only
  }, [customerIdsKey, urlCustomer, firstCustomerId]);

  useEffect(() => {
    setHistoryOpen(false);
    setHistoryQuery("");
    setAddressesOpen(false);
    setLedgerOpen(false);
  }, [selectedId]);

  useEffect(() => {
    if (selectedId == null) {
      setDetail(null);
      return;
    }
    let cancelled = false;
    setDetailLoading(true);
    setDetailError(null);
    (async () => {
      try {
        const params = new URLSearchParams(searchParams.toString());
        if (!params.get("period")) params.set("period", period);
        const res = await fetch(`/api/customers/${encodeURIComponent(selectedId)}?${params}`, {
          credentials: "include",
          cache: "no-store",
          headers: userId ? { "x-coredash-user": userId } : undefined,
        });
        const json = (await res.json()) as {
          success?: boolean;
          data?: CustomerDetailData;
          error?: string;
        };
        if (!res.ok || !json.success || !json.data) {
          throw new Error(json.error || "Failed to load customer");
        }
        if (!cancelled) setDetail(json.data);
      } catch (err) {
        if (!cancelled) {
          setDetail(null);
          setDetailError(err instanceof Error ? err.message : "Failed to load customer");
        }
      } finally {
        if (!cancelled) setDetailLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedId, searchParams, userId, period, detailNonce]);

  const groups = useMemo(() => {
    const selectedCustomer = selectedId ? customers.find((c) => c.id === selectedId) : null;
    const rest = selectedId ? customers.filter((c) => c.id !== selectedId) : customers;

    if (segment === "LATEST") {
      const result: Array<{ key: string; items: CustomerRow[] }> = [];
      if (selectedCustomer) result.push({ key: "OPEN", items: [selectedCustomer] });
      if (rest.length) result.push({ key: "LATEST JOINS", items: rest });
      return result;
    }

    const map = new Map<string, CustomerRow[]>();
    const plus = rest.filter((c) => c.plus);
    if (plus.length) map.set("GATIMITRA PLUS", plus);
    for (const c of rest) {
      const key = c.cityGroup || "Unknown";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(c);
    }
    const keys = Array.from(map.keys()).sort((a, b) => {
      if (a === "GATIMITRA PLUS") return -1;
      if (b === "GATIMITRA PLUS") return 1;
      return a.localeCompare(b);
    });

    const result: Array<{ key: string; items: CustomerRow[] }> = [];
    if (selectedCustomer) result.push({ key: "OPEN", items: [selectedCustomer] });
    for (const k of keys) result.push({ key: k, items: map.get(k)! });
    return result;
  }, [customers, segment, selectedId]);

  const allOrders = detail?.orderHistory ?? [];
  const filteredOrders = useMemo(() => {
    const needle = historyQuery.trim().toLowerCase();
    if (!needle) return allOrders;
    return allOrders.filter((o) =>
      [o.code, o.type, o.status, o.pickup, o.dropoff].join(" ").toLowerCase().includes(needle)
    );
  }, [allOrders, historyQuery]);

  if (loading) return <LoadingGrid />;
  if (error || !data) return <ErrorState message={error || "Failed"} onRetry={reload} />;

  const selected = customers.find((c) => c.id === selectedId) ?? null;
  const customer = detail?.customer;
  const active = detail?.activeOrder ?? null;
  const mix = detail?.orderMix ?? [];
  const previewOrders = allOrders.slice(0, 6);
  const lastOrderAt =
    customer?.lastOrderAt ||
    selected?.lastOrderAt ||
    allOrders[0]?.deliveredAt ||
    allOrders[0]?.createdAt ||
    null;
  const cancelRate =
    customer && customer.orders > 0
      ? (customer.cancelled / customer.orders) * 100
      : 0;
  const deliverRate =
    customer && customer.orders > 0
      ? (customer.delivered / customer.orders) * 100
      : 0;

  return (
    <div className="flex h-dvh min-h-[640px] overflow-hidden bg-[#F5F6F8]">
      <aside className="flex w-[320px] shrink-0 flex-col border-r border-[#E5E7EB] bg-white">
        <div className="border-b border-[#EEF0F4] p-4">
          <div className="flex items-center gap-2">
            <div className="flex min-w-0 flex-1 items-center gap-2 rounded-xl border border-[#E5E7EB] bg-[#F9FAFB] px-3 py-2.5">
              <Search className="h-4 w-4 shrink-0 text-[#9CA3AF]" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search name, mobile, city…"
                className="min-w-0 w-full bg-transparent text-[13px] text-[#111827] outline-none placeholder:text-[#9CA3AF]"
              />
            </div>
            <div className="shrink-0 rounded-xl border border-[#E5E7EB] bg-white px-2.5 py-2 text-center">
              <p className="text-[10px] font-medium uppercase tracking-wide text-[#9CA3AF]">Total</p>
              <p className="text-[13px] font-semibold tabular-nums text-[#111827]">
                {formatCount(data.stats.total)}
              </p>
            </div>
          </div>
          <div className="mt-3">
            <SlidingPillToggle
              options={["ALL", "ACTIVE", "PLUS", "LATEST"] as const}
              value={segment}
              onChange={setSegment}
              className="w-full"
            />
          </div>
          <div className="mt-3 grid grid-cols-3 gap-2">
            <MiniStat label="Wallet" value={formatInr(data.stats.wallet, true)} />
            <MiniStat label="Plus" value={formatCount(data.stats.plus)} />
            <MiniStat label="Ordered" value={formatCount(data.stats.ordered)} />
          </div>
        </div>

        <div className="cd-scroll min-h-0 flex-1 overflow-y-auto px-2 py-3">
          {groups.map((group) => {
            const isCollapsed = collapsed[group.key];
            return (
              <div key={group.key} className="mb-3">
                <button
                  type="button"
                  onClick={() => setCollapsed((s) => ({ ...s, [group.key]: !s[group.key] }))}
                  className="mb-1 flex w-full cursor-pointer items-center justify-between px-2 py-1 text-[11px] font-semibold tracking-[0.14em] text-[#9CA3AF]"
                >
                  <span className="inline-flex items-center gap-1.5">
                    {group.key === "GATIMITRA PLUS" || group.key === "OPEN" ? (
                      <Star className={`h-3 w-3 ${group.key === "OPEN" ? "fill-[#4F46E5] text-[#4F46E5]" : "fill-[#F5A524] text-[#F5A524]"}`} />
                    ) : null}
                    {group.key === "OPEN" ? "SELECTED" : group.key.toUpperCase()}
                  </span>
                  <ChevronDown className={`h-3.5 w-3.5 transition ${isCollapsed ? "-rotate-90" : ""}`} />
                </button>
                {!isCollapsed
                  ? group.items.map((c) => {
                      const activeRow = c.id === selectedId;
                      return (
                        <button
                          key={`${group.key}-${c.id}`}
                          type="button"
                          onClick={() => selectCustomer(c.id)}
                          className={`relative mb-0.5 flex w-full cursor-pointer items-center gap-3 rounded-xl px-2.5 py-2.5 text-left transition ${
                            activeRow ? "bg-[#EEF2FF]" : "hover:bg-[#F9FAFB]"
                          }`}
                        >
                          {activeRow ? (
                            <span className="absolute bottom-2 left-0 top-2 w-[3px] rounded-r-full bg-[#4F46E5]" />
                          ) : null}
                          <CustomerAvatar name={c.name} src={c.avatarUrl} size={40} />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-[13px] font-semibold text-[#111827]">{c.name}</p>
                            <p className="truncate text-[11px] text-[#6B7280]">
                              {segment === "LATEST"
                                ? `Joined ${formatDateTime(c.createdAt)}`
                                : c.orders
                                  ? `${formatCount(c.orders)} orders · ${formatInr(c.gmv)}`
                                  : "No orders yet"}
                            </p>
                          </div>
                          <StatusBadge status={c.status} plus={c.plus} />
                        </button>
                      );
                    })
                  : null}
              </div>
            );
          })}
          {customers.length === 0 ? (
            <p className="px-3 py-8 text-center text-[13px] text-[#9CA3AF]">No customers match.</p>
          ) : null}
        </div>
      </aside>

      <section className="flex min-w-0 flex-1 flex-col overflow-hidden">
        {!selected ? (
          <div className="flex flex-1 items-center justify-center text-[14px] text-[#6B6894]">
            Select a customer
          </div>
        ) : (
          <>
            <header className="shrink-0 border-b border-[#E5E7EB] bg-white">
              <div className="flex items-center justify-between gap-4 px-5 py-4">
                <div className="flex min-w-0 items-center gap-4">
                  <CustomerAvatar
                    name={customer?.name || selected.name}
                    src={customer?.avatarUrl || selected.avatarUrl}
                    size={56}
                  />
                  <div className="min-w-0">
                    <div className="flex min-w-0 flex-wrap items-center gap-2">
                      <h2 className="truncate text-[20px] font-semibold tracking-tight text-[#111827]">
                        {customer?.name || selected.name}
                      </h2>
                      {customer?.plus || selected.plus ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-[#FEF3C7] px-2 py-0.5 text-[10px] font-semibold text-[#B45309]">
                          <Star className="h-2.5 w-2.5 fill-current" /> Plus
                        </span>
                      ) : null}
                      <StatusBadge status={customer?.status || selected.status} />
                    </div>
                    <p className="mt-1 text-[12px] text-[#6B7280]">
                      <span className="font-medium text-[#374151]">ID {customer?.id || selected.id}</span>
                      <span className="mx-1.5 text-[#D1D5DB]">·</span>
                      {customer?.mobile || selected.mobile}
                      {customer?.email && customer.email !== "—" ? (
                        <>
                          <span className="mx-1.5 text-[#D1D5DB]">·</span>
                          {customer.email}
                        </>
                      ) : null}
                    </p>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <SlidingPillToggle
                    options={["W", "M", "6M", "Y"] as const}
                    value={statsRange}
                    onChange={setStatsRange}
                  />
                  <a
                    href={`sms:${selected.mobile}`}
                    className="flex h-10 w-10 cursor-pointer items-center justify-center rounded-full bg-[#F3F4F6] text-[#111827] hover:bg-[#E5E7EB]"
                    title="Message"
                  >
                    <MessageCircle className="h-4 w-4" strokeWidth={1.75} />
                  </a>
                  <a
                    href={`tel:${selected.mobile}`}
                    className="flex h-10 w-10 cursor-pointer items-center justify-center rounded-full bg-[#F3F4F6] text-[#111827] hover:bg-[#E5E7EB]"
                    title="Call"
                  >
                    <Phone className="h-4 w-4" strokeWidth={1.75} />
                  </a>
                </div>
              </div>
            </header>

            <div className="cd-scroll min-h-0 flex-1 overflow-y-auto bg-[#F3F4F8] p-5">
              {detailError ? (
                <ErrorState message={detailError} onRetry={() => selectCustomer(selected.id)} />
              ) : null}

              <div className="overflow-hidden rounded-2xl border border-[#E5E7EB] bg-white shadow-sm">
                <div className="grid lg:grid-cols-2">
                  <div className="border-b border-[#EEF0F4] p-5 lg:border-b-0 lg:border-r">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#9CA3AF]">
                        Profile
                      </p>
                      <span className="rounded-full bg-[#F3F4F6] px-2.5 py-1 text-[11px] font-medium text-[#6B7280]">
                        {(customer?.createdVia || "app").toString()}
                      </span>
                    </div>
                    <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3">
                      <Spec label="Language" value={(customer?.language || "en").toUpperCase()} />
                      <Spec label="Referral" value={customer?.referralCode || "—"} />
                      <Spec label="Joined" value={formatDateTime(customer?.createdAt || selected.createdAt)} />
                      <Spec
                        label="Last login"
                        value={customer?.lastLoginAt ? formatDateTime(customer.lastLoginAt) : "—"}
                      />
                      <Spec label="Last order" value={lastOrderAt ? formatDateTime(lastOrderAt) : "—"} />
                      <Spec
                        label="Trust"
                        value={
                          customer?.trustScore != null
                            ? customer.trustScore.toFixed(1)
                            : selected.trustScore != null
                              ? selected.trustScore.toFixed(1)
                              : "—"
                        }
                      />
                    </div>
                  </div>

                  <div className="p-5">
                    <div className="flex items-start justify-between gap-3">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#9CA3AF]">
                        Location & risk
                      </p>
                      <div className="flex flex-wrap items-center justify-end gap-2">
                        <span
                          className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                            String(customer?.risk || selected.risk || "").toUpperCase() === "LOW"
                              ? "bg-[#DCFCE7] text-[#15803D]"
                              : String(customer?.risk || selected.risk || "").toUpperCase() === "HIGH"
                                ? "bg-[#FEE2E2] text-[#B91C1C]"
                                : "bg-[#F3F4F6] text-[#4B5563]"
                          }`}
                        >
                          Risk {(customer?.risk || selected.risk || "—").toString()}
                        </span>
                        <button
                          type="button"
                          onClick={() => setAddressesOpen(true)}
                          className="inline-flex shrink-0 cursor-pointer items-center gap-1 rounded-full bg-[#EEF2FF] px-2.5 py-1 text-[11px] font-semibold text-[#4F46E5] hover:bg-[#E0E7FF]"
                        >
                          <MapPin className="h-3 w-3" />
                          Saved
                          {(detail?.savedAddresses?.length ?? 0) > 0 ? (
                            <span className="tabular-nums">· {detail?.savedAddresses.length}</span>
                          ) : null}
                        </button>
                      </div>
                    </div>
                    <div className="mt-4 rounded-xl border border-[#EEF0F4] bg-[#F8FAFC] px-3.5 py-3">
                      <div className="flex items-start gap-2.5">
                        <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white text-[#7C3AED] shadow-sm">
                          <MapPin className="h-4 w-4" />
                        </span>
                        <p className="text-[13px] leading-snug text-[#374151]">
                          {customer?.address && customer.address !== "—"
                            ? customer.address
                            : `${customer?.city || selected.city}, ${customer?.state || selected.state}`}
                        </p>
                      </div>
                    </div>
                    <div className="mt-4 grid grid-cols-3 gap-3">
                      <Spec label="City" value={customer?.city || selected.city} />
                      <Spec label="State" value={customer?.state || selected.state} />
                      <Spec label="Pincode" value={customer?.pincode || selected.pincode || "—"} />
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <KpiCard
                  title="Total Orders"
                  value={formatCount(customer?.orders ?? selected.orders)}
                  hint={`${formatCount(customer?.delivered ?? 0)} delivered`}
                  icon={ShoppingBag}
                  iconBg="bg-[#EDE9FE]"
                  iconColor="text-[#7C3AED]"
                />
                <KpiCard
                  title="Revenue (GMV)"
                  value={formatInr(customer?.gmv ?? selected.gmv)}
                  hint={`${cancelRate.toFixed(0)}% cancel rate`}
                  icon={TrendingUp}
                  iconBg="bg-[#DCFCE7]"
                  iconColor="text-[#16A34A]"
                />
                <div className="rounded-2xl border border-[#E8EAF0] bg-white p-4 shadow-sm">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-[12px] font-medium text-[#6B7280]">Wallet Balance</p>
                      <p className="mt-1 truncate text-[22px] font-semibold tracking-tight text-[#111827]">
                        {formatInr(customer?.wallet ?? selected.wallet)}
                      </p>
                      <p className="mt-1 text-[11px] text-[#9CA3AF]">
                        Locked {formatInr(customer?.walletLocked ?? 0)}
                      </p>
                    </div>
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#DBEAFE]">
                      <Wallet className="h-5 w-5 text-[#2563EB]" />
                    </span>
                  </div>
                  <div className="mt-3 flex gap-2">
                    <button
                      type="button"
                      onClick={() => setLedgerOpen(true)}
                      className="inline-flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-xl border border-[#D1D5DB] bg-white px-3 py-2 text-[12px] font-semibold text-[#111827] hover:bg-[#F9FAFB]"
                    >
                      Ledger
                    </button>
                    <button
                      type="button"
                      onClick={() => setWalletOpen(true)}
                      className="inline-flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-xl bg-[#2563EB] px-3 py-2 text-[12px] font-semibold text-white hover:bg-[#1D4ED8]"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      Add
                    </button>
                  </div>
                </div>
                <KpiCard
                  title="Deliver Rate"
                  value={`${deliverRate.toFixed(0)}%`}
                  hint={lastOrderAt ? `Last order ${formatDateTime(lastOrderAt)}` : "No orders yet"}
                  icon={Package}
                  iconBg="bg-[#FCE7F3]"
                  iconColor="text-[#DB2777]"
                />
              </div>

              {/* Recent orders — full width */}
              <div className="mt-4 rounded-2xl border border-[#E8EAF0] bg-white p-5 shadow-sm">
                <div className="flex items-center justify-between">
                  <h4 className="text-[16px] font-semibold text-[#111827]">Recent orders</h4>
                  <button
                    type="button"
                    onClick={() => setHistoryOpen(true)}
                    className="cursor-pointer text-[12px] font-medium text-[#7C3AED] hover:underline"
                  >
                    View all
                  </button>
                </div>
                {active ? (
                  <div className="mt-3 rounded-xl border border-[#BBF7D0] bg-[#F0FDF4] px-3 py-2.5">
                    <p className="text-[10px] font-semibold tracking-wide text-[#15803D]">ACTIVE NOW</p>
                      <p className="mt-0.5 text-[13px] font-medium text-[#111827]">
                        <a
                          href={orderDetailHref(active.code)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-semibold text-[#7C3AED] hover:underline"
                        >
                          {active.code}
                        </a>
                        {" · "}
                        {prettyType(active.type)} · {formatInr(active.payable)}
                      </p>
                  </div>
                ) : null}
                <div className="mt-3 overflow-hidden rounded-xl border border-[#F3F4F6]">
                  <div className="grid grid-cols-[1.1fr_1.4fr_0.7fr] gap-2 bg-[#F9FAFB] px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-[#9CA3AF]">
                    <span>Order</span>
                    <span>Route</span>
                    <span className="text-right">Amount</span>
                  </div>
                  {previewOrders.length === 0 ? (
                    <p className="px-3 py-8 text-center text-[13px] text-[#9CA3AF]">No orders yet.</p>
                  ) : (
                    previewOrders.map((o) => (
                      <div
                        key={o.id}
                        className="grid grid-cols-[1.1fr_1.4fr_0.7fr] items-center gap-2 border-t border-[#F3F4F6] px-3 py-2.5"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-[13px] font-semibold text-[#7C3AED]">
                            <a
                              href={orderDetailHref(o.code)}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="hover:underline"
                            >
                              {o.code}
                            </a>
                          </p>
                          <p className="text-[11px] capitalize text-[#9CA3AF]">
                            {prettyType(o.type)} · {o.status.replace(/_/g, " ")}
                          </p>
                        </div>
                        <p className="truncate text-[12px] text-[#6B7280]">
                          {shortAddress(o.pickup)} → {shortAddress(o.dropoff)}
                        </p>
                        <p className="text-right text-[13px] font-semibold tabular-nums text-[#111827]">
                          {formatInr(o.payable)}
                        </p>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Order completion + Service funnel — one row */}
              <div className="mt-4 grid gap-4 xl:grid-cols-[0.9fr_1.2fr]">
                <div className="rounded-2xl border border-[#E8EAF0] bg-white p-5 shadow-sm">
                  <h4 className="text-[16px] font-semibold text-[#111827]">Order completion</h4>
                  <p className="mt-0.5 text-[12px] text-[#9CA3AF]">Delivered vs cancelled</p>
                  <div className="relative mx-auto mt-2 h-[180px] w-[180px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={[
                            { name: "Delivered", value: Math.max(customer?.delivered ?? 0, 0) },
                            { name: "Cancelled", value: Math.max(customer?.cancelled ?? 0, 0) },
                            {
                              name: "Other",
                              value: Math.max(
                                (customer?.orders ?? selected.orders) -
                                  (customer?.delivered ?? 0) -
                                  (customer?.cancelled ?? 0),
                                0
                              ),
                            },
                          ].filter((d) => d.value > 0)}
                          dataKey="value"
                          innerRadius={58}
                          outerRadius={78}
                          paddingAngle={2}
                          stroke="none"
                        >
                          <Cell fill="#7C3AED" />
                          <Cell fill="#F472B6" />
                          <Cell fill="#E5E7EB" />
                        </Pie>
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                      <p className="text-[22px] font-semibold text-[#111827]">{deliverRate.toFixed(0)}%</p>
                      <p className="text-[11px] text-[#9CA3AF]">Delivered</p>
                    </div>
                  </div>
                  <div className="mt-2 space-y-2 text-[12px]">
                    <div className="flex items-center justify-between">
                      <span className="inline-flex items-center gap-1.5 text-[#6B7280]">
                        <span className="h-2 w-2 rounded-full bg-[#7C3AED]" /> Delivered
                      </span>
                      <span className="font-semibold text-[#111827]">
                        {formatCount(customer?.delivered ?? 0)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="inline-flex items-center gap-1.5 text-[#6B7280]">
                        <span className="h-2 w-2 rounded-full bg-[#F472B6]" /> Cancelled
                      </span>
                      <span className="font-semibold text-[#111827]">
                        {formatCount(customer?.cancelled ?? 0)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between border-t border-[#F3F4F6] pt-2">
                      <span className="text-[#6B7280]">Total orders</span>
                      <span className="font-semibold text-[#111827]">
                        {formatCount(customer?.orders ?? selected.orders)}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="rounded-2xl border border-[#E8EAF0] bg-white p-5 shadow-sm">
                  <h4 className="text-[16px] font-semibold text-[#111827]">Service metrics</h4>
                  <p className="mt-0.5 text-[12px] text-[#9CA3AF]">Food · Parcel · Ride funnel</p>
                  <ServiceFunnel
                    total={customer?.orders ?? selected.orders}
                    food={(() => {
                      const rows = mix.filter((m) => prettyType(m.type) === "Food");
                      return rows.length ? rows.reduce((a, m) => a + m.orders, 0) : selected.foodOrders;
                    })()}
                    parcel={(() => {
                      const rows = mix.filter((m) => prettyType(m.type) === "Parcel");
                      return rows.length
                        ? rows.reduce((a, m) => a + m.orders, 0)
                        : selected.parcelOrders;
                    })()}
                    ride={(() => {
                      const rows = mix.filter((m) => prettyType(m.type) === "Ride");
                      return rows.length ? rows.reduce((a, m) => a + m.orders, 0) : selected.rideOrders;
                    })()}
                  />
                </div>
              </div>
            </div>
          </>
        )}
      </section>

      {historyOpen ? (
        <div className="fixed inset-0 z-[70] flex justify-end bg-black/35" onClick={() => setHistoryOpen(false)}>
          <aside
            className="flex h-full w-full max-w-md flex-col bg-white shadow-2xl"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
          >
            <div className="flex items-center justify-between border-b border-[#E5E7EB] px-5 py-4">
              <div>
                <h3 className="text-[17px] font-semibold text-[#111827]">Order history</h3>
                <p className="text-[12px] text-[#6B7280]">
                  {selected?.name} · {formatCount(filteredOrders.length)}
                  {historyQuery ? ` of ${formatCount(allOrders.length)}` : ""} orders
                </p>
              </div>
              <button
                type="button"
                onClick={() => setHistoryOpen(false)}
                className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-full bg-[#F3F4F6] text-[#111827] hover:bg-[#E5E7EB]"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="border-b border-[#EEF0F4] px-5 py-3">
              <div className="flex items-center gap-2 rounded-xl border border-[#E5E7EB] bg-[#F9FAFB] px-3 py-2.5">
                <Search className="h-4 w-4 text-[#9CA3AF]" />
                <input
                  value={historyQuery}
                  onChange={(e) => setHistoryQuery(e.target.value)}
                  placeholder="Search ID, type, address…"
                  className="w-full bg-transparent text-[13px] text-[#111827] outline-none placeholder:text-[#9CA3AF]"
                />
              </div>
            </div>
            <div className="cd-scroll min-h-0 flex-1 overflow-y-auto px-5 py-4">
              <OrderHistoryList items={filteredOrders} />
            </div>
          </aside>
        </div>
      ) : null}

      {addressesOpen ? (
        <div
          className="fixed inset-0 z-[70] flex justify-end bg-black/35"
          onClick={() => setAddressesOpen(false)}
        >
          <aside
            className="flex h-full w-full max-w-md flex-col bg-white shadow-2xl"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
          >
            <div className="flex items-center justify-between border-b border-[#E5E7EB] px-5 py-4">
              <div>
                <h3 className="text-[17px] font-semibold text-[#111827]">Saved addresses</h3>
                <p className="text-[12px] text-[#6B7280]">
                  {selected?.name} · {formatCount(detail?.savedAddresses?.length ?? 0)} addresses
                </p>
              </div>
              <button
                type="button"
                onClick={() => setAddressesOpen(false)}
                className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-full bg-[#F3F4F6] text-[#111827] hover:bg-[#E5E7EB]"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="cd-scroll min-h-0 flex-1 overflow-y-auto px-5 py-4">
              <SavedAddressList items={detail?.savedAddresses ?? []} />
            </div>
          </aside>
        </div>
      ) : null}

      {ledgerOpen && selected ? (
        <CustomerWalletLedgerSheet
          customerId={selected.id}
          customerName={selected.name}
          onClose={() => setLedgerOpen(false)}
        />
      ) : null}

      {walletOpen && selected ? (
        <AddWalletBalanceModal
          customerId={selected.id}
          customerName={selected.name}
          currentBalance={customer?.wallet ?? selected.wallet}
          onClose={() => setWalletOpen(false)}
          onSuccess={() => {
            setWalletOpen(false);
            setDetailNonce((n) => n + 1);
            void reload();
          }}
        />
      ) : null}
    </div>
  );
}

function Spec({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[11px] text-[#9CA3AF]">{label}</p>
      <p className="mt-0.5 text-[13px] font-semibold capitalize text-[#111827]">{value || "—"}</p>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-[#EEF0F4] bg-[#F9FAFB] px-2.5 py-2">
      <p className="text-[10px] uppercase tracking-wide text-[#9CA3AF]">{label}</p>
      <p className="mt-0.5 truncate text-[12px] font-semibold text-[#111827]">{value}</p>
    </div>
  );
}

function KpiCard({
  title,
  value,
  hint,
  icon: Icon,
  iconBg,
  iconColor,
}: {
  title: string;
  value: string;
  hint: string;
  icon: ComponentType<{ className?: string }>;
  iconBg: string;
  iconColor: string;
}) {
  return (
    <div className="rounded-2xl border border-[#E8EAF0] bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[12px] font-medium text-[#6B7280]">{title}</p>
          <p className="mt-1 truncate text-[22px] font-semibold tracking-tight text-[#111827]">{value}</p>
          <p className="mt-1 text-[11px] text-[#9CA3AF]">{hint}</p>
        </div>
        <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full ${iconBg}`}>
          <Icon className={`h-5 w-5 ${iconColor}`} />
        </span>
      </div>
    </div>
  );
}

function CustomerWalletLedgerSheet({
  customerId,
  customerName,
  onClose,
}: {
  customerId: string;
  customerName: string;
  onClose: () => void;
}) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [balance, setBalance] = useState(0);
  const [reloadKey, setReloadKey] = useState(0);
  const [entries, setEntries] = useState<
    Array<{
      id: string;
      title: string;
      amount: number;
      balanceAfter: number | null;
      createdAt: string;
      type: string;
      formattedOrderId?: string | null;
    }>
  >([]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const res = await fetch(`/api/customers/${encodeURIComponent(customerId)}/wallet/ledger?limit=50`, {
          cache: "no-store",
        });
        const json = (await res.json()) as {
          success?: boolean;
          error?: string;
          data?: {
            balance?: number;
            entries?: Array<{
              id: string;
              title: string;
              amount: number;
              balanceAfter: number | null;
              createdAt: string;
              type: string;
              formattedOrderId?: string | null;
            }>;
          };
        };
        if (!res.ok || !json.success || !json.data) {
          const raw = json.error || "Failed to load ledger";
          throw new Error(
            raw.includes("is not a function") || raw.includes("TURBOPACK")
              ? "Ledger service failed to load. Retry in a moment."
              : raw
          );
        }
        if (cancelled) return;
        setBalance(Number(json.data.balance ?? 0));
        setEntries(json.data.entries ?? []);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load ledger");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [customerId, reloadKey]);

  return (
    <div className="fixed inset-0 z-[70] flex justify-end bg-black/35" onClick={onClose}>
      <aside
        className="flex h-full w-full max-w-md flex-col bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className="flex items-center justify-between border-b border-[#E5E7EB] px-5 py-4">
          <div>
            <h3 className="text-[17px] font-semibold text-[#111827]">Wallet ledger</h3>
            <p className="text-[12px] text-[#6B7280]">
              {customerName} · {formatInr(balance)}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-full bg-[#F3F4F6] text-[#111827] hover:bg-[#E5E7EB]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="cd-scroll min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {loading ? (
            <p className="py-10 text-center text-[13px] text-[#9CA3AF]">Loading ledger…</p>
          ) : error ? (
            <div className="space-y-3">
              <p className="rounded-xl bg-[#FEF2F2] px-3 py-2 text-[12px] text-[#B91C1C]">{error}</p>
              <button
                type="button"
                onClick={() => setReloadKey((n) => n + 1)}
                className="cursor-pointer rounded-xl bg-[#F3F4F6] px-3 py-2 text-[12px] font-semibold text-[#111827] hover:bg-[#E5E7EB]"
              >
                Retry
              </button>
            </div>
          ) : entries.length === 0 ? (
            <p className="py-10 text-center text-[13px] text-[#9CA3AF]">No wallet transactions yet.</p>
          ) : (
            <ul className="space-y-2">
              {entries.map((tx) => {
                const credit = tx.amount >= 0;
                return (
                  <li
                    key={tx.id}
                    className="flex items-start gap-3 rounded-xl border border-[#EEF0F4] bg-[#F9FAFB] px-3 py-3"
                  >
                    <span
                      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${
                        credit ? "bg-[#DCFCE7] text-[#16A34A]" : "bg-[#FEE2E2] text-[#DC2626]"
                      }`}
                    >
                      <Wallet className="h-4 w-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] font-semibold text-[#111827]">{tx.title}</p>
                      {tx.formattedOrderId ? (
                        <p className="mt-0.5 truncate text-[11px] font-semibold tracking-wide text-[#4B5563]">
                          {tx.formattedOrderId}
                        </p>
                      ) : null}
                      <p className="mt-0.5 text-[11px] text-[#9CA3AF]">{formatDateTime(tx.createdAt)}</p>
                      {tx.balanceAfter != null ? (
                        <p className="mt-0.5 text-[11px] text-[#6B7280]">
                          Balance {formatInr(tx.balanceAfter)}
                        </p>
                      ) : null}
                    </div>
                    <p
                      className={`shrink-0 text-[13px] font-semibold ${
                        credit ? "text-[#16A34A]" : "text-[#DC2626]"
                      }`}
                    >
                      {credit ? "+" : "−"} {formatInr(Math.abs(tx.amount))}
                    </p>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </aside>
    </div>
  );
}

function AddWalletBalanceModal({
  customerId,
  customerName,
  currentBalance,
  onClose,
  onSuccess,
}: {
  customerId: string;
  customerName: string;
  currentBalance: number;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [amountText, setAmountText] = useState("");
  const [comment, setComment] = useState("");
  const [sendingOtp, setSendingOtp] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [otpOpen, setOtpOpen] = useState(false);
  const [otp, setOtp] = useState("");
  const [challengeId, setChallengeId] = useState<string | null>(null);
  const [requestId, setRequestId] = useState("");
  const [emailMasked, setEmailMasked] = useState("");
  const [maxBalance, setMaxBalance] = useState(50_000);
  const [liveBalance, setLiveBalance] = useState(currentBalance);
  const [limitsLoading, setLimitsLoading] = useState(true);
  const [limitHit, setLimitHit] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLimitsLoading(true);
    (async () => {
      try {
        const res = await fetch(`/api/customers/${encodeURIComponent(customerId)}/wallet`, {
          cache: "no-store",
        });
        const json = (await res.json()) as {
          success?: boolean;
          data?: { balance?: number; maxBalance?: number; remaining?: number };
        };
        if (cancelled || !res.ok || !json.success || !json.data) return;
        setLiveBalance(Number(json.data.balance ?? currentBalance));
        setMaxBalance(Number(json.data.maxBalance ?? 50_000));
      } catch {
        /* keep defaults from props */
      } finally {
        if (!cancelled) setLimitsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [customerId, currentBalance]);

  const remaining = Math.max(0, Math.round((maxBalance - liveBalance) * 100) / 100);
  const amount = Number(amountText);
  const overLimit = Number.isFinite(amount) && amount > 0 && amount > remaining + 1e-9;
  const amountOk = Number.isFinite(amount) && amount > 0 && !overLimit && remaining > 0;
  const commentTrimmed = comment.trim();
  const commentOk = commentTrimmed.length > 0 && commentTrimmed.length <= 200;
  const previewTitle = commentTrimmed || "Your ledger message will appear here";
  const balanceAfter = amountOk ? liveBalance + amount : liveBalance;
  const busy = sendingOtp || verifying;

  function onAmountChange(raw: string) {
    setError(null);
    if (raw === "" || raw === ".") {
      setAmountText(raw);
      setLimitHit(false);
      return;
    }
    const n = Number(raw);
    if (!Number.isFinite(n)) {
      setAmountText(raw);
      return;
    }
    if (n > remaining && remaining >= 0) {
      setAmountText(String(remaining));
      setLimitHit(true);
      setError(
        remaining <= 0
          ? `Wallet is at max limit (${formatInr(maxBalance)}). Cannot add more.`
          : `Limit crossed — max you can add is ${formatInr(remaining)}`
      );
      return;
    }
    setLimitHit(false);
    setAmountText(raw);
  }

  async function requestOtp() {
    if (overLimit || remaining <= 0) {
      setLimitHit(true);
      setError(
        remaining <= 0
          ? `Wallet is at max limit (${formatInr(maxBalance)}). Cannot add more.`
          : `Limit crossed — max you can add is ${formatInr(remaining)}`
      );
      return;
    }
    if (!amountOk || !commentOk || busy) return;
    setSendingOtp(true);
    setError(null);
    try {
      const res = await fetch(`/api/customers/${encodeURIComponent(customerId)}/wallet/otp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount,
          comment: commentTrimmed,
          customerName,
        }),
      });
      const json = (await res.json()) as {
        success?: boolean;
        error?: string;
        data?: { challengeId?: string; emailMasked?: string; requestId?: string };
      };
      if (!res.ok || !json.success || !json.data?.challengeId) {
        throw new Error(json.error || "Failed to send OTP");
      }
      setChallengeId(json.data.challengeId);
      setRequestId(json.data.requestId || "");
      setEmailMasked(json.data.emailMasked || "approver email");
      setOtp("");
      setOtpOpen(true);
      toast.success(`OTP sent to ${json.data.emailMasked || "approver email"}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send OTP");
    } finally {
      setSendingOtp(false);
    }
  }

  async function verifyAndCredit() {
    if (!challengeId || !/^\d{6}$/.test(otp.trim()) || verifying) return;
    setVerifying(true);
    setError(null);
    try {
      const res = await fetch(`/api/customers/${encodeURIComponent(customerId)}/wallet`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          challengeId,
          otp: otp.trim(),
        }),
      });
      const json = (await res.json()) as {
        success?: boolean;
        error?: string;
        data?: { balanceAfter?: number; amount?: number };
      };
      if (!res.ok || !json.success) {
        throw new Error(json.error || "OTP verification failed");
      }
      const credited = json.data?.amount != null ? formatInr(json.data.amount) : formatInr(amount);
      toast.success(`Wallet updated · ${credited} credited`);
      setOtpOpen(false);
      onSuccess();
    } catch (err) {
      const message = err instanceof Error ? err.message : "OTP verification failed";
      setError(message);
      toast.error(message);
    } finally {
      setVerifying(false);
    }
  }

  return (
    <>
      <div
        className="fixed inset-0 z-[80] flex items-center justify-center bg-black/45 p-4 backdrop-blur-[2px]"
        role="dialog"
        aria-modal="true"
        aria-labelledby="wallet-add-title"
      >
        <div className="w-full max-w-3xl overflow-hidden rounded-2xl border border-[#E5E7EB] bg-white shadow-2xl">
          <div className="flex items-start justify-between gap-4 border-b border-[#EEF0F4] px-6 py-4">
            <div className="min-w-0">
              <h3 id="wallet-add-title" className="text-[18px] font-semibold tracking-tight text-[#111827]">
                Add wallet balance
              </h3>
              <p className="mt-0.5 truncate text-[13px] text-[#6B7280]">
                {customerName} · current {formatInr(liveBalance)}
              </p>
            </div>
            <button
              type="button"
              disabled={busy}
              onClick={onClose}
              className="flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-full bg-[#F3F4F6] text-[#111827] hover:bg-[#E5E7EB] disabled:opacity-50"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="grid gap-0 md:grid-cols-2">
            <div className="space-y-4 px-6 py-5">
              {limitHit ? (
                <div className="grid grid-cols-2 gap-2">
                  <div className="rounded-xl border border-[#FECACA] bg-[#FEF2F2] px-3 py-2.5">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-[#B91C1C]">
                      Max limit
                    </p>
                    <p className="mt-0.5 text-[13px] font-semibold text-[#111827]">
                      {limitsLoading ? "…" : formatInr(maxBalance)}
                    </p>
                  </div>
                  <div className="rounded-xl border border-[#FECACA] bg-[#FEF2F2] px-3 py-2.5">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-[#B91C1C]">
                      Remaining
                    </p>
                    <p className="mt-0.5 text-[13px] font-semibold text-[#B91C1C]">
                      {limitsLoading ? "…" : formatInr(remaining)}
                    </p>
                  </div>
                </div>
              ) : null}

              <label className="block">
                <span className="text-[12px] font-medium text-[#6B7280]">Amount (₹)</span>
                <input
                  type="number"
                  min={0.01}
                  max={remaining > 0 ? remaining : 0}
                  step="0.01"
                  value={amountText}
                  onChange={(e) => onAmountChange(e.target.value)}
                  placeholder="e.g. 100"
                  disabled={remaining <= 0 && !limitsLoading}
                  className={`mt-1.5 w-full rounded-xl border bg-[#F9FAFB] px-3 py-2.5 text-[15px] font-semibold outline-none focus:ring-2 disabled:cursor-not-allowed disabled:opacity-60 ${
                    limitHit
                      ? "border-[#FECACA] text-[#B91C1C] focus:border-[#DC2626] focus:ring-[#DC2626]/20"
                      : "border-[#E5E7EB] text-[#111827] focus:border-[#2563EB] focus:ring-[#2563EB]/20"
                  }`}
                />
                {limitHit ? (
                  <p className="mt-1.5 text-[12px] font-medium text-[#B91C1C]">
                    {remaining <= 0
                      ? "Wallet is already at max limit. Cannot add more."
                      : `Limit crossed — you can add at most ${formatInr(remaining)}.`}
                  </p>
                ) : null}
              </label>

              <label className="block">
                <span className="text-[12px] font-medium text-[#6B7280]">Ledger comment</span>
                <textarea
                  value={comment}
                  onChange={(e) => setComment(e.target.value.slice(0, 200))}
                  rows={2}
                  placeholder="Shown as the title in the customer wallet ledger"
                  className="mt-1.5 w-full resize-none rounded-xl border border-[#E5E7EB] bg-[#F9FAFB] px-3 py-2.5 text-[14px] text-[#111827] outline-none focus:border-[#2563EB] focus:ring-2 focus:ring-[#2563EB]/20"
                />
                <span className="mt-1 block text-right text-[11px] text-[#9CA3AF]">
                  {commentTrimmed.length}/200
                </span>
              </label>
            </div>

            <div className="border-t border-[#EEF0F4] bg-[#F8FAFC] px-6 py-5 md:border-l md:border-t-0">
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#9CA3AF]">
                Customer wallet preview
              </p>
              <div className="mt-3 flex items-start gap-3 rounded-xl border border-[#E5E7EB] bg-white p-3.5 shadow-sm">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#DCFCE7]">
                  <Wallet className="h-4 w-4 text-[#16A34A]" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-semibold leading-snug text-[#111827]">{previewTitle}</p>
                  <p className="mt-0.5 text-[11px] text-[#9CA3AF]">Just now · GatiCash ledger</p>
                </div>
                <p className="shrink-0 text-[13px] font-semibold text-[#16A34A]">
                  {amountOk ? `+ ${formatInr(amount)}` : "+ ₹—"}
                </p>
              </div>
              <div className="mt-3 flex items-center justify-between rounded-xl bg-white/80 px-3 py-2.5 text-[12px] text-[#6B7280]">
                <span>Balance after credit</span>
                <span className="font-semibold text-[#111827]">{formatInr(balanceAfter)}</span>
              </div>
            </div>
          </div>

          {error && !otpOpen ? (
            <div className="px-6 pb-2">
              <p className="rounded-xl bg-[#FEF2F2] px-3 py-2 text-[12px] text-[#B91C1C]">{error}</p>
            </div>
          ) : null}

          <div className="flex items-center justify-end gap-3 border-t border-[#EEF0F4] px-6 py-4">
            <button
              type="button"
              disabled={busy}
              onClick={onClose}
              className="cursor-pointer rounded-xl bg-[#F4F6FF] px-5 py-2.5 text-sm font-medium text-[#1E1C4A] hover:bg-[#EEF0FF] disabled:opacity-60"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={!amountOk || !commentOk || busy || limitsLoading || remaining <= 0}
              onClick={() => void requestOtp()}
              className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-xl bg-[#2563EB] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#1D4ED8] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {sendingOtp ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {sendingOtp ? "Sending OTP…" : "Credit wallet"}
            </button>
          </div>
        </div>
      </div>

      {otpOpen ? (
        <div
          className="fixed inset-0 z-[90] flex items-center justify-center bg-black/55 p-4 backdrop-blur-[2px]"
          role="dialog"
          aria-modal="true"
          aria-labelledby="wallet-otp-title"
        >
          <div className="w-full max-w-md rounded-2xl border border-[#E5E7EB] bg-white p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 id="wallet-otp-title" className="text-[17px] font-semibold text-[#111827]">
                  Verify OTP
                </h3>
                <p className="mt-1 text-[12px] text-[#6B7280]">
                  Enter the 6-digit code sent to{" "}
                  <span className="font-medium text-[#111827]">{emailMasked}</span>
                </p>
              </div>
              <button
                type="button"
                disabled={verifying}
                onClick={() => {
                  setOtpOpen(false);
                  setOtp("");
                  setError(null);
                }}
                className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-full bg-[#F3F4F6] text-[#111827] hover:bg-[#E5E7EB] disabled:opacity-50"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-4 rounded-xl border border-[#EEF0F4] bg-[#F8FAFC] px-3 py-2.5 text-[12px] text-[#6B7280]">
              {requestId ? (
                <p className="mb-1">
                  Request ID{" "}
                  <span className="font-mono font-semibold text-[#111827]">{requestId}</span>
                </p>
              ) : null}
              Crediting <span className="font-semibold text-[#111827]">{formatInr(amount)}</span> ·{" "}
              <span className="font-medium text-[#111827]">{commentTrimmed || "—"}</span>
            </div>

            <label className="mt-4 block">
              <span className="text-[12px] font-medium text-[#6B7280]">OTP</span>
              <input
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
                placeholder="••••••"
                className="mt-1.5 w-full rounded-xl border border-[#E5E7EB] bg-[#F9FAFB] px-3 py-3 text-center text-[22px] font-semibold tracking-[0.35em] text-[#111827] outline-none focus:border-[#2563EB] focus:ring-2 focus:ring-[#2563EB]/20"
              />
            </label>

            {error ? (
              <p className="mt-3 rounded-xl bg-[#FEF2F2] px-3 py-2 text-[12px] text-[#B91C1C]">{error}</p>
            ) : null}

            <div className="mt-5 flex gap-3">
              <button
                type="button"
                disabled={verifying || sendingOtp}
                onClick={() => void requestOtp()}
                className="flex-1 cursor-pointer rounded-xl bg-[#F4F6FF] px-4 py-2.5 text-sm font-medium text-[#1E1C4A] hover:bg-[#EEF0FF] disabled:opacity-60"
              >
                {sendingOtp ? "Resending…" : "Resend OTP"}
              </button>
              <button
                type="button"
                disabled={!/^\d{6}$/.test(otp) || verifying}
                onClick={() => void verifyAndCredit()}
                className="inline-flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-xl bg-[#2563EB] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#1D4ED8] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {verifying ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                {verifying ? "Verifying…" : "Verify & credit"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

