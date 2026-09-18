"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  ChevronDown,
  MessageCircle,
  MoreVertical,
  Phone,
  Search,
  Star,
  X,
} from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useCoreData } from "@/lib/hooks/useCoreData";
import { formatCount, formatInr } from "@/lib/format";
import { parsePeriod, type Period } from "@/lib/period";
import { vehicleImageForType } from "@/lib/rider-media";
import { useDashboardIdentity } from "@/components/auth/DashboardIdentity";
import { wipeCoredashBrowserAuth } from "@/lib/auth/browser-wipe";
import { ErrorState, LoadingGrid } from "@/components/ui/Primitives";
import type { RiderDetailData, RidersData } from "@/lib/data-types";
import { orderDetailHref } from "@/lib/order-links";

type RiderRow = RidersData["recent"][number];
type RouteRow = RiderDetailData["routeHistory"][number];
type DutyLive = { availability: string; dutyLabel: string };

const DUTY_POLL_MS = 2500;

const RANGE_TO_PERIOD: Record<"W" | "M" | "6M" | "Y", Period> = {
  W: "7d",
  M: "30d",
  "6M": "90d",
  Y: "90d",
};

function periodToRange(period: Period): "W" | "M" | "6M" | "Y" {
  if (period === "30d") return "M";
  if (period === "90d") return "6M";
  return "W";
}

type WheelFilter = "2W" | "3W" | "4W";
type StatsRange = "W" | "M" | "6M" | "Y";

function wheelClassForRider(vehicleType: string, vehicleCategory: string): WheelFilter {
  const src = vehicleImageForType(vehicleType, vehicleCategory);
  if (src === "/3w.png") return "3W";
  if (src === "/4w.png") return "4W";
  return "2W";
}

function groupTitle(key: string) {
  if (key === "UNASSIGNED") return "Un-Verified Riders";
  return key;
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

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "R";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
}

function isOnDuty(availability: string) {
  return availability === "ONLINE" || availability === "BUSY";
}

function dutyRank(availability: string) {
  if (availability === "BUSY") return 0;
  if (availability === "ONLINE") return 1;
  return 2;
}

function dutyFromAvailability(availability: string): string {
  if (availability === "BUSY") return "ON THE WAY";
  if (availability === "ONLINE") return "WAITING";
  return "OFFLINE";
}

function dutyTone(label: string) {
  if (label === "ON THE WAY") return "text-[#15803D]";
  if (label === "LOADING") return "text-[#F5A524]";
  if (label === "WAITING") return "text-[#E11D48]";
  return "text-[#9CA3AF]";
}

function formatDuration(seconds: number) {
  const total = Math.max(0, Math.round(seconds));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  if (h <= 0) return `${m} min`;
  return `${h} hr ${m} min`;
}

function formatEta(seconds: number | null, etaAt: string | null) {
  if (seconds != null && seconds > 0) {
    const m = Math.max(1, Math.round(seconds / 60));
    return `${m} min`;
  }
  if (etaAt) {
    const ms = new Date(etaAt).getTime() - Date.now();
    if (Number.isFinite(ms) && ms > 0) return `${Math.max(1, Math.round(ms / 60000))} min`;
  }
  return "—";
}

function shortAddress(value: string) {
  if (!value || value === "—") return "—";
  return value.length > 42 ? `${value.slice(0, 40)}…` : value;
}

function RiderAvatar({
  name,
  src,
  size = 40,
}: {
  name: string;
  src: string | null | undefined;
  size?: number;
}) {
  const [broken, setBroken] = useState(false);
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
      className="flex shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#4B49AC] to-[#7DA0FA] text-[12px] font-semibold text-white"
      style={{ width: px, height: px, fontSize: size > 44 ? 14 : 12 }}
    >
      {initials(name)}
    </div>
  );
}

function LicensePlate({ plate }: { plate: string }) {
  if (!plate) {
    return (
      <div className="inline-flex h-10 items-center rounded-md border-2 border-dashed border-[#C5C9D6] px-3 text-[12px] font-semibold tracking-wide text-[#9CA3AF]">
        No plate
      </div>
    );
  }
  return (
    <div className="inline-flex overflow-hidden rounded-md border-2 border-[#1E1C4A] bg-white shadow-sm">
      <div className="flex w-7 flex-col items-center justify-center bg-[#1E3A8A] px-1 text-[8px] font-bold leading-tight text-white">
        <span>IN</span>
      </div>
      <div className="px-3 py-1.5 font-mono text-[15px] font-bold tracking-[0.18em] text-[#111827]">
        {plate.toUpperCase()}
      </div>
    </div>
  );
}

function MiniRouteMap() {
  return (
    <div className="relative mt-3 h-[120px] overflow-hidden rounded-xl bg-[#EEF0F4]">
      <svg viewBox="0 0 320 120" className="h-full w-full" aria-hidden>
        <path d="M20 90 C60 90, 70 40, 120 40 S180 80, 220 55 S280 30, 300 35" fill="none" stroke="#D1D5DB" strokeWidth="10" strokeLinecap="round" />
        <path d="M20 90 C60 90, 70 40, 120 40 S180 80, 220 55 S280 30, 300 35" fill="none" stroke="#111827" strokeWidth="3" strokeLinecap="round" />
        <circle cx="28" cy="88" r="8" fill="#111827" />
        <text x="28" y="92" textAnchor="middle" fill="#fff" fontSize="9" fontWeight="700">A</text>
        <circle cx="298" cy="35" r="8" fill="#111827" />
        <text x="298" y="39" textAnchor="middle" fill="#fff" fontSize="9" fontWeight="700">B</text>
      </svg>
    </div>
  );
}

function StatusBadge({ availability }: { availability: string }) {
  const label = dutyFromAvailability(availability);
  if (label === "ON THE WAY") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-[#DCFCE7] px-2 py-0.5 text-[10px] font-semibold tracking-wide text-[#15803D]">
        <span className="h-1.5 w-1.5 rounded-full bg-[#22C55E]" />
        ON THE WAY
      </span>
    );
  }
  if (label === "WAITING") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-[#FEE2E2] px-2 py-0.5 text-[10px] font-semibold tracking-wide text-[#E11D48]">
        <span className="h-1.5 w-1.5 rounded-full bg-[#E11D48]" />
        WAITING
      </span>
    );
  }
  return <span className={`text-[10px] font-semibold tracking-wide ${dutyTone(label)}`}>{label}</span>;
}

function RouteHistoryList({ items }: { items: RouteRow[] }) {
  if (items.length === 0) {
    return <p className="text-[13px] text-[#9CA3AF]">No delivered routes yet.</p>;
  }
  return (
    <div className="space-y-4">
      {groupHistoryByDate(items).map((block) => (
        <div key={block.date}>
          <p className="mb-2 text-[12px] font-semibold text-[#9CA3AF]">{block.date}</p>
          <div className="space-y-3">
            {block.items.map((o) => (
              <div key={o.id} className="flex gap-3">
                <div className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-[#D1D5DB]" />
                <div className="min-w-0">
                  <p className="text-[13px] text-[#6B7280]">
                    ID:{" "}
                    <a
                      href={orderDetailHref(o.code)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-semibold text-[#7C3AED] hover:underline"
                    >
                      {o.code}
                    </a>
                    {" · "}
                    {prettyType(o.type)}
                  </p>
                  <p className="truncate text-[13px] font-medium text-[#111827]">
                    {shortAddress(o.pickup)} → {shortAddress(o.dropoff)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

const TIME_COLORS: Record<string, string> = {
  on_the_way: "#98BDFF",
  unloading: "#3B82F6",
  loading: "#F5A524",
  waiting: "#111827",
};

const GROUP_ORDER = ["FAVORITES", "BIKES", "SCOOTERS", "AUTOS", "CARS", "CYCLES", "OTHER", "UNASSIGNED"];

export function FleetRidersPage() {
  const { data, loading, error, reload, period } = useCoreData<RidersData>("/api/riders");
  const searchParams = useSearchParams();
  const router = useRouter();
  const { userId } = useDashboardIdentity();
  const [q, setQ] = useState("");
  const urlRider = searchParams.get("rider");
  const [selectedId, setSelectedId] = useState<number | null>(() => {
    const n = urlRider ? Number(urlRider) : NaN;
    return Number.isFinite(n) ? n : null;
  });
  const [detail, setDetail] = useState<RiderDetailData | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const statsRange = periodToRange(period);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [favoriteIds, setFavoriteIds] = useState<number[]>([]);
  const [favBusy, setFavBusy] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyQuery, setHistoryQuery] = useState("");
  const [docsOpen, setDocsOpen] = useState(false);
  const [docsQuery, setDocsQuery] = useState("");
  const [docsLoading, setDocsLoading] = useState(false);
  const [docsError, setDocsError] = useState<string | null>(null);
  const [wheelFilter, setWheelFilter] = useState<WheelFilter>("2W");
  const [dutyById, setDutyById] = useState<Record<number, DutyLive>>({});
  const [documents, setDocuments] = useState<
    Array<{
      id: number;
      docType: string;
      docNumber: string;
      extractedName: string;
      verified: boolean;
      status: string;
      method: string;
      methodLabel: string;
      source: string;
      createdAt: string;
      details: Array<{ label: string; value: string }>;
      files: Array<{ side: string; url: string | null }>;
    }>
  >([]);

  function setStatsRange(next: StatsRange) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("period", RANGE_TO_PERIOD[next]);
    router.replace(`/riders?${params.toString()}`);
  }

  function selectRider(id: number) {
    setSelectedId(id);
    const params = new URLSearchParams(searchParams.toString());
    if (params.get("rider") === String(id)) return;
    params.set("rider", String(id));
    router.replace(`/riders?${params.toString()}`, { scroll: false });
  }

  const loadFavorites = useCallback(async () => {
    try {
      const res = await fetch("/api/riders/favorites", { credentials: "include", cache: "no-store" });
      const json = (await res.json()) as { success?: boolean; data?: { ids: number[] } };
      if (res.ok && json.success && json.data) setFavoriteIds(json.data.ids);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    void loadFavorites();
  }, [loadFavorites]);

  // Live duty status — poll lightly so WAITING / OFFLINE flips instantly
  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const schedule = (ms: number) => {
      if (cancelled) return;
      timer = setTimeout(() => {
        void tick();
      }, ms);
    };

    const tick = async () => {
      if (cancelled) return;
      if (typeof document !== "undefined" && document.visibilityState === "hidden") {
        schedule(DUTY_POLL_MS);
        return;
      }
      try {
        const res = await fetch("/api/riders/status", {
          credentials: "include",
          cache: "no-store",
          headers: { "Cache-Control": "no-store" },
        });
        const json = (await res.json()) as {
          success?: boolean;
          data?: {
            online: number;
            riders: Array<{ id: number; availability: string; dutyLabel: string }>;
          };
        };
        if (!cancelled && res.ok && json.success && json.data) {
          const next: Record<number, DutyLive> = {};
          for (const row of json.data.riders) {
            next[row.id] = { availability: row.availability, dutyLabel: row.dutyLabel };
          }
          setDutyById(next);
        }
      } catch {
        /* keep last known status */
      } finally {
        schedule(DUTY_POLL_MS);
      }
    };

    void tick();

    const onVis = () => {
      if (document.visibilityState === "visible") void tick();
    };
    document.addEventListener("visibilitychange", onVis);

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, []);

  // Keep selected rider detail badge in sync with live duty
  useEffect(() => {
    if (selectedId == null) return;
    const live = dutyById[selectedId];
    if (!live) return;
    setDetail((prev) => {
      if (!prev) return prev;
      if (prev.rider.availability === live.availability && prev.rider.dutyLabel === live.dutyLabel) {
        return prev;
      }
      return {
        ...prev,
        rider: {
          ...prev.rider,
          availability: live.availability,
          dutyLabel: live.dutyLabel,
        },
      };
    });
  }, [dutyById, selectedId]);

  const riders = useMemo(() => {
    if (!data) return [];
    const needle = q.trim().toLowerCase();
    let list = data.recent.map((r) => {
      const live = dutyById[r.id];
      return live ? { ...r, availability: live.availability } : r;
    });
    list = list.filter(
      (r) => wheelClassForRider(r.vehicleType || "", r.vehicleCategory || "") === wheelFilter
    );
    if (!needle) {
      return [...list].sort((a, b) => dutyRank(a.availability) - dutyRank(b.availability));
    }
    return list
      .filter((r) =>
        [r.name, r.mobile, r.city, r.vehicle, r.plate, r.availability, r.kyc, String(r.id)]
          .join(" ")
          .toLowerCase()
          .includes(needle)
      )
      .sort((a, b) => dutyRank(a.availability) - dutyRank(b.availability));
  }, [data, q, wheelFilter, dutyById]);

  const onDutyFiltered = useMemo(
    () => riders.filter((r) => isOnDuty(r.availability)).length,
    [riders]
  );

  // Order-independent — duty re-sort must not re-trigger selection sync
  const riderIdsKey = useMemo(
    () =>
      riders
        .map((r) => r.id)
        .slice()
        .sort((a, b) => a - b)
        .join("|"),
    [riders]
  );

  useEffect(() => {
    if (!riders.length) {
      setSelectedId(null);
      return;
    }
    const fromUrl = urlRider ? Number(urlRider) : NaN;
    if (Number.isFinite(fromUrl) && riders.some((r) => r.id === fromUrl)) {
      setSelectedId(fromUrl);
      return;
    }
    // Keep the open rider if still in the filtered list (don't jump to riders[0])
    setSelectedId((prev) => {
      if (prev != null && riders.some((r) => r.id === prev)) return prev;
      return riders[0]!.id;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- sync from URL + stable id set only
  }, [riderIdsKey, urlRider]);

  // Sync URL after selection settles — never call router inside a setState updater.
  useEffect(() => {
    if (selectedId == null) return;
    if (urlRider === String(selectedId)) return;
    if (!riders.some((r) => r.id === selectedId)) return;
    const params = new URLSearchParams(searchParams.toString());
    params.set("rider", String(selectedId));
    router.replace(`/riders?${params.toString()}`, { scroll: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- URL mirror only
  }, [selectedId, urlRider, riderIdsKey]);

  useEffect(() => {
    setHistoryOpen(false);
    setDocsOpen(false);
    setHistoryQuery("");
    setDocsQuery("");
    setDocuments([]);
  }, [selectedId]);

  async function openDocuments() {
    if (selectedId == null) return;
    setDocsOpen(true);
    setDocsLoading(true);
    setDocsError(null);
    try {
      const res = await fetch(`/api/riders/${selectedId}/documents`, {
        credentials: "include",
        cache: "no-store",
      });
      const json = (await res.json()) as {
        success?: boolean;
        data?: { documents: typeof documents };
        error?: string;
      };
      if (!res.ok || !json.success || !json.data) throw new Error(json.error || "Failed to load documents");
      setDocuments(json.data.documents);
    } catch (err) {
      setDocuments([]);
      setDocsError(err instanceof Error ? err.message : "Failed to load documents");
    } finally {
      setDocsLoading(false);
    }
  }

  useEffect(() => {
    if (selectedId == null) {
      setDetail(null);
      return;
    }
    let cancelled = false;
    const periodKey = parsePeriod(searchParams.get("period"));
    (async () => {
      setDetailLoading(true);
      setDetailError(null);
      try {
        const res = await fetch(`/api/riders/${selectedId}?period=${periodKey}`, {
          credentials: "include",
          cache: "no-store",
          headers: { "Cache-Control": "no-store" },
        });
        const json = (await res.json()) as { success: boolean; data?: RiderDetailData; error?: string };
        if (res.status === 401 || res.status === 403) {
          await wipeCoredashBrowserAuth(userId);
          window.location.replace(res.status === 403 ? "/api/auth/denied" : "/login");
          return;
        }
        if (!res.ok || !json.success || !json.data) throw new Error(json.error || "Failed to load rider");
        if (!cancelled) setDetail(json.data);
      } catch (err) {
        if (!cancelled) {
          setDetail(null);
          setDetailError(err instanceof Error ? err.message : "Failed to load rider");
        }
      } finally {
        if (!cancelled) setDetailLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedId, searchParams, userId, period]);

  const favoriteSet = useMemo(() => new Set(favoriteIds), [favoriteIds]);

  const allRoutes = detail?.routeHistory ?? [];
  const filteredRoutes = useMemo(() => {
    const needle = historyQuery.trim().toLowerCase();
    if (!needle) return allRoutes;
    return allRoutes.filter((o) =>
      [o.code, o.type, o.pickup, o.dropoff, o.status].join(" ").toLowerCase().includes(needle)
    );
  }, [allRoutes, historyQuery]);
  const filteredDocs = useMemo(() => {
    const needle = docsQuery.trim().toLowerCase();
    if (!needle) return documents;
    return documents.filter((d) =>
      [
        d.docType,
        d.docNumber,
        d.extractedName,
        d.status,
        d.method,
        d.methodLabel,
        d.source,
        ...((d.details ?? []).flatMap((x) => [x.label, x.value])),
      ]
        .join(" ")
        .toLowerCase()
        .includes(needle)
    );
  }, [documents, docsQuery]);

  const groups = useMemo(() => {
    const map = new Map<string, RiderRow[]>();
    const favorites = riders.filter((r) => favoriteSet.has(r.id));
    if (favorites.length) map.set("FAVORITES", favorites);
    for (const rider of riders) {
      const key =
        !rider.vehicleVerified || rider.vehicleGroup === "UNASSIGNED"
          ? "UNASSIGNED"
          : rider.vehicleGroup || "UNASSIGNED";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(rider);
    }
    return GROUP_ORDER.filter((k) => map.has(k)).map((k) => ({ key: k, items: map.get(k)! }));
  }, [riders, favoriteSet]);

  async function toggleFavorite() {
    if (selectedId == null || favBusy) return;
    const next = !favoriteSet.has(selectedId);
    setFavBusy(true);
    setFavoriteIds((prev) =>
      next ? [selectedId, ...prev.filter((id) => id !== selectedId)] : prev.filter((id) => id !== selectedId)
    );
    try {
      const res = await fetch("/api/riders/favorites", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ riderId: selectedId, favorite: next }),
      });
      const json = (await res.json()) as { success?: boolean };
      if (!res.ok || !json.success) {
        await loadFavorites();
      }
    } catch {
      await loadFavorites();
    } finally {
      setFavBusy(false);
    }
  }

  if (loading) return <LoadingGrid />;
  if (error || !data) return <ErrorState message={error || "Failed"} onRetry={reload} />;

  const selected = riders.find((r) => r.id === selectedId) ?? null;
  const rider = detail?.rider;
  const active = detail?.activeRoute ?? null;
  const liveDuty = selectedId != null ? dutyById[selectedId] : undefined;
  const dutyLabel =
    liveDuty?.dutyLabel ||
    rider?.dutyLabel ||
    (selected ? dutyFromAvailability(selected.availability) : "OFFLINE");
  const selfie = rider?.selfieUrl || selected?.selfieUrl || null;
  const vehicleSrc = vehicleImageForType(
    rider?.vehicleType || selected?.vehicleType || "",
    rider?.vehicleCategory || selected?.vehicleCategory || ""
  );
  const isFavorite = selectedId != null && favoriteSet.has(selectedId);
  const previewRoutes = allRoutes.slice(0, 5);
  const showWaitingRadar = dutyLabel === "WAITING";

  const timeCats = (detail?.timeCategories ?? []).map((c) => ({
    ...c,
    color: TIME_COLORS[c.key] || "#98BDFF",
  }));
  const timeTotal = timeCats.reduce((a, b) => a + b.seconds, 0);

  return (
    <div className="flex h-dvh min-h-[640px] overflow-hidden bg-[#F5F6F8]">
      <aside className="flex w-[300px] shrink-0 flex-col border-r border-[#E5E7EB] bg-white">
        <div className="border-b border-[#EEF0F4] p-4">
          <div className="flex items-center gap-2 rounded-xl border border-[#E5E7EB] bg-[#F9FAFB] px-3 py-2.5">
            <Search className="h-4 w-4 text-[#9CA3AF]" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search..."
              className="w-full bg-transparent text-[13px] text-[#111827] outline-none placeholder:text-[#9CA3AF]"
            />
          </div>
          <div className="mt-3 flex items-center justify-between gap-2">
            <p className="min-w-0 truncate text-[11px] font-medium tracking-wide text-[#9CA3AF]">
              {formatCount(riders.length)} riders · {formatCount(onDutyFiltered)} on duty
            </p>
            <SlidingPillToggle
              options={["2W", "3W", "4W"] as const}
              value={wheelFilter}
              onChange={setWheelFilter}
              className="shrink-0"
            />
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
                    {group.key === "FAVORITES" ? <Star className="h-3 w-3 fill-[#F5A524] text-[#F5A524]" /> : null}
                    {groupTitle(group.key)}
                  </span>
                  <ChevronDown className={`h-3.5 w-3.5 transition ${isCollapsed ? "-rotate-90" : ""}`} />
                </button>
                {!isCollapsed
                  ? group.items.map((r) => {
                      const activeRow = r.id === selectedId;
                      return (
                        <button
                          key={`${group.key}-${r.id}`}
                          type="button"
                          onClick={() => selectRider(r.id)}
                          className={`relative mb-0.5 flex w-full cursor-pointer items-center gap-3 rounded-xl px-2.5 py-2.5 text-left transition ${
                            activeRow
                              ? "bg-[#EEF2FF]"
                              : "hover:bg-[#F9FAFB]"
                          }`}
                        >
                          {activeRow ? (
                            <span className="absolute left-0 top-2 bottom-2 w-[3px] rounded-r-full bg-[#3B82F6]" />
                          ) : null}
                          <RiderAvatar name={r.name} src={r.selfieUrl} size={40} />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-[13px] font-semibold text-[#111827]">{r.name}</p>
                            <p className="truncate text-[11px] text-[#6B7280]">{r.vehicle}</p>
                          </div>
                          <StatusBadge availability={r.availability} />
                        </button>
                      );
                    })
                  : null}
              </div>
            );
          })}
          {riders.length === 0 ? (
            <p className="px-3 py-8 text-center text-[13px] text-[#9CA3AF]">No riders match your search.</p>
          ) : null}
        </div>
      </aside>

      <section className="flex min-w-0 flex-1 flex-col overflow-hidden">
        {!selected ? (
          <div className="flex flex-1 items-center justify-center text-[14px] text-[#6B6894]">Select a rider</div>
        ) : (
          <>
            <header className="flex h-[64px] items-center justify-between border-b border-[#E5E7EB] bg-white px-5">
              <div className="flex min-w-0 items-center gap-3">
                <RiderAvatar name={rider?.name || selected.name} src={selfie} size={40} />
                <div className="min-w-0">
                  <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5">
                    <h2 className="truncate text-[17px] font-semibold tracking-tight text-[#111827]">
                      {rider?.name || selected.name}
                    </h2>
                    <span className="shrink-0 text-[12px] text-[#6B7280]">ID: {rider?.id ?? selected.id}</span>
                  </div>
                  <p className="truncate text-[12px] font-medium text-[#374151]">{rider?.mobile || selected.mobile}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => void toggleFavorite()}
                  disabled={favBusy}
                  className={`flex h-9 w-9 items-center justify-center rounded-full transition ${
                    isFavorite
                      ? "bg-[#FEF3C7] text-[#D97706]"
                      : "bg-[#F3F4F6] text-[#6B7280] hover:bg-[#E5E7EB]"
                  }`}
                  title={isFavorite ? "Remove from favorites" : "Add to favorites"}
                >
                  <Star className={`h-4 w-4 ${isFavorite ? "fill-current" : ""}`} strokeWidth={1.75} />
                </button>
                <a
                  href={`sms:${selected.mobile}`}
                  className="flex h-9 w-9 items-center justify-center rounded-full bg-[#F3F4F6] text-[#111827] hover:bg-[#E5E7EB]"
                  title="Message"
                >
                  <MessageCircle className="h-4 w-4" strokeWidth={1.75} />
                </a>
                <a
                  href={`tel:${selected.mobile}`}
                  className="flex h-9 w-9 items-center justify-center rounded-full bg-[#F3F4F6] text-[#111827] hover:bg-[#E5E7EB]"
                  title="Call"
                >
                  <Phone className="h-4 w-4" strokeWidth={1.75} />
                </a>
                <button
                  type="button"
                  className="flex h-9 w-9 items-center justify-center rounded-full bg-[#F3F4F6] text-[#111827] hover:bg-[#E5E7EB]"
                  title="More"
                >
                  <MoreVertical className="h-4 w-4" strokeWidth={1.75} />
                </button>
              </div>
            </header>

            <div className="cd-scroll min-h-0 flex-1 overflow-y-auto p-5">
              {detailError ? (
                <ErrorState message={detailError} onRetry={() => selectRider(selected.id)} />
              ) : null}

              <div className="relative overflow-hidden rounded-[22px] bg-[#E8EAEE] px-6 py-5">
                {showWaitingRadar ? (
                  <div className="absolute right-4 top-4 z-10 flex items-center gap-2 rounded-full bg-white/90 px-2.5 py-1.5 shadow-sm">
                    <WaitingRadar />
                    <span className="text-[11px] font-semibold tracking-wide text-[#E11D48]">WAITING</span>
                  </div>
                ) : dutyLabel === "OFFLINE" ? (
                  <div className="absolute right-4 top-4 z-10 flex items-center gap-2 rounded-full border border-[#E5E7EB] bg-white/90 px-2.5 py-1.5 shadow-sm">
                    <span className="h-2 w-2 rounded-full bg-[#9CA3AF]" />
                    <span className="text-[11px] font-semibold tracking-wide text-[#6B7280]">OFFLINE</span>
                  </div>
                ) : dutyLabel === "ON THE WAY" || dutyLabel === "LOADING" ? (
                  <div className="absolute right-4 top-4 z-10 flex items-center gap-2 rounded-full border border-[#E5E7EB] bg-white/90 px-2.5 py-1.5 shadow-sm">
                    <span className="h-2 w-2 rounded-full bg-[#22C55E]" />
                    <span className="text-[11px] font-semibold tracking-wide text-[#15803D]">{dutyLabel}</span>
                  </div>
                ) : null}
                <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
                  <div>
                    <h3 className="max-w-[90%] text-[26px] font-semibold leading-tight tracking-tight text-[#111827]">
                      {rider?.vehicle || selected.vehicle}
                    </h3>
                    <div className="mt-5 grid max-w-md grid-cols-2 gap-x-8 gap-y-4">
                      <Spec label="Type" value={(rider?.vehicleType || selected.vehicleType || "—").replace(/_/g, " ")} />
                      <Spec label="Fuel" value={rider?.fuelType || selected.fuelType || "—"} />
                      <Spec label="Color" value={rider?.color || selected.color || "—"} />
                      <Spec
                        label="Seats / Year"
                        value={
                          rider?.seats || selected.seats || rider?.year || selected.year
                            ? `${rider?.seats ?? selected.seats ?? "—"} / ${rider?.year ?? selected.year ?? "—"}`
                            : "—"
                        }
                      />
                    </div>
                    <div className="mt-6 flex flex-wrap items-center gap-5">
                      <LicensePlate plate={rider?.plate || selected.plate} />
                      <button
                        type="button"
                        onClick={() => void openDocuments()}
                        className="cursor-pointer border-b border-dashed border-[#6B7280] pb-0.5 text-[13px] font-medium text-[#6B7280] hover:text-[#111827]"
                      >
                        Documents
                      </button>
                    </div>
                  </div>
                  <div className="flex flex-col items-center justify-end lg:items-end">
                    <div className="relative flex h-[260px] w-full max-w-[360px] items-center justify-center">
                      <Image
                        src={vehicleSrc}
                        alt={rider?.vehicle || selected.vehicle || "Vehicle"}
                        width={360}
                        height={260}
                        className="h-[240px] w-auto max-w-full object-contain"
                        priority
                      />
                    </div>
                    <p className="mt-2 max-w-[360px] text-center text-[12px] text-[#6B7280] lg:text-right">
                      Working area:{" "}
                      <span className="font-medium text-[#111827]">
                        {rider?.workingArea || selected.workingArea || selected.city || "—"}
                      </span>
                    </p>
                  </div>
                </div>
                {detailLoading ? (
                  <div className="absolute inset-0 animate-pulse rounded-[22px] bg-white/30" />
                ) : null}
              </div>

              <div className="mt-5 grid gap-5 xl:grid-cols-2">
                <div className="rounded-[22px] bg-white p-5 shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
                  <div className="flex items-center justify-between">
                    <h3 className="text-[18px] font-semibold text-[#111827]">Routes</h3>
                    <button
                      type="button"
                      onClick={() => setHistoryOpen(true)}
                      className="cursor-pointer border-b border-dashed border-[#9CA3AF] text-[13px] text-[#6B7280] hover:text-[#111827]"
                    >
                      History
                    </button>
                  </div>

                  {active ? (
                    <div className="mt-4">
                      <p className="text-[11px] font-semibold tracking-[0.12em] text-[#2BB673]">NOW ON THE WAY</p>
                      <p className="mt-1 text-[13px] text-[#6B7280]">
                        ID:{" "}
                        <a
                          href={orderDetailHref(active.code)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-semibold text-[#7C3AED] hover:underline"
                        >
                          {active.code}
                        </a>
                        {" · "}
                        {prettyType(active.type)}
                      </p>
                      <p className="mt-1 text-[13px] font-medium text-[#111827]">
                        {shortAddress(active.pickup)} → {shortAddress(active.dropoff)}
                      </p>
                      <MiniRouteMap />
                      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                        <Metric label="Distance" value={active.distanceKm != null ? `${active.distanceKm.toFixed(1)} km` : "—"} />
                        <Metric label="Time Left" value={formatEta(active.etaSeconds, active.etaAt)} />
                        <Metric label="Earning" value={formatInr(active.earning)} />
                        <Metric label="City" value={rider?.city || selected.city} />
                      </div>
                    </div>
                  ) : (
                    <div className="mt-4 rounded-xl bg-[#F9FAFB] px-4 py-6 text-center text-[13px] text-[#6B7280]">
                      No active route right now
                    </div>
                  )}

                  <div className="mt-5">
                    <p className="mb-3 text-[12px] font-semibold text-[#9CA3AF]">Latest 5</p>
                    <RouteHistoryList items={previewRoutes} />
                  </div>
                </div>

                <div className="rounded-[22px] bg-white p-5 shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
                  <div className="flex items-center justify-between">
                    <h3 className="text-[18px] font-semibold text-[#111827]">Driver Statistics</h3>
                    <ChevronDown className="h-4 w-4 text-[#9CA3AF]" />
                  </div>

                  <div className="mt-5">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-[13px] font-medium text-[#111827]">Average Time Per Day by Category</p>
                      <SlidingPillToggle
                        options={["W", "M", "6M", "Y"] as const}
                        value={statsRange}
                        onChange={setStatsRange}
                      />
                    </div>

                    <div className="mt-4 flex h-4 overflow-hidden rounded-full bg-[#F3F4F6]">
                      {timeCats.map((c) => (
                        <div
                          key={c.key}
                          style={{ width: `${Math.max(c.pct, timeTotal ? 0 : 0)}%`, background: c.color }}
                          title={`${c.label}: ${c.pct.toFixed(1)}%`}
                        />
                      ))}
                    </div>

                    <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
                      {timeCats.map((c) => (
                        <div
                          key={c.key}
                          className="flex h-auto min-h-[88px] w-full flex-col justify-between rounded-lg border border-[#E5E7EB] bg-white px-3 py-2.5"
                        >
                          <div className="flex items-center gap-1.5">
                            <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: c.color }} />
                            <span className="text-[12px] font-medium leading-tight text-[#374151]">{c.label}</span>
                          </div>
                          <div className="mt-2">
                            <p className="text-[15px] font-semibold tabular-nums text-[#111827]">
                              {formatDuration(c.seconds)}
                            </p>
                            <p className="mt-0.5 text-[11px] tabular-nums text-[#6B7280]">{c.pct.toFixed(1)}%</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="mt-8">
                    <p className="text-[13px] font-medium text-[#111827]">Working Time Per Day</p>
                    <div className="mt-3 h-[200px] w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={detail?.workingTime.days ?? []} barGap={4}>
                          <CartesianGrid stroke="#EEF0F4" vertical={false} />
                          <XAxis
                            dataKey="day"
                            tick={{ fill: "#9CA3AF", fontSize: 11 }}
                            axisLine={false}
                            tickLine={false}
                            tickFormatter={(v) => {
                              const d = new Date(String(v));
                              return Number.isNaN(d.getTime())
                                ? String(v).slice(5)
                                : `${d.getMonth() + 1}/${d.getDate()}`;
                            }}
                          />
                          <YAxis
                            tick={{ fill: "#9CA3AF", fontSize: 11 }}
                            axisLine={false}
                            tickLine={false}
                            tickFormatter={(v) => `${v}h`}
                          />
                          <Tooltip
                            contentStyle={{
                              background: "#fff",
                              border: "1px solid #E5E7EB",
                              borderRadius: 12,
                              fontSize: 12,
                            }}
                            formatter={(value, name) => [
                              `${Number(value).toFixed(1)} hr`,
                              name === "hours" ? "Working Time" : "Average",
                            ]}
                          />
                          <Bar dataKey="hours" name="Working Time" fill="#111827" radius={[4, 4, 0, 0]} barSize={14} />
                          <Bar dataKey="average" name="Average" fill="#98BDFF" radius={[4, 4, 0, 0]} barSize={8} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                    <div className="mt-2 flex items-center gap-4 text-[12px] text-[#6B7280]">
                      <span className="flex items-center gap-1.5">
                        <span className="h-2 w-2 rounded-full bg-[#111827]" /> Working Time
                      </span>
                      <span className="flex items-center gap-1.5">
                        <span className="h-2 w-2 rounded-full bg-[#98BDFF]" /> Average Working Time
                      </span>
                    </div>
                    <div className="mt-4 grid grid-cols-3 gap-3 border-t border-[#F3F4F6] pt-4 text-[12px]">
                      <div>
                        <p className="text-[#9CA3AF]">Deliveries</p>
                        <p className="mt-0.5 text-[15px] font-semibold text-[#111827]">
                          {formatCount(rider?.deliveries ?? selected.deliveries)}
                        </p>
                      </div>
                      <div>
                        <p className="text-[#9CA3AF]">Earnings</p>
                        <p className="mt-0.5 text-[15px] font-semibold text-[#111827]">
                          {formatInr(rider?.earnings ?? selected.earnings)}
                        </p>
                      </div>
                      <div>
                        <p className="text-[#9CA3AF]">Wallet</p>
                        <p className="mt-0.5 text-[15px] font-semibold text-[#111827]">
                          {formatInr(rider?.wallet ?? selected.wallet)}
                        </p>
                      </div>
                    </div>
                  </div>
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
            aria-labelledby="route-history-title"
          >
            <div className="flex items-center justify-between border-b border-[#E5E7EB] px-5 py-4">
              <div>
                <h3 id="route-history-title" className="text-[17px] font-semibold text-[#111827]">
                  Route history
                </h3>
                <p className="text-[12px] text-[#6B7280]">
                  {selected?.name} · {formatCount(filteredRoutes.length)}
                  {historyQuery ? ` of ${formatCount(allRoutes.length)}` : ""} rides
                </p>
              </div>
              <button
                type="button"
                onClick={() => setHistoryOpen(false)}
                className="flex h-9 w-9 items-center justify-center rounded-full bg-[#F3F4F6] text-[#111827] hover:bg-[#E5E7EB]"
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
              <RouteHistoryList items={filteredRoutes} />
            </div>
          </aside>
        </div>
      ) : null}

      {docsOpen ? (
        <div className="fixed inset-0 z-[70] flex justify-end bg-black/35" onClick={() => setDocsOpen(false)}>
          <aside
            className="flex h-full w-full max-w-md flex-col bg-white shadow-2xl"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="rider-docs-title"
          >
            <div className="flex items-center justify-between border-b border-[#E5E7EB] px-5 py-4">
              <div>
                <h3 id="rider-docs-title" className="text-[17px] font-semibold text-[#111827]">
                  Documents
                </h3>
                <p className="text-[12px] text-[#6B7280]">
                  {selected?.name} · {formatCount(filteredDocs.length)} docs
                </p>
              </div>
              <button
                type="button"
                onClick={() => setDocsOpen(false)}
                className="flex h-9 w-9 items-center justify-center rounded-full bg-[#F3F4F6] text-[#111827] hover:bg-[#E5E7EB]"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="border-b border-[#EEF0F4] px-5 py-3">
              <div className="flex items-center gap-2 rounded-xl border border-[#E5E7EB] bg-[#F9FAFB] px-3 py-2.5">
                <Search className="h-4 w-4 text-[#9CA3AF]" />
                <input
                  value={docsQuery}
                  onChange={(e) => setDocsQuery(e.target.value)}
                  placeholder="Search document type, number…"
                  className="w-full bg-transparent text-[13px] text-[#111827] outline-none placeholder:text-[#9CA3AF]"
                />
              </div>
            </div>
            <div className="cd-scroll min-h-0 flex-1 overflow-y-auto px-5 py-4">
              {docsLoading ? (
                <p className="text-[13px] text-[#9CA3AF]">Loading documents…</p>
              ) : docsError ? (
                <p className="text-[13px] text-[#E11D48]">{docsError}</p>
              ) : filteredDocs.length === 0 ? (
                <p className="text-[13px] text-[#9CA3AF]">No documents found.</p>
              ) : (
                <div className="space-y-4">
                  {filteredDocs.map((doc) => {
                    const visibleFiles = doc.files.filter((f) => f.url);
                    return (
                      <div
                        key={doc.id}
                        className="cursor-pointer rounded-2xl border border-[#EEF0F4] p-3 transition hover:border-[#D1D5DB] hover:bg-[#FAFAFA]"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-[14px] font-semibold capitalize text-[#111827]">
                              {prettyType(doc.docType)}
                            </p>
                            <p className="mt-0.5 text-[12px] text-[#6B7280]">
                              {doc.docNumber ? `No. ${doc.docNumber} · ` : ""}
                              {doc.methodLabel || doc.source || doc.method || "Manual"}
                              {doc.status ? ` · ${doc.status}` : ""}
                              {doc.verified ? " · verified" : ""}
                            </p>
                            {doc.extractedName ? (
                              <p className="mt-0.5 truncate text-[12px] font-medium text-[#374151]">
                                {doc.extractedName}
                              </p>
                            ) : null}
                          </div>
                          <span
                            className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${
                              doc.verified ? "bg-[#DCFCE7] text-[#15803D]" : "bg-[#F3F4F6] text-[#6B7280]"
                            }`}
                          >
                            {doc.verified ? "OK" : doc.status || "pending"}
                          </span>
                        </div>

                        {doc.details?.length ? (
                          <div className="mt-3 grid grid-cols-2 gap-2">
                            {doc.details.slice(0, 8).map((d) => (
                              <div
                                key={`${doc.id}-${d.label}`}
                                className="rounded-lg border border-[#EEF0F4] bg-white px-2.5 py-2"
                              >
                                <p className="text-[10px] uppercase tracking-wide text-[#9CA3AF]">{d.label}</p>
                                <p className="mt-0.5 break-all text-[12px] font-medium text-[#111827]">{d.value}</p>
                              </div>
                            ))}
                          </div>
                        ) : null}

                        {visibleFiles.length ? (
                          <div className="mt-3 grid grid-cols-2 gap-2">
                            {visibleFiles.map((f, idx) => (
                              <a
                                key={`${doc.id}-${idx}`}
                                href={f.url!}
                                target="_blank"
                                rel="noreferrer"
                                className="cursor-pointer overflow-hidden rounded-xl border border-[#EEF0F4] bg-[#F9FAFB]"
                              >
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img
                                  src={f.url!}
                                  alt={`${doc.docType} ${f.side}`}
                                  className="h-28 w-full object-cover"
                                />
                                <p className="px-2 py-1 text-[10px] uppercase tracking-wide text-[#9CA3AF]">
                                  {f.side}
                                </p>
                              </a>
                            ))}
                          </div>
                        ) : (
                          <p className="mt-2 text-[12px] text-[#9CA3AF]">
                            {doc.methodLabel === "Cashfree" || doc.methodLabel === "DigiLocker"
                              ? "Verified digitally — no scan image stored"
                              : "No file attached"}
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </aside>
        </div>
      ) : null}
    </div>
  );
}

function WaitingRadar() {
  const size = 22;
  const dot = 6;
  return (
    <div className="relative flex shrink-0 items-center justify-center" style={{ width: size, height: size }} aria-hidden>
      <span
        className="cd-radar-ring absolute rounded-full border-2 border-[#F87171]"
        style={{ width: size, height: size, animationDelay: "0ms" }}
      />
      <span
        className="cd-radar-ring absolute rounded-full border-2 border-[#EF4444]"
        style={{ width: size, height: size, animationDelay: "600ms" }}
      />
      <span
        className="cd-radar-ring absolute rounded-full border-2 border-[#B91C1C]"
        style={{ width: size, height: size, animationDelay: "1200ms" }}
      />
      <span className="absolute rounded-full bg-[#22C55E]" style={{ width: dot, height: dot }} />
    </div>
  );
}

function Spec({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[12px] text-[#6B7280]">{label}</p>
      <p className="mt-0.5 text-[15px] font-semibold capitalize text-[#111827]">{value || "—"}</p>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[11px] text-[#9CA3AF]">{label}</p>
      <p className="mt-0.5 text-[14px] font-semibold text-[#111827]">{value}</p>
    </div>
  );
}

function prettyType(type: string) {
  return type.replace(/_/g, " ");
}

function groupHistoryByDate(items: RouteRow[]) {
  const map = new Map<string, RouteRow[]>();
  for (const item of items) {
    const raw = item.deliveredAt || item.createdAt;
    const d = new Date(raw);
    const key = Number.isNaN(d.getTime())
      ? "—"
      : d.toLocaleDateString("en-GB", { timeZone: "Asia/Kolkata", day: "2-digit", month: "2-digit", year: "2-digit" });
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(item);
  }
  return Array.from(map.entries()).map(([date, rows]) => ({ date, items: rows }));
}
