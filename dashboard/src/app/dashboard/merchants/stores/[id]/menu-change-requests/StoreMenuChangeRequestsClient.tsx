"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useQueryClient } from "@tanstack/react-query";
import { ImageIcon, Loader2, RefreshCw } from "lucide-react";
import { useToast } from "@/context/ToastContext";
import { useMerchantDashboardAccess } from "@/hooks/useMerchantDashboardAccess";
import { R2Image } from "@/components/ui/R2Image";
import { useStoreMenuQuery } from "@/hooks/queries/useMerchantStoreQueries";
import { queryKeys } from "@/lib/queryKeys";
import {
  dispatchMenuReviewQueueRefresh,
  MERCHANT_MENU_REVIEW_QUEUE_REFRESH_EVENT,
  type MenuReviewPhotoItem,
  type MenuReviewQueueSummary,
} from "@/lib/merchant/menu-review-queue";
import { ITEM_PLACEHOLDER_SVG, type MenuCategory, type MenuItem } from "../menu/menu-types";
import { MenuItemPhotoCustomerPreview } from "@/components/merchant/MenuItemPhotoCustomerPreview";
import {
  MenuChangeRequestReviewSheet,
  type MenuChangeRequestReviewRow,
} from "@/components/merchant/MenuChangeRequestReviewSheet";

const PHOTO_REJECT_PRESETS = [
  "Image is blurry or low quality",
  "Dish is not clearly visible",
  "Image contains watermark or promotional text",
  "Wrong dish photo uploaded",
  "Image does not match item name/description / QTY",
] as const;

type ChangeRequestRow = MenuChangeRequestReviewRow & {
  created_by?: string;
  created_by_role?: string | null;
  reviewed_by?: string | null;
  reviewed_reason?: string | null;
  updated_at?: string;
};

export function StoreMenuChangeRequestsClient({ storeId }: { storeId: string }) {
  const { toast } = useToast();
  const { canApproveMenuItems, isViewOnly } = useMerchantDashboardAccess();
  const canReviewMenu = canApproveMenuItems && !isViewOnly;
  const queryClient = useQueryClient();
  const menuQuery = useStoreMenuQuery(storeId);
  const data = menuQuery.data ?? null;

  const refreshMenu = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: queryKeys.merchantStore.menu(storeId) });
    await queryClient.refetchQueries({ queryKey: queryKeys.merchantStore.menu(storeId) });
  }, [queryClient, storeId]);

  const trackAudit = useCallback(
    (payload: {
      actionType: "VIEW" | "CREATE" | "UPDATE" | "DELETE";
      resourceType: string;
      resourceId?: string;
      actionDetails?: Record<string, unknown>;
      actionStatus?: "SUCCESS" | "FAILED";
      errorMessage?: string;
      requestMethod?: string;
    }) => {
      try {
        if (process.env.NODE_ENV === "development") return;
        if (typeof window === "undefined") return;
        void fetch("/api/audit/track", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            eventType: payload.actionType === "VIEW" ? "PAGE_VIEW" : "API_CALL",
            dashboardType: "MERCHANT",
            actionType: payload.actionType,
            resourceType: payload.resourceType,
            resourceId: payload.resourceId,
            actionDetails: payload.actionDetails ?? {},
            requestPath: window.location.pathname,
            requestMethod: payload.requestMethod ?? payload.actionType,
            actionStatus: payload.actionStatus ?? "SUCCESS",
            errorMessage: payload.errorMessage,
          }),
        });
      } catch {
        // never block UI
      }
    },
    []
  );

  const requestStoreKey = String(storeId || "").trim();

  const [crStatus, setCrStatus] = useState<"ALL" | "PENDING" | "APPROVED" | "REJECTED" | "CANCELLED">(
    "PENDING"
  );
  const [crType, setCrType] = useState<"ALL" | "CREATE" | "UPDATE" | "DELETE">("ALL");
  const [crLoading, setCrLoading] = useState(true);
  const [crTotal, setCrTotal] = useState(0);
  const [crActionLoadingId, setCrActionLoadingId] = useState<number | null>(null);
  const [changeRequests, setChangeRequests] = useState<ChangeRequestRow[]>([]);
  const [reviewSheet, setReviewSheet] = useState<ChangeRequestRow | null>(null);
  const [reviewSummary, setReviewSummary] = useState<MenuReviewQueueSummary | null>(null);
  const [photosLoading, setPhotosLoading] = useState(true);
  const [photoReviewItem, setPhotoReviewItem] = useState<MenuItem | null>(null);
  const [photoRejectReason, setPhotoRejectReason] = useState("");
  const [photoRejectError, setPhotoRejectError] = useState<string | null>(null);
  const [photoActionLoading, setPhotoActionLoading] = useState<"APPROVE" | "REJECT" | null>(null);
  const [activeTab, setActiveTab] = useState<"images" | "changes">("images");

  const menuItems = ((data as { items?: MenuItem[] } | null)?.items ?? []) as MenuItem[];
  const categories = ((data as { categories?: MenuCategory[] } | null)?.categories ??
    []) as MenuCategory[];

  const getCategoryLabel = useCallback(
    (categoryId: number | null | undefined) => {
      if (categoryId == null) return undefined;
      const cat = categories.find((c) => Number(c.id) === Number(categoryId));
      if (!cat) return undefined;
      if (cat.parent_category_id) {
        const parent = categories.find((c) => Number(c.id) === Number(cat.parent_category_id));
        return parent ? `${parent.category_name} (${cat.category_name})` : cat.category_name;
      }
      return cat.category_name;
    },
    [categories]
  );

  const pendingPhotoItems = useMemo(() => {
    const fromSummary = reviewSummary?.photo_items;
    if (Array.isArray(fromSummary)) {
      return fromSummary.map(
        (row): MenuItem => ({
          id: row.id,
          item_id: String(row.id),
          item_name: row.item_name,
          category_id: null,
          base_price: Number(row.selling_price ?? 0),
          selling_price: Number(row.selling_price ?? 0),
          discount_percentage: 0,
          item_image_url: row.item_image_url ?? "",
          approval_status: (row.approval_status as MenuItem["approval_status"]) ?? "PENDING",
          primary_image_moderation_status:
            (row.primary_image_moderation_status as MenuItem["primary_image_moderation_status"]) ??
            "PENDING",
        })
      );
    }
    return menuItems.filter((item) => {
      const hasImage =
        Boolean(item.item_image_url?.trim()) ||
        (Array.isArray(item.images) && item.images.some((img) => String(img.image_url ?? "").trim()));
      if (!hasImage) return false;
      return String(item.primary_image_moderation_status ?? "").toUpperCase() === "PENDING";
    });
  }, [reviewSummary?.photo_items, menuItems]);

  const removePhotoFromReviewQueue = useCallback((itemId: number) => {
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
  }, []);

  const fetchReviewSummary = useCallback(() => {
    const id = requestStoreKey;
    if (!id) return;
    setPhotosLoading(true);
    fetch(`/api/merchant-menu/review-queue-summary?storeId=${encodeURIComponent(id)}`, {
      credentials: "include",
      cache: "no-store",
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((body) => {
        if (!body?.success) return;
        setReviewSummary({
          pending_change_requests: Number(body.pending_change_requests ?? 0),
          pending_photo_reviews: Number(body.pending_photo_reviews ?? 0),
          total_pending: Number(body.total_pending ?? 0),
          photo_items: Array.isArray(body.photo_items) ? (body.photo_items as MenuReviewPhotoItem[]) : [],
        });
      })
      .catch(() => {
        /* keep last known summary */
      })
      .finally(() => setPhotosLoading(false));
  }, [requestStoreKey]);

  const fetchChangeRequests = useCallback(async () => {
    if (!requestStoreKey) return;
    setCrLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("storeId", requestStoreKey);
      if (crStatus !== "ALL") params.set("status", crStatus);
      if (crType !== "ALL") params.set("request_type", crType);
      params.set("limit", "50");
      params.set("offset", "0");
      const res = await fetch(`/api/merchant-menu/change-requests?${params.toString()}`);
      const d = await res.json().catch(() => null);
      const list = (d && Array.isArray(d.change_requests) ? d.change_requests : []) as ChangeRequestRow[];
      setChangeRequests(list);
      setCrTotal(Number(d?.total ?? list.length));
    } catch {
      setChangeRequests([]);
      setCrTotal(0);
    } finally {
      setCrLoading(false);
    }
  }, [requestStoreKey, crStatus, crType]);

  useEffect(() => {
    fetchReviewSummary();
  }, [fetchReviewSummary]);

  useEffect(() => {
    void fetchChangeRequests();
  }, [fetchChangeRequests]);

  useEffect(() => {
    const onRefresh = () => fetchReviewSummary();
    window.addEventListener(MERCHANT_MENU_REVIEW_QUEUE_REFRESH_EVENT, onRefresh);
    return () => window.removeEventListener(MERCHANT_MENU_REVIEW_QUEUE_REFRESH_EVENT, onRefresh);
  }, [fetchReviewSummary]);

  const openReviewSheet = (row: ChangeRequestRow) => {
    setReviewSheet(row);
  };

  const closePhotoSheet = () => {
    setPhotoReviewItem(null);
    setPhotoRejectReason("");
    setPhotoRejectError(null);
  };

  const openPhotoReview = (item: MenuItem) => {
    setPhotoRejectReason("");
    setPhotoRejectError(null);
    setPhotoReviewItem(item);
  };

  const handleApproveCr = async (id: number) => {
    if (!canReviewMenu) {
      toast("View-only access — approve/reject is disabled");
      return;
    }
    setCrActionLoadingId(id);
    try {
      const res = await fetch(`/api/merchant-menu/change-requests/${id}/approve`, { method: "POST" });
      const resData = await res.json().catch(() => ({}));
      if (!res.ok || resData?.success === false) throw new Error(resData?.error || "Approve failed");
      toast("Change request approved.");
      trackAudit({
        actionType: "UPDATE",
        resourceType: "merchant_menu_item_change_requests",
        resourceId: String(id),
        actionDetails: { action: "approve_change_request" },
        actionStatus: "SUCCESS",
        requestMethod: "POST",
      });
      setReviewSheet(null);
      await refreshMenu();
      await fetchChangeRequests();
      fetchReviewSummary();
      dispatchMenuReviewQueueRefresh();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Approve failed");
      trackAudit({
        actionType: "UPDATE",
        resourceType: "merchant_menu_item_change_requests",
        resourceId: String(id),
        actionDetails: { action: "approve_change_request" },
        actionStatus: "FAILED",
        errorMessage: e instanceof Error ? e.message : String(e),
        requestMethod: "POST",
      });
    } finally {
      setCrActionLoadingId(null);
    }
  };

  const handleRejectCr = async (id: number, reason: string) => {
    if (!canReviewMenu) {
      toast("View-only access — approve/reject is disabled");
      return;
    }
    if (reason.trim().length < 3) {
      toast("Add a rejection reason (min 3 characters).");
      return;
    }
    setCrActionLoadingId(id);
    try {
      const res = await fetch(`/api/merchant-menu/change-requests/${id}/reject`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reviewed_reason: reason.trim() }),
      });
      const resData = await res.json().catch(() => ({}));
      if (!res.ok || resData?.success === false) throw new Error(resData?.error || "Reject failed");
      toast("Change request rejected.");
      trackAudit({
        actionType: "UPDATE",
        resourceType: "merchant_menu_item_change_requests",
        resourceId: String(id),
        actionDetails: { action: "reject_change_request" },
        actionStatus: "SUCCESS",
        requestMethod: "POST",
      });
      setReviewSheet(null);
      await refreshMenu();
      await fetchChangeRequests();
      fetchReviewSummary();
      dispatchMenuReviewQueueRefresh();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Reject failed");
      trackAudit({
        actionType: "UPDATE",
        resourceType: "merchant_menu_item_change_requests",
        resourceId: String(id),
        actionDetails: { action: "reject_change_request" },
        actionStatus: "FAILED",
        errorMessage: e instanceof Error ? e.message : String(e),
        requestMethod: "POST",
      });
    } finally {
      setCrActionLoadingId(null);
    }
  };

  const handleApprovePhoto = async (item: MenuItem) => {
    if (!canReviewMenu) {
      toast("View-only access — approve/reject is disabled");
      return;
    }
    setPhotoActionLoading("APPROVE");
    try {
      const res = await fetch(`/api/merchant/stores/${storeId}/menu/items/${item.id}/approval`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ approval_status: "APPROVED" }),
      });
      const resData = await res.json().catch(() => ({}));
      if (!res.ok || resData?.success === false) throw new Error(resData?.error || "Approve failed");
      toast("Photo approved.");
      trackAudit({
        actionType: "UPDATE",
        resourceType: "merchant_menu_items",
        resourceId: String(item.id),
        actionDetails: { action: "approve_item_photo" },
        actionStatus: "SUCCESS",
        requestMethod: "PATCH",
      });
      removePhotoFromReviewQueue(item.id);
      closePhotoSheet();
      await refreshMenu();
      await new Promise((r) => setTimeout(r, 150));
      fetchReviewSummary();
      dispatchMenuReviewQueueRefresh();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Approve failed");
      trackAudit({
        actionType: "UPDATE",
        resourceType: "merchant_menu_items",
        resourceId: String(item.id),
        actionDetails: { action: "approve_item_photo" },
        actionStatus: "FAILED",
        errorMessage: e instanceof Error ? e.message : String(e),
        requestMethod: "PATCH",
      });
    } finally {
      setPhotoActionLoading(null);
    }
  };

  const handleRejectPhoto = async (item: MenuItem) => {
    if (!canReviewMenu) {
      toast("View-only access — approve/reject is disabled");
      return;
    }
    const reason = photoRejectReason.trim();
    if (reason.length < 3) {
      const message = "Rejection reason is required (min 3 characters).";
      setPhotoRejectError(message);
      toast(message);
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
      const resData = await res.json().catch(() => ({}));
      if (!res.ok || resData?.success === false) throw new Error(resData?.error || "Reject failed");
      toast(
        resData?.restored_previous_photo
          ? "Photo rejected. Previous approved image restored."
          : "Photo rejected."
      );
      trackAudit({
        actionType: "UPDATE",
        resourceType: "merchant_menu_items",
        resourceId: String(item.id),
        actionDetails: { action: "reject_item_photo", rejection_reason: reason },
        actionStatus: "SUCCESS",
        requestMethod: "PATCH",
      });
      removePhotoFromReviewQueue(item.id);
      closePhotoSheet();
      await refreshMenu();
      await new Promise((r) => setTimeout(r, 150));
      fetchReviewSummary();
      dispatchMenuReviewQueueRefresh();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Reject failed");
      trackAudit({
        actionType: "UPDATE",
        resourceType: "merchant_menu_items",
        resourceId: String(item.id),
        actionDetails: { action: "reject_item_photo" },
        actionStatus: "FAILED",
        errorMessage: e instanceof Error ? e.message : String(e),
        requestMethod: "PATCH",
      });
    } finally {
      setPhotoActionLoading(null);
    }
  };

  if (isViewOnly) {
    return (
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center bg-slate-50 px-6 py-16 text-center">
        <h1 className="text-lg font-bold text-gray-900">Menu change requests</h1>
        <p className="mt-2 max-w-md text-sm text-gray-500">
          You don’t have permission to view or review menu change requests for this store.
        </p>
      </div>
    );
  }

  const rowBorder = "border-b-[0.5px] border-[#121212]/10";
  const photoCount = reviewSummary?.pending_photo_reviews ?? pendingPhotoItems.length;
  const changeCount = reviewSummary?.pending_change_requests ?? 0;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 bg-white px-3 py-3 sm:px-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h1 className="text-lg font-bold text-[#121212] sm:text-xl">Menu change requests</h1>
          <p className="mt-0.5 text-sm text-[#121212]/55">
            Merchant edit/delete requests and uploaded photo reviews for this store.
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
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
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            value={crStatus}
            onChange={(e) => setCrStatus(e.target.value as typeof crStatus)}
            className="h-8 cursor-pointer rounded-lg border border-[#121212]/12 bg-white px-2.5 text-xs text-[#121212]"
            aria-label="Filter by status"
          >
            <option value="ALL">Status: All</option>
            <option value="PENDING">Status: Pending</option>
            <option value="APPROVED">Status: Approved</option>
            <option value="REJECTED">Status: Rejected</option>
            <option value="CANCELLED">Status: Cancelled</option>
          </select>
          {activeTab === "changes" ? (
            <select
              value={crType}
              onChange={(e) => setCrType(e.target.value as typeof crType)}
              className="h-8 cursor-pointer rounded-lg border border-[#121212]/12 bg-white px-2.5 text-xs text-[#121212]"
              aria-label="Filter by type"
            >
              <option value="ALL">Type: All</option>
              <option value="CREATE">Type: Add</option>
              <option value="UPDATE">Type: Edit</option>
              <option value="DELETE">Type: Delete</option>
            </select>
          ) : null}
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
              void fetchChangeRequests();
              fetchReviewSummary();
            }}
            disabled={crLoading || photosLoading}
            className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-lg border border-[#121212]/12 bg-white px-2.5 text-[11px] font-semibold text-[#121212] hover:bg-[#F7F7F7] disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${crLoading || photosLoading ? "animate-spin" : ""}`} />
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
          ) : pendingPhotoItems.length === 0 ? (
            <div className="px-3 py-12 text-center text-sm text-[#121212]/50">
              No pending photo reviews.
            </div>
          ) : (
            <table className="w-full min-w-[720px] border-collapse text-left text-sm">
              <thead className="text-[10px] font-semibold uppercase tracking-wide text-[#121212]/45">
                <tr>
                  <th className={`sticky top-0 z-10 bg-[#F7F7F7] px-3 py-2.5 ${rowBorder}`}>Photo</th>
                  <th className={`sticky top-0 z-10 bg-[#F7F7F7] px-3 py-2.5 ${rowBorder}`}>Item</th>
                  <th className={`sticky top-0 z-10 bg-[#F7F7F7] px-3 py-2.5 ${rowBorder}`}>
                    Status
                  </th>
                  <th className={`sticky top-0 z-10 bg-[#F7F7F7] px-3 py-2.5 text-right ${rowBorder}`}>
                    Action
                  </th>
                </tr>
              </thead>
              <tbody>
                {pendingPhotoItems.map((item) => {
                  const photoStatus = String(
                    item.primary_image_moderation_status || item.approval_status || "PENDING"
                  ).toUpperCase();
                  return (
                    <tr
                      key={item.id}
                      role="button"
                      tabIndex={0}
                      onClick={() => openPhotoReview(item)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          openPhotoReview(item);
                        }
                      }}
                      className="cursor-pointer bg-white hover:bg-[#FAFAFA]"
                    >
                      <td className={`px-3 py-2.5 ${rowBorder}`}>
                        <div className="h-11 w-11 overflow-hidden rounded-md border-[0.5px] border-[#121212]/15 bg-[#F7F7F7]">
                          <R2Image
                            src={item.item_image_url}
                            alt={item.item_name}
                            className="h-full w-full object-cover"
                            fallbackSrc={ITEM_PLACEHOLDER_SVG}
                          />
                        </div>
                      </td>
                      <td className={`px-3 py-2.5 ${rowBorder}`}>
                        <p className="truncate text-[13px] font-medium text-[#121212]">{item.item_name}</p>
                        <p className="text-[11px] text-[#121212]/45">₹{item.selling_price}</p>
                      </td>
                      <td className={`px-3 py-2.5 ${rowBorder}`}>
                        <span
                          className={`inline-flex rounded-md px-1.5 py-0.5 text-[10px] font-semibold uppercase ${
                            photoStatus === "APPROVED"
                              ? "bg-emerald-50 text-emerald-800"
                              : photoStatus === "REJECTED"
                                ? "bg-red-50 text-red-700"
                                : "bg-amber-50 text-amber-800"
                          }`}
                        >
                          {photoStatus === "PENDING" ? "Pending" : photoStatus}
                        </span>
                      </td>
                      <td className={`px-3 py-2.5 text-right ${rowBorder}`}>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            openPhotoReview(item);
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
          {crTotal > 0 ? (
            <p className="text-[10px] text-[#121212]/45">
              Showing {changeRequests.length} of {crTotal}
            </p>
          ) : null}

          <div className="min-h-0 flex-1 overflow-auto bg-white">
            {crLoading && changeRequests.length === 0 ? (
              <div className="flex items-center justify-center py-12 text-[#121212]/45">
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Loading…
              </div>
            ) : changeRequests.length === 0 ? (
              <div className="px-3 py-12 text-center text-sm text-[#121212]/50">
                No change requests found.
              </div>
            ) : (
              <table className="w-full min-w-[720px] border-collapse text-left text-sm">
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
                  {changeRequests.map((r) => {
                    const itemName =
                      r.item_name ??
                      (r.add_payload as { item_name?: string } | null | undefined)?.item_name ??
                      (r.requested_payload as { item_name?: string } | null | undefined)?.item_name ??
                      (r.menu_item_id != null ? `Item #${r.menu_item_id}` : "New item");
                    return (
                      <tr
                        key={r.id}
                        className="cursor-pointer bg-white hover:bg-[#FAFAFA]"
                        onClick={() => openReviewSheet(r)}
                      >
                        <td className={`px-3 py-2.5 ${rowBorder}`}>
                          <p className="truncate text-[13px] font-medium text-[#121212]">{itemName}</p>
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
                                  : r.status === "CANCELLED"
                                    ? "bg-[#F3F7FA] text-[#121212]/55"
                                    : "bg-red-50 text-red-700"
                            }`}
                          >
                            {r.status}
                          </span>
                        </td>
                        <td className={`px-3 py-2.5 text-[11px] text-[#121212]/50 ${rowBorder}`}>
                          {r.created_at ? new Date(r.created_at).toLocaleString("en-IN") : "—"}
                        </td>
                        <td
                          className={`px-3 py-2.5 text-right ${rowBorder}`}
                          onClick={(e) => e.stopPropagation()}
                        >
                          {r.status === "PENDING" && canReviewMenu ? (
                            <div className="inline-flex items-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => openReviewSheet(r)}
                                disabled={crActionLoadingId !== null}
                                className="cursor-pointer rounded-md border border-[#121212]/15 px-2 py-1 text-[11px] font-semibold text-[#121212] hover:bg-[#F7F7F7] disabled:opacity-50"
                              >
                                Reject
                              </button>
                              <button
                                type="button"
                                onClick={() => openReviewSheet(r)}
                                disabled={crActionLoadingId !== null}
                                className="cursor-pointer rounded-md bg-emerald-600 px-2 py-1 text-[11px] font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                              >
                                Approve
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => openReviewSheet(r)}
                              className="cursor-pointer rounded-md border border-[#121212]/15 px-2 py-1 text-[11px] font-semibold text-[#121212] hover:bg-[#F7F7F7]"
                            >
                              View
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {reviewSheet ? (
        <MenuChangeRequestReviewSheet
          request={reviewSheet}
          busy={crActionLoadingId === Number(reviewSheet.id)}
          onClose={() => setReviewSheet(null)}
          onApprove={async (id) => {
            if (!canReviewMenu) {
              toast("View-only access — approve/reject is disabled");
              return;
            }
            await handleApproveCr(id);
          }}
          onReject={async (id, reason) => {
            if (!canReviewMenu) {
              toast("View-only access — approve/reject is disabled");
              return;
            }
            await handleRejectCr(id, reason);
          }}
        />
      ) : null}

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
                  <p className="truncate text-[11px] text-gray-500">{photoReviewItem.item_name}</p>
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
                  item={photoReviewItem}
                  categoryLabel={getCategoryLabel(photoReviewItem.category_id)}
                  storeId={storeId}
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
              {canReviewMenu ? (
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
              ) : (
                <div className="border-t border-gray-200 px-4 py-3">
                  <p className="text-xs font-medium text-gray-500">
                    View only — photo approve/reject disabled
                  </p>
                </div>
              )}
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}
