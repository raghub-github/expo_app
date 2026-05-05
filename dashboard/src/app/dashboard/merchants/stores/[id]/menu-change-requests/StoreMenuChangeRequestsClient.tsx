"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useQueryClient } from "@tanstack/react-query";
import { FileText, X } from "lucide-react";
import { useToast } from "@/context/ToastContext";
import { useStoreMenuQuery } from "@/hooks/queries/useMerchantStoreQueries";
import { queryKeys } from "@/lib/queryKeys";
import {
  buildChangeRequestDiff,
  ChangeRequestFullPayloadPanels,
  ChangeRequestValueBox,
  menuItemChangeFieldLabel,
  parseChangeRequestJson,
} from "../menu/menuChangeRequestReview";

export function StoreMenuChangeRequestsClient({ storeId }: { storeId: string }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const menuQuery = useStoreMenuQuery(storeId);
  const data = menuQuery.data ?? null;

  const refreshMenu = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: queryKeys.merchantStore.menu(storeId) });
    await queryClient.refetchQueries({ queryKey: queryKeys.merchantStore.menu(storeId), type: "active" });
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
  const [crType, setCrType] = useState<"ALL" | "UPDATE" | "DELETE">("ALL");
  const [crLoading, setCrLoading] = useState(false);
  const [crActionLoadingId, setCrActionLoadingId] = useState<number | null>(null);
  const [changeRequests, setChangeRequests] = useState<Record<string, unknown>[]>([]);
  const [crDetailModal, setCrDetailModal] = useState<Record<string, unknown> | null>(null);

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

  const handleRejectCr = async (id: number) => {
    setCrActionLoadingId(id);
    try {
      const res = await fetch(`/api/merchant-menu/change-requests/${id}/reject`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reviewed_reason: "Rejected by agent" }),
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
      setCrDetailModal((m) => (m && Number(m.id) === id ? null : m));
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
    return buildChangeRequestDiff(
      String(crDetailModal.request_type ?? ""),
      crDetailModal.current_snapshot,
      crDetailModal.requested_payload
    );
  }, [crDetailModal]);

  const crParsedCurrent = useMemo(() => {
    if (!crDetailModal) return null;
    const v = parseChangeRequestJson(crDetailModal.current_snapshot);
    return v !== null && typeof v === "object" && !Array.isArray(v)
      ? (v as Record<string, unknown>)
      : null;
  }, [crDetailModal]);

  const crParsedRequested = useMemo(() => {
    if (!crDetailModal) return null;
    const v = parseChangeRequestJson(crDetailModal.requested_payload);
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
    const changed = Array.from(keys).filter((k) => crChangedKeys.has(k));
    const rest = Array.from(keys).filter((k) => !crChangedKeys.has(k)).sort((a, b) => a.localeCompare(b));
    return [...changed, ...rest];
  }, [crDetailModal, crParsedCurrent, crParsedRequested, crChangedKeys]);

  return (
    <div className="flex flex-1 min-h-0 flex-col bg-slate-50">
      <div className="border-b border-gray-200 bg-white px-3 py-3 sm:px-4">
        <h1 className="text-lg font-bold text-gray-900 sm:text-xl">Menu change requests</h1>
        <p className="mt-0.5 text-sm text-gray-500">Merchant edit/delete requests for this store (agent review).</p>
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-4 sm:px-4">
        <div className="mx-auto max-w-6xl">
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
                          onClick={() => setCrDetailModal(r)}
                          className="cursor-pointer font-semibold text-left text-blue-700 hover:text-blue-900 hover:underline underline-offset-2"
                        >
                          {String(r.item_name ?? "—")}
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
                        {r.status === "PENDING" ? (
                          <div className="inline-flex items-center gap-2">
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
                          </div>
                        ) : (
                          <span className="text-xs text-gray-500">—</span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {crDetailModal &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40 backdrop-blur-md"
            onClick={() => setCrDetailModal(null)}
            aria-hidden={false}
          >
            <div onClick={(e) => e.stopPropagation()}>
              <div className="bg-white rounded-xl shadow-xl w-full max-w-3xl mx-2 md:mx-0 border border-gray-100">
                <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-100">
                  <div className="min-w-0">
                    <h2 className="text-base font-bold text-gray-900 truncate">
                      {String(crDetailModal.item_name ?? "Menu item")}
                    </h2>
                    <p className="text-xs text-gray-500 truncate">
                      {String(crDetailModal.request_type ?? "UPDATE")} • {String(crDetailModal.status ?? "")}
                      {crDetailModal.menu_item_public_id ? ` • ${String(crDetailModal.menu_item_public_id)}` : ""}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setCrDetailModal(null)}
                    className="p-1.5 hover:bg-gray-100 rounded-lg"
                    aria-label="Close"
                  >
                    <X className="h-4 w-4 text-gray-600" />
                  </button>
                </div>

                <div className="flex border-b border-gray-200">
                  <button
                    type="button"
                    className="px-3 py-2 text-xs font-medium border-b-2 border-orange-500 text-orange-600"
                  >
                    Item & pricing
                  </button>
                  <button
                    type="button"
                    disabled
                    className="px-3 py-2 text-xs font-medium border-b-2 border-transparent text-gray-500 opacity-40 cursor-not-allowed"
                    title="Only item & pricing fields are reviewed here"
                  >
                    Customizations & variants
                  </button>
                </div>

                <div className="px-4 py-3 max-h-[70vh] overflow-y-auto">
                  {crDetailModal.reason != null && String(crDetailModal.reason).trim() !== "" ? (
                    <div className="mb-3 rounded-xl border border-amber-200 bg-amber-50/80 px-3 py-2">
                      <div className="text-xs font-bold text-amber-700 uppercase tracking-wide mb-1">
                        Merchant reason
                      </div>
                      <p className="text-sm text-gray-800 whitespace-pre-wrap">{String(crDetailModal.reason)}</p>
                    </div>
                  ) : null}

                  <div className="space-y-3">
                    {crAllKeys.map((key) => {
                      const edited = crChangedKeys.has(key);
                      const fade = edited ? "" : "opacity-50";
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
                          className={`rounded-xl border ${edited ? "border-emerald-200 ring-2 ring-emerald-100" : "border-gray-200"} bg-white p-3 shadow-sm transition ${fade}`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <label className="text-xs font-medium text-gray-600">
                              {menuItemChangeFieldLabel(key)}
                            </label>
                            {edited ? (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                Edited
                              </span>
                            ) : null}
                          </div>
                          <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-2">
                            <div>
                              <div className="text-[10px] font-bold uppercase tracking-wide text-gray-500 mb-1">
                                Current
                              </div>
                              <ChangeRequestValueBox fieldKey={key} value={currentVal} variant="current" />
                            </div>
                            <div>
                              <div className="text-[10px] font-bold uppercase tracking-wide text-gray-500 mb-1">
                                Requested
                              </div>
                              <ChangeRequestValueBox fieldKey={key} value={requestedVal} variant="requested" />
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {String(crDetailModal.status) === "PENDING" ? (
                  <div className="px-4 py-3 border-t border-gray-100 flex items-center justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => handleRejectCr(Number(crDetailModal.id))}
                      disabled={crActionLoadingId === Number(crDetailModal.id)}
                      className="px-3 py-2 rounded-lg text-sm font-medium text-gray-600 bg-white border border-gray-200 hover:bg-gray-100 disabled:opacity-50"
                    >
                      {crActionLoadingId === Number(crDetailModal.id) ? "…" : "Reject"}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleApproveCr(Number(crDetailModal.id))}
                      disabled={crActionLoadingId === Number(crDetailModal.id)}
                      className="px-3 py-2 rounded-lg text-sm font-medium text-white bg-green-600 hover:bg-green-700 disabled:opacity-50"
                    >
                      {crActionLoadingId === Number(crDetailModal.id) ? "…" : "Approve"}
                    </button>
                  </div>
                ) : (
                  <div className="px-4 py-3 border-t border-gray-100 flex items-center justify-end">
                    <button
                      type="button"
                      onClick={() => setCrDetailModal(null)}
                      className="px-3 py-2 rounded-lg text-sm font-medium text-gray-600 bg-white border border-gray-200 hover:bg-gray-100"
                    >
                      Close
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}
