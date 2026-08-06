"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  Activity,
  ArrowUpDown,
  Bike,
  Clock,
  Loader2,
  MapPin,
  Percent,
  RefreshCw,
  Search,
  Users,
  WifiOff,
} from "lucide-react";
import { GeoRiderAvailabilityMap } from "@/components/area-managers/GeoRiderAvailabilityMap";

const RADIUS_OPTIONS = [1, 2, 3, 5, 10] as const;
const REFRESH_MS = 20_000;

type GeoRider = {
  id: number;
  mobile: string;
  name: string | null;
  lat: number;
  lng: number;
  distanceKm: number;
  status: string;
  localityCode: string | null;
  storeName?: string | null;
  lastUpdatedAt: string | null;
  activeServices?: string[];
  currentAssignedOrderId?: string | null;
  totalDeliveredOrders?: number;
  totalCancelledOrders?: number;
  city?: string | null;
};

type GeoSearchData = {
  center: { lat: number; lng: number };
  radiusKm: number;
  kpis: {
    total: number;
    available: number;
    busy: number;
    offline: number;
    coveragePct: number;
  };
  riders: GeoRider[];
  insights: {
    nearest: GeoRider | null;
    farthest: GeoRider | null;
    avgDistanceKm: number | null;
    recommendedRadiusKm: number;
  };
};

type PlaceSuggestion = {
  id: string;
  placeName: string;
  lat: number;
  lng: number;
};

type SortKey =
  | "id"
  | "name"
  | "distanceKm"
  | "status"
  | "currentAssignedOrderId"
  | "lastUpdatedAt";

function statusLabel(status: string): string {
  const s = status.toUpperCase();
  if (s === "ONLINE") return "Available";
  if (s === "BUSY") return "On Delivery";
  return "Offline";
}

function statusBadgeClass(status: string): string {
  const s = status.toUpperCase();
  if (s === "ONLINE") return "bg-emerald-50 text-emerald-700 ring-emerald-200";
  if (s === "BUSY") return "bg-orange-50 text-orange-700 ring-orange-200";
  return "bg-red-50 text-red-700 ring-red-200";
}

function formatDistance(km: number): string {
  if (km < 1) return `${Math.round(km * 1000)} m`;
  return `${km.toFixed(2)} km`;
}

function formatUpdated(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "—";
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function AreaManagerAvailabilityClient() {
  const mapboxToken =
    (typeof process !== "undefined" &&
      (process.env.NEXT_PUBLIC_MAPBOX_TOKEN || process.env.MAPBOX_PUBLIC_TOKEN)) ||
    "";

  const [placeQuery, setPlaceQuery] = useState("");
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([]);
  const [suggestOpen, setSuggestOpen] = useState(false);
  const [latInput, setLatInput] = useState("");
  const [lngInput, setLngInput] = useState("");
  const [radiusKm, setRadiusKm] = useState<number>(3);
  const [centerLabel, setCenterLabel] = useState<string | null>(null);

  const [data, setData] = useState<GeoSearchData | null>(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState(false);

  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [sortKey, setSortKey] = useState<SortKey>("distanceKm");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  const activeCenterRef = useRef<{ lat: number; lng: number; radiusKm: number } | null>(null);
  const suggestAbort = useRef<AbortController | null>(null);
  /** Skip Mapbox autocomplete when Location was filled programmatically (reverse geocode / pick). */
  const skipPlaceSuggestRef = useRef(false);

  const runSearch = useCallback(
    async (lat: number, lng: number, rk: number, opts?: { silent?: boolean }) => {
      if (!opts?.silent) setLoading(true);
      else setRefreshing(true);
      setError(null);
      try {
        const q = new URLSearchParams({
          lat: String(lat),
          lng: String(lng),
          radiusKm: String(rk),
        });
        const res = await fetch(`/api/area-manager/availability/geo?${q}`, {
          credentials: "include",
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(
            (json as { error?: string })?.error ||
              (res.status === 403
                ? "You need to be logged into the control dashboard."
                : "Failed to search riders")
          );
        }
        const payload = (json as { data?: GeoSearchData }).data;
        if (!payload) throw new Error("Empty response");
        setData(payload);
        setHasSearched(true);
        activeCenterRef.current = { lat, lng, radiusKm: rk };
      } catch (e) {
        setError(e instanceof Error ? e.message : "Something went wrong");
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    []
  );

  const onSubmitSearch = useCallback(async () => {
    const lat = Number(latInput);
    const lng = Number(lngInput);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      setError("Enter a place from suggestions or valid latitude / longitude.");
      return;
    }

    // Reverse-geocode lat/lng → fill Location search bar with a human-readable address.
    let label = centerLabel;
    const placeLooksLikeCoords =
      !placeQuery.trim() ||
      /^-?\d+(\.\d+)?\s*,\s*-?\d+(\.\d+)?$/.test(placeQuery.trim()) ||
      placeQuery.trim() === `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
    if (placeLooksLikeCoords || !centerLabel) {
      try {
        const rev = await fetch(
          `/api/merchant/reverse-geocode?lat=${encodeURIComponent(String(lat))}&lng=${encodeURIComponent(String(lng))}`,
          { credentials: "include" }
        );
        const revJson = await rev.json().catch(() => ({}));
        const placeName =
          (typeof (revJson as { place_name?: string }).place_name === "string" &&
            (revJson as { place_name: string }).place_name.trim()) ||
          (typeof (revJson as { address?: string }).address === "string" &&
            (revJson as { address: string }).address.trim()) ||
          "";
        if (placeName) {
          label = placeName;
          skipPlaceSuggestRef.current = true;
          suggestAbort.current?.abort();
          setPlaceQuery(placeName);
          setCenterLabel(placeName);
          setSuggestOpen(false);
          setSuggestions([]);
        } else {
          label = `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
          setCenterLabel(label);
        }
      } catch {
        label = `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
        setCenterLabel(label);
      }
    }

    await runSearch(lat, lng, radiusKm);
  }, [latInput, lngInput, radiusKm, centerLabel, placeQuery, runSearch]);

  // Place autocomplete (Mapbox) — only while the user is typing, not after lat/lng reverse-geocode.
  useEffect(() => {
    const q = placeQuery.trim();
    if (skipPlaceSuggestRef.current) {
      skipPlaceSuggestRef.current = false;
      setSuggestions([]);
      setSuggestOpen(false);
      return;
    }
    if (q.length < 2 || !mapboxToken) {
      setSuggestions([]);
      setSuggestOpen(false);
      return;
    }
    const t = window.setTimeout(async () => {
      suggestAbort.current?.abort();
      const ac = new AbortController();
      suggestAbort.current = ac;
      try {
        const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(q)}.json?access_token=${mapboxToken}&country=IN&limit=5&language=en&types=place,locality,neighborhood,address,poi`;
        const res = await fetch(url, { signal: ac.signal });
        if (!res.ok) return;
        const json = await res.json();
        const feats = (json.features ?? []) as Array<{
          id: string;
          place_name?: string;
          center?: [number, number];
        }>;
        setSuggestions(
          feats
            .filter((f) => Array.isArray(f.center) && f.center.length >= 2)
            .map((f) => ({
              id: f.id,
              placeName: f.place_name || "Unknown",
              lng: f.center![0]!,
              lat: f.center![1]!,
            }))
        );
        setSuggestOpen(true);
      } catch {
        /* aborted or network */
      }
    }, 280);
    return () => window.clearTimeout(t);
  }, [placeQuery, mapboxToken]);

  // Auto-refresh
  useEffect(() => {
    if (!activeCenterRef.current) return;
    const id = window.setInterval(() => {
      const c = activeCenterRef.current;
      if (!c) return;
      void runSearch(c.lat, c.lng, c.radiusKm, { silent: true });
    }, REFRESH_MS);
    return () => window.clearInterval(id);
  }, [data?.center.lat, data?.center.lng, data?.radiusKm, runSearch]);

  const filteredSorted = useMemo(() => {
    let list = [...(data?.riders ?? [])];
    if (statusFilter !== "ALL") {
      list = list.filter((r) => r.status.toUpperCase() === statusFilter);
    }
    list.sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case "id":
          cmp = a.id - b.id;
          break;
        case "name":
          cmp = (a.name || "").localeCompare(b.name || "");
          break;
        case "distanceKm":
          cmp = a.distanceKm - b.distanceKm;
          break;
        case "status":
          cmp = a.status.localeCompare(b.status);
          break;
        case "currentAssignedOrderId":
          cmp = (a.currentAssignedOrderId || "").localeCompare(
            b.currentAssignedOrderId || ""
          );
          break;
        case "lastUpdatedAt":
          cmp = (a.lastUpdatedAt || "").localeCompare(b.lastUpdatedAt || "");
          break;
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
    return list;
  }, [data?.riders, statusFilter, sortKey, sortDir]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  const pickSuggestion = (s: PlaceSuggestion) => {
    skipPlaceSuggestRef.current = true;
    setPlaceQuery(s.placeName);
    setCenterLabel(s.placeName);
    setLatInput(String(s.lat));
    setLngInput(String(s.lng));
    setSuggestions([]);
    setSuggestOpen(false);
    void runSearch(s.lat, s.lng, radiusKm);
  };

  // Re-search immediately when radius changes after an active search center exists.
  useEffect(() => {
    const c = activeCenterRef.current;
    if (!c) return;
    if (c.radiusKm === radiusKm) return;
    void runSearch(c.lat, c.lng, radiusKm);
  }, [radiusKm, runSearch]);

  const applyRecommendedRadius = () => {
    if (!data || !activeCenterRef.current) return;
    const rk = data.insights.recommendedRadiusKm;
    setRadiusKm(rk);
    void runSearch(activeCenterRef.current.lat, activeCenterRef.current.lng, rk);
  };

  return (
    <div className="space-y-5 w-full max-w-full">
      <div className="flex justify-end">
        {hasSearched && activeCenterRef.current ? (
          <button
            type="button"
            onClick={() => {
              const c = activeCenterRef.current;
              if (!c) return;
              void runSearch(c.lat, c.lng, c.radiusKm, { silent: true });
            }}
            className="inline-flex items-center gap-1.5 self-start rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />
            Refresh
          </button>
        ) : null}
      </div>

      {/* Search panel */}
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="grid gap-3 lg:grid-cols-12">
          <div className="relative lg:col-span-5">
            <label className="mb-1 block text-xs font-medium text-slate-600">Location</label>
            <div className="relative">
              <MapPin className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={placeQuery}
                onChange={(e) => {
                  skipPlaceSuggestRef.current = false;
                  setPlaceQuery(e.target.value);
                }}
                onFocus={() => suggestions.length > 0 && setSuggestOpen(true)}
                onBlur={() => window.setTimeout(() => setSuggestOpen(false), 150)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void onSubmitSearch();
                  }
                }}
                placeholder="Search place (Mapbox Places)…"
                className="w-full rounded-lg border border-slate-200 bg-slate-50 py-2.5 pl-9 pr-3 text-sm text-slate-900 outline-none focus:border-blue-400 focus:bg-white focus:ring-2 focus:ring-blue-100"
              />
            </div>
            {suggestOpen && suggestions.length > 0 ? (
              <ul className="absolute z-30 mt-1 max-h-56 w-full overflow-auto rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
                {suggestions.map((s) => (
                  <li key={s.id}>
                    <button
                      type="button"
                      className="w-full px-3 py-2 text-left text-sm text-slate-700 hover:bg-blue-50"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => pickSuggestion(s)}
                    >
                      {s.placeName}
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
            {!mapboxToken ? (
              <p className="mt-1 text-[11px] text-amber-600">
                Mapbox token missing — use lat/lng or set NEXT_PUBLIC_MAPBOX_TOKEN.
              </p>
            ) : null}
          </div>

          <div className="grid grid-cols-2 gap-3 lg:col-span-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">Latitude</label>
              <input
                type="number"
                step="any"
                value={latInput}
                onChange={(e) => {
                  setLatInput(e.target.value);
                  setCenterLabel(null);
                }}
                placeholder="e.g. 28.61"
                className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none focus:border-blue-400 focus:bg-white focus:ring-2 focus:ring-blue-100"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">Longitude</label>
              <input
                type="number"
                step="any"
                value={lngInput}
                onChange={(e) => {
                  setLngInput(e.target.value);
                  setCenterLabel(null);
                }}
                placeholder="e.g. 77.20"
                className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none focus:border-blue-400 focus:bg-white focus:ring-2 focus:ring-blue-100"
              />
            </div>
          </div>

          <div className="lg:col-span-2">
            <label className="mb-1 block text-xs font-medium text-slate-600">Radius</label>
            <select
              value={radiusKm}
              onChange={(e) => setRadiusKm(Number(e.target.value))}
              className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none focus:border-blue-400 focus:bg-white focus:ring-2 focus:ring-blue-100"
            >
              {RADIUS_OPTIONS.map((r) => (
                <option key={r} value={r}>
                  {r} km
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-end lg:col-span-2">
            <button
              type="button"
              onClick={() => void onSubmitSearch()}
              disabled={loading}
              className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 disabled:opacity-60"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
              Search
            </button>
          </div>
        </div>
        {error ? (
          <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
            {error}
          </div>
        ) : null}
      </div>

      {!hasSearched && !loading ? (
        <div className="rounded-xl border border-dashed border-slate-200 bg-white px-6 py-16 text-center shadow-sm">
          <Bike className="mx-auto h-10 w-10 text-slate-300" />
          <p className="mt-3 text-sm font-medium text-slate-700">Search a location to see rider coverage</p>
          <p className="mt-1 text-xs text-slate-500">
            Use place autocomplete or paste coordinates, pick a radius, then Search.
          </p>
        </div>
      ) : null}

      {hasSearched && data ? (
        <>
          {/* Active search context */}
          <div className="rounded-xl border border-slate-200 bg-slate-50/80 px-4 py-3 shadow-sm">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5 text-sm">
              <div>
                <p className="text-[11px] font-medium uppercase tracking-wide text-slate-400">
                  Search Location
                </p>
                <p className="mt-0.5 font-medium text-slate-800 truncate" title={centerLabel || undefined}>
                  {centerLabel || `${data.center.lat.toFixed(5)}, ${data.center.lng.toFixed(5)}`}
                </p>
              </div>
              <div>
                <p className="text-[11px] font-medium uppercase tracking-wide text-slate-400">
                  Latitude
                </p>
                <p className="mt-0.5 font-mono text-slate-800">{data.center.lat.toFixed(5)}</p>
              </div>
              <div>
                <p className="text-[11px] font-medium uppercase tracking-wide text-slate-400">
                  Longitude
                </p>
                <p className="mt-0.5 font-mono text-slate-800">{data.center.lng.toFixed(5)}</p>
              </div>
              <div>
                <p className="text-[11px] font-medium uppercase tracking-wide text-slate-400">
                  Search Radius
                </p>
                <p className="mt-0.5 font-medium text-slate-800">{data.radiusKm} km</p>
              </div>
              <div>
                <p className="text-[11px] font-medium uppercase tracking-wide text-slate-400">
                  Matching Riders
                </p>
                <p className="mt-0.5 font-semibold text-slate-900">{data.kpis.total}</p>
              </div>
            </div>
          </div>

          {/* KPIs — only riders inside selected radius */}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <KpiCard
              label="Total Riders Found"
              value={data.kpis.total}
              icon={<Users className="h-5 w-5 text-blue-500" />}
            />
            <KpiCard
              label="Available Riders"
              value={data.kpis.available}
              valueClass="text-emerald-600"
              icon={<Activity className="h-5 w-5 text-emerald-500" />}
            />
            <KpiCard
              label="Busy Riders"
              value={data.kpis.busy}
              valueClass="text-orange-600"
              icon={<Clock className="h-5 w-5 text-orange-500" />}
            />
            <KpiCard
              label="Offline Riders"
              value={data.kpis.offline}
              valueClass="text-red-600"
              icon={<WifiOff className="h-5 w-5 text-red-500" />}
            />
            <KpiCard
              label="Coverage"
              value={`${data.kpis.coveragePct}%`}
              icon={<Percent className="h-5 w-5 text-blue-500" />}
            />
          </div>

          <div className="grid gap-4 xl:grid-cols-12">
            <div className="xl:col-span-8">
              {mapboxToken ? (
                <GeoRiderAvailabilityMap
                  mapboxToken={mapboxToken}
                  center={data.center}
                  radiusKm={data.radiusKm}
                  riders={filteredSorted}
                  className="h-[380px]"
                />
              ) : (
                <div className="flex h-[380px] items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-sm text-slate-500">
                  Map unavailable — set NEXT_PUBLIC_MAPBOX_TOKEN
                </div>
              )}
            </div>

            <aside className="xl:col-span-4">
              <div className="sticky top-4 space-y-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <h3 className="text-sm font-semibold text-slate-900">Search insights</h3>
                <InsightRow
                  label="Nearest rider"
                  value={
                    data.insights.nearest
                      ? `${data.insights.nearest.name || `#${data.insights.nearest.id}`} · ${formatDistance(data.insights.nearest.distanceKm)}`
                      : "—"
                  }
                />
                <InsightRow
                  label="Farthest rider"
                  value={
                    data.insights.farthest
                      ? `${data.insights.farthest.name || `#${data.insights.farthest.id}`} · ${formatDistance(data.insights.farthest.distanceKm)}`
                      : "—"
                  }
                />
                <InsightRow
                  label="Average distance"
                  value={
                    data.insights.avgDistanceKm != null
                      ? formatDistance(data.insights.avgDistanceKm)
                      : "—"
                  }
                />
                <div className="rounded-lg border border-blue-100 bg-blue-50/60 p-3">
                  <p className="text-xs font-medium text-blue-800">Recommended radius</p>
                  <p className="mt-1 text-lg font-semibold text-blue-900">
                    {data.insights.recommendedRadiusKm} km
                  </p>
                  <p className="mt-1 text-[11px] text-blue-700/80">
                    Smallest radius with at least 3 available riders (or next step up).
                  </p>
                  {data.insights.recommendedRadiusKm !== data.radiusKm ? (
                    <button
                      type="button"
                      onClick={applyRecommendedRadius}
                      className="mt-2 text-xs font-semibold text-blue-700 underline-offset-2 hover:underline"
                    >
                      Apply recommended radius
                    </button>
                  ) : null}
                </div>
                <div className="flex flex-wrap gap-3 border-t border-slate-100 pt-3 text-[11px] text-slate-500">
                  <LegendDot color="#22c55e" label="Available" />
                  <LegendDot color="#f97316" label="On Delivery" />
                  <LegendDot color="#ef4444" label="Offline" />
                  <LegendDot color="#2563eb" label="Search point" />
                </div>
                {refreshing ? (
                  <p className="flex items-center gap-1.5 text-[11px] text-slate-400">
                    <Loader2 className="h-3 w-3 animate-spin" /> Updating live positions…
                  </p>
                ) : (
                  <p className="text-[11px] text-slate-400">Auto-refreshes every 20s</p>
                )}
              </div>
            </aside>
          </div>

          <div className="w-full rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="flex flex-col gap-3 border-b border-slate-100 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
              <h3 className="text-sm font-semibold text-slate-900">
                Riders in radius{" "}
                <span className="font-normal text-slate-500">({filteredSorted.length})</span>
              </h3>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-700"
              >
                <option value="ALL">All statuses</option>
                <option value="ONLINE">Available</option>
                <option value="BUSY">On Delivery</option>
                <option value="OFFLINE">Offline</option>
              </select>
            </div>
            <div className="w-full overflow-x-auto">
              <table className="w-full min-w-[1000px] divide-y divide-slate-100 text-sm">
                <thead className="bg-slate-50">
                  <tr>
                    {(
                      [
                        ["name", "Rider Name"],
                        ["id", "Rider ID"],
                        ["status", "Status"],
                        ["distanceKm", "Distance"],
                        ["lastUpdatedAt", "Last Location Update"],
                        ["currentAssignedOrderId", "Assigned Order"],
                      ] as [SortKey, string][]
                    ).map(([key, label]) => (
                      <th key={key} className="px-3 py-2.5 text-left text-xs font-medium text-slate-500">
                        <button
                          type="button"
                          onClick={() => toggleSort(key)}
                          className="inline-flex items-center gap-1 hover:text-slate-800"
                        >
                          {label}
                          <ArrowUpDown className="h-3 w-3 opacity-50" />
                        </button>
                      </th>
                    ))}
                    <th className="px-3 py-2.5 text-left text-xs font-medium text-slate-500">
                      Coordinates
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {filteredSorted.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-4 py-8 text-center text-sm text-slate-500">
                        No riders found inside this search radius.
                      </td>
                    </tr>
                  ) : (
                    filteredSorted.map((r) => (
                      <tr key={r.id} className="hover:bg-slate-50/80">
                        <td className="px-3 py-2.5 text-slate-900">
                          <div className="max-w-[180px] truncate font-medium">{r.name || "—"}</div>
                          <div className="text-[11px] text-slate-400">{r.mobile}</div>
                        </td>
                        <td className="whitespace-nowrap px-3 py-2.5 font-mono text-xs text-slate-700">
                          {r.id}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2.5">
                          <span
                            className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset ${statusBadgeClass(r.status)}`}
                          >
                            {statusLabel(r.status)}
                          </span>
                        </td>
                        <td className="whitespace-nowrap px-3 py-2.5 text-slate-600">
                          {formatDistance(r.distanceKm)}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2.5 text-slate-500">
                          {formatUpdated(r.lastUpdatedAt)}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2.5 font-mono text-xs text-slate-700">
                          {r.currentAssignedOrderId || "—"}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2.5 font-mono text-[11px] text-slate-600">
                          {r.lat.toFixed(5)}, {r.lng.toFixed(5)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      ) : null}

      {loading && !data ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
        </div>
      ) : null}
    </div>
  );
}

function KpiCard({
  label,
  value,
  icon,
  valueClass = "text-slate-900",
}: {
  label: string;
  value: string | number;
  icon: ReactNode;
  valueClass?: string;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-xs font-medium text-slate-500">{label}</p>
          <p className={`mt-1 text-2xl font-semibold tracking-tight ${valueClass}`}>{value}</p>
        </div>
        {icon}
      </div>
    </div>
  );
}

function InsightRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[11px] font-medium uppercase tracking-wide text-slate-400">{label}</p>
      <p className="mt-0.5 text-sm font-medium text-slate-800">{value}</p>
    </div>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: color }} />
      {label}
    </span>
  );
}
