"use client";

import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2, RefreshCw, ImageIcon } from "lucide-react";
import { useAppSearchParams } from "@/hooks/useAppSearchParams";
import { R2Image } from "@/components/ui/R2Image";
import { MenuItemPhotoCustomerPreview } from "@/components/merchant/MenuItemPhotoCustomerPreview";
import {
  dispatchMenuReviewQueueRefresh,
  MERCHANT_MENU_REVIEW_QUEUE_REFRESH_EVENT,
  type MenuReviewPhotoItem,
  type MenuReviewQueueSummary,
} from "@/lib/merchant/menu-review-queue";
import { parsePortalParam } from "@/lib/merchants/portal-preference";

const PHOTO_REJECT_PRESETS = [
  "Image is blurry or low quality",
  "Dish is not clearly visible",
  "Image contains watermark or promotional text",
  "Wrong dish photo uploaded",
  "Image does not match item name/description",
] as const;

type ChangeRequestRow = {
  id: number;
  store_id: number;
  menu_item_id: number | null;
  request_type: string;
  status: string;
  requested_payload: Record<string, unknown>;
  current_snapshot: Record<string, unknown> | null;
  reason: string | null;
  created_by: string;
  created_by_role: string | null;
  reviewed_by: string | null;
  reviewed_reason: string | null;
  created_at: string;
  updated_at: string;
  item_name: string | null;
  menu_item_public_id: string | null;
};

export default function MenuRequestsPage() {
  const router = useRouter();
  const searchParams = useAppSearchParams();
  const portal = parsePortalParam(searchParams.get("portal"));

  const [requests, setRequests] = useState<ChangeRequestRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>("PENDING");
  const [actioningId, setActioningId] = useState<number | null>(null);
  const [rejectReason, setRejectReason] = useState<Record<number, string>>({});
  const [showRejectModal, setShowRejectModal] = useState<number | null>(null);
  const [reviewSummary, setReviewSummary] = useState<MenuReviewQueueSummary | null>(null);
  const [photosLoading, setPhotosLoading] = useState(true);
  const [photoReviewItem, setPhotoReviewItem] = useState<MenuReviewPhotoItem | null>(null);
  const [photoRejectReason, setPhotoRejectReason] = useState("");
  const [photoRejectError, setPhotoRejectError] = useState<string | null>(null);
  const [photoActionLoading, setPhotoActionLoading] = useState<"APPROVE" | "REJECT" | null>(null);
  const [activeTab, setActiveTab] = useState<"images" | "changes">("images");

  useEffect(() => {
    if (portal === "merchant") {
      router.replace("/dashboard/merchants?portal=merchant");
    }
  }, [portal, router]);

  const fetchReviewSummary = useCallback(() => {
    setPhotosLoading(true);
    fetch("/api/merchant-menu/review-queue-summary")
      .then((r) => (r.ok ? r.json() : null))
      .then((body) => {
        if (!body?.success) return;
        setReviewSummary({
          pending_change_requests: Number(body.pending_change_requests ?? 0),
          pending_photo_reviews: Number(body.pending_photo_reviews ?? 0),
          total_pending: Number(body.total_pending ?? 0),
          photo_items: Array.isArray(body.photo_items) ? body.photo_items : [],
        });
      })
      .catch(() => setReviewSummary(null))
      .finally(() => setPhotosLoading(false));
  }, []);

  const fetchRequests = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: "50", offset: "0" });
      if (statusFilter) params.set("status", statusFilter);
      const res = await fetch(`/api/merchant-menu/change-requests?${params}`);
      const data = await res.json();
      if (data.success && Array.isArray(data.change_requests)) {
        setRequests(data.change_requests);
        setTotal(data.total ?? data.change_requests.length);
      }
    } catch {
      setRequests([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchRequests();
    fetchReviewSummary();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter]);

  useEffect(() => {
    const onRefresh = () => fetchReviewSummary();
    window.addEventListener(MERCHANT_MENU_REVIEW_QUEUE_REFRESH_EVENT, onRefresh);
    return () => window.removeEventListener(MERCHANT_MENU_REVIEW_QUEUE_REFRESH_EVENT, onRefresh);
  }, [fetchReviewSummary]);

  const photoItems: MenuReviewPhotoItem[] = reviewSummary?.photo_items ?? [];

  const removePhotoFromReviewQueue = (itemId: number) => {
    setReviewSummary((prev) => {
      if (!prev) return prev;
      const photo_items = (prev.photo_items ?? []).filter((row) => Number(row.id) !== Number(itemId));
      const pending_photo_reviews = photo_items.length;
      return {
        ...prev,
        photo_items,
        pending_photo_reviews,
        total_pending: Number(prev.pending_change_requests ?? 0) + pending_photo_reviews,
      };
    });
  };

  const closePhotoSheet = () => {
    setPhotoReviewItem(null);
    setPhotoRejectReason("");
    setPhotoRejectError(null);
  };

  const handleApprove = async (id: number) => {
    setActioningId(id);
    try {
      const res = await fetch(`/api/merchant-menu/change-requests/${id}/approve`, { method: "POST" });
      const data = await res.json();
      if (data.success) {
        await fetchRequests();
        fetchReviewSummary();
        dispatchMenuReviewQueueRefresh();
      } else {
        alert(data.error || "Approve failed");
      }
    } catch (e) {
      alert(e instanceof Error ? e.message : "Approve failed");
    } finally {
      setActioningId(null);
    }
  };

  const handleReject = async (id: number) => {
    const reason = rejectReason[id] ?? "";
    setActioningId(id);
    try {
      const res = await fetch(`/api/merchant-menu/change-requests/${id}/reject`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reviewed_reason: reason || null }),
      });
      const data = await res.json();
      if (data.success) {
        setShowRejectModal(null);
        setRejectReason((prev) => ({ ...prev, [id]: "" }));
        await fetchRequests();
        fetchReviewSummary();
        dispatchMenuReviewQueueRefresh();
      } else {
        alert(data.error || "Reject failed");
      }
    } catch (e) {
      alert(e instanceof Error ? e.message : "Reject failed");
    } finally {
      setActioningId(null);
    }
  };

  const handleApprovePhoto = async (item: MenuReviewPhotoItem) => {
    const storeId = Number(item.store_id);
    if (!Number.isFinite(storeId) || storeId < 1) {
      alert("Store id missing for this photo.");
      return;
    }
    setPhotoActionLoading("APPROVE");
    try {
      const res = await fetch(`/api/merchant/stores/${storeId}/menu/items/${item.id}/approval`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ approval_status: "APPROVED" }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data?.success === false) throw new Error(data?.error || "Approve failed");
      removePhotoFromReviewQueue(item.id);
      closePhotoSheet();
      fetchReviewSummary();
      dispatchMenuReviewQueueRefresh();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Approve failed");
    } finally {
      setPhotoActionLoading(null);
    }
  };

  const handleRejectPhoto = async (item: MenuReviewPhotoItem) => {
    const storeId = Number(item.store_id);
    if (!Number.isFinite(storeId) || storeId < 1) {
      alert("Store id missing for this photo.");
      return;
    }
    const reason = photoRejectReason.trim();
    if (reason.length < 3) {
      setPhotoRejectError("Rejection reason is required (min 3 characters).");
      return;
    }
    setPhotoRejectError(null);
    setPhotoActionLoading("REJECT");
    try {
      const res = await fetch(`/api/merchant/stores/${storeId}/menu/items/${item.id}/approval`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ approval_status: "REJECTED", rejection_reason: reason }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data?.success === false) throw new Error(data?.error || "Reject failed");
      removePhotoFromReviewQueue(item.id);
      closePhotoSheet();
      fetchReviewSummary();
      dispatchMenuReviewQueueRefresh();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Reject failed");
    } finally {
      setPhotoActionLoading(null);
    }
  };

  if (portal === "merchant") {
    return (
      <div className="flex min-h-[40vh] items-center justify-center bg-slate-50">
        <Loader2 className="h-7 w-7 animate-spin text-gray-400" />
      </div>
    );
  }

  const rowBorder = "border-b-[0.5px] border-[#121212]/10";
  const photoCount = reviewSummary?.pending_photo_reviews ?? 0;
  const changeCount = reviewSummary?.pending_change_requests ?? 0;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="rounded-md bg-amber-50 px-2 py-1 text-[10px] font-semibold text-amber-900">
            {reviewSummary?.total_pending ?? 0} total pending
          </span>
          <span className="rounded-md bg-purple-50 px-2 py-1 text-[10px] font-semibold text-purple-800">
            {photoCount} image
          </span>
          <span className="rounded-md bg-[#F3F7FA] px-2 py-1 text-[10px] font-semibold text-[#121212]/65">
            {changeCount} changes
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="h-8 cursor-pointer rounded-lg border border-[#121212]/12 bg-white px-2.5 text-xs text-[#121212]"
            aria-label="Filter by status"
          >
            <option value="">Status: All</option>
            <option value="PENDING">Status: Pending</option>
            <option value="APPROVED">Status: Approved</option>
            <option value="REJECTED">Status: Rejected</option>
          </select>
          <div className="inline-flex rounded-lg border border-[#121212]/12 bg-white p-0.5">
            <button
              type="button"
              onClick={() => setActiveTab("images")}
              className={`inline-flex cursor-pointer items-center gap-1.5 rounded-md px-3 py-1.5 text-[11px] font-semibold transition-colors ${
                activeTab === "images"
                  ? "bg-[#121212] text-white"
                  : "text-[#121212]/65 hover:bg-[#F7F7F7]"
              }`}
            >
              <ImageIcon className="h-3.5 w-3.5" aria-hidden />
              Image review
              {photoCount > 0 ? (
                <span
                  className={`rounded px-1 py-0.5 text-[9px] font-bold ${
                    activeTab === "images" ? "bg-white/20 text-white" : "bg-purple-100 text-purple-800"
                  }`}
                >
                  {photoCount}
                </span>
              ) : null}
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("changes")}
              className={`inline-flex cursor-pointer items-center gap-1.5 rounded-md px-3 py-1.5 text-[11px] font-semibold transition-colors ${
                activeTab === "changes"
                  ? "bg-[#121212] text-white"
                  : "text-[#121212]/65 hover:bg-[#F7F7F7]"
              }`}
            >
              Changes Review
              {changeCount > 0 ? (
                <span
                  className={`rounded px-1 py-0.5 text-[9px] font-bold ${
                    activeTab === "changes" ? "bg-white/20 text-white" : "bg-amber-100 text-amber-900"
                  }`}
                >
                  {changeCount}
                </span>
              ) : null}
            </button>
          </div>
          <button
            type="button"
            onClick={() => {
              void fetchRequests();
              fetchReviewSummary();
            }}
            disabled={loading || photosLoading}
            className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-lg border border-[#121212]/12 bg-white px-2.5 text-[11px] font-semibold text-[#121212] hover:bg-[#F7F7F7] disabled:opacity-50"
          >
            <RefreshCw
              className={`h-3.5 w-3.5 ${loading || photosLoading ? "animate-spin" : ""}`}
            />
            Refresh
          </button>
        </div>
      </div>

      {activeTab === "images" ? (
        <div className="min-h-0 flex-1 overflow-auto bg-white">
          {photosLoading ? (
            <div className="flex items-center justify-center py-12 text-[#121212]/45">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Loading…
            </div>
          ) : photoItems.length === 0 ? (
            <div className="px-3 py-12 text-center text-sm text-[#121212]/50">
              No pending photo reviews.
            </div>
          ) : (
            <table className="w-full min-w-[720px] border-collapse text-left text-sm">
              <thead className="text-[10px] font-semibold uppercase tracking-wide text-[#121212]/45">
                <tr>
                  <th className={`sticky top-0 z-10 bg-[#F7F7F7] px-3 py-2.5 ${rowBorder}`}>Photo</th>
                  <th className={`sticky top-0 z-10 bg-[#F7F7F7] px-3 py-2.5 ${rowBorder}`}>Item</th>
                  <th className={`sticky top-0 z-10 bg-[#F7F7F7] px-3 py-2.5 ${rowBorder}`}>Store</th>
                  <th className={`sticky top-0 z-10 bg-[#F7F7F7] px-3 py-2.5 text-right ${rowBorder}`}>
                    Action
                  </th>
                </tr>
              </thead>
              <tbody>
                {photoItems.map((item) => {
                  const key = `${item.store_id}:${item.id}`;
                  const storeHref = item.store_id
                    ? `/dashboard/merchants/stores/${item.store_id}/menu-change-requests?portal=admin`
                    : null;
                  return (
                    <tr key={key} className="bg-white hover:bg-[#FAFAFA]">
                      <td className={`px-3 py-2.5 ${rowBorder}`}>
                        <button
                          type="button"
                          onClick={() => {
                            setPhotoRejectReason("");
                            setPhotoRejectError(null);
                            setPhotoReviewItem(item);
                          }}
                          className="h-11 w-11 cursor-pointer overflow-hidden rounded-md border-[0.5px] border-[#121212]/15 bg-[#F7F7F7]"
                        >
                          <R2Image
                            src={item.item_image_url}
                            alt={item.item_name}
                            className="h-full w-full object-cover"
                          />
                        </button>
                      </td>
                      <td className={`px-3 py-2.5 ${rowBorder}`}>
                        <button
                          type="button"
                          onClick={() => {
                            setPhotoRejectReason("");
                            setPhotoRejectError(null);
                            setPhotoReviewItem(item);
                          }}
                          className="cursor-pointer truncate text-left text-[13px] font-medium text-[#121212] hover:underline"
                        >
                          {item.item_name}
                        </button>
                        {item.selling_price != null ? (
                          <p className="text-[11px] text-[#121212]/45">₹{item.selling_price}</p>
                        ) : null}
                      </td>
                      <td className={`px-3 py-2.5 text-[12px] text-[#121212]/65 ${rowBorder}`}>
                        {storeHref ? (
                          <Link href={storeHref} className="font-medium text-sky-700 hover:underline">
                            {item.store_name || item.store_public_id || `Store #${item.store_id}`}
                          </Link>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className={`px-3 py-2.5 text-right ${rowBorder}`}>
                        <button
                          type="button"
                          onClick={() => {
                            setPhotoRejectReason("");
                            setPhotoRejectError(null);
                            setPhotoReviewItem(item);
                          }}
                          className="cursor-pointer rounded-md bg-[#121212] px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-black"
                        >
                          Review
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col gap-2">
          {total > 0 ? (
            <p className="text-[10px] text-[#121212]/45">
              Showing {requests.length} of {total}
            </p>
          ) : null}

          <div className="min-h-0 flex-1 overflow-auto bg-white">
            {loading && requests.length === 0 ? (
              <div className="flex items-center justify-center py-12 text-[#121212]/45">
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Loading…
              </div>
            ) : requests.length === 0 ? (
              <div className="px-3 py-12 text-center text-sm text-[#121212]/50">
                No change requests found.
              </div>
            ) : (
              <table className="w-full min-w-[820px] border-collapse text-left text-sm">
                <thead className="text-[10px] font-semibold uppercase tracking-wide text-[#121212]/45">
                  <tr>
                    <th className={`sticky top-0 z-10 bg-[#F7F7F7] px-3 py-2.5 ${rowBorder}`}>Item</th>
                    <th className={`sticky top-0 z-10 bg-[#F7F7F7] px-3 py-2.5 ${rowBorder}`}>Type</th>
                    <th className={`sticky top-0 z-10 bg-[#F7F7F7] px-3 py-2.5 ${rowBorder}`}>
                      Status
                    </th>
                    <th className={`sticky top-0 z-10 bg-[#F7F7F7] px-3 py-2.5 ${rowBorder}`}>
                      Created
                    </th>
                    <th className={`sticky top-0 z-10 bg-[#F7F7F7] px-3 py-2.5 text-right ${rowBorder}`}>
                      Action
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {requests.map((r) => (
                    <tr key={r.id} className="bg-white hover:bg-[#FAFAFA]">
                      <td className={`px-3 py-2.5 ${rowBorder}`}>
                        <p className="truncate text-[13px] font-medium text-[#121212]">
                          {r.item_name ?? `Item #${r.menu_item_id}`}
                        </p>
                        {r.menu_item_public_id ? (
                          <p className="truncate font-mono text-[10px] text-[#121212]/40">
                            {r.menu_item_public_id}
                          </p>
                        ) : null}
                      </td>
                      <td className={`px-3 py-2.5 ${rowBorder}`}>
                        <span className="rounded-md border border-[#121212]/10 bg-[#F7F7F7] px-1.5 py-0.5 text-[10px] font-semibold uppercase text-[#121212]/65">
                          {r.request_type}
                        </span>
                      </td>
                      <td className={`px-3 py-2.5 ${rowBorder}`}>
                        <span
                          className={`inline-flex rounded-md px-1.5 py-0.5 text-[10px] font-semibold uppercase ${
                            r.status === "PENDING"
                              ? "bg-amber-50 text-amber-800"
                              : r.status === "APPROVED"
                                ? "bg-emerald-50 text-emerald-800"
                                : "bg-red-50 text-red-700"
                          }`}
                        >
                          {r.status}
                        </span>
                      </td>
                      <td className={`px-3 py-2.5 text-[11px] text-[#121212]/50 ${rowBorder}`}>
                        {r.created_at ? new Date(r.created_at).toLocaleString("en-IN") : "—"}
                      </td>
                      <td className={`px-3 py-2.5 text-right ${rowBorder}`}>
                        {r.status === "PENDING" ? (
                          <div className="inline-flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => setShowRejectModal(r.id)}
                              disabled={actioningId !== null}
                              className="cursor-pointer rounded-md border border-[#121212]/15 px-2 py-1 text-[11px] font-semibold text-[#121212] hover:bg-[#F7F7F7] disabled:opacity-50"
                            >
                              Reject
                            </button>
                            <button
                              type="button"
                              onClick={() => void handleApprove(r.id)}
                              disabled={actioningId !== null}
                              className="cursor-pointer rounded-md bg-emerald-600 px-2 py-1 text-[11px] font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                            >
                              {actioningId === r.id ? "…" : "Approve"}
                            </button>
                          </div>
                        ) : (
                          <span className="text-[11px] text-[#121212]/35">—</span>
                        )}
                        {showRejectModal === r.id ? (
                          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
                            <div className="w-full max-w-md rounded-lg bg-white p-4 shadow">
                              <h3 className="font-semibold text-[#121212]">Reject request</h3>
                              <p className="mt-1 text-sm text-[#121212]/50">
                                Optional reason (shown to merchant):
                              </p>
                              <textarea
                                value={rejectReason[r.id] ?? ""}
                                onChange={(e) =>
                                  setRejectReason((prev) => ({ ...prev, [r.id]: e.target.value }))
                                }
                                className="mt-2 w-full rounded border border-[#121212]/15 p-2 text-sm"
                                rows={3}
                                placeholder="e.g. Price change not allowed"
                              />
                              <div className="mt-4 flex justify-end gap-2">
                                <button
                                  type="button"
                                  onClick={() => setShowRejectModal(null)}
                                  className="cursor-pointer rounded border border-[#121212]/15 px-3 py-1.5 text-sm font-medium text-[#121212]"
                                >
                                  Cancel
                                </button>
                                <button
                                  type="button"
                                  onClick={() => void handleReject(r.id)}
                                  disabled={actioningId === r.id}
                                  className="cursor-pointer rounded bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
                                >
                                  {actioningId === r.id ? "Rejecting…" : "Reject"}
                                </button>
                              </div>
                            </div>
                          </div>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {photoReviewItem &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            className="fixed inset-0 z-[9998] flex items-stretch justify-end bg-black/40 backdrop-blur-sm"
            onClick={closePhotoSheet}
          >
            <div
              className="flex w-full max-w-lg flex-col border-l border-gray-200 bg-white shadow-xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
                <div className="min-w-0 pr-3">
                  <h2 className="text-sm font-bold text-gray-900">Review item photo</h2>
                  <p className="truncate text-[11px] text-gray-500">
                    {photoReviewItem.store_name ||
                      photoReviewItem.store_public_id ||
                      (photoReviewItem.store_id ? `Store #${photoReviewItem.store_id}` : "Store")}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={closePhotoSheet}
                  className="text-xs text-gray-500 hover:text-gray-800"
                >
                  Close
                </button>
              </div>
              <div className="flex-1 space-y-4 overflow-auto p-4 text-sm">
                <MenuItemPhotoCustomerPreview
                  item={{
                    item_name: photoReviewItem.item_name,
                    item_image_url: photoReviewItem.item_image_url,
                    selling_price: Number(photoReviewItem.selling_price ?? 0),
                  }}
                  storeId={photoReviewItem.store_id}
                />
                <div>
                  <label className="mb-1 block text-xs font-bold text-gray-700">
                    Rejection reason (required if rejecting)
                  </label>
                  <div className="mb-2 flex flex-wrap gap-1.5">
                    {PHOTO_REJECT_PRESETS.map((preset) => (
                      <button
                        key={preset}
                        type="button"
                        onClick={() => {
                          setPhotoRejectReason(preset);
                          setPhotoRejectError(null);
                        }}
                        className="rounded-md border border-gray-200 bg-gray-50 px-2 py-1 text-left text-[10px] font-medium text-gray-700 hover:bg-gray-100"
                      >
                        {preset}
                      </button>
                    ))}
                  </div>
                  <textarea
                    value={photoRejectReason}
                    onChange={(e) => {
                      setPhotoRejectReason(e.target.value);
                      if (photoRejectError) setPhotoRejectError(null);
                    }}
                    rows={2}
                    placeholder="Why is this photo being rejected?"
                    className={`w-full resize-y rounded-lg border px-3 py-2 text-sm text-gray-900 ${
                      photoRejectError ? "border-red-400 ring-1 ring-red-200" : "border-gray-300"
                    }`}
                  />
                  {photoRejectError ? (
                    <p className="mt-1 text-xs font-medium text-red-600">{photoRejectError}</p>
                  ) : null}
                </div>
              </div>
              <div className="flex items-center gap-2 border-t border-gray-200 px-4 py-3">
                <button
                  type="button"
                  onClick={() => void handleRejectPhoto(photoReviewItem)}
                  disabled={photoActionLoading !== null}
                  className="inline-flex flex-1 items-center justify-center rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs font-bold text-red-700 hover:bg-red-100 disabled:opacity-50"
                >
                  {photoActionLoading === "REJECT" ? "Rejecting…" : "Reject photo"}
                </button>
                <button
                  type="button"
                  onClick={() => void handleApprovePhoto(photoReviewItem)}
                  disabled={photoActionLoading !== null}
                  className="inline-flex flex-1 items-center justify-center rounded-md bg-green-600 px-3 py-2 text-xs font-bold text-white hover:bg-green-700 disabled:opacity-50"
                >
                  {photoActionLoading === "APPROVE" ? "Approving…" : "Approve photo"}
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}
