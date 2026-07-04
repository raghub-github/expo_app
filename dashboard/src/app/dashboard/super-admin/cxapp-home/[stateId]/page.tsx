"use client";

import { useAppParams } from "@/hooks/useAppSearchParams";

import { useCallback, useEffect, useMemo, useState } from "react";

import { Check } from "lucide-react";

import { FoodHomeLayoutPhonePreview } from "@/components/cxapp-home/FoodHomeLayoutPhonePreview";
import { GridFirstHeroMediaPanel } from "@/components/cxapp-home/GridFirstHeroMediaPanel";
import { GridFirstSubscriptionRowPanel } from "@/components/cxapp-home/GridFirstSubscriptionRowPanel";
import { GridFirstUnder250Panel } from "@/components/cxapp-home/GridFirstUnder250Panel";
import { Spinner } from "@/components/geo-admin/Loader";
import { useGeoStatesQuery } from "@/store/api/geoAdminApi";
import {
  DEFAULT_FOOD_HOME_LAYOUT,
  DEFAULT_GRID_FIRST_SUBSCRIPTION_ROW,
  DEFAULT_GRID_FIRST_UNDER_250,
  FOOD_HOME_LAYOUT_CATALOG,
  type FoodHomeLayoutKey,
} from "@/lib/cxapp-home/food-home-layout";
import { cn } from "@/lib/utils";

const LAYOUT_CACHE_PREFIX = "cxapp-food-layout-v2:";

type LayoutApiPayload = {
  layoutKey?: FoodHomeLayoutKey;
  gridFirstSubscriptionRowEnabled?: boolean;
  gridFirstSubscriptionRowText?: string;
  gridFirstSubscriptionRowBgColor?: string;
  gridFirstUnder250Enabled?: boolean;
  gridFirstUnder250MaxPrice?: number;
  gridFirstUnder250Title?: string;
  gridFirstUnder250FilterLabel?: string;
  gridFirstUnder250TabImageUrl?: string | null;
  gridFirstUnder250HeroImageUrl?: string | null;
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
    sessionStorage.setItem(`${LAYOUT_CACHE_PREFIX}${stateId}`, JSON.stringify(payload));
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
      <div className="mt-3 space-y-1.5 rounded-lg border border-slate-200 bg-slate-50 p-2">
        <div className="h-10 rounded bg-slate-200/80" />
        <div className="flex gap-1 overflow-hidden">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-4 w-10 shrink-0 rounded-full bg-white ring-1 ring-slate-200" />
          ))}
        </div>
        <div className="flex gap-1 overflow-hidden">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-12 w-16 shrink-0 rounded bg-white ring-1 ring-slate-200" />
          ))}
        </div>
        <div className="h-8 rounded bg-white ring-1 ring-slate-200" />
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

  const { data: statesData } = useGeoStatesQuery();
  const states = statesData?.states ?? [];
  const stateName = useMemo(
    () => states.find((s) => s.id === stateId)?.name ?? "State / UT",
    [states, stateId]
  );

  const cached = useMemo(() => (stateId ? readLayoutCache(stateId) : null), [stateId]);

  const [activeLayout, setActiveLayout] = useState<FoodHomeLayoutKey>(
    cached?.layoutKey ?? DEFAULT_FOOD_HOME_LAYOUT
  );
  const [previewLayout, setPreviewLayout] = useState<FoodHomeLayoutKey>(
    cached?.layoutKey ?? DEFAULT_FOOD_HOME_LAYOUT
  );
  const [subscriptionRowEnabled, setSubscriptionRowEnabled] = useState(
    cached?.gridFirstSubscriptionRowEnabled === true
  );
  const [subscriptionRowText, setSubscriptionRowText] = useState(
    cached?.gridFirstSubscriptionRowText ?? DEFAULT_GRID_FIRST_SUBSCRIPTION_ROW.text
  );
  const [subscriptionRowBgColor, setSubscriptionRowBgColor] = useState(
    cached?.gridFirstSubscriptionRowBgColor ?? DEFAULT_GRID_FIRST_SUBSCRIPTION_ROW.backgroundColor
  );
  const [under250Enabled, setUnder250Enabled] = useState(
    cached?.gridFirstUnder250Enabled !== false
  );
  const [under250Title, setUnder250Title] = useState(
    cached?.gridFirstUnder250Title ?? DEFAULT_GRID_FIRST_UNDER_250.title
  );
  const [under250FilterLabel, setUnder250FilterLabel] = useState(
    cached?.gridFirstUnder250FilterLabel ?? DEFAULT_GRID_FIRST_UNDER_250.filterLabel
  );
  const [under250MaxPrice, setUnder250MaxPrice] = useState(
    cached?.gridFirstUnder250MaxPrice ?? DEFAULT_GRID_FIRST_UNDER_250.maxPrice
  );
  const [under250TabImageUrl, setUnder250TabImageUrl] = useState<string | null>(
    cached?.gridFirstUnder250TabImageUrl ?? null
  );
  const [under250HeroImageUrl, setUnder250HeroImageUrl] = useState<string | null>(
    cached?.gridFirstUnder250HeroImageUrl ?? null
  );
  const [syncingLayout, setSyncingLayout] = useState(!cached?.layoutKey);
  const [savingLayout, setSavingLayout] = useState<FoodHomeLayoutKey | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

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
      writeLayoutCache(stateId, json);
    },
    [stateId]
  );

  const loadLayout = useCallback(async () => {
    if (!stateId) return;
    setSyncingLayout(true);
    setSaveError(null);
    try {
      const res = await fetch(`/api/super-admin/cxapp-home/food-layout/${stateId}`, { cache: "no-store" });
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

  return (
    <div className="w-full min-w-0 max-w-none space-y-4">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-3 py-1">
        <h1 className="text-xl font-semibold tracking-tight text-slate-900 sm:text-2xl">{stateName}</h1>
        <span className="text-xs text-slate-600">State ID: {stateId}</span>
        {syncingLayout ? (
          <span className="text-[11px] font-medium text-cyan-700">Syncing active layout…</span>
        ) : null}
      </div>

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

          <GridFirstHeroMediaPanel stateId={stateId} enabled={gridFirstPanelEnabled} />
        </div>

        <div className="order-1 xl:sticky xl:top-2 xl:z-10 xl:order-2 xl:self-start">
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
          />
        </div>
      </div>
    </div>
  );
}
