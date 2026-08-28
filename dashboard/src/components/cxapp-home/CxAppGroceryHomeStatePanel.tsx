"use client";

import { useCallback, useEffect, useState } from "react";
import { Check } from "lucide-react";

import { GridFirstHeroMediaPanel } from "@/components/cxapp-home/GridFirstHeroMediaPanel";
import { Spinner } from "@/components/geo-admin/Loader";
import type { FoodHomeLayoutKey } from "@/lib/cxapp-home/food-home-layout";
import type { GridFirstHeroMediaItem } from "@/lib/cxapp-home/grid-first-hero-media";
import { cn } from "@/lib/utils";

const GROCERY_LAYOUTS: { key: FoodHomeLayoutKey; label: string; description: string }[] = [
  {
    key: "grid_first",
    label: "Grid first",
    description: "Hero carousel, store menu categories, and grocery stores list.",
  },
  {
    key: "classic",
    label: "Classic",
    description: "Simple header and grocery stores list.",
  },
];

const LAYOUT_CACHE_PREFIX = "cxapp-grocery-layout-v1:";

type LayoutApiPayload = {
  layoutKey?: FoodHomeLayoutKey;
  gridFirstHeroMedia?: GridFirstHeroMediaItem[];
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

type Props = {
  stateId: string;
};

export function CxAppGroceryHomeStatePanel({ stateId }: Props) {
  const [activeLayout, setActiveLayout] = useState<FoodHomeLayoutKey>("grid_first");
  const [heroMediaItems, setHeroMediaItems] = useState<GridFirstHeroMediaItem[] | undefined>(
    undefined
  );
  const [syncingLayout, setSyncingLayout] = useState(true);
  const [savingLayout, setSavingLayout] = useState<FoodHomeLayoutKey | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  const applyLayoutPayload = useCallback(
    (json: LayoutApiPayload) => {
      if (json.layoutKey) setActiveLayout(json.layoutKey);
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
      const res = await fetch(`/api/super-admin/cxapp-home/grocery-layout/${stateId}`, {
        cache: "default",
      });
      const json = (await res.json()) as LayoutApiPayload & { error?: string };
      if (!res.ok) throw new Error(json.error ?? "Failed to load grocery layout");
      applyLayoutPayload(json);
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "Failed to load grocery layout");
    } finally {
      setSyncingLayout(false);
    }
  }, [applyLayoutPayload, stateId]);

  useEffect(() => {
    void loadLayout();
  }, [loadLayout]);

  const onSelectLayout = async (layoutKey: FoodHomeLayoutKey) => {
    if (!stateId || savingLayout) return;
    setSavingLayout(layoutKey);
    setSaveError(null);
    try {
      const res = await fetch(`/api/super-admin/cxapp-home/grocery-layout/${stateId}`, {
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

  const gridFirstEnabled = activeLayout === "grid_first";

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <h2 className="text-sm font-semibold text-slate-900">Grocery home screen</h2>
      <p className="mt-1 text-xs text-slate-500">
        Separate hero media from food. Category row on the customer app is built from nearby
        grocery store menu items (de-duplicated by category name).
      </p>

      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
        {GROCERY_LAYOUTS.map((layout) => {
          const isActive = activeLayout === layout.key;
          const isSaving = savingLayout === layout.key;
          return (
            <button
              key={layout.key}
              type="button"
              disabled={!!savingLayout}
              onClick={() => void onSelectLayout(layout.key)}
              className={cn(
                "rounded-xl border p-3 text-left transition",
                isActive
                  ? "border-emerald-500 bg-emerald-50/40 ring-1 ring-emerald-500/30"
                  : "border-gray-200 bg-white hover:border-emerald-300 hover:bg-slate-50"
              )}
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold text-slate-900">{layout.label}</p>
                  <p className="mt-0.5 text-xs text-slate-500">{layout.description}</p>
                </div>
                {isActive ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-600 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
                    <Check className="h-3 w-3" />
                    Active
                  </span>
                ) : isSaving ? (
                  <span className="text-[10px] font-medium text-emerald-700">Saving…</span>
                ) : syncingLayout ? (
                  <Spinner className="h-4 w-4 text-emerald-600" />
                ) : null}
              </div>
            </button>
          );
        })}
      </div>

      {saveError ? <p className="mt-3 text-xs font-medium text-red-600">{saveError}</p> : null}

      {gridFirstEnabled && !syncingLayout ? (
        <GridFirstHeroMediaPanel
          stateId={stateId}
          enabled
          initialItems={heroMediaItems ?? []}
          apiBasePath="grocery-layout"
        />
      ) : null}
    </div>
  );
}
