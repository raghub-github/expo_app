"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import {
  ORDER_ROUTED_TO_ACTION_LABELS,
  type OrderRoutedToAction,
} from "@/lib/orders/stamp-order-routed-to-labels";
import { OrderNum } from "@/components/orders/orders-typography";

export type RoutedToHistoryItem = {
  id: number;
  orderId: number;
  systemUserId: number | null;
  actorEmail: string | null;
  actorName: string | null;
  actorRole: string | null;
  action: string;
  actionLabel: string | null;
  createdAt: string;
};

/** In-memory cache so reopen is instant after the first fetch. */
const historyCache = new Map<number, RoutedToHistoryItem[]>();
const historyInflight = new Map<number, Promise<RoutedToHistoryItem[]>>();

function formatWhen(iso: string | null | undefined): string {
  if (!iso?.trim()) return "—";
  try {
    return new Date(iso).toLocaleString("en-IN", {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
  } catch {
    return iso;
  }
}

function actionLabelFor(item: RoutedToHistoryItem): string {
  const raw = item.actionLabel?.trim() || "";
  if (raw) {
    // Legacy rows stored DB codes (in_transit / picked_up) — show agent-facing labels.
    return raw
      .replace(/\bin_transit\b/gi, "Dispatched")
      .replace(/\bpicked_up\b/gi, "Dispatch Ready")
      .replace(/\bdelivered\b/gi, "Delivered");
  }
  const key = item.action as OrderRoutedToAction;
  return ORDER_ROUTED_TO_ACTION_LABELS[key] ?? item.action;
}

export function peekRoutedToHistory(orderId: number): RoutedToHistoryItem[] | null {
  return historyCache.has(orderId) ? historyCache.get(orderId)! : null;
}

export function seedRoutedToHistory(
  orderId: number,
  rows: RoutedToHistoryItem[]
): void {
  historyCache.set(orderId, rows);
}

export function invalidateRoutedToHistory(orderId: number): void {
  historyCache.delete(orderId);
  historyInflight.delete(orderId);
}

export async function fetchRoutedToHistory(
  orderId: number,
  opts?: { force?: boolean }
): Promise<RoutedToHistoryItem[]> {
  if (!opts?.force) {
    const cached = historyCache.get(orderId);
    if (cached) return cached;
    const inflight = historyInflight.get(orderId);
    if (inflight) return inflight;
  }

  const promise = (async () => {
    const res = await fetch(`/api/orders/${orderId}/routed-to-history`, {
      credentials: "include",
      cache: "no-store",
    });
    const json = (await res.json()) as {
      success?: boolean;
      data?: RoutedToHistoryItem[];
      error?: string;
    };
    if (!res.ok || !json.success) {
      throw new Error(json.error || "Failed to load Routed To history");
    }
    const rows = Array.isArray(json.data) ? json.data : [];
    historyCache.set(orderId, rows);
    return rows;
  })();

  historyInflight.set(orderId, promise);
  try {
    return await promise;
  } finally {
    historyInflight.delete(orderId);
  }
}

export function OrderRoutedToHistorySideSheet({
  orderId,
  currentEmail,
  initialItems,
  onClose,
}: {
  orderId: number;
  currentEmail: string | null;
  initialItems?: RoutedToHistoryItem[] | null;
  onClose: () => void;
}) {
  const seed =
    (Array.isArray(initialItems) ? initialItems : null) ??
    peekRoutedToHistory(orderId) ??
    [];
  const [items, setItems] = useState<RoutedToHistoryItem[]>(seed);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Silent refresh — sheet is already open; never block on "Loading…".
  useEffect(() => {
    let cancelled = false;
    void fetchRoutedToHistory(orderId)
      .then((rows) => {
        if (!cancelled) {
          setItems(rows);
          setError(null);
        }
      })
      .catch((e) => {
        if (!cancelled && items.length === 0) {
          setError(e instanceof Error ? e.message : "Failed to load history");
        }
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only refetch when order changes
  }, [orderId]);

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[10000] flex justify-end bg-black/30"
      role="dialog"
      aria-modal="true"
      aria-label="Routed To history"
      onClick={onClose}
    >
      <div
        className="flex h-full w-full max-w-sm flex-col border-l border-slate-200 bg-white"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex shrink-0 items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 py-3">
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-slate-900">Routed To history</h2>
            {currentEmail ? (
              <p className="mt-0.5 truncate text-[11px] text-slate-500">{currentEmail}</p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 text-slate-500 hover:text-slate-800"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto bg-white px-4 py-2 text-[12px] text-slate-800">
          {error && items.length === 0 ? (
            <p className="py-4 text-red-600">{error}</p>
          ) : items.length === 0 ? (
            <p className="py-8 text-center text-slate-500">No history yet.</p>
          ) : (
            <ul className="divide-y divide-slate-200">
              {items.map((item, index) => {
                const meta = [
                  item.actorName?.trim() || null,
                  item.actorRole?.trim()
                    ? `${actionLabelFor(item)} : ${item.actorRole.trim()}`
                    : actionLabelFor(item),
                ]
                  .filter(Boolean)
                  .join(" • ");
                return (
                  <li
                    key={item.id}
                    className="flex items-start justify-between gap-3 py-3.5"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] font-medium text-slate-900">
                        {item.actorEmail || "Unknown"}
                      </p>
                      {meta ? (
                        <p className="mt-0.5 break-words text-[11px] text-slate-500">{meta}</p>
                      ) : null}
                      <p className="mt-0.5 whitespace-nowrap text-[11px] text-slate-500">
                        <OrderNum>{formatWhen(item.createdAt)}</OrderNum>
                      </p>
                    </div>
                    {index === 0 ? (
                      <span className="shrink-0 pt-0.5 text-[11px] text-slate-400">current</span>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
