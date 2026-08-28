"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Film, ImageIcon, Trash2, Upload } from "lucide-react";

import { Spinner } from "@/components/geo-admin/Loader";
import {
  MAX_GRID_FIRST_HERO_MEDIA,
  type GridFirstHeroMediaItem,
} from "@/lib/cxapp-home/grid-first-hero-media";
import { resolveAttachmentProxyUrl } from "@/lib/attachments/resolve-attachment-proxy-url";
import { cn } from "@/lib/utils";

type Props = {
  stateId: string;
  enabled: boolean;
  /** Seed from layout GET so we skip a duplicate hero-media round-trip on first paint. */
  initialItems?: GridFirstHeroMediaItem[];
  /** API base path without trailing slash, e.g. food-layout or grocery-layout. */
  apiBasePath?: string;
};

function mediaPreviewUrl(url: string): string {
  return resolveAttachmentProxyUrl(url) || url;
}

export function GridFirstHeroMediaPanel({
  stateId,
  enabled,
  initialItems,
  apiBasePath = "food-layout",
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [items, setItems] = useState<GridFirstHeroMediaItem[]>(() => initialItems ?? []);
  const [loading, setLoading] = useState(() => enabled && !initialItems);
  const [uploading, setUploading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const heroApiBase = `/api/super-admin/cxapp-home/${apiBasePath}/${stateId}/hero-media`;

  const loadItems = useCallback(async () => {
    if (!stateId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(heroApiBase, {
        cache: "default",
      });
      const json = (await res.json()) as { items?: GridFirstHeroMediaItem[]; error?: string };
      if (!res.ok) throw new Error(json.error ?? "Failed to load hero media");
      setItems(Array.isArray(json.items) ? json.items : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load hero media");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [stateId, heroApiBase]);

  useEffect(() => {
    if (!enabled || !stateId) {
      setLoading(false);
      return;
    }
    if (initialItems !== undefined) {
      setItems(initialItems);
      setLoading(false);
      return;
    }
    void loadItems();
  }, [enabled, stateId, loadItems, initialItems]);

  const onPickFiles = () => {
    if (!enabled || uploading) return;
    inputRef.current?.click();
  };

  const onFilesSelected = async (fileList: FileList | null) => {
    if (!fileList?.length || !stateId) return;
    setUploading(true);
    setError(null);
    try {
      let latest = [...items];
      for (const file of Array.from(fileList)) {
        if (latest.length >= MAX_GRID_FIRST_HERO_MEDIA) break;
        const fd = new FormData();
        fd.set("file", file);
        const res = await fetch(`${heroApiBase}/upload`, { method: "POST", body: fd });
        const json = (await res.json()) as {
          items?: GridFirstHeroMediaItem[];
          error?: string;
        };
        if (!res.ok) throw new Error(json.error ?? "Upload failed");
        if (Array.isArray(json.items)) latest = json.items;
      }
      setItems(latest);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const onDelete = async (itemId: string) => {
    if (!stateId || deletingId) return;
    setDeletingId(itemId);
    setError(null);
    try {
      const res = await fetch(`${heroApiBase}?itemId=${encodeURIComponent(itemId)}`, {
        method: "DELETE",
      });
      const json = (await res.json()) as { items?: GridFirstHeroMediaItem[]; error?: string };
      if (!res.ok) throw new Error(json.error ?? "Delete failed");
      setItems(Array.isArray(json.items) ? json.items : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setDeletingId(null);
    }
  };

  if (!enabled) return null;

  return (
    <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50/40 p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-slate-900">Grid First hero carousel</h3>
          <p className="mt-0.5 text-xs text-slate-600">
            Upload images (jpg/png/webp/gif) or MP4. The customer app hero auto-resizes to each
            slide&apos;s aspect ratio (max {MAX_GRID_FIRST_HERO_MEDIA} slides).
          </p>
        </div>
        <button
          type="button"
          onClick={onPickFiles}
          disabled={uploading || items.length >= MAX_GRID_FIRST_HERO_MEDIA}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition",
            uploading || items.length >= MAX_GRID_FIRST_HERO_MEDIA
              ? "cursor-not-allowed bg-slate-200 text-slate-500"
              : "bg-cyan-600 text-white hover:bg-cyan-700"
          )}
        >
          {uploading ? <Spinner className="h-3.5 w-3.5" /> : <Upload className="h-3.5 w-3.5" />}
          {uploading ? "Uploading…" : "Add image / video"}
        </button>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,.mp4"
        multiple
        className="hidden"
        onChange={(e) => void onFilesSelected(e.target.files)}
      />

      {loading ? (
        <div className="flex justify-center py-6">
          <Spinner label="Loading hero media…" className="text-slate-600" />
        </div>
      ) : items.length === 0 ? (
        <p className="mt-3 rounded-lg border border-dashed border-amber-300 bg-white/60 px-3 py-4 text-center text-xs text-slate-500">
          No hero slides yet. Upload images or MP4 to replace offer banners in the customer app.
        </p>
      ) : (
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
          {items.map((item, index) => {
            const src = mediaPreviewUrl(item.url);
            return (
              <div
                key={item.id}
                className="group relative overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm"
              >
                <div
                  className="relative bg-slate-100"
                  style={{
                    aspectRatio:
                      item.aspectRatio && item.aspectRatio > 0
                        ? String(item.aspectRatio)
                        : "16 / 10",
                  }}
                >
                  {item.kind === "video" ? (
                    <video
                      src={src}
                      className="h-full w-full object-cover"
                      muted
                      playsInline
                      loop
                      autoPlay
                    />
                  ) : (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={src} alt="" className="h-full w-full object-cover" />
                  )}
                  <span className="absolute left-1.5 top-1.5 inline-flex items-center gap-0.5 rounded bg-black/55 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-white">
                    {item.kind === "video" ? (
                      <Film className="h-2.5 w-2.5" />
                    ) : (
                      <ImageIcon className="h-2.5 w-2.5" />
                    )}
                    {item.kind}
                  </span>
                  <span className="absolute right-1.5 top-1.5 rounded bg-black/45 px-1.5 py-0.5 text-[9px] font-bold text-white">
                    #{index + 1}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => void onDelete(item.id)}
                  disabled={deletingId === item.id}
                  className="absolute bottom-1.5 right-1.5 inline-flex items-center gap-1 rounded-md bg-red-600/90 px-2 py-1 text-[10px] font-semibold text-white opacity-0 transition group-hover:opacity-100 disabled:opacity-60"
                >
                  <Trash2 className="h-3 w-3" />
                  {deletingId === item.id ? "…" : "Remove"}
                </button>
              </div>
            );
          })}
        </div>
      )}

      {error ? <p className="mt-2 text-xs font-medium text-red-600">{error}</p> : null}
    </div>
  );
}
