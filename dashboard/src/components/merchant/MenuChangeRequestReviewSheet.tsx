"use client";

import { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import {
  buildChangeRequestDiff,
  ChangeRequestFullPayloadPanels,
  ChangeRequestValueBox,
  formatChangeRequestValue,
  isMeaningfulMenuFieldChange,
  menuItemChangeFieldLabel,
  parseChangeRequestJson,
  sortMenuItemChangeKeys,
} from "@/app/dashboard/merchants/stores/[id]/menu/menuChangeRequestReview";

export type MenuChangeRequestReviewRow = {
  id: number;
  store_id?: number;
  store_name?: string | null;
  store_public_id?: string | null;
  menu_item_id?: number | null;
  request_type: string;
  status: string;
  requested_payload?: Record<string, unknown> | null;
  add_payload?: Record<string, unknown> | null;
  current_snapshot?: Record<string, unknown> | null;
  changes?: Array<{
    id?: number;
    field_name: string;
    old_value: unknown;
    new_value: unknown;
    created_at?: string;
  }> | null;
  reason?: string | null;
  item_name?: string | null;
  menu_item_public_id?: string | null;
  created_at?: string;
};

type Props = {
  request: MenuChangeRequestReviewRow;
  busy?: boolean;
  onClose: () => void;
  onApprove: (id: number) => void | Promise<void>;
  onReject: (id: number, reason: string) => void | Promise<void>;
};

export function MenuChangeRequestReviewSheet({
  request,
  busy = false,
  onClose,
  onApprove,
  onReject,
}: Props) {
  const [rejectReason, setRejectReason] = useState("");
  const [showAllFields, setShowAllFields] = useState(false);
  const [rejectError, setRejectError] = useState<string | null>(null);

  const meaningfulChanges = useMemo(() => {
    const changesList = Array.isArray(request.changes) ? request.changes : [];
    return changesList.filter((c) => isMeaningfulMenuFieldChange(c.old_value, c.new_value));
  }, [request.changes]);

  const detailDiff = useMemo(() => {
    if (meaningfulChanges.length > 0 && String(request.request_type) === "UPDATE") {
      const rows = meaningfulChanges.map((c) => ({
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
      String(request.request_type ?? ""),
      request.current_snapshot,
      request.requested_payload ?? request.add_payload
    );
  }, [request, meaningfulChanges]);

  const parsedCurrent = useMemo(() => {
    if (meaningfulChanges.length > 0 && String(request.request_type) === "UPDATE") {
      const obj: Record<string, unknown> = {};
      for (const c of meaningfulChanges) obj[String(c.field_name)] = c.old_value;
      return obj;
    }
    const v = parseChangeRequestJson(request.current_snapshot);
    return v !== null && typeof v === "object" && !Array.isArray(v)
      ? (v as Record<string, unknown>)
      : null;
  }, [request, meaningfulChanges]);

  const parsedRequested = useMemo(() => {
    if (meaningfulChanges.length > 0 && String(request.request_type) === "UPDATE") {
      const obj: Record<string, unknown> = {};
      for (const c of meaningfulChanges) obj[String(c.field_name)] = c.new_value;
      return obj;
    }
    const v = parseChangeRequestJson(request.requested_payload ?? request.add_payload);
    return v !== null && typeof v === "object" && !Array.isArray(v)
      ? (v as Record<string, unknown>)
      : null;
  }, [request, meaningfulChanges]);

  const changedKeys = useMemo(() => {
    const set = new Set<string>();
    for (const r of detailDiff?.rows ?? []) set.add(String(r.key));
    return set;
  }, [detailDiff]);

  const allKeys = useMemo(() => {
    const rt = String(request.request_type ?? "");
    const keys = new Set<string>();
    if (rt === "UPDATE") {
      for (const k of Object.keys(parsedCurrent ?? {})) keys.add(k);
      for (const k of Object.keys(parsedRequested ?? {})) keys.add(k);
    } else if (rt === "DELETE") {
      for (const k of Object.keys(parsedCurrent ?? {})) keys.add(k);
    } else if (rt === "CREATE") {
      for (const k of Object.keys(parsedRequested ?? {})) keys.add(k);
    }
    return sortMenuItemChangeKeys(Array.from(keys));
  }, [request.request_type, parsedCurrent, parsedRequested]);

  const editedKeysOnly = useMemo(
    () => allKeys.filter((k) => changedKeys.has(k)),
    [allKeys, changedKeys]
  );

  const displayKeys = useMemo(() => {
    const rt = String(request.request_type ?? "");
    if (rt === "UPDATE") return showAllFields ? allKeys : editedKeysOnly;
    return allKeys;
  }, [request.request_type, showAllFields, allKeys, editedKeysOnly]);

  const canShowFullPayload =
    (String(request.request_type) === "DELETE" && Boolean(parsedCurrent)) ||
    (String(request.request_type) === "CREATE" && Boolean(parsedRequested)) ||
    (String(request.request_type) === "UPDATE" &&
      Boolean(parsedCurrent || parsedRequested));

  const pending = String(request.status).toUpperCase() === "PENDING";

  const submitReject = () => {
    const reason = rejectReason.trim();
    if (reason.length < 3) {
      setRejectError("Please enter a rejection reason (min 3 characters).");
      return;
    }
    setRejectError(null);
    void onReject(Number(request.id), reason);
  };

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[9998] flex items-stretch justify-end bg-black/40 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="flex h-full w-full max-w-xl flex-col border-l border-gray-200 bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-gray-200 px-4 py-3">
          <div className="min-w-0 pr-3">
            <h2 className="truncate text-sm font-bold text-gray-900">
              {String(request.item_name ?? "Menu item")}
            </h2>
            <p className="truncate text-[11px] text-gray-500">
              {String(request.request_type ?? "UPDATE")} • {String(request.status ?? "")}
              {request.menu_item_public_id ? ` • ${String(request.menu_item_public_id)}` : ""}
            </p>
            {request.store_name || request.store_public_id ? (
              <p className="truncate text-[11px] text-gray-500">
                {request.store_name || "Store"}
                {request.store_public_id ? ` • ${request.store_public_id}` : ""}
              </p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 hover:bg-gray-100"
            aria-label="Close"
          >
            <X className="h-4 w-4 text-gray-600" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
          {request.reason != null && String(request.reason).trim() !== "" ? (
            <div className="mb-3 rounded-xl border border-amber-200 bg-amber-50/80 px-3 py-2">
              <div className="mb-1 text-xs font-bold uppercase tracking-wide text-amber-700">
                Merchant reason
              </div>
              <p className="whitespace-pre-wrap text-sm text-gray-800">{String(request.reason)}</p>
            </div>
          ) : null}

          {String(request.request_type ?? "") === "UPDATE" && editedKeysOnly.length > 0 ? (
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2">
              <div className="flex flex-wrap items-center gap-3 text-xs font-semibold">
                <span className="text-gray-700">
                  {editedKeysOnly.length} field{editedKeysOnly.length === 1 ? "" : "s"} changed
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
              {allKeys.length > editedKeysOnly.length ? (
                <button
                  type="button"
                  onClick={() => setShowAllFields((v) => !v)}
                  className="text-xs font-semibold text-blue-700 hover:text-blue-900 hover:underline"
                >
                  {showAllFields
                    ? "Show changed fields only"
                    : `Show all fields (${allKeys.length - editedKeysOnly.length} unchanged)`}
                </button>
              ) : null}
            </div>
          ) : null}

          {displayKeys.length === 0 ? (
            <div className="space-y-3">
              {detailDiff?.intro ? (
                <p className="text-sm text-gray-600">{detailDiff.intro}</p>
              ) : (
                <p className="text-sm text-gray-600">No field-level differences detected.</p>
              )}
              {canShowFullPayload ? (
                <ChangeRequestFullPayloadPanels
                  requestType={String(request.request_type ?? "")}
                  currentObj={parsedCurrent}
                  requestedObj={parsedRequested}
                  highlightKeys={changedKeys}
                />
              ) : null}
            </div>
          ) : (
            <div className="space-y-3">
              {displayKeys.map((key) => {
                const edited = changedKeys.has(key);
                const currentVal =
                  String(request.request_type ?? "") === "CREATE"
                    ? undefined
                    : (parsedCurrent?.[key] as unknown);
                const requestedVal =
                  String(request.request_type ?? "") === "DELETE"
                    ? undefined
                    : (parsedRequested?.[key] as unknown);
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
                        <ChangeRequestValueBox
                          fieldKey={key}
                          value={requestedVal}
                          variant="requested"
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {pending ? (
          <div className="shrink-0 space-y-3 border-t border-gray-100 bg-white px-4 py-3">
            <div>
              <label className="mb-1 block text-xs font-bold text-gray-700">
                Rejection reason (required if rejecting)
              </label>
              <textarea
                value={rejectReason}
                onChange={(e) => {
                  setRejectReason(e.target.value);
                  if (rejectError) setRejectError(null);
                }}
                rows={2}
                placeholder="Why is this change request being rejected?"
                className={`w-full resize-y rounded-lg border px-3 py-2 text-sm text-gray-900 ${
                  rejectError ? "border-red-400 ring-1 ring-red-200" : "border-gray-300"
                }`}
              />
              {rejectError ? (
                <p className="mt-1 text-xs font-medium text-red-600">{rejectError}</p>
              ) : null}
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={submitReject}
                disabled={busy}
                className="inline-flex flex-1 items-center justify-center rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs font-bold text-red-700 hover:bg-red-100 disabled:opacity-50"
              >
                {busy ? "…" : "Reject"}
              </button>
              <button
                type="button"
                onClick={() => void onApprove(Number(request.id))}
                disabled={busy}
                className="inline-flex flex-1 items-center justify-center rounded-md bg-green-600 px-3 py-2 text-xs font-bold text-white hover:bg-green-700 disabled:opacity-50"
              >
                {busy ? "…" : "Approve"}
              </button>
            </div>
          </div>
        ) : (
          <div className="flex shrink-0 items-center justify-end border-t border-gray-100 px-4 py-3">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100"
            >
              Close
            </button>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}
