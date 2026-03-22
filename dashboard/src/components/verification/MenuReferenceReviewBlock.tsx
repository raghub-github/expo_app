"use client";

import React, { useState } from "react";
import { ExternalLink, Loader2 } from "lucide-react";
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

export function MenuReferenceReviewBlock({
  storeId,
  files,
  onUpdated,
  interactive,
}: {
  storeId: number;
  files: MenuMediaFile[];
  onUpdated?: () => void;
  interactive: boolean;
}) {
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const patch = async (fileId: number, verification_status: "VERIFIED" | "REJECTED" | "PENDING", entry_id?: string) => {
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

  if (!files.length) return null;

  return (
    <div className="mt-3 border-t border-gray-100 pt-2">
      <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-gray-500">
        Menu files (images, CSV, XLS, PDF)
      </p>
      <div className="space-y-4">
        {files.map((f) => {
          const imgs = f.reference_images && f.reference_images.length > 0 ? f.reference_images : null;
          if (imgs) {
            return (
              <div key={f.id} className="rounded-lg border border-gray-200 bg-gray-50/40 p-3">
                <p className="mb-2 text-[11px] font-medium text-gray-700">{sourceEntityLabel(f.source_entity)}</p>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {imgs.map((img) => {
                    const st = (img.verification_status || "PENDING").toUpperCase();
                    const key = `${f.id}:${img.id}`;
                    const busy = busyKey === key;
                    const showActions = st !== "VERIFIED";
                    const rejectedAwaitingReupload = st === "REJECTED";
                    const reuploadedNeedsReview = st === "REUPLOADED";
                    return (
                      <div
                        key={img.id}
                        className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm"
                      >
                        <a href={img.url} target="_blank" rel="noopener noreferrer" className="block bg-gray-100">
                          <img
                            src={img.url}
                            alt={img.file_name || "Menu reference"}
                            className="mx-auto max-h-52 w-full object-contain"
                          />
                        </a>
                        <div className="space-y-2 p-2">
                          <p className="truncate text-[11px] font-medium text-gray-800" title={img.file_name || img.url}>
                            {img.file_name || "Image"}
                          </p>
                          <div className="flex flex-wrap items-center gap-1.5">
                            {st === "VERIFIED" && (
                              <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-medium text-emerald-800">
                                Accepted
                              </span>
                            )}
                            {st === "REJECTED" && (
                              <span className="rounded bg-red-100 px-1.5 py-0.5 text-[10px] font-medium text-red-800">
                                Rejected
                              </span>
                            )}
                            {st === "REUPLOADED" && (
                              <span className="rounded bg-indigo-100 px-1.5 py-0.5 text-[10px] font-medium text-indigo-900">
                                Reuploaded
                              </span>
                            )}
                            {st === "PENDING" && (
                              <span className="rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-900">
                                Pending
                              </span>
                            )}
                          </div>
                          {interactive && showActions && rejectedAwaitingReupload && (
                            <div className="space-y-1.5">
                              <p className="text-[10px] leading-snug text-gray-500">
                                The merchant must replace this image from the partner site before you can verify it again.
                              </p>
                              <div className="flex flex-wrap gap-1.5">
                                <button
                                  type="button"
                                  disabled
                                  title="Available after the merchant re-uploads this menu image"
                                  className="inline-flex flex-1 cursor-not-allowed items-center justify-center gap-1 rounded border border-gray-200 bg-gray-50 px-2 py-1 text-[10px] font-semibold text-gray-400"
                                >
                                  Verify again
                                </button>
                                <span
                                  className="inline-flex flex-1 items-center justify-center rounded border border-red-200 bg-red-50/80 px-2 py-1 text-[10px] font-semibold text-red-800"
                                  title="Rejected — waiting for a new upload"
                                >
                                  Rejected
                                </span>
                              </div>
                            </div>
                          )}
                          {interactive && showActions && !rejectedAwaitingReupload && (
                            <div className="flex flex-wrap gap-1.5">
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => patch(f.id, "VERIFIED", img.id)}
                                className="inline-flex flex-1 cursor-pointer items-center justify-center gap-1 rounded border border-emerald-600 bg-emerald-50 px-2 py-1 text-[10px] font-semibold text-emerald-900 hover:bg-emerald-100 disabled:opacity-50"
                              >
                                {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
                                {reuploadedNeedsReview ? "Verify again" : "Accept"}
                              </button>
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => patch(f.id, "REJECTED", img.id)}
                                className="inline-flex flex-1 cursor-pointer items-center justify-center gap-1 rounded border border-red-500 bg-red-50 px-2 py-1 text-[10px] font-semibold text-red-900 hover:bg-red-100 disabled:opacity-50"
                              >
                                Reject
                              </button>
                              {st !== "PENDING" && !reuploadedNeedsReview && (
                                <button
                                  type="button"
                                  disabled={busy}
                                  onClick={() => patch(f.id, "PENDING", img.id)}
                                  className="w-full cursor-pointer rounded border border-gray-300 bg-white px-2 py-1 text-[10px] font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                                >
                                  Reset
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          }

          const href = openHrefForNonImage(f);
          const rowSt = (f.verification_status || "PENDING").toUpperCase();
          const rowKey = `${f.id}:-`;
          const rowBusy = busyKey === rowKey;

          return (
            <div key={f.id} className="rounded-lg border border-gray-200 bg-gray-50/40 p-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] font-medium text-gray-700">{sourceEntityLabel(f.source_entity)}</p>
                  <p className="mt-0.5 truncate text-[11px] text-gray-600" title={f.original_file_name || ""}>
                    {f.original_file_name || f.r2_key || `File ${f.id}`}
                  </p>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {rowSt === "VERIFIED" && (
                      <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-medium text-emerald-800">
                        Accepted
                      </span>
                    )}
                    {rowSt === "REJECTED" && (
                      <span className="rounded bg-red-100 px-1.5 py-0.5 text-[10px] font-medium text-red-800">
                        Rejected
                      </span>
                    )}
                    {rowSt === "PENDING" && (
                      <span className="rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-900">
                        Pending
                      </span>
                    )}
                  </div>
                </div>
                {href ? (
                  <a
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex shrink-0 cursor-pointer items-center gap-1 rounded bg-indigo-600 px-2.5 py-1.5 text-[11px] font-medium text-white hover:bg-indigo-700"
                  >
                    <ExternalLink className="h-3 w-3" />
                    Open
                  </a>
                ) : (
                  <span className="text-[10px] text-gray-400">No link</span>
                )}
              </div>
              {interactive && rowSt !== "VERIFIED" && rowSt === "REJECTED" && (
                <div className="mt-2 space-y-1.5">
                  <p className="text-[10px] leading-snug text-gray-500">
                    The merchant must upload a new file from the partner site before you can verify this menu document again.
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    <button
                      type="button"
                      disabled
                      title="Available after the merchant re-uploads this file"
                      className="inline-flex flex-1 cursor-not-allowed items-center justify-center gap-1 rounded border border-gray-200 bg-gray-50 px-2 py-1 text-[10px] font-semibold text-gray-400"
                    >
                      Verify again
                    </button>
                    <span
                      className="inline-flex flex-1 items-center justify-center rounded border border-red-200 bg-red-50/80 px-2 py-1 text-[10px] font-semibold text-red-800"
                      title="Rejected — waiting for a new upload"
                    >
                      Rejected
                    </span>
                  </div>
                </div>
              )}
              {interactive && rowSt !== "VERIFIED" && rowSt !== "REJECTED" && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <button
                    type="button"
                    disabled={rowBusy}
                    onClick={() => patch(f.id, "VERIFIED")}
                    className="inline-flex flex-1 cursor-pointer items-center justify-center gap-1 rounded border border-emerald-600 bg-emerald-50 px-2 py-1 text-[10px] font-semibold text-emerald-900 hover:bg-emerald-100 disabled:opacity-50"
                  >
                    {rowBusy ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
                    Accept
                  </button>
                  <button
                    type="button"
                    disabled={rowBusy}
                    onClick={() => patch(f.id, "REJECTED")}
                    className="inline-flex flex-1 cursor-pointer items-center justify-center gap-1 rounded border border-red-500 bg-red-50 px-2 py-1 text-[10px] font-semibold text-red-900 hover:bg-red-100 disabled:opacity-50"
                  >
                    Reject
                  </button>
                  {rowSt !== "PENDING" && (
                    <button
                      type="button"
                      disabled={rowBusy}
                      onClick={() => patch(f.id, "PENDING")}
                      className="w-full cursor-pointer rounded border border-gray-300 bg-white px-2 py-1 text-[10px] font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                    >
                      Reset
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
