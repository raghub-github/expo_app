"use client";

import { useCallback, useEffect, useState } from "react";
import { ImageIcon, Loader2, Tag, X } from "lucide-react";

import {
  DEFAULT_GRID_FIRST_UNDER_250,
  parseGridFirstUnder250Enabled,
  parseGridFirstUnder250ImageUrl,
  parseGridFirstUnder250MaxPrice,
  parseGridFirstUnder250Title,
} from "@/lib/cxapp-home/food-home-layout";
import { cn } from "@/lib/utils";

type Props = {
  stateId: string;
  enabled: boolean;
  initialEnabled: boolean;
  initialMaxPrice: number;
  initialTitle: string;
  initialFilterLabel: string;
  initialTabImageUrl: string | null;
  initialHeroImageUrl: string | null;
  onSaved?: (config: {
    enabled: boolean;
    maxPrice: number;
    title: string;
    filterLabel: string;
    tabImageUrl: string | null;
    heroImageUrl: string | null;
  }) => void;
};

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
              if (file) onPick(file);
              e.target.value = "";
            }}
          />
          {value ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={value}
              alt=""
              className="h-20 w-20 rounded-full border border-gray-200/80 object-contain bg-white p-1"
            />
          ) : (
            <div className="flex h-20 w-20 items-center justify-center rounded-full border border-dashed border-gray-300 bg-white text-gray-400">
              {uploading ? (
                <Loader2 className="h-6 w-6 animate-spin text-cyan-600" />
              ) : (
                <ImageIcon className="h-7 w-7" />
              )}
            </div>
          )}
          <span className="text-[10px] text-cyan-700">
            {uploading ? "Uploading…" : "Click to choose image"}
          </span>
        </label>
        {value ? (
          <button
            type="button"
            onClick={onClear}
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

export function GridFirstUnder250Panel({
  stateId,
  enabled,
  initialEnabled,
  initialMaxPrice,
  initialTitle,
  initialFilterLabel,
  initialTabImageUrl,
  initialHeroImageUrl,
  onSaved,
}: Props) {
  const [rowEnabled, setRowEnabled] = useState(initialEnabled);
  const [maxPrice, setMaxPrice] = useState(initialMaxPrice);
  const [title, setTitle] = useState(initialTitle);
  const [filterLabel, setFilterLabel] = useState(initialFilterLabel);
  const [tabImageUrl, setTabImageUrl] = useState<string | null>(initialTabImageUrl);
  const [heroImageUrl, setHeroImageUrl] = useState<string | null>(initialHeroImageUrl);
  const [uploadingTarget, setUploadingTarget] = useState<"tab" | "hero" | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  useEffect(() => {
    setRowEnabled(initialEnabled);
    setMaxPrice(initialMaxPrice);
    setTitle(initialTitle);
    setFilterLabel(initialFilterLabel);
    setTabImageUrl(initialTabImageUrl);
    setHeroImageUrl(initialHeroImageUrl);
  }, [
    initialEnabled,
    initialMaxPrice,
    initialTitle,
    initialFilterLabel,
    initialTabImageUrl,
    initialHeroImageUrl,
    stateId,
  ]);

  const dirty =
    rowEnabled !== initialEnabled ||
    parseGridFirstUnder250MaxPrice(maxPrice) !== parseGridFirstUnder250MaxPrice(initialMaxPrice) ||
    title.trim() !== initialTitle.trim() ||
    filterLabel.trim() !== initialFilterLabel.trim() ||
    tabImageUrl !== initialTabImageUrl ||
    heroImageUrl !== initialHeroImageUrl;

  const uploadImage = useCallback(
    async (target: "tab" | "hero", file: File) => {
      if (!stateId || uploadingTarget) return;
      setUploadingTarget(target);
      setError(null);
      try {
        const form = new FormData();
        form.append("file", file);
        form.append("target", target);
        const res = await fetch(
          `/api/super-admin/cxapp-home/food-layout/${stateId}/under-250/upload-image`,
          { method: "POST", body: form }
        );
        const json = (await res.json()) as { url?: string; error?: string };
        if (!res.ok) throw new Error(json.error ?? "Upload failed");
        const url = parseGridFirstUnder250ImageUrl(json.url);
        if (!url) throw new Error("Upload failed");
        if (target === "tab") setTabImageUrl(url);
        else setHeroImageUrl(url);
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
      const nextTitle = title.trim() || DEFAULT_GRID_FIRST_UNDER_250.title;
      const nextFilterLabel = filterLabel.trim() || DEFAULT_GRID_FIRST_UNDER_250.filterLabel;
      const nextMaxPrice = parseGridFirstUnder250MaxPrice(maxPrice);
      const res = await fetch(`/api/super-admin/cxapp-home/food-layout/${stateId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          gridFirstUnder250Enabled: rowEnabled,
          gridFirstUnder250MaxPrice: nextMaxPrice,
          gridFirstUnder250Title: nextTitle,
          gridFirstUnder250FilterLabel: nextFilterLabel,
          gridFirstUnder250TabImageUrl: tabImageUrl,
          gridFirstUnder250HeroImageUrl: heroImageUrl,
        }),
      });
      const json = (await res.json()) as {
        gridFirstUnder250Enabled?: boolean;
        gridFirstUnder250MaxPrice?: number;
        gridFirstUnder250Title?: string;
        gridFirstUnder250FilterLabel?: string;
        gridFirstUnder250TabImageUrl?: string | null;
        gridFirstUnder250HeroImageUrl?: string | null;
        error?: string;
      };
      if (!res.ok) throw new Error(json.error ?? "Failed to save under-250 section");
      const next = {
        enabled: parseGridFirstUnder250Enabled(json.gridFirstUnder250Enabled),
        maxPrice: parseGridFirstUnder250MaxPrice(json.gridFirstUnder250MaxPrice ?? nextMaxPrice),
        title: parseGridFirstUnder250Title(json.gridFirstUnder250Title, nextTitle),
        filterLabel: parseGridFirstUnder250Title(json.gridFirstUnder250FilterLabel, nextFilterLabel),
        tabImageUrl: parseGridFirstUnder250ImageUrl(json.gridFirstUnder250TabImageUrl ?? tabImageUrl),
        heroImageUrl: parseGridFirstUnder250ImageUrl(json.gridFirstUnder250HeroImageUrl ?? heroImageUrl),
      };
      setRowEnabled(next.enabled);
      setMaxPrice(next.maxPrice);
      setTitle(next.title);
      setFilterLabel(next.filterLabel);
      setTabImageUrl(next.tabImageUrl);
      setHeroImageUrl(next.heroImageUrl);
      setSavedAt(Date.now());
      onSaved?.(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save under-250 section");
    } finally {
      setSaving(false);
    }
  }, [
    filterLabel,
    heroImageUrl,
    maxPrice,
    onSaved,
    rowEnabled,
    saving,
    stateId,
    tabImageUrl,
    title,
  ]);

  if (!enabled) return null;

  return (
    <div className="mt-5 rounded-xl border border-violet-200/80 bg-violet-50/40 p-4">
      <div className="flex items-start gap-2">
        <div className="rounded-lg bg-violet-100 p-2 text-violet-800">
          <Tag className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold text-slate-900">Items under price</h3>
          <p className="mt-0.5 text-xs text-slate-500">
            Home category tab image, inner-page hero, filter chip label, and max price.
          </p>
        </div>
      </div>

      <div className="mt-4 flex items-center justify-between gap-3 rounded-lg border border-violet-200/60 bg-white px-3 py-2.5">
        <div>
          <p className="text-xs font-semibold text-slate-800">Show meals filter</p>
          <p className="text-[11px] text-slate-500">Off hides the chip on grid-first home for this state.</p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={rowEnabled}
          onClick={() => setRowEnabled((v) => !v)}
          className={cn(
            "relative h-7 w-12 shrink-0 rounded-full transition",
            rowEnabled ? "bg-cyan-600" : "bg-slate-300"
          )}
        >
          <span
            className={cn(
              "absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition",
              rowEnabled ? "left-[22px]" : "left-0.5"
            )}
          />
        </button>
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <ImageUploadField
          label="Category tab image (outer)"
          hint="Shown on the home category row — full image, not cropped."
          value={tabImageUrl}
          uploading={uploadingTarget === "tab"}
          onPick={(file) => void uploadImage("tab", file)}
          onClear={() => setTabImageUrl(null)}
        />
        <ImageUploadField
          label="Inner page hero image"
          hint="Banner on the meals-under-price page. Title ribbon still shows on top."
          value={heroImageUrl}
          uploading={uploadingTarget === "hero"}
          onPick={(file) => void uploadImage("hero", file)}
          onClear={() => setHeroImageUrl(null)}
        />
      </div>

      <label className="mt-3 block">
        <span className="text-xs font-semibold text-slate-800">Max item price (₹)</span>
        <input
          type="number"
          min={1}
          max={5000}
          value={maxPrice}
          onChange={(e) => setMaxPrice(Number(e.target.value))}
          className="mt-1.5 h-10 w-full max-w-[140px] rounded-lg border border-gray-200 bg-white px-3 text-xs text-slate-800 outline-none focus:border-cyan-500"
        />
      </label>

      <label className="mt-3 block">
        <span className="text-xs font-semibold text-slate-800">Page banner title</span>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={80}
          placeholder={DEFAULT_GRID_FIRST_UNDER_250.title}
          className="mt-1.5 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs text-slate-800 outline-none placeholder:text-slate-400 focus:border-cyan-500"
        />
      </label>

      <label className="mt-3 block">
        <span className="text-xs font-semibold text-slate-800">Home filter chip label</span>
        <input
          type="text"
          value={filterLabel}
          onChange={(e) => setFilterLabel(e.target.value)}
          maxLength={48}
          placeholder={DEFAULT_GRID_FIRST_UNDER_250.filterLabel}
          className="mt-1.5 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs text-slate-800 outline-none placeholder:text-slate-400 focus:border-cyan-500"
        />
      </label>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={!dirty || saving || uploadingTarget != null}
          onClick={() => void onSave()}
          className="inline-flex h-9 items-center rounded-lg bg-cyan-600 px-4 text-xs font-semibold text-white transition hover:bg-cyan-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save items row"}
        </button>
        {savedAt ? <span className="text-[11px] font-medium text-emerald-700">Saved</span> : null}
      </div>

      {error ? <p className="mt-2 text-xs font-medium text-red-600">{error}</p> : null}
    </div>
  );
}
