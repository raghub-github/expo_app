"use client";

import { useAppParams } from "@/hooks/useAppSearchParams";

import { useCallback, useEffect, useMemo, useState } from "react";

import { Check } from "lucide-react";

import { DiscoveryCtaPanel } from "@/components/cxapp-home/DiscoveryCtaPanel";
import { CxAppGroceryHomeStatePanel } from "@/components/cxapp-home/CxAppGroceryHomeStatePanel";
import { FoodHomeLayoutPhonePreview } from "@/components/cxapp-home/FoodHomeLayoutPhonePreview";
import { GridFirstHeroMediaPanel } from "@/components/cxapp-home/GridFirstHeroMediaPanel";
import { GridFirstSubscriptionRowPanel } from "@/components/cxapp-home/GridFirstSubscriptionRowPanel";
import { GridFirstUnder250Panel } from "@/components/cxapp-home/GridFirstUnder250Panel";
import { Spinner } from "@/components/geo-admin/Loader";
import { useGeoStatesQuery } from "@/store/api/geoAdminApi";
import {
  DEFAULT_DISCOVERY_CTA,
  DEFAULT_FOOD_HOME_LAYOUT,
  DEFAULT_GRID_FIRST_SUBSCRIPTION_ROW,
  DEFAULT_GRID_FIRST_UNDER_250,
  FOOD_HOME_LAYOUT_CATALOG,
  parseDiscoveryCtaTiles,
  parseDiscoveryDealsAtMaxPrice,
  type DiscoveryCtaTile,
  type FoodHomeLayoutKey,
} from "@/lib/cxapp-home/food-home-layout";
import type { GridFirstHeroMediaItem } from "@/lib/cxapp-home/grid-first-hero-media";
import { cn } from "@/lib/utils";

const LAYOUT_CACHE_PREFIX = "cxapp-food-layout-v2:";

type LayoutApiPayload = {
  layoutKey?: FoodHomeLayoutKey;
  gridFirstHeroMedia?: GridFirstHeroMediaItem[];
  gridFirstSubscriptionRowEnabled?: boolean;
  gridFirstSubscriptionRowText?: string;
  gridFirstSubscriptionRowBgColor?: string;
  gridFirstUnder250Enabled?: boolean;
  gridFirstUnder250MaxPrice?: number;
  gridFirstUnder250Title?: string;
  gridFirstUnder250FilterLabel?: string;
  gridFirstUnder250TabImageUrl?: string | null;
  gridFirstUnder250HeroImageUrl?: string | null;
  discoveryDealsAtMaxPrice?: number | null;
  discoveryDealsAtImageUrl?: string | null;
  discoveryDealsAtHeroImageUrl?: string | null;
  discoveryCrazyDealsImageUrl?: string | null;
  discoveryFreePackagingImageUrl?: string | null;
  discoveryDealsAtLabel?: string | null;
  discoveryCrazyDealsLabel?: string | null;
  discoveryFreePackagingLabel?: string | null;
  discoveryCtaTiles?: DiscoveryCtaTile[] | null;
};

function readLayoutCache(stateId: string): LayoutApiPayload | null {
  if (typeof window === "undefined" || !stateId) return null;
  try {
    const raw = sessionStorage.getItem(`${LAYOUT_CACHE_PREFIX}${stateId}`);
    return raw ? (JSON.parse(raw) as LayoutApiPayload) : null;
  } catch {
    return null;
  }
}

function writeLayoutCache(stateId: string, payload: LayoutApiPayload) {
  if (typeof window === "undefined" || !stateId) return;
  try {
    const prev = readLayoutCache(stateId) ?? {};
    sessionStorage.setItem(
      `${LAYOUT_CACHE_PREFIX}${stateId}`,
      JSON.stringify({ ...prev, ...payload })
    );
  } catch {
    // ignore quota errors
  }
}

function LayoutPreviewMock({ layoutKey }: { layoutKey: FoodHomeLayoutKey }) {
  if (layoutKey === "grid_first") {
    return (
      <div className="mt-3 space-y-1.5 rounded-lg border border-slate-200 bg-slate-50 p-2">
        <div
          className="h-10 rounded-lg"
          style={{
            background: "linear-gradient(180deg, #BAE6FD 0%, #BBF7D0 100%)",
          }}
        />
        <div className="h-4 rounded bg-amber-100 ring-1 ring-amber-200" />
        <div className="flex gap-1 overflow-hidden">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex shrink-0 flex-col items-center gap-0.5">
              <div className="h-5 w-5 rounded-full bg-white ring-1 ring-slate-200" />
              <div className="h-1 w-6 rounded bg-slate-200" />
              {i === 1 ? <div className="h-0.5 w-5 rounded bg-rose-400" /> : null}
            </div>
          ))}
        </div>
        <div className="flex gap-1">
          <div className="h-4 w-10 rounded bg-white ring-1 ring-slate-200" />
          <div className="h-4 w-12 rounded bg-green-100" />
          <div className="h-4 w-14 rounded bg-white ring-1 ring-slate-200" />
        </div>
        <div className="grid grid-cols-2 gap-1">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="h-8 rounded bg-white ring-1 ring-slate-200" />
          ))}
        </div>
      </div>
    );
  }

  if (layoutKey === "discovery") {
    return (
      <div className="mt-3 space-y-1.5 rounded-lg border border-zinc-800 bg-[#121212] p-2">
        <div className="h-6 rounded-full bg-zinc-800" />
        <div className="flex gap-1 overflow-hidden">
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              className={cn(
                "h-10 w-10 shrink-0 rounded-xl bg-zinc-900 ring-1",
                i === 0 ? "ring-teal-400/70" : i === 1 ? "ring-orange-400/70" : "ring-amber-400/70"
              )}
            />
          ))}
        </div>
        <div className="flex gap-1 overflow-hidden">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex shrink-0 flex-col gap-1">
              <div className="flex flex-col items-center gap-0.5">
                <div className="h-5 w-5 rounded-full bg-zinc-700" />
                <div className="h-1 w-5 rounded bg-zinc-700" />
              </div>
              <div className="flex flex-col items-center gap-0.5">
                <div className="h-5 w-5 rounded-full bg-zinc-700" />
                <div className="h-1 w-5 rounded bg-zinc-700" />
              </div>
            </div>
          ))}
        </div>
        <div className="h-8 rounded-lg bg-zinc-900" />
      </div>
    );
  }

  return (
    <div className="mt-3 space-y-1.5 rounded-lg border border-slate-200 bg-slate-50 p-2">
      <div className="h-8 rounded bg-slate-200/80" />
      <div className="flex gap-1 overflow-hidden">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="flex shrink-0 flex-col items-center gap-0.5">
            <div className="h-6 w-6 rounded-full bg-white ring-1 ring-slate-200" />
            <div className="h-1 w-6 rounded bg-slate-200" />
          </div>
        ))}
      </div>
      <div className="grid grid-cols-3 gap-1">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-10 rounded bg-white ring-1 ring-slate-200" />
        ))}
      </div>
      <div className="h-8 rounded bg-white ring-1 ring-slate-200" />
    </div>
  );
}

export default function CxAppHomeStateDetailPage() {
  const params = useAppParams<{ stateId: string }>();
  const stateId = params.stateId ?? "";

  const { data: statesData } = useGeoStatesQuery(undefined, {
    refetchOnMountOrArgChange: false,
    refetchOnFocus: false,
    refetchOnReconnect: false,
  });
  const states = statesData?.states ?? [];
  const stateName = useMemo(
    () => states.find((s) => s.id === stateId)?.name ?? "State / UT",
    [states, stateId]
  );

  const [activeLayout, setActiveLayout] = useState<FoodHomeLayoutKey>(DEFAULT_FOOD_HOME_LAYOUT);
  const [previewLayout, setPreviewLayout] = useState<FoodHomeLayoutKey>(DEFAULT_FOOD_HOME_LAYOUT);
  const [subscriptionRowEnabled, setSubscriptionRowEnabled] = useState(false);
  const [subscriptionRowText, setSubscriptionRowText] = useState(DEFAULT_GRID_FIRST_SUBSCRIPTION_ROW.text);
  const [subscriptionRowBgColor, setSubscriptionRowBgColor] = useState(
    DEFAULT_GRID_FIRST_SUBSCRIPTION_ROW.backgroundColor
  );
  const [under250Enabled, setUnder250Enabled] = useState(DEFAULT_GRID_FIRST_UNDER_250.enabled);
  const [under250Title, setUnder250Title] = useState(DEFAULT_GRID_FIRST_UNDER_250.title);
  const [under250FilterLabel, setUnder250FilterLabel] = useState(DEFAULT_GRID_FIRST_UNDER_250.filterLabel);
  const [under250MaxPrice, setUnder250MaxPrice] = useState(DEFAULT_GRID_FIRST_UNDER_250.maxPrice);
  const [under250TabImageUrl, setUnder250TabImageUrl] = useState<string | null>(null);
  const [under250HeroImageUrl, setUnder250HeroImageUrl] = useState<string | null>(null);
  const [discoveryDealsAtMaxPrice, setDiscoveryDealsAtMaxPrice] = useState<number | null>(
    DEFAULT_DISCOVERY_CTA.dealsAtMaxPrice
  );
  const [discoveryDealsAtImageUrl, setDiscoveryDealsAtImageUrl] = useState<string | null>(null);
  const [discoveryDealsAtHeroImageUrl, setDiscoveryDealsAtHeroImageUrl] = useState<string | null>(null);
  const [discoveryCrazyDealsImageUrl, setDiscoveryCrazyDealsImageUrl] = useState<string | null>(null);
  const [discoveryFreePackagingImageUrl, setDiscoveryFreePackagingImageUrl] = useState<string | null>(null);
  const [discoveryDealsAtLabel, setDiscoveryDealsAtLabel] = useState<string | null>(null);
  const [discoveryCrazyDealsLabel, setDiscoveryCrazyDealsLabel] = useState<string | null>(null);
  const [discoveryFreePackagingLabel, setDiscoveryFreePackagingLabel] = useState<string | null>(null);
  const [discoveryCtaTiles, setDiscoveryCtaTiles] = useState<DiscoveryCtaTile[] | null>(null);
  const [heroMediaItems, setHeroMediaItems] = useState<GridFirstHeroMediaItem[] | undefined>(undefined);
  const [syncingLayout, setSyncingLayout] = useState(true);
  const [savingLayout, setSavingLayout] = useState<FoodHomeLayoutKey | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  /** Mount live preview after first paint so layout cards aren't blocked. */
  const [previewReady, setPreviewReady] = useState(false);
  const [verticalTab, setVerticalTab] = useState<"food" | "grocery">("food");

  useEffect(() => {
    let idleId: number | undefined;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    const enable = () => setPreviewReady(true);
    if (typeof window !== "undefined" && "requestIdleCallback" in window) {
      idleId = window.requestIdleCallback(enable, { timeout: 500 });
    } else {
      timeoutId = setTimeout(enable, 50);
    }
    return () => {
      if (idleId != null && typeof window !== "undefined" && "cancelIdleCallback" in window) {
        window.cancelIdleCallback(idleId);
      }
      if (timeoutId != null) clearTimeout(timeoutId);
    };
  }, [stateId]);

  const applyLayoutPayload = useCallback(
    (json: LayoutApiPayload) => {
      const key = json.layoutKey ?? DEFAULT_FOOD_HOME_LAYOUT;
      setActiveLayout(key);
      setPreviewLayout(key);
      if (typeof json.gridFirstSubscriptionRowEnabled === "boolean") {
        setSubscriptionRowEnabled(json.gridFirstSubscriptionRowEnabled);
      }
      if (typeof json.gridFirstSubscriptionRowText === "string") {
        setSubscriptionRowText(json.gridFirstSubscriptionRowText);
      }
      if (typeof json.gridFirstSubscriptionRowBgColor === "string") {
        setSubscriptionRowBgColor(json.gridFirstSubscriptionRowBgColor);
      }
      if (typeof json.gridFirstUnder250Enabled === "boolean") {
        setUnder250Enabled(json.gridFirstUnder250Enabled);
      }
      if (typeof json.gridFirstUnder250Title === "string") {
        setUnder250Title(json.gridFirstUnder250Title);
      }
      if (typeof json.gridFirstUnder250FilterLabel === "string") {
        setUnder250FilterLabel(json.gridFirstUnder250FilterLabel);
      }
      if (json.gridFirstUnder250MaxPrice != null) {
        setUnder250MaxPrice(json.gridFirstUnder250MaxPrice);
      }
      if (json.gridFirstUnder250TabImageUrl !== undefined) {
        setUnder250TabImageUrl(json.gridFirstUnder250TabImageUrl?.trim() || null);
      }
      if (json.gridFirstUnder250HeroImageUrl !== undefined) {
        setUnder250HeroImageUrl(json.gridFirstUnder250HeroImageUrl?.trim() || null);
      }
      if (json.discoveryDealsAtMaxPrice !== undefined) {
        setDiscoveryDealsAtMaxPrice(parseDiscoveryDealsAtMaxPrice(json.discoveryDealsAtMaxPrice));
      }
      if (json.discoveryDealsAtImageUrl !== undefined) {
        setDiscoveryDealsAtImageUrl(json.discoveryDealsAtImageUrl?.trim() || null);
      }
      if (json.discoveryDealsAtHeroImageUrl !== undefined) {
        setDiscoveryDealsAtHeroImageUrl(json.discoveryDealsAtHeroImageUrl?.trim() || null);
      }
      if (json.discoveryCrazyDealsImageUrl !== undefined) {
        setDiscoveryCrazyDealsImageUrl(json.discoveryCrazyDealsImageUrl?.trim() || null);
      }
      if (json.discoveryFreePackagingImageUrl !== undefined) {
        setDiscoveryFreePackagingImageUrl(json.discoveryFreePackagingImageUrl?.trim() || null);
      }
      if (json.discoveryDealsAtLabel !== undefined) {
        setDiscoveryDealsAtLabel(json.discoveryDealsAtLabel?.trim() || null);
      }
      if (json.discoveryCrazyDealsLabel !== undefined) {
        setDiscoveryCrazyDealsLabel(json.discoveryCrazyDealsLabel?.trim() || null);
      }
      if (json.discoveryFreePackagingLabel !== undefined) {
        setDiscoveryFreePackagingLabel(json.discoveryFreePackagingLabel?.trim() || null);
      }
      if (json.discoveryCtaTiles !== undefined) {
        setDiscoveryCtaTiles(
          Array.isArray(json.discoveryCtaTiles)
            ? parseDiscoveryCtaTiles(json.discoveryCtaTiles, [])
            : []
        );
      }
      if (json.gridFirstHeroMedia !== undefined) {
        setHeroMediaItems(Array.isArray(json.gridFirstHeroMedia) ? json.gridFirstHeroMedia : []);
      }
      writeLayoutCache(stateId, json);
    },
    [stateId]
  );

  useEffect(() => {
    if (!stateId) return;
    const cached = readLayoutCache(stateId);
    if (cached) applyLayoutPayload(cached);
  }, [applyLayoutPayload, stateId]);

  const loadLayout = useCallback(async () => {
    if (!stateId) return;
    setSyncingLayout(true);
    setSaveError(null);
    try {
      const res = await fetch(`/api/super-admin/cxapp-home/food-layout/${stateId}`, {
        cache: "default",
      });
      const json = (await res.json()) as LayoutApiPayload & { error?: string };
      if (!res.ok) throw new Error(json.error ?? "Failed to load layout");
      applyLayoutPayload(json);
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "Failed to load layout");
    } finally {
      setSyncingLayout(false);
    }
  }, [applyLayoutPayload, stateId]);

  useEffect(() => {
    void loadLayout();
  }, [loadLayout]);

  const onSelectLayout = async (layoutKey: FoodHomeLayoutKey) => {
    if (!stateId || savingLayout) return;
    setPreviewLayout(layoutKey);
    setSavingLayout(layoutKey);
    setSaveError(null);
    try {
      const res = await fetch(`/api/super-admin/cxapp-home/food-layout/${stateId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ layoutKey }),
      });
      const json = (await res.json()) as LayoutApiPayload & { error?: string };
      if (!res.ok) throw new Error(json.error ?? "Failed to save layout");
      applyLayoutPayload(json);
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "Failed to save layout");
    } finally {
      setSavingLayout(null);
    }
  };

  const gridFirstPanelEnabled = activeLayout === "grid_first" || previewLayout === "grid_first";
  const discoveryPanelEnabled = activeLayout === "discovery" || previewLayout === "discovery";

  return (
    <div className="w-full min-w-0 max-w-none space-y-4">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-3 py-1">
        <h1 className="text-xl font-semibold tracking-tight text-slate-900 sm:text-2xl">{stateName}</h1>
        <span className="text-xs text-slate-600">State ID: {stateId}</span>
        {syncingLayout ? (
          <span className="text-[11px] font-medium text-cyan-700">Syncing active layout…</span>
        ) : null}
      </div>

      <div className="px-3">
        <div
          className="inline-flex rounded-full bg-slate-100 p-1 ring-1 ring-slate-200/90"
          role="tablist"
          aria-label="Home vertical"
        >
          {(
            [
              ["food", "Food home"],
              ["grocery", "Grocery home"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={verticalTab === id}
              onClick={() => setVerticalTab(id)}
              className={cn(
                "rounded-full px-4 py-2 text-[13px] font-semibold transition",
                verticalTab === id
                  ? "bg-white text-cyan-900 shadow-sm ring-1 ring-cyan-200/80"
                  : "text-slate-500 hover:text-slate-800"
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {verticalTab === "grocery" ? (
        <div className="px-3">
          <CxAppGroceryHomeStatePanel stateId={stateId} />
        </div>
      ) : (
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_300px] xl:items-start">
        <div className="order-2 rounded-xl border border-gray-200 bg-white p-4 shadow-sm xl:order-1">
          <h2 className="text-sm font-semibold text-slate-900">Food delivery home screen</h2>
          <p className="mt-1 text-xs text-slate-500">
            Select one active UI for this state/UT. Customer app food home will use only the active layout.
          </p>

          <div
            className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-3"
            onMouseLeave={() => activeLayout && setPreviewLayout(activeLayout)}
          >
            {FOOD_HOME_LAYOUT_CATALOG.map((layout) => {
              const isActive = activeLayout === layout.key;
              const isPreview = previewLayout === layout.key;
              const isSaving = savingLayout === layout.key;
              return (
                <button
                  key={layout.key}
                  type="button"
                  disabled={!!savingLayout}
                  onMouseEnter={() => setPreviewLayout(layout.key)}
                  onFocus={() => setPreviewLayout(layout.key)}
                  onClick={() => void onSelectLayout(layout.key)}
                  className={cn(
                    "rounded-xl border p-3 text-left transition",
                    isActive
                      ? "border-cyan-500 bg-cyan-50/40 ring-1 ring-cyan-500/30"
                      : isPreview
                        ? "border-cyan-300 bg-slate-50"
                        : "border-gray-200 bg-white hover:border-cyan-300 hover:bg-slate-50"
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-semibold text-slate-900">{layout.label}</p>
                      <p className="mt-0.5 text-xs text-slate-500">{layout.description}</p>
                    </div>
                    {isActive ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-cyan-600 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
                        <Check className="h-3 w-3" />
                        Active
                      </span>
                    ) : isSaving ? (
                      <span className="text-[10px] font-medium text-cyan-700">Saving…</span>
                    ) : syncingLayout ? (
                      <Spinner className="h-4 w-4 text-cyan-600" />
                    ) : null}
                  </div>
                  <LayoutPreviewMock layoutKey={layout.key} />
                </button>
              );
            })}
          </div>

          {saveError ? <p className="mt-3 text-xs font-medium text-red-600">{saveError}</p> : null}

          <GridFirstSubscriptionRowPanel
            stateId={stateId}
            enabled={gridFirstPanelEnabled}
            initialEnabled={subscriptionRowEnabled}
            initialText={subscriptionRowText}
            initialBackgroundColor={subscriptionRowBgColor}
            onSaved={(config) => {
              setSubscriptionRowEnabled(config.enabled);
              setSubscriptionRowText(config.text);
              setSubscriptionRowBgColor(config.backgroundColor);
              writeLayoutCache(stateId, {
                layoutKey: activeLayout,
                gridFirstHeroMedia: heroMediaItems,
                gridFirstSubscriptionRowEnabled: config.enabled,
                gridFirstSubscriptionRowText: config.text,
                gridFirstSubscriptionRowBgColor: config.backgroundColor,
              });
            }}
          />

          <GridFirstUnder250Panel
            stateId={stateId}
            enabled={gridFirstPanelEnabled}
            initialEnabled={under250Enabled}
            initialMaxPrice={under250MaxPrice}
            initialTitle={under250Title}
            initialFilterLabel={under250FilterLabel}
            initialTabImageUrl={under250TabImageUrl}
            initialHeroImageUrl={under250HeroImageUrl}
            onSaved={(config) => {
              setUnder250Enabled(config.enabled);
              setUnder250MaxPrice(config.maxPrice);
              setUnder250Title(config.title);
              setUnder250FilterLabel(config.filterLabel);
              setUnder250TabImageUrl(config.tabImageUrl);
              setUnder250HeroImageUrl(config.heroImageUrl);
              writeLayoutCache(stateId, {
                layoutKey: activeLayout,
                gridFirstHeroMedia: heroMediaItems,
                gridFirstSubscriptionRowEnabled: subscriptionRowEnabled,
                gridFirstSubscriptionRowText: subscriptionRowText,
                gridFirstSubscriptionRowBgColor: subscriptionRowBgColor,
                gridFirstUnder250Enabled: config.enabled,
                gridFirstUnder250MaxPrice: config.maxPrice,
                gridFirstUnder250Title: config.title,
                gridFirstUnder250FilterLabel: config.filterLabel,
                gridFirstUnder250TabImageUrl: config.tabImageUrl,
                gridFirstUnder250HeroImageUrl: config.heroImageUrl,
              });
            }}
          />

          <DiscoveryCtaPanel
            stateId={stateId}
            enabled={discoveryPanelEnabled}
            fallbackMaxPrice={under250MaxPrice}
            initialDealsAtMaxPrice={discoveryDealsAtMaxPrice}
            initialDealsAtImageUrl={discoveryDealsAtImageUrl}
            initialDealsAtHeroImageUrl={discoveryDealsAtHeroImageUrl}
            initialTiles={discoveryCtaTiles}
            initialCrazyDealsImageUrl={discoveryCrazyDealsImageUrl}
            initialFreePackagingImageUrl={discoveryFreePackagingImageUrl}
            initialDealsAtLabel={discoveryDealsAtLabel}
            initialCrazyDealsLabel={discoveryCrazyDealsLabel}
            initialFreePackagingLabel={discoveryFreePackagingLabel}
            onSaved={(config) => {
              setDiscoveryDealsAtMaxPrice(config.dealsAtMaxPrice);
              setDiscoveryDealsAtImageUrl(config.dealsAtImageUrl);
              setDiscoveryDealsAtHeroImageUrl(config.dealsAtHeroImageUrl);
              setDiscoveryCrazyDealsImageUrl(config.crazyDealsImageUrl);
              setDiscoveryFreePackagingImageUrl(config.freePackagingImageUrl);
              setDiscoveryDealsAtLabel(config.dealsAtLabel);
              setDiscoveryCrazyDealsLabel(config.crazyDealsLabel);
              setDiscoveryFreePackagingLabel(config.freePackagingLabel);
              setDiscoveryCtaTiles(config.tiles);
              writeLayoutCache(stateId, {
                layoutKey: activeLayout,
                discoveryDealsAtMaxPrice: config.dealsAtMaxPrice,
                discoveryDealsAtImageUrl: config.dealsAtImageUrl,
                discoveryDealsAtHeroImageUrl: config.dealsAtHeroImageUrl,
                discoveryCrazyDealsImageUrl: config.crazyDealsImageUrl,
                discoveryFreePackagingImageUrl: config.freePackagingImageUrl,
                discoveryDealsAtLabel: config.dealsAtLabel,
                discoveryCrazyDealsLabel: config.crazyDealsLabel,
                discoveryFreePackagingLabel: config.freePackagingLabel,
                discoveryCtaTiles: config.tiles,
              });
            }}
          />

          {gridFirstPanelEnabled && !syncingLayout ? (
            <GridFirstHeroMediaPanel
              stateId={stateId}
              enabled
              initialItems={heroMediaItems ?? []}
            />
          ) : null}
        </div>

        <div className="order-1 xl:sticky xl:top-2 xl:z-10 xl:order-2 xl:self-start">
          {previewReady ? (
            <FoodHomeLayoutPhonePreview
              stateId={stateId}
              layoutKey={previewLayout}
              stateName={stateName}
              subscriptionRowEnabled={subscriptionRowEnabled}
              subscriptionRowText={subscriptionRowText}
              subscriptionRowBgColor={subscriptionRowBgColor}
              under250Enabled={under250Enabled}
              under250FilterLabel={under250FilterLabel}
              under250TabImageUrl={under250TabImageUrl}
              discoveryDealsAtMaxPrice={discoveryDealsAtMaxPrice}
              discoveryDealsAtImageUrl={discoveryDealsAtImageUrl}
              discoveryCrazyDealsImageUrl={discoveryCrazyDealsImageUrl}
              discoveryFreePackagingImageUrl={discoveryFreePackagingImageUrl}
              discoveryDealsAtLabel={discoveryDealsAtLabel}
              discoveryCrazyDealsLabel={discoveryCrazyDealsLabel}
              discoveryFreePackagingLabel={discoveryFreePackagingLabel}
              discoveryCtaTiles={discoveryCtaTiles}
            />
          ) : (
            <div className="mb-2 rounded-xl border border-slate-200 bg-slate-50 p-3">
              <p className="text-center text-sm font-semibold text-slate-700">Live app preview</p>
              <div className="mx-auto mt-3 h-64 w-[200px] rounded-[24px] border-[5px] border-slate-200 bg-white" />
            </div>
          )}
        </div>
      </div>
      )}
    </div>
  );
}
