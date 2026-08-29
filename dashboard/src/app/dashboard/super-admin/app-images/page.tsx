"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ImageIcon, Loader2, Trash2, Upload, RefreshCw, Plus } from "lucide-react";
import { usePermissions } from "@/hooks/usePermissions";
import {
  APP_STATIC_ASSET_APPS,
  appStaticAssetAppLabel,
  isAppStaticVideoAsset,
  isRideHomeBannerSlot,
  RIDE_HOME_BANNER_SLOT_IDS,
  type AppStaticAssetApp,
} from "@/lib/app-static-assets/shared";
import type { AppStaticAssetRow } from "@/lib/db/operations/app-static-assets";
import { LearningCentreAdminPanel } from "@/components/super-admin/LearningCentreAdminPanel";
import { resolveAttachmentProxyUrl } from "@/lib/attachments/resolve-attachment-proxy-url";
import { cn } from "@/lib/utils";

type PageTab = AppStaticAssetApp | "learning";

function previewUrl(proxyUrl: string | null): string | null {
  if (!proxyUrl) return null;
  return resolveAttachmentProxyUrl(proxyUrl) || proxyUrl;
}

type SectionGroup = {
  section: string;
  items: AppStaticAssetRow[];
};

function rideBannerSlotsFromItems(items: AppStaticAssetRow[]): AppStaticAssetRow[] {
  const byId = new Map(items.map((item) => [item.id, item]));
  return RIDE_HOME_BANNER_SLOT_IDS.map((id) => byId.get(id)).filter(
    (row): row is AppStaticAssetRow => Boolean(row)
  );
}

export default function AppImagesPage() {
  const router = useRouter();
  const { isSuperAdmin, loading: permLoading } = usePermissions();
  const [tab, setTab] = useState<PageTab>("customer");
  const [learningTick, setLearningTick] = useState(0);
  const [items, setItems] = useState<AppStaticAssetRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pendingUploadIds = useRef<string[]>([]);
  const app = tab === "learning" ? "merchant" : tab;

  useEffect(() => {
    if (!permLoading && !isSuperAdmin) {
      router.replace("/dashboard");
    }
  }, [permLoading, isSuperAdmin, router]);

  const loadItems = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/super-admin/app-assets?app=${encodeURIComponent(app)}`, {
        cache: "no-store",
      });
      const json = (await res.json()) as { items?: AppStaticAssetRow[]; error?: string };
      if (!res.ok) throw new Error(json.error ?? "Failed to load");
      setItems(Array.isArray(json.items) ? json.items : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [app]);

  useEffect(() => {
    if (isSuperAdmin && tab !== "learning") void loadItems();
  }, [isSuperAdmin, loadItems, tab]);

  const grouped = useMemo((): SectionGroup[] => {
    const map = new Map<string, AppStaticAssetRow[]>();
    for (const item of items) {
      const list = map.get(item.section) ?? [];
      list.push(item);
      map.set(item.section, list);
    }
    return Array.from(map.entries()).map(([section, sectionItems]) => ({
      section,
      items: sectionItems,
    }));
  }, [items]);

  const onPickFile = (id: string) => {
    pendingUploadIds.current = [id];
    if (fileInputRef.current) {
      fileInputRef.current.multiple = false;
      fileInputRef.current.accept = isAppStaticVideoAsset(id)
        ? "video/mp4,video/webm,video/quicktime,video/x-m4v"
        : "image/jpeg,image/png,image/webp,image/gif";
    }
    fileInputRef.current?.click();
  };

  const onPickRideBannerFiles = (emptySlotIds: string[]) => {
    if (emptySlotIds.length === 0) return;
    pendingUploadIds.current = emptySlotIds;
    if (fileInputRef.current) {
      fileInputRef.current.multiple = emptySlotIds.length > 1;
      fileInputRef.current.accept = "image/jpeg,image/png,image/webp,image/gif";
    }
    fileInputRef.current?.click();
  };

  const uploadToSlot = async (id: string, file: File): Promise<AppStaticAssetRow> => {
    const fd = new FormData();
    fd.set("file", file);
    const res = await fetch(`/api/super-admin/app-assets/${encodeURIComponent(id)}`, {
      method: "POST",
      body: fd,
    });
    const json = (await res.json()) as { item?: AppStaticAssetRow; error?: string };
    if (!res.ok || !json.item) throw new Error(json.error ?? "Upload failed");
    return json.item;
  };

  const onFileSelected = async (fileList: FileList | null) => {
    const ids = pendingUploadIds.current;
    pendingUploadIds.current = [];
    if (ids.length === 0 || !fileList?.length) return;

    const files = Array.from(fileList).slice(0, ids.length);
    setBusyId(ids[0] ?? null);
    setError(null);
    try {
      const updated: AppStaticAssetRow[] = [];
      for (let i = 0; i < files.length; i++) {
        const slotId = ids[i];
        const file = files[i];
        if (!slotId || !file) break;
        setBusyId(slotId);
        updated.push(await uploadToSlot(slotId, file));
      }
      if (updated.length > 0) {
        setItems((prev) => {
          const next = [...prev];
          for (const item of updated) {
            const idx = next.findIndex((row) => row.id === item.id);
            if (idx >= 0) next[idx] = item;
            else next.push(item);
          }
          return next;
        });
      } else {
        await loadItems();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setBusyId(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
        fileInputRef.current.multiple = false;
      }
    }
  };

  const onRemove = async (id: string) => {
    if (busyId) return;
    if (!window.confirm("Remove this file? The app will show empty until a new file is uploaded.")) {
      return;
    }
    setBusyId(id);
    setError(null);
    try {
      const res = await fetch(`/api/super-admin/app-assets/${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      const json = (await res.json()) as { item?: AppStaticAssetRow; error?: string };
      if (!res.ok) throw new Error(json.error ?? "Remove failed");
      if (json.item) {
        setItems((prev) => prev.map((row) => (row.id === id ? json.item! : row)));
      } else {
        await loadItems();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Remove failed");
    } finally {
      setBusyId(null);
    }
  };

  if (permLoading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
      </div>
    );
  }

  if (!isSuperAdmin) return null;

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6">
      <div className="mb-5 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        <h1 className="text-lg font-semibold tracking-tight text-slate-900 sm:text-xl">
          {tab === "learning" ? "Learning Centre" : "App images"}
        </h1>
        <p className="mt-1 max-w-3xl text-xs text-slate-500 sm:text-sm">
          {tab === "learning"
            ? "Add section title, video title, thumbnail, and a YouTube link. Select Rider, Merchant, or Customer for each video. Tapping a card in the app opens YouTube."
            : "Upload images and videos to R2 for Customer, Rider & Merchant apps. Files are served via signed URLs — no bundled assets in app code. Branding → App icon updates in-app after the next app open; the Expo bundling / phone home-screen icon is native and needs a store rebuild. Packaging tips video: MP4, max 80 MB."}
        </p>

        <div className="mt-4 flex flex-wrap items-center gap-2">
        {APP_STATIC_ASSET_APPS.map((appTab) => (
          <button
            key={appTab}
            type="button"
            onClick={() => setTab(appTab)}
            className={cn(
              "rounded-full px-4 py-2 text-sm font-medium transition-colors",
              tab === appTab
                ? "bg-teal-600 text-white shadow-sm"
                : "bg-slate-100 text-slate-700 hover:bg-slate-200"
            )}
          >
            {appStaticAssetAppLabel(appTab)}
          </button>
        ))}
        <button
          type="button"
          onClick={() => setTab("learning")}
          className={cn(
            "rounded-full px-4 py-2 text-sm font-medium transition-colors",
            tab === "learning"
              ? "bg-teal-600 text-white shadow-sm"
              : "bg-slate-100 text-slate-700 hover:bg-slate-200"
          )}
        >
          Learning
        </button>
        <button
          type="button"
          onClick={() => {
            if (tab === "learning") setLearningTick((n) => n + 1);
            else void loadItems();
          }}
          disabled={tab !== "learning" && loading}
          className="ml-auto inline-flex items-center gap-1.5 rounded-full border border-slate-200 px-3 py-2 text-sm text-slate-600 hover:bg-slate-50"
        >
          <RefreshCw className={cn("h-4 w-4", tab !== "learning" && loading && "animate-spin")} />
          Refresh
        </button>
        </div>
      </div>

      {tab === "learning" ? (
        <LearningCentreAdminPanel key={learningTick} />
      ) : (
        <>
      {error ? (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        className="hidden"
        onChange={(e) => void onFileSelected(e.target.files)}
      />

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
        </div>
      ) : (
        <div className="space-y-8">
          {grouped.map(({ section, items: sectionItems }) => (
            <section key={section}>
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
                {section}
              </h2>
              <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
                <table className="w-full text-left text-sm">
                  <thead className="border-b border-slate-100 bg-slate-50 text-xs uppercase text-slate-500">
                    <tr>
                      <th className="px-4 py-3 font-medium">Preview</th>
                      <th className="px-4 py-3 font-medium">Name</th>
                      <th className="px-4 py-3 font-medium hidden sm:table-cell">Usage</th>
                      <th className="px-4 py-3 font-medium text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {sectionItems.map((item) => {
                      if (isRideHomeBannerSlot(item.id) && item.id !== "customer.ride.banner") {
                        return null;
                      }
                      if (item.id === "customer.ride.banner") {
                        const slots = rideBannerSlotsFromItems(sectionItems);
                        const filled = slots.filter((slot) => Boolean(slot.proxy_url));
                        const emptyIds = slots
                          .filter((slot) => !slot.proxy_url)
                          .map((slot) => slot.id);
                        const galleryBusy = slots.some((slot) => busyId === slot.id);
                        return (
                          <tr key="customer.ride.banner-gallery" className="hover:bg-slate-50/80">
                            <td className="px-4 py-3" colSpan={4}>
                              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                                <div className="min-w-0">
                                  <div className="font-medium text-slate-900">Ride home banner</div>
                                  <div className="mt-0.5 font-mono text-xs text-slate-400">
                                    customer.ride.banner · up to 6 images
                                  </div>
                                  <div className="mt-1 text-sm text-slate-600">
                                    1 image shows on every offer. 2 or more images split across offer slides.
                                  </div>
                                </div>
                                {emptyIds.length > 0 ? (
                                  <button
                                    type="button"
                                    disabled={galleryBusy}
                                    onClick={() => onPickRideBannerFiles(emptyIds)}
                                    className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-teal-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-teal-700 disabled:opacity-50"
                                  >
                                    {galleryBusy ? (
                                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                    ) : (
                                      <Plus className="h-3.5 w-3.5" />
                                    )}
                                    {filled.length === 0 ? "Upload" : "Add images"}
                                    {` (${filled.length}/6)`}
                                  </button>
                                ) : (
                                  <span className="shrink-0 text-xs font-medium text-slate-500">6/6 uploaded</span>
                                )}
                              </div>
                              <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-6">
                                {slots.map((slot, idx) => {
                                  const url = previewUrl(slot.proxy_url);
                                  const isBusy = busyId === slot.id;
                                  return (
                                    <div
                                      key={slot.id}
                                      className="overflow-hidden rounded-lg border border-slate-200 bg-slate-50"
                                    >
                                      <div className="flex h-20 items-center justify-center bg-white">
                                        {url ? (
                                          // eslint-disable-next-line @next/next/no-img-element
                                          <img
                                            src={url}
                                            alt={`Ride banner ${idx + 1}`}
                                            className="h-full w-full object-cover"
                                          />
                                        ) : (
                                          <ImageIcon className="h-5 w-5 text-slate-300" />
                                        )}
                                      </div>
                                      <div className="flex items-center justify-between gap-1 px-1.5 py-1">
                                        <span className="text-[10px] font-medium text-slate-500">
                                          {idx + 1}
                                        </span>
                                        <div className="flex gap-1">
                                          <button
                                            type="button"
                                            disabled={isBusy}
                                            onClick={() => onPickFile(slot.id)}
                                            className="rounded p-0.5 text-teal-700 hover:bg-teal-50 disabled:opacity-50"
                                            title={url ? "Change" : "Upload"}
                                          >
                                            {isBusy ? (
                                              <Loader2 className="h-3 w-3 animate-spin" />
                                            ) : (
                                              <Upload className="h-3 w-3" />
                                            )}
                                          </button>
                                          {url ? (
                                            <button
                                              type="button"
                                              disabled={isBusy}
                                              onClick={() => void onRemove(slot.id)}
                                              className="rounded p-0.5 text-red-600 hover:bg-red-50 disabled:opacity-50"
                                              title="Remove"
                                            >
                                              <Trash2 className="h-3 w-3" />
                                            </button>
                                          ) : null}
                                        </div>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            </td>
                          </tr>
                        );
                      }
                      const url = previewUrl(item.proxy_url);
                      const isBusy = busyId === item.id;
                      const isVideo = isAppStaticVideoAsset(item.id);
                      return (
                        <tr key={item.id} className="hover:bg-slate-50/80">
                          <td className="px-4 py-3">
                            <div className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-lg border border-slate-200 bg-slate-50">
                              {url && isVideo ? (
                                <video
                                  src={url}
                                  muted
                                  playsInline
                                  preload="metadata"
                                  className="h-full w-full object-cover"
                                />
                              ) : url ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img
                                  src={url}
                                  alt={item.label}
                                  className="h-full w-full object-contain"
                                />
                              ) : (
                                <ImageIcon className="h-6 w-6 text-slate-300" />
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <div className="font-medium text-slate-900">{item.label}</div>
                            <div className="mt-0.5 font-mono text-xs text-slate-400">{item.id}</div>
                          </td>
                          <td className="hidden px-4 py-3 text-slate-600 sm:table-cell">
                            {item.description}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex flex-wrap justify-end gap-2">
                              <button
                                type="button"
                                disabled={isBusy}
                                onClick={() => onPickFile(item.id)}
                                className="inline-flex items-center gap-1 rounded-lg bg-teal-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-teal-700 disabled:opacity-50"
                              >
                                {isBusy ? (
                                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                ) : (
                                  <Upload className="h-3.5 w-3.5" />
                                )}
                                {item.proxy_url ? "Change" : "Upload"}
                              </button>
                              {item.proxy_url ? (
                                <button
                                  type="button"
                                  disabled={isBusy}
                                  onClick={() => void onRemove(item.id)}
                                  className="inline-flex items-center gap-1 rounded-lg border border-red-200 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                  Remove
                                </button>
                              ) : null}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          ))}
        </div>
      )}
        </>
      )}
    </div>
  );
}
