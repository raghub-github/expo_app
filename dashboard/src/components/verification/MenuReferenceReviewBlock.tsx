"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Eye,
  Loader2,
  RotateCcw,
  X,
} from "lucide-react";
import { ONBOARDING_MENU_IMAGE, type MenuMediaFile } from "@/lib/merchant-menu-media";
import { toast } from "sonner";

function sourceEntityLabel(entity: string | null): string {
  if (!entity) return "Menu file";
  if (entity === ONBOARDING_MENU_IMAGE) return "Menu images";
  if (entity === "ONBOARDING_MENU_PDF") return "Menu PDF";
  if (entity === "ONBOARDING_MENU_SHEET") return "Menu spreadsheet";
  return entity.replace(/^ONBOARDING_/, "").replace(/_/g, " ");
}

function openHrefForNonImage(f: MenuMediaFile): string | null {
  const u = (f.menu_url && f.menu_url.trim()) || (f.public_url && f.public_url.trim()) || "";
  return u || null;
}

function StatusPill({ st, tone = "light" }: { st: string; tone?: "light" | "dark" }) {
  const dark = tone === "dark";
  if (st === "VERIFIED") {
    return (
      <span
        className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${
          dark ? "bg-emerald-500 text-white" : "bg-emerald-100 text-emerald-800"
        }`}
      >
        Accepted
      </span>
    );
  }
  if (st === "REJECTED") {
    return (
      <span
        className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${
          dark ? "bg-red-500 text-white" : "bg-red-100 text-red-800"
        }`}
      >
        Rejected
      </span>
    );
  }
  if (st === "REUPLOADED") {
    return (
      <span
        className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${
          dark ? "bg-indigo-500 text-white" : "bg-indigo-100 text-indigo-900"
        }`}
      >
        Reuploaded
      </span>
    );
  }
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${
        dark ? "bg-amber-400 text-amber-950" : "bg-amber-50 text-amber-900 ring-1 ring-amber-200/70"
      }`}
    >
      Pending
    </span>
  );
}

type PreviewItem = {
  fileId: number;
  entryId: string;
  url: string;
  fileName: string;
  status: string;
};

export function MenuReferenceReviewBlock({
  storeId,
  files,
  onUpdated,
  interactive,
  embedded = false,
}: {
  storeId: number;
  files: MenuMediaFile[];
  onUpdated?: () => void;
  interactive: boolean;
  /** When true, omit outer title/border (parent card already provides chrome). */
  embedded?: boolean;
}) {
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);

  const previewItems = useMemo<PreviewItem[]>(() => {
    const items: PreviewItem[] = [];
    for (const f of files) {
      const imgs = f.reference_images;
      if (!imgs?.length) continue;
      for (const img of imgs) {
        items.push({
          fileId: f.id,
          entryId: img.id,
          url: img.url,
          fileName: img.file_name || "Menu image",
          status: (img.verification_status || "PENDING").toUpperCase(),
        });
      }
    }
    return items;
  }, [files]);

  const patch = async (
    fileId: number,
    verification_status: "VERIFIED" | "REJECTED" | "PENDING",
    entry_id?: string
  ) => {
    const key = `${fileId}:${entry_id ?? "-"}`;
    setBusyKey(key);
    try {
      const res = await fetch(`/api/merchant/stores/${storeId}/media/${fileId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ verification_status, ...(entry_id ? { entry_id } : {}) }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.success) {
        toast.error(typeof data?.error === "string" ? data.error : "Update failed");
        return;
      }
      onUpdated?.();
    } finally {
      setBusyKey(null);
    }
  };

  const closePreview = useCallback(() => setPreviewIndex(null), []);
  const goPrev = useCallback(() => {
    setPreviewIndex((i) => (i == null || previewItems.length === 0 ? i : (i - 1 + previewItems.length) % previewItems.length));
  }, [previewItems.length]);
  const goNext = useCallback(() => {
    setPreviewIndex((i) => (i == null || previewItems.length === 0 ? i : (i + 1) % previewItems.length));
  }, [previewItems.length]);

  useEffect(() => {
    if (previewIndex == null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closePreview();
      if (e.key === "ArrowLeft") goPrev();
      if (e.key === "ArrowRight") goNext();
    };
    window.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [previewIndex, closePreview, goPrev, goNext]);

  // Keep index valid after accept/reject refresh
  useEffect(() => {
    if (previewIndex == null) return;
    if (previewItems.length === 0) {
      setPreviewIndex(null);
      return;
    }
    if (previewIndex >= previewItems.length) setPreviewIndex(previewItems.length - 1);
  }, [previewIndex, previewItems.length]);

  if (!files.length) return null;

  const imageGroups = files.filter((f) => f.reference_images && f.reference_images.length > 0);
  const otherFiles = files.filter((f) => !(f.reference_images && f.reference_images.length > 0));
  const showGroupLabels = imageGroups.length > 1;
  const activePreview = previewIndex != null ? previewItems[previewIndex] : null;
  const previewBusy =
    activePreview != null ? busyKey === `${activePreview.fileId}:${activePreview.entryId}` : false;

  const body = (
    <div className="space-y-4">
      {previewItems.length > 0 && (
        <div className="space-y-3">
          {imageGroups.map((f) => {
            const imgs = f.reference_images!;
            return (
              <div key={f.id} className="space-y-2">
                {showGroupLabels && (
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-slate-500">
                      {sourceEntityLabel(f.source_entity)}
                    </p>
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold tabular-nums text-slate-600">
                      {imgs.length}
                    </span>
                  </div>
                )}
                <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4">
                  {imgs.map((img) => {
                    const st = (img.verification_status || "PENDING").toUpperCase();
                    const key = `${f.id}:${img.id}`;
                    const busy = busyKey === key;
                    const showActions = st !== "VERIFIED";
                    const rejectedAwaitingReupload = st === "REJECTED";
                    const reuploadedNeedsReview = st === "REUPLOADED";
                    const flatIndex = previewItems.findIndex(
                      (p) => p.fileId === f.id && p.entryId === img.id
                    );
                    return (
                      <article
                        key={img.id}
                        className="group overflow-hidden rounded-xl border border-slate-200/90 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition hover:border-indigo-200 hover:shadow-md"
                      >
                        <button
                          type="button"
                          onClick={() => flatIndex >= 0 && setPreviewIndex(flatIndex)}
                          className="relative block aspect-[3/4] w-full cursor-zoom-in overflow-hidden bg-slate-900/5 text-left"
                          title="Open preview"
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={img.url}
                            alt={img.file_name || "Menu reference"}
                            className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.03]"
                          />
                          <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/55 via-transparent to-black/15" />
                          <div className="absolute left-2 top-2">
                            <StatusPill st={st} tone="dark" />
                          </div>
                          <span className="absolute right-2 top-2 inline-flex h-7 w-7 items-center justify-center rounded-full bg-white/90 text-slate-700 opacity-0 shadow-sm transition group-hover:opacity-100">
                            <Eye className="h-3.5 w-3.5" aria-hidden />
                          </span>
                          <div className="absolute inset-x-0 bottom-0 p-2">
                            <p
                              className="truncate text-[11px] font-semibold text-white"
                              title={img.file_name || img.url}
                            >
                              {img.file_name || "Menu image"}
                            </p>
                            <p className="mt-0.5 text-[10px] font-medium text-white/80">
                              Click to preview
                            </p>
                          </div>
                        </button>

                        <div className="border-t border-slate-100 p-1.5">
                          {interactive && showActions && rejectedAwaitingReupload ? (
                            <p className="px-1 py-1 text-[10px] leading-snug text-slate-500">
                              Waiting for re-upload
                            </p>
                          ) : interactive && showActions ? (
                            <div className="flex items-center gap-1">
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => patch(f.id, "VERIFIED", img.id)}
                                className="inline-flex min-w-0 flex-1 cursor-pointer items-center justify-center gap-0.5 rounded-md bg-emerald-600 px-1.5 py-1.5 text-[10px] font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                              >
                                {busy ? (
                                  <Loader2 className="h-3 w-3 animate-spin" />
                                ) : (
                                  <Check className="h-3 w-3" aria-hidden />
                                )}
                                {reuploadedNeedsReview ? "Verify" : "Accept"}
                              </button>
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => patch(f.id, "REJECTED", img.id)}
                                className="inline-flex min-w-0 flex-1 cursor-pointer items-center justify-center gap-0.5 rounded-md border border-red-200 bg-red-50 px-1.5 py-1.5 text-[10px] font-semibold text-red-800 hover:bg-red-100 disabled:opacity-50"
                              >
                                <X className="h-3 w-3" aria-hidden />
                                Reject
                              </button>
                              {st !== "PENDING" && !reuploadedNeedsReview && (
                                <button
                                  type="button"
                                  disabled={busy}
                                  title="Reset"
                                  onClick={() => patch(f.id, "PENDING", img.id)}
                                  className="inline-flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-md border border-slate-200 text-slate-500 hover:bg-slate-50 disabled:opacity-50"
                                >
                                  <RotateCcw className="h-3 w-3" aria-hidden />
                                </button>
                              )}
                            </div>
                          ) : st === "VERIFIED" ? (
                            <p className="px-1 py-1 text-center text-[10px] font-medium text-emerald-700">
                              Accepted
                            </p>
                          ) : null}
                        </div>
                      </article>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {otherFiles.length > 0 && (
        <div className="space-y-2">
          {otherFiles.map((f) => {
            const href = openHrefForNonImage(f);
            const rowSt = (f.verification_status || "PENDING").toUpperCase();
            const rowKey = `${f.id}:-`;
            const rowBusy = busyKey === rowKey;

            return (
              <div
                key={f.id}
                className="flex flex-col gap-2 rounded-xl border border-slate-200/90 bg-slate-50/60 px-3 py-2.5 sm:flex-row sm:items-center"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-[13px] font-semibold text-slate-900">
                      {sourceEntityLabel(f.source_entity)}
                    </p>
                    <StatusPill st={rowSt} />
                  </div>
                  <p className="mt-0.5 truncate text-[12px] text-slate-500" title={f.original_file_name || ""}>
                    {f.original_file_name || f.r2_key || `File ${f.id}`}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  {href ? (
                    <a
                      href={href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex cursor-pointer items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-slate-700 hover:bg-slate-50"
                    >
                      <ExternalLink className="h-3 w-3" />
                      Open
                    </a>
                  ) : null}
                  {interactive && rowSt !== "VERIFIED" && rowSt !== "REJECTED" && (
                    <>
                      <button
                        type="button"
                        disabled={rowBusy}
                        onClick={() => patch(f.id, "VERIFIED")}
                        className="inline-flex cursor-pointer items-center gap-1 rounded-lg bg-emerald-600 px-2.5 py-1.5 text-[11px] font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                      >
                        {rowBusy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                        Accept
                      </button>
                      <button
                        type="button"
                        disabled={rowBusy}
                        onClick={() => patch(f.id, "REJECTED")}
                        className="inline-flex cursor-pointer items-center gap-1 rounded-lg border border-red-200 bg-red-50 px-2.5 py-1.5 text-[11px] font-semibold text-red-800 hover:bg-red-100 disabled:opacity-50"
                      >
                        <X className="h-3 w-3" />
                        Reject
                      </button>
                    </>
                  )}
                  {interactive && rowSt === "REJECTED" && (
                    <p className="text-[11px] text-slate-500">Waiting for re-upload</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {activePreview != null && previewIndex != null && (
        <div
          className="fixed inset-0 z-[90] flex flex-col bg-black/95"
          role="dialog"
          aria-modal="true"
          aria-label="Menu image preview"
        >
          <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-white/10 px-3 py-2.5 sm:px-4">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-white">{activePreview.fileName}</p>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <StatusPill st={activePreview.status} tone="dark" />
                <span className="text-[11px] text-white/60">
                  {previewIndex + 1} / {previewItems.length}
                </span>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              {interactive && activePreview.status !== "VERIFIED" && activePreview.status !== "REJECTED" && (
                <>
                  <button
                    type="button"
                    disabled={previewBusy}
                    onClick={() =>
                      void patch(activePreview.fileId, "VERIFIED", activePreview.entryId)
                    }
                    className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                  >
                    {previewBusy ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Check className="h-3.5 w-3.5" />
                    )}
                    Accept
                  </button>
                  <button
                    type="button"
                    disabled={previewBusy}
                    onClick={() =>
                      void patch(activePreview.fileId, "REJECTED", activePreview.entryId)
                    }
                    className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-red-400/70 bg-red-950/50 px-3 py-1.5 text-xs font-semibold text-red-100 hover:bg-red-900/60 disabled:opacity-50"
                  >
                    <X className="h-3.5 w-3.5" />
                    Reject
                  </button>
                </>
              )}
              <a
                href={activePreview.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex cursor-pointer items-center gap-1 rounded-lg border border-white/25 bg-white/10 px-3 py-1.5 text-xs font-medium text-white hover:bg-white/20"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                Open
              </a>
              <button
                type="button"
                onClick={closePreview}
                className="inline-flex cursor-pointer items-center gap-1 rounded-lg border border-white/25 bg-white/10 px-3 py-1.5 text-xs font-medium text-white hover:bg-white/20"
              >
                <X className="h-4 w-4" />
                Close
              </button>
            </div>
          </div>

          <div className="relative flex min-h-0 flex-1 items-center justify-center p-3 sm:p-6">
            {previewItems.length > 1 && (
              <>
                <button
                  type="button"
                  onClick={goPrev}
                  className="absolute left-2 top-1/2 z-10 inline-flex h-10 w-10 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full border border-white/20 bg-black/40 text-white hover:bg-black/60 sm:left-4"
                  aria-label="Previous image"
                >
                  <ChevronLeft className="h-5 w-5" />
                </button>
                <button
                  type="button"
                  onClick={goNext}
                  className="absolute right-2 top-1/2 z-10 inline-flex h-10 w-10 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full border border-white/20 bg-black/40 text-white hover:bg-black/60 sm:right-4"
                  aria-label="Next image"
                >
                  <ChevronRight className="h-5 w-5" />
                </button>
              </>
            )}
            <button
              type="button"
              className="absolute inset-0 cursor-default"
              aria-label="Close preview backdrop"
              onClick={closePreview}
            />
            <div
              className="relative z-[1] flex max-h-full max-w-full items-center justify-center"
              onClick={(e) => e.stopPropagation()}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={activePreview.url}
                alt={activePreview.fileName}
                className="max-h-[calc(100vh-6.5rem)] max-w-[min(100vw-2rem,56rem)] object-contain"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );

  if (embedded) return body;

  return (
    <div className="mt-3 border-t border-gray-100 pt-2.5">
      <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-gray-500">
        Menu files (images, CSV, XLS, PDF)
      </p>
      {body}
    </div>
  );
}
