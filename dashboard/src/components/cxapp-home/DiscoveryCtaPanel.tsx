"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ImageIcon, Loader2, Plus, Sparkles, Trash2, X } from "lucide-react";

import {
  MAX_DISCOVERY_CTA_TILES,
  parseDiscoveryCtaConfig,
  parseDiscoveryDealsAtMaxPrice,
  parseGridFirstUnder250ImageUrl,
  type DiscoveryCtaAction,
  type DiscoveryCtaConfig,
  type DiscoveryCtaTile,
} from "@/lib/cxapp-home/food-home-layout";
import {
  resolveAttachmentProxyUrl,
  withAttachmentCacheBust,
} from "@/lib/attachments/resolve-attachment-proxy-url";
import { cn } from "@/lib/utils";

type Props = {
  stateId: string;
  enabled: boolean;
  fallbackMaxPrice: number;
  initialDealsAtMaxPrice: number | null;
  initialDealsAtHeroImageUrl?: string | null;
  initialTiles?: DiscoveryCtaTile[] | null;
  initialDealsAtImageUrl: string | null;
  initialCrazyDealsImageUrl: string | null;
  initialFreePackagingImageUrl: string | null;
  initialDealsAtLabel?: string | null;
  initialCrazyDealsLabel?: string | null;
  initialFreePackagingLabel?: string | null;
  onSaved?: (config: DiscoveryCtaConfig) => void;
};

const ACTION_OPTIONS: { id: DiscoveryCtaAction; label: string }[] = [
  { id: "meals", label: "Deals At inner page" },
  { id: "deals", label: "Crazy Deals list" },
  { id: "packaging", label: "Free Packaging list" },
];

function newTileId(): string {
  return `tile_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function tilesFromLegacy(props: {
  dealsAtImageUrl: string | null;
  crazyDealsImageUrl: string | null;
  freePackagingImageUrl: string | null;
  dealsAtLabel: string | null;
  crazyDealsLabel: string | null;
  freePackagingLabel: string | null;
  dealsAtHeroImageUrl: string | null;
  dealsAtMaxPrice: number | null;
}): DiscoveryCtaTile[] {
  return [
    {
      id: "meals",
      action: "meals",
      label: props.dealsAtLabel,
      imageUrl: props.dealsAtImageUrl,
      heroImageUrl: props.dealsAtHeroImageUrl,
      maxPrice: props.dealsAtMaxPrice,
      sortOrder: 0,
    },
    {
      id: "deals",
      action: "deals",
      label: props.crazyDealsLabel,
      imageUrl: props.crazyDealsImageUrl,
      heroImageUrl: null,
      maxPrice: null,
      sortOrder: 1,
    },
    {
      id: "packaging",
      action: "packaging",
      label: props.freePackagingLabel,
      imageUrl: props.freePackagingImageUrl,
      heroImageUrl: null,
      maxPrice: null,
      sortOrder: 2,
    },
  ];
}

function withMealsFallbacks(
  tiles: DiscoveryCtaTile[],
  fallbackPrice: number | null,
  fallbackHero: string | null
): DiscoveryCtaTile[] {
  let assigned = false;
  return tiles.map((tile) => {
    if (tile.action !== "meals") {
      return { ...tile, heroImageUrl: tile.heroImageUrl ?? null, maxPrice: tile.maxPrice ?? null };
    }
    const next: DiscoveryCtaTile = {
      ...tile,
      maxPrice: tile.maxPrice ?? (!assigned ? fallbackPrice : null),
      heroImageUrl: tile.heroImageUrl ?? (!assigned ? fallbackHero : null),
    };
    assigned = true;
    return next;
  });
}

function ImageUploadField({
  label,
  hint,
  value,
  uploading,
  onPick,
  onClear,
}: {
  label: string;
  hint: string;
  value: string | null;
  uploading: boolean;
  onPick: (file: File) => void;
  onClear: () => void;
}) {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      if (blobUrl) URL.revokeObjectURL(blobUrl);
    };
  }, [blobUrl]);

  useEffect(() => {
    if (uploading || !value || !blobUrl) return;
    URL.revokeObjectURL(blobUrl);
    setBlobUrl(null);
  }, [uploading, value, blobUrl]);

  const proxySrc = value
    ? withAttachmentCacheBust(resolveAttachmentProxyUrl(value) || value)
    : "";
  const previewSrc = blobUrl || proxySrc;

  return (
    <div>
      <span className="text-xs font-semibold text-slate-800">{label}</span>
      <p className="mt-0.5 text-[11px] text-slate-500">{hint}</p>
      <div className="mt-2 flex items-start gap-3">
        <label className="inline-flex cursor-pointer flex-col gap-1">
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            disabled={uploading}
            className="sr-only"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) {
                if (blobUrl) URL.revokeObjectURL(blobUrl);
                setBlobUrl(URL.createObjectURL(file));
                onPick(file);
              }
              e.target.value = "";
            }}
          />
          {previewSrc ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={previewSrc}
              alt=""
              className="h-20 w-20 rounded-xl border border-gray-200/80 object-cover bg-zinc-900"
            />
          ) : (
            <div className="flex h-20 w-20 items-center justify-center rounded-xl border border-dashed border-gray-300 bg-white text-gray-400">
              {uploading ? (
                <Loader2 className="h-6 w-6 animate-spin text-teal-600" />
              ) : (
                <ImageIcon className="h-7 w-7" />
              )}
            </div>
          )}
          <span className="text-[10px] text-teal-700">
            {uploading ? "Uploading…" : "Click to choose image"}
          </span>
        </label>
        {value || blobUrl ? (
          <button
            type="button"
            onClick={() => {
              if (blobUrl) {
                URL.revokeObjectURL(blobUrl);
                setBlobUrl(null);
              }
              onClear();
            }}
            className="inline-flex h-8 items-center gap-1 rounded-lg border border-gray-200 bg-white px-2.5 text-[11px] font-medium text-slate-600 hover:bg-gray-50"
          >
            <X className="h-3.5 w-3.5" />
            Remove
          </button>
        ) : null}
      </div>
    </div>
  );
}

export function DiscoveryCtaPanel({
  stateId,
  enabled,
  fallbackMaxPrice,
  initialDealsAtMaxPrice,
  initialDealsAtImageUrl,
  initialDealsAtHeroImageUrl = null,
  initialCrazyDealsImageUrl,
  initialFreePackagingImageUrl,
  initialDealsAtLabel = null,
  initialCrazyDealsLabel = null,
  initialFreePackagingLabel = null,
  initialTiles = null,
  onSaved,
}: Props) {
  const seedTiles = useMemo(
    () =>
      withMealsFallbacks(
        initialTiles ??
          tilesFromLegacy({
            dealsAtImageUrl: initialDealsAtImageUrl,
            crazyDealsImageUrl: initialCrazyDealsImageUrl,
            freePackagingImageUrl: initialFreePackagingImageUrl,
            dealsAtLabel: initialDealsAtLabel,
            crazyDealsLabel: initialCrazyDealsLabel,
            freePackagingLabel: initialFreePackagingLabel,
            dealsAtHeroImageUrl: initialDealsAtHeroImageUrl,
            dealsAtMaxPrice: initialDealsAtMaxPrice,
          }),
        initialDealsAtMaxPrice,
        initialDealsAtHeroImageUrl
      ),
    [
      initialTiles,
      initialDealsAtImageUrl,
      initialCrazyDealsImageUrl,
      initialFreePackagingImageUrl,
      initialDealsAtLabel,
      initialCrazyDealsLabel,
      initialFreePackagingLabel,
      initialDealsAtHeroImageUrl,
      initialDealsAtMaxPrice,
    ]
  );
  const [tiles, setTiles] = useState<DiscoveryCtaTile[]>(seedTiles);
  const [uploadingTarget, setUploadingTarget] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  useEffect(() => {
    setTiles(seedTiles);
  }, [seedTiles, stateId]);

  const dirty = JSON.stringify(tiles) !== JSON.stringify(seedTiles);

  const uploadImage = useCallback(
    async (target: string, file: File) => {
      if (!stateId || uploadingTarget) return;
      setUploadingTarget(target);
      setError(null);
      try {
        const form = new FormData();
        form.append("file", file);
        form.append("target", target);
        const res = await fetch(
          `/api/super-admin/cxapp-home/food-layout/${stateId}/discovery-cta/upload-image`,
          { method: "POST", body: form }
        );
        const json = (await res.json()) as { url?: string; error?: string };
        if (!res.ok) throw new Error(json.error ?? "Upload failed");
        const url = parseGridFirstUnder250ImageUrl(json.url);
        if (!url) throw new Error("Upload failed");
        if (target.startsWith("hero__")) {
          const tileId = target.slice("hero__".length);
          setTiles((prev) =>
            prev.map((tile) => (tile.id === tileId ? { ...tile, heroImageUrl: url } : tile))
          );
        } else {
          setTiles((prev) =>
            prev.map((tile) => (tile.id === target ? { ...tile, imageUrl: url } : tile))
          );
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "Upload failed");
      } finally {
        setUploadingTarget(null);
      }
    },
    [stateId, uploadingTarget]
  );

  const onSave = useCallback(async () => {
    if (!stateId || saving) return;
    setSaving(true);
    setError(null);
    try {
      const primaryMeals = tiles.find((tile) => tile.action === "meals");
      const res = await fetch(`/api/super-admin/cxapp-home/food-layout/${stateId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          discoveryDealsAtMaxPrice: primaryMeals?.maxPrice ?? null,
          discoveryDealsAtHeroImageUrl: primaryMeals?.heroImageUrl ?? null,
          discoveryCtaTiles: tiles.map((tile, index) => ({ ...tile, sortOrder: index })),
        }),
      });
      const json = (await res.json()) as {
        discoveryDealsAtMaxPrice?: number | null;
        discoveryDealsAtHeroImageUrl?: string | null;
        discoveryCtaTiles?: DiscoveryCtaTile[];
        discoveryDealsAtImageUrl?: string | null;
        discoveryCrazyDealsImageUrl?: string | null;
        discoveryFreePackagingImageUrl?: string | null;
        discoveryDealsAtLabel?: string | null;
        discoveryCrazyDealsLabel?: string | null;
        discoveryFreePackagingLabel?: string | null;
        error?: string;
      };
      if (!res.ok) throw new Error(json.error ?? "Failed to save discovery tiles");
      const next = parseDiscoveryCtaConfig({
        discoveryDealsAtMaxPrice: json.discoveryDealsAtMaxPrice ?? primaryMeals?.maxPrice ?? null,
        discoveryDealsAtHeroImageUrl: json.discoveryDealsAtHeroImageUrl ?? primaryMeals?.heroImageUrl ?? null,
        discoveryDealsAtImageUrl: json.discoveryDealsAtImageUrl,
        discoveryCrazyDealsImageUrl: json.discoveryCrazyDealsImageUrl,
        discoveryFreePackagingImageUrl: json.discoveryFreePackagingImageUrl,
        discoveryDealsAtLabel: json.discoveryDealsAtLabel,
        discoveryCrazyDealsLabel: json.discoveryCrazyDealsLabel,
        discoveryFreePackagingLabel: json.discoveryFreePackagingLabel,
        discoveryCtaTiles: json.discoveryCtaTiles ?? tiles,
      });
      setTiles(
        withMealsFallbacks(
          next.tiles,
          next.dealsAtMaxPrice,
          next.dealsAtHeroImageUrl
        )
      );
      setSavedAt(Date.now());
      onSaved?.(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save discovery tiles");
    } finally {
      setSaving(false);
    }
  }, [onSaved, saving, stateId, tiles]);

  if (!enabled) return null;

  return (
    <div className="mt-5 rounded-xl border border-teal-200/80 bg-teal-50/40 p-4">
      <div className="flex items-start gap-2">
        <div className="rounded-lg bg-teal-100 p-2 text-teal-800">
          <Sparkles className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold text-slate-900">Discovery promo tiles</h3>
          <p className="mt-0.5 text-xs text-slate-500">
            Add or remove CTA buttons. For Deals At, set the inner-page hero and amount so items
            auto-filter at or below that price.
          </p>
        </div>
      </div>

      <div className="mt-4 space-y-3">
        {tiles.length === 0 ? (
          <p className="rounded-lg border border-dashed border-slate-300 bg-white px-3 py-4 text-xs text-slate-500">
            No CTA buttons. Add one below, or the Discovery home rail stays hidden.
          </p>
        ) : null}
        {tiles.map((tile, index) => {
          const tilePrice = tile.maxPrice ?? fallbackMaxPrice;
          return (
          <div key={tile.id} className="rounded-xl border border-white bg-white/90 p-3 shadow-sm">
            <div className="mb-2 flex items-center justify-between gap-2">
              <span className="text-[11px] font-semibold text-slate-500">Button {index + 1}</span>
              <button
                type="button"
                onClick={() => setTiles((prev) => prev.filter((row) => row.id !== tile.id))}
                className="inline-flex h-8 items-center gap-1 rounded-lg border border-red-200 bg-white px-2.5 text-[11px] font-medium text-red-600 hover:bg-red-50"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Remove button
              </button>
            </div>
            <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
              <label className="block">
                <span className="text-xs font-semibold text-slate-800">Name</span>
                <input
                  type="text"
                  maxLength={40}
                  value={tile.label ?? ""}
                  onChange={(e) =>
                    setTiles((prev) =>
                      prev.map((row) =>
                        row.id === tile.id ? { ...row, label: e.target.value || null } : row
                      )
                    )
                  }
                  placeholder={
                    tile.action === "meals"
                      ? `DEALS AT ₹${tilePrice}`
                      : tile.action === "deals"
                        ? "CRAZY DEALS"
                        : "FREE PACKAGING"
                  }
                  className="mt-1.5 h-10 w-full rounded-lg border border-gray-200 bg-white px-3 text-xs text-slate-800 outline-none focus:border-teal-500"
                />
              </label>
              <label className="block">
                <span className="text-xs font-semibold text-slate-800">Opens</span>
                <select
                  value={tile.action}
                  onChange={(e) =>
                    setTiles((prev) =>
                      prev.map((row) =>
                        row.id === tile.id
                          ? { ...row, action: e.target.value as DiscoveryCtaAction }
                          : row
                      )
                    )
                  }
                  className="mt-1.5 h-10 w-full rounded-lg border border-gray-200 bg-white px-3 text-xs text-slate-800 outline-none focus:border-teal-500"
                >
                  {ACTION_OPTIONS.map((opt) => (
                    <option key={opt.id} value={opt.id}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </label>
              <ImageUploadField
                label="Tile image"
                hint="Shown on Discovery home."
                value={tile.imageUrl}
                uploading={uploadingTarget === tile.id}
                onPick={(file) => void uploadImage(tile.id, file)}
                onClear={() =>
                  setTiles((prev) =>
                    prev.map((row) => (row.id === tile.id ? { ...row, imageUrl: null } : row))
                  )
                }
              />
            </div>
            {tile.action === "meals" ? (
              <div className="mt-3 grid gap-3 border-t border-slate-100 pt-3 sm:grid-cols-[140px_1fr]">
                <label className="block">
                  <span className="text-xs font-semibold text-slate-800">Amount (₹)</span>
                  <p className="mt-0.5 text-[11px] text-slate-500">
                    Items at or below this price fill the inner page.
                  </p>
                  <input
                    type="number"
                    min={1}
                    max={5000}
                    value={tile.maxPrice != null ? String(tile.maxPrice) : ""}
                    onChange={(e) =>
                      setTiles((prev) =>
                        prev.map((row) =>
                          row.id === tile.id
                            ? {
                                ...row,
                                maxPrice: parseDiscoveryDealsAtMaxPrice(e.target.value.trim() || null),
                              }
                            : row
                        )
                      )
                    }
                    placeholder={String(fallbackMaxPrice)}
                    className="mt-1.5 h-10 w-full rounded-lg border border-gray-200 bg-white px-3 text-xs text-slate-800 outline-none focus:border-teal-500"
                  />
                </label>
                <ImageUploadField
                  label="Inner page hero"
                  hint="Banner on the Deals At page opened by this button."
                  value={tile.heroImageUrl}
                  uploading={uploadingTarget === `hero__${tile.id}`}
                  onPick={(file) => void uploadImage(`hero__${tile.id}`, file)}
                  onClear={() =>
                    setTiles((prev) =>
                      prev.map((row) => (row.id === tile.id ? { ...row, heroImageUrl: null } : row))
                    )
                  }
                />
              </div>
            ) : null}
          </div>
          );
        })}
      </div>

      <button
        type="button"
        disabled={tiles.length >= MAX_DISCOVERY_CTA_TILES}
        onClick={() =>
          setTiles((prev) => [
            ...prev,
            {
              id: newTileId(),
              action: "meals",
              label: null,
              imageUrl: null,
              heroImageUrl: null,
              maxPrice: null,
              sortOrder: prev.length,
            },
          ])
        }
        className="mt-3 inline-flex h-9 items-center gap-1.5 rounded-lg border border-teal-300 bg-white px-3 text-xs font-semibold text-teal-800 hover:bg-teal-50 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <Plus className="h-3.5 w-3.5" />
        Add CTA button
      </button>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={!dirty || saving || uploadingTarget != null}
          onClick={() => void onSave()}
          className={cn(
            "inline-flex h-9 items-center rounded-lg bg-teal-600 px-4 text-xs font-semibold text-white transition hover:bg-teal-700 disabled:cursor-not-allowed disabled:opacity-50"
          )}
        >
          {saving ? "Saving…" : "Save discovery tiles"}
        </button>
        {savedAt ? <span className="text-[11px] font-medium text-emerald-700">Saved</span> : null}
      </div>

      {error ? <p className="mt-2 text-xs font-medium text-red-600">{error}</p> : null}
    </div>
  );
}
