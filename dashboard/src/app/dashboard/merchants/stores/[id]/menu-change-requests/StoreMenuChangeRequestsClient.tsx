"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useQueryClient } from "@tanstack/react-query";
import { FileText, ImageIcon, X } from "lucide-react";
import { useToast } from "@/context/ToastContext";
import { useMerchantDashboardAccess } from "@/hooks/useMerchantDashboardAccess";
import { R2Image } from "@/components/ui/R2Image";
import { useStoreMenuQuery } from "@/hooks/queries/useMerchantStoreQueries";
import { queryKeys } from "@/lib/queryKeys";
import {
  dispatchMenuReviewQueueRefresh,
  MERCHANT_MENU_REVIEW_QUEUE_REFRESH_EVENT,
  type MenuReviewQueueSummary,
} from "@/lib/merchant/menu-review-queue";
import { ITEM_PLACEHOLDER_SVG, type MenuItem, type MenuCategory } from "../menu/menu-types";
import {
  buildChangeRequestDiff,
  ChangeRequestFullPayloadPanels,
  ChangeRequestValueBox,
  formatChangeRequestValue,
  menuItemChangeFieldLabel,
  parseChangeRequestJson,
  sortMenuItemChangeKeys,
} from "../menu/menuChangeRequestReview";
import { MenuItemPhotoCustomerPreview } from "@/components/merchant/MenuItemPhotoCustomerPreview";

const PHOTO_REJECT_PRESETS = [
  "Image is blurry or low quality",
  "Dish is not clearly visible",
  "Image contains watermark or promotional text",
  "Wrong dish photo uploaded",
  "Image does not match item name/description",
] as const;

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

  const storePublicId = (data as { store?: { store_id?: string } } | null)?.store?.store_id as
    | string
    | null
    | undefined;

  const [crStatus, setCrStatus] = useState<"ALL" | "PENDING" | "APPROVED" | "REJECTED" | "CANCELLED">("PENDING");
  const [crType, setCrType] = useState<"ALL" | "CREATE" | "UPDATE" | "DELETE">("ALL");
  const [crLoading, setCrLoading] = useState(false);
  const [crActionLoadingId, setCrActionLoadingId] = useState<number | null>(null);
  const [changeRequests, setChangeRequests] = useState<Record<string, unknown>[]>([]);
  const [crDetailModal, setCrDetailModal] = useState<Record<string, unknown> | null>(null);
  const [crShowAllFields, setCrShowAllFields] = useState(false);
  const [crRejectReason, setCrRejectReason] = useState("");
  const [reviewSummary, setReviewSummary] = useState<MenuReviewQueueSummary | null>(null);
  const [photoReviewItem, setPhotoReviewItem] = useState<MenuItem | null>(null);
  const [photoRejectReason, setPhotoRejectReason] = useState("");
  const [photoRejectError, setPhotoRejectError] = useState<string | null>(null);
  const [photoActionLoading, setPhotoActionLoading] = useState<"APPROVE" | "REJECT" | null>(null);

  const menuItems = ((data as { items?: MenuItem[] } | null)?.items ?? []) as MenuItem[];
  const categories = ((data as { categories?: MenuCategory[] } | null)?.categories ?? []) as MenuCategory[];

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

  const pendingPhotoItems = useMemo(
    () =>
      menuItems.filter((item) => {
        if (!item.item_image_url?.trim()) return false;
        const primaryMod = String(item.primary_image_moderation_status ?? "").toUpperCase();
        if (primaryMod === "PENDING") return true;
        const st = String(item.approval_status ?? "PENDING").toUpperCase();
        return st === "PENDING";
      }),
    [menuItems]
  );

  const fetchReviewSummary = useCallback(() => {
    const id = storePublicId ?? storeId;
    if (!id) return;
    fetch(`/api/merchant-menu/review-queue-summary?storeId=${encodeURIComponent(id)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((body) => {
        if (!body?.success) return;
        setReviewSummary({
          pending_change_requests: Number(body.pending_change_requests ?? 0),
          pending_photo_reviews: Number(body.pending_photo_reviews ?? 0),
          total_pending: Number(body.total_pending ?? 0),
        });
      })
      .catch(() => setReviewSummary(null));
  }, [storePublicId, storeId]);

  useEffect(() => {
    fetchReviewSummary();
  }, [fetchReviewSummary]);

  useEffect(() => {
    const onRefresh = () => fetchReviewSummary();
    window.addEventListener(MERCHANT_MENU_REVIEW_QUEUE_REFRESH_EVENT, onRefresh);
    return () => window.removeEventListener(MERCHANT_MENU_REVIEW_QUEUE_REFRESH_EVENT, onRefresh);
  }, [fetchReviewSummary]);

  useEffect(() => {
    let cancelled = false;
    if (!storePublicId) return;
    setCrLoading(true);
    const params = new URLSearchParams();
    params.set("storeId", storePublicId);
    if (crStatus !== "ALL") params.set("status", crStatus);
    if (crType !== "ALL") params.set("request_type", crType);
    params.set("limit", "50");
    params.set("offset", "0");
    fetch(`/api/merchant-menu/change-requests?${params.toString()}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (cancelled) return;
        const list = (d && Array.isArray(d.change_requests) ? d.change_requests : []) as Record<string, unknown>[];
        setChangeRequests(list);
      })
      .finally(() => {
        if (!cancelled) setCrLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [storePublicId, crStatus, crType]);

  const refetchChangeRequests = useCallback(() => {
    if (!storePublicId) return;
    const params = new URLSearchParams();
    params.set("storeId", storePublicId);
    if (crStatus !== "ALL") params.set("status", crStatus);
    if (crType !== "ALL") params.set("request_type", crType);
    params.set("limit", "50");
    params.set("offset", "0");
    fetch(`/api/merchant-menu/change-requests?${params.toString()}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        const list = (d && Array.isArray(d.change_requests) ? d.change_requests : []) as Record<string, unknown>[];
        setChangeRequests(list);
      });
  }, [storePublicId, crStatus, crType]);

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
      await refreshMenu();
      refetchChangeRequests();
      fetchReviewSummary();
      dispatchMenuReviewQueueRefresh();
      setCrDetailModal((m) => (m && Number(m.id) === id ? null : m));
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

  const handleRejectCr = async (id: number, reviewedReason?: string) => {
    if (!canReviewMenu) {
      toast("View-only access — approve/reject is disabled");
      return;
    }
    const reason = (reviewedReason ?? crRejectReason).trim();
    if (reason.length < 3) {
      toast("Add a rejection reason (min 3 characters).");
      return;
    }
    setCrActionLoadingId(id);
    try {
      const res = await fetch(`/api/merchant-menu/change-requests/${id}/reject`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reviewed_reason: reason }),
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
      await refreshMenu();
      refetchChangeRequests();
      fetchReviewSummary();
      dispatchMenuReviewQueueRefresh();
      setCrDetailModal((m) => (m && Number(m.id) === id ? null : m));
      setCrRejectReason("");
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

  const changeRequestDetailDiff = useMemo(() => {
    if (!crDetailModal) return null;
    const changesRaw = crDetailModal.changes;
    const changesList = Array.isArray(changesRaw) ? changesRaw : [];
    if (changesList.length > 0 && String(crDetailModal.request_type) === "UPDATE") {
      const rows = changesList.map((c: any) => ({
        key: String(c.field_name),
        before: formatChangeRequestValue(c.old_value),
        after: formatChangeRequestValue(c.new_value),
        beforeRaw: c.old_value,
        afterRaw: c.new_value,
      }));
      return {
        intro: "Only fields the merchant changed (field-level review).",
        rows,
        fallbackCurrent: null,
        fallbackRequested: null,
      };
    }
    return buildChangeRequestDiff(
      String(crDetailModal.request_type ?? ""),
      crDetailModal.current_snapshot,
      crDetailModal.requested_payload
    );
  }, [crDetailModal]);

  const crParsedCurrent = useMemo(() => {
    if (!crDetailModal) return null;
    const changesRaw = crDetailModal.changes;
    const changesList = Array.isArray(changesRaw) ? changesRaw : [];
    if (changesList.length > 0 && String(crDetailModal.request_type) === "UPDATE") {
      const obj: Record<string, unknown> = {};
      for (const c of changesList as any[]) {
        obj[String(c.field_name)] = c.old_value;
      }
      return obj;
    }
    const v = parseChangeRequestJson(crDetailModal.current_snapshot);
    return v !== null && typeof v === "object" && !Array.isArray(v)
      ? (v as Record<string, unknown>)
      : null;
  }, [crDetailModal]);

  const crParsedRequested = useMemo(() => {
    if (!crDetailModal) return null;
    const changesRaw = crDetailModal.changes;
    const changesList = Array.isArray(changesRaw) ? changesRaw : [];
    if (changesList.length > 0 && String(crDetailModal.request_type) === "UPDATE") {
      const obj: Record<string, unknown> = {};
      for (const c of changesList as any[]) {
        obj[String(c.field_name)] = c.new_value;
      }
      return obj;
    }
    const v = parseChangeRequestJson(crDetailModal.requested_payload ?? crDetailModal.add_payload);
    return v !== null && typeof v === "object" && !Array.isArray(v)
      ? (v as Record<string, unknown>)
      : null;
  }, [crDetailModal]);

  const crCanShowFullPayloadPanels = useMemo(() => {
    if (!crDetailModal) return false;
    const rt = String(crDetailModal.request_type ?? "");
    if (rt === "DELETE" && crParsedCurrent) return true;
    if (rt === "CREATE" && crParsedRequested) return true;
    if (rt === "UPDATE" && (crParsedCurrent || crParsedRequested)) return true;
    return false;
  }, [crDetailModal, crParsedCurrent, crParsedRequested]);

  const crChangedKeys = useMemo(() => {
    const set = new Set<string>();
    if (!changeRequestDetailDiff) return set;
    for (const r of changeRequestDetailDiff.rows) set.add(String(r.key));
    return set;
  }, [changeRequestDetailDiff]);

  const crAllKeys = useMemo(() => {
    if (!crDetailModal) return [];
    const rt = String(crDetailModal.request_type ?? "");
    const keys = new Set<string>();
    if (rt === "UPDATE") {
      for (const k of Object.keys(crParsedCurrent ?? {})) keys.add(k);
      for (const k of Object.keys(crParsedRequested ?? {})) keys.add(k);
    } else if (rt === "DELETE") {
      for (const k of Object.keys(crParsedCurrent ?? {})) keys.add(k);
    } else if (rt === "CREATE") {
      for (const k of Object.keys(crParsedRequested ?? {})) keys.add(k);
    }
    return sortMenuItemChangeKeys(Array.from(keys));
  }, [crDetailModal, crParsedCurrent, crParsedRequested]);

  const crEditedKeysOnly = useMemo(
    () => crAllKeys.filter((k) => crChangedKeys.has(k)),
    [crAllKeys, crChangedKeys]
  );

  const crDisplayKeys = useMemo(() => {
    if (!crDetailModal) return [];
    const rt = String(crDetailModal.request_type ?? "");
    if (rt === "UPDATE") {
      return crShowAllFields ? crAllKeys : crEditedKeysOnly;
    }
    return crAllKeys;
  }, [crDetailModal, crShowAllFields, crAllKeys, crEditedKeysOnly]);

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
      await refreshMenu();
      fetchReviewSummary();
      dispatchMenuReviewQueueRefresh();
      setPhotoReviewItem(null);
      setPhotoRejectReason("");
      setPhotoRejectError(null);
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

  const handleRejectPhoto = async (item: MenuItem, reasonInput?: string) => {
    if (!canReviewMenu) {
      toast("View-only access — approve/reject is disabled");
      return;
    }
    const reason = (reasonInput ?? photoRejectReason).trim();
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
      await refreshMenu();
      fetchReviewSummary();
      dispatchMenuReviewQueueRefresh();
      setPhotoReviewItem(null);
      setPhotoRejectReason("");
      setPhotoRejectError(null);
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
      <div className="flex flex-1 min-h-0 flex-col items-center justify-center bg-slate-50 px-6 py-16 text-center">
        <h1 className="text-lg font-bold text-gray-900">Menu change requests</h1>
        <p className="mt-2 max-w-md text-sm text-gray-500">
          You don’t have permission to view or review menu change requests for this store.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-1 min-h-0 flex-col bg-slate-50">
      <div className="border-b border-gray-200 bg-white px-3 py-3 sm:px-4">
        <h1 className="text-lg font-bold text-gray-900 sm:text-xl">Menu change requests</h1>
        <p className="mt-0.5 text-sm text-gray-500">
          Merchant edit/delete requests and uploaded photo reviews for this store.
        </p>
        {reviewSummary ? (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-bold text-amber-900">
              {reviewSummary.total_pending} total pending
            </span>
            <span className="rounded-full border border-gray-200 bg-white px-2.5 py-1 text-xs font-semibold text-gray-700">
              {reviewSummary.pending_change_requests} change requests
            </span>
            <span className="rounded-full border border-purple-200 bg-purple-50 px-2.5 py-1 text-xs font-semibold text-purple-800">
              {reviewSummary.pending_photo_reviews} photo reviews
            </span>
          </div>
        ) : null}
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-4 sm:px-4">
        <div className="mx-auto max-w-6xl space-y-8">
          <section>
            <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
              <div>
                <div className="flex items-center gap-2 text-sm font-bold text-gray-900">
                  <ImageIcon className="h-4 w-4 text-purple-600" aria-hidden />
                  Photo reviews
                </div>
                <div className="text-xs text-gray-500">
                  New or replaced item photos waiting for approval.
                </div>
              </div>
            </div>

            <div className="mt-4 overflow-x-auto rounded-xl border border-gray-200 bg-white">
              <table className="min-w-full text-sm">
                <thead className="sticky top-0 z-10 bg-white">
                  <tr className="text-xs text-gray-500 border-b border-gray-200">
                    <th className="text-left font-semibold py-3 px-4">Item</th>
                    <th className="text-left font-semibold py-3 px-4">Photo</th>
                    <th className="text-left font-semibold py-3 px-4">Status</th>
                    <th className="text-right font-semibold py-3 px-4">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {menuQuery.isLoading ? (
                    <tr>
                      <td className="px-4 py-6 text-xs text-gray-500" colSpan={4}>
                        Loading photo reviews…
                      </td>
                    </tr>
                  ) : pendingPhotoItems.length === 0 ? (
                    <tr>
                      <td className="px-4 py-6 text-xs text-gray-500" colSpan={4}>
                        No pending photo reviews.
                      </td>
                    </tr>
                  ) : (
                    pendingPhotoItems.map((item) => (
                      <tr key={item.id} className="border-t border-gray-100">
                        <td className="py-3 px-4">
                          <button
                            type="button"
                            onClick={() => setPhotoReviewItem(item)}
                            className="cursor-pointer font-semibold text-left text-blue-700 hover:text-blue-900 hover:underline underline-offset-2"
                          >
                            {item.item_name}
                          </button>
                          <div className="text-xs text-gray-500">₹{item.selling_price}</div>
                        </td>
                        <td className="py-3 px-4">
                          <div className="h-12 w-12 overflow-hidden rounded-lg border border-gray-200 bg-gray-50">
                            <R2Image
                              src={item.item_image_url}
                              alt={item.item_name}
                              className="h-full w-full object-cover"
                              fallbackSrc={ITEM_PLACEHOLDER_SVG}
                            />
                          </div>
                        </td>
                        <td className="py-3 px-4">
                          <span className="rounded bg-amber-50 border border-amber-200 px-2 py-1 text-xs font-bold text-amber-800">
                            Pending
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right">
                          <div className="inline-flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => setPhotoReviewItem(item)}
                              className="px-3 py-1.5 rounded-lg text-xs font-bold border border-gray-300 text-gray-700 hover:bg-gray-50"
                            >
                              Review
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>

          <section>
          <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
            <div>
              <div className="text-sm font-bold text-gray-900">Requests</div>
              <div className="text-xs text-gray-500">Filter by status and type.</div>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <select
                value={crStatus}
                onChange={(e) => setCrStatus(e.target.value as typeof crStatus)}
                className="px-3 py-2 text-sm border border-gray-300 rounded-lg bg-white text-gray-900"
                aria-label="Filter change requests by status"
              >
                <option value="ALL">Status: All</option>
                <option value="PENDING">Status: Pending</option>
                <option value="APPROVED">Status: Approved</option>
                <option value="REJECTED">Status: Rejected</option>
                <option value="CANCELLED">Status: Cancelled</option>
              </select>
              <select
                value={crType}
                onChange={(e) => setCrType(e.target.value as typeof crType)}
                className="px-3 py-2 text-sm border border-gray-300 rounded-lg bg-white text-gray-900"
                aria-label="Filter change requests by type"
              >
                <option value="ALL">Type: All</option>
                <option value="CREATE">Type: Add</option>
                <option value="UPDATE">Type: Edit</option>
                <option value="DELETE">Type: Delete</option>
              </select>
            </div>
          </div>

          <div className="mt-4 overflow-x-auto rounded-xl border border-gray-200 bg-white">
            <table className="min-w-full text-sm">
              <thead className="sticky top-0 z-10 bg-white">
                <tr className="text-xs text-gray-500 border-b border-gray-200">
                  <th className="text-left font-semibold py-3 px-4">Item</th>
                  <th className="text-left font-semibold py-3 px-4">Type</th>
                  <th className="text-left font-semibold py-3 px-4">Status</th>
                  <th className="text-left font-semibold py-3 px-4">Created</th>
                  <th className="text-right font-semibold py-3 px-4">Action</th>
                </tr>
              </thead>
              <tbody>
                {!storePublicId ? (
                  <tr>
                    <td className="px-4 py-6 text-xs text-gray-500" colSpan={5}>
                      Loading store info…
                    </td>
                  </tr>
                ) : crLoading ? (
                  <tr>
                    <td className="px-4 py-6 text-xs text-gray-500" colSpan={5}>
                      Loading change requests…
                    </td>
                  </tr>
                ) : changeRequests.length === 0 ? (
                  <tr>
                    <td className="px-4 py-6 text-xs text-gray-500" colSpan={5}>
                      No change requests found.
                    </td>
                  </tr>
                ) : (
                  changeRequests.map((r) => (
                    <tr key={String(r.id)} className="border-t border-gray-100">
                      <td className="py-3 px-4">
                        <button
                          type="button"
                          onClick={() => {
                            setCrRejectReason("");
                            setCrShowAllFields(false);
                            setCrDetailModal(r);
                          }}
                          className="cursor-pointer font-semibold text-left text-blue-700 hover:text-blue-900 hover:underline underline-offset-2"
                        >
                          {String(
                            r.item_name ??
                              (r.add_payload as { item_name?: string } | null)?.item_name ??
                              (r.requested_payload as { item_name?: string } | null)?.item_name ??
                              "New item"
                          )}
                        </button>
                        <div className="text-xs text-gray-500">{String(r.menu_item_public_id ?? "")}</div>
                      </td>
                      <td className="py-3 px-4">
                        <span className="px-2 py-1 rounded bg-gray-50 border border-gray-200 text-xs font-bold">
                          {String(r.request_type ?? "")}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <span className="px-2 py-1 rounded bg-gray-50 border border-gray-200 text-xs font-bold">
                          {String(r.status ?? "")}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-xs text-gray-600">
                        {r.created_at ? new Date(String(r.created_at)).toLocaleString() : "—"}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <div className="inline-flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              setCrRejectReason("");
                              setCrShowAllFields(false);
                              setCrDetailModal(r);
                            }}
                            className="px-3 py-1.5 rounded-lg text-xs font-bold border border-gray-300 text-gray-700 hover:bg-gray-50"
                          >
                            Review
                          </button>
                          {r.status === "PENDING" && canReviewMenu ? (
                            <>
                              <button
                                type="button"
                                onClick={() => handleRejectCr(Number(r.id))}
                                disabled={crActionLoadingId === Number(r.id)}
                                className="px-3 py-1.5 rounded-lg text-xs font-bold border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                              >
                                {crActionLoadingId === Number(r.id) ? "…" : "Reject"}
                              </button>
                              <button
                                type="button"
                                onClick={() => handleApproveCr(Number(r.id))}
                                disabled={crActionLoadingId === Number(r.id)}
                                className="px-3 py-1.5 rounded-lg text-xs font-bold bg-green-600 text-white hover:bg-green-700 disabled:opacity-50"
                              >
                                {crActionLoadingId === Number(r.id) ? "…" : "Approve"}
                              </button>
                            </>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          </section>
        </div>
      </div>

      {crDetailModal &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40 backdrop-blur-md p-3 sm:p-4"
            onClick={() => setCrDetailModal(null)}
            aria-hidden={false}
          >
            <div
              className="flex max-h-[min(92vh,880px)] w-full max-w-3xl flex-col overflow-hidden rounded-xl border border-gray-100 bg-white shadow-xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="shrink-0 flex items-center justify-between border-b border-gray-100 px-4 py-3">
                <div className="min-w-0 pr-3">
                  <h2 className="truncate text-base font-bold text-gray-900">
                    {String(crDetailModal.item_name ?? "Menu item")}
                  </h2>
                  <p className="truncate text-xs text-gray-500">
                    {String(crDetailModal.request_type ?? "UPDATE")} • {String(crDetailModal.status ?? "")}
                    {crDetailModal.menu_item_public_id ? ` • ${String(crDetailModal.menu_item_public_id)}` : ""}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setCrDetailModal(null)}
                  className="shrink-0 rounded-lg p-1.5 hover:bg-gray-100"
                  aria-label="Close"
                >
                  <X className="h-4 w-4 text-gray-600" />
                </button>
              </div>

              <div className="shrink-0 flex border-b border-gray-200 px-1">
                <button
                  type="button"
                  className="border-b-2 border-orange-500 px-3 py-2 text-xs font-medium text-orange-600"
                >
                  Item & pricing
                </button>
                <button
                  type="button"
                  disabled
                  className="cursor-not-allowed border-b-2 border-transparent px-3 py-2 text-xs font-medium text-gray-500 opacity-40"
                  title="Only item & pricing fields are reviewed here"
                >
                  Customizations & variants
                </button>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
                {crDetailModal.reason != null && String(crDetailModal.reason).trim() !== "" ? (
                  <div className="mb-3 rounded-xl border border-amber-200 bg-amber-50/80 px-3 py-2">
                    <div className="mb-1 text-xs font-bold uppercase tracking-wide text-amber-700">
                      Merchant reason
                    </div>
                    <p className="whitespace-pre-wrap text-sm text-gray-800">{String(crDetailModal.reason)}</p>
                  </div>
                ) : null}

                {String(crDetailModal.request_type ?? "") === "UPDATE" && crEditedKeysOnly.length > 0 ? (
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2">
                    <div className="flex flex-wrap items-center gap-3 text-xs font-semibold">
                      <span className="text-gray-700">
                        {crEditedKeysOnly.length} field{crEditedKeysOnly.length === 1 ? "" : "s"} changed
                      </span>
                      <span className="inline-flex items-center gap-1.5 text-red-700">
                        <span className="h-2.5 w-2.5 rounded-sm border border-red-300 bg-red-100" />
                        Old value
                      </span>
                      <span className="inline-flex items-center gap-1.5 text-emerald-700">
                        <span className="h-2.5 w-2.5 rounded-sm border border-emerald-300 bg-emerald-100" />
                        New value
                      </span>
                    </div>
                    {crAllKeys.length > crEditedKeysOnly.length ? (
                      <button
                        type="button"
                        onClick={() => setCrShowAllFields((v) => !v)}
                        className="text-xs font-semibold text-blue-700 hover:text-blue-900 hover:underline"
                      >
                        {crShowAllFields
                          ? "Show changed fields only"
                          : `Show all fields (${crAllKeys.length - crEditedKeysOnly.length} unchanged)`}
                      </button>
                    ) : null}
                  </div>
                ) : null}

                {crDisplayKeys.length === 0 ? (
                  <div className="space-y-3">
                    {changeRequestDetailDiff?.intro ? (
                      <p className="text-sm text-gray-600">{changeRequestDetailDiff.intro}</p>
                    ) : (
                      <p className="text-sm text-gray-600">No field-level differences detected.</p>
                    )}
                    {crCanShowFullPayloadPanels ? (
                      <ChangeRequestFullPayloadPanels
                        requestType={String(crDetailModal.request_type ?? "")}
                        currentObj={crParsedCurrent}
                        requestedObj={crParsedRequested}
                        highlightKeys={crChangedKeys}
                      />
                    ) : null}
                  </div>
                ) : (
                  <div className="space-y-3">
                    {crDisplayKeys.map((key) => {
                      const edited = crChangedKeys.has(key);
                      const currentVal =
                        String(crDetailModal.request_type ?? "") === "CREATE"
                          ? undefined
                          : (crParsedCurrent?.[key] as unknown);
                      const requestedVal =
                        String(crDetailModal.request_type ?? "") === "DELETE"
                          ? undefined
                          : (crParsedRequested?.[key] as unknown);
                      return (
                        <div
                          key={key}
                          className={`rounded-xl border bg-white p-3 shadow-sm transition ${
                            edited
                              ? "border-emerald-200 ring-1 ring-emerald-100"
                              : "border-gray-200 opacity-40"
                          }`}
                        >
                          <div className="mb-2 flex items-center justify-between gap-2">
                            <label className="text-sm font-semibold text-gray-900">
                              {menuItemChangeFieldLabel(key)}
                            </label>
                            {edited ? (
                              <span className="shrink-0 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700">
                                Changed
                              </span>
                            ) : null}
                          </div>
                          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                            <div className="min-w-0">
                              <div className="mb-1 text-[10px] font-bold uppercase tracking-wide text-red-600">
                                Old value
                              </div>
                              <ChangeRequestValueBox fieldKey={key} value={currentVal} variant="current" />
                            </div>
                            <div className="min-w-0">
                              <div className="mb-1 text-[10px] font-bold uppercase tracking-wide text-emerald-700">
                                New value
                              </div>
                              <ChangeRequestValueBox fieldKey={key} value={requestedVal} variant="requested" />
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {String(crDetailModal.status) === "PENDING" && canReviewMenu ? (
                <div className="shrink-0 space-y-3 border-t border-gray-100 bg-white px-4 py-3">
                  <div>
                    <label className="mb-1 block text-xs font-bold text-gray-700">
                      Rejection reason (required if rejecting)
                    </label>
                    <textarea
                      value={crRejectReason}
                      onChange={(e) => setCrRejectReason(e.target.value)}
                      rows={2}
                      placeholder="Why is this change request being rejected?"
                      className="w-full resize-y rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900"
                    />
                  </div>
                  <div className="flex items-center justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => handleRejectCr(Number(crDetailModal.id))}
                      disabled={crActionLoadingId === Number(crDetailModal.id)}
                      className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-100 disabled:opacity-50"
                    >
                      {crActionLoadingId === Number(crDetailModal.id) ? "…" : "Reject request"}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleApproveCr(Number(crDetailModal.id))}
                      disabled={crActionLoadingId === Number(crDetailModal.id)}
                      className="rounded-lg bg-green-600 px-3 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
                    >
                      {crActionLoadingId === Number(crDetailModal.id) ? "…" : "Approve request"}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="shrink-0 flex items-center justify-end border-t border-gray-100 px-4 py-3">
                  <button
                    type="button"
                    onClick={() => setCrDetailModal(null)}
                    className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100"
                  >
                    Close
                  </button>
                </div>
              )}
            </div>
          </div>,
          document.body
        )}

      {photoReviewItem &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            className="fixed inset-0 z-[9998] flex items-stretch justify-end bg-black/40 backdrop-blur-sm"
            onClick={() => {
              setPhotoReviewItem(null);
              setPhotoRejectReason("");
              setPhotoRejectError(null);
            }}
          >
            <div
              className="w-full max-w-lg bg-white shadow-xl border-l border-gray-200 flex flex-col"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between">
                <h2 className="text-sm font-bold text-gray-900">Review item photo</h2>
                <button
                  type="button"
                  onClick={() => {
                    setPhotoReviewItem(null);
                    setPhotoRejectReason("");
                    setPhotoRejectError(null);
                  }}
                  className="text-xs text-gray-500 hover:text-gray-800"
                >
                  Close
                </button>
              </div>
              <div className="p-4 flex-1 overflow-auto space-y-4 text-sm">
                <MenuItemPhotoCustomerPreview
                  item={photoReviewItem}
                  categoryLabel={getCategoryLabel(photoReviewItem.category_id)}
                  storeId={storeId}
                />
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">
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
                    className={`w-full rounded-lg border px-3 py-2 text-sm text-gray-900 resize-y ${
                      photoRejectError ? "border-red-400 ring-1 ring-red-200" : "border-gray-300"
                    }`}
                  />
                  {photoRejectError ? (
                    <p className="mt-1 text-xs font-medium text-red-600">{photoRejectError}</p>
                  ) : null}
                </div>
              </div>
              {canReviewMenu ? (
                <div className="px-4 py-3 border-t border-gray-200 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => void handleRejectPhoto(photoReviewItem)}
                    disabled={photoActionLoading !== null}
                    className="flex-1 inline-flex items-center justify-center px-3 py-2 rounded-md border border-red-200 text-xs font-bold text-red-700 bg-red-50 hover:bg-red-100 disabled:opacity-50"
                  >
                    {photoActionLoading === "REJECT" ? "Rejecting…" : "Reject photo"}
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleApprovePhoto(photoReviewItem)}
                    disabled={photoActionLoading !== null}
                    className="flex-1 inline-flex items-center justify-center px-3 py-2 rounded-md text-xs font-bold text-white bg-green-600 hover:bg-green-700 disabled:opacity-50"
                  >
                    {photoActionLoading === "APPROVE" ? "Approving…" : "Approve photo"}
                  </button>
                </div>
              ) : (
                <div className="px-4 py-3 border-t border-gray-200">
                  <p className="text-xs font-medium text-gray-500">View only — photo approve/reject disabled</p>
                </div>
              )}
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}
