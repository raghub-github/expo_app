"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { LogOut, X } from "lucide-react";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import type { RiderLogoutEventRow } from "@/lib/rider-logout-types";

type RiderLogoutHistorySideSheetProps = {
  riderId: number;
  riderName?: string | null;
  open: boolean;
  onClose: () => void;
};

export function RiderLogoutHistorySideSheet({
  riderId,
  riderName,
  open,
  onClose,
}: RiderLogoutHistorySideSheetProps) {
  const [events, setEvents] = useState<RiderLogoutEventRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (!open || !riderId) return;

    let cancelled = false;
    setLoading(true);
    setError(null);

    fetch(`/api/riders/${riderId}/logout-events`, { credentials: "include" })
      .then(async (res) => {
        const json = await res.json();
        if (!res.ok || !json.success) {
          throw new Error(json.error || "Failed to load logout history");
        }
        if (cancelled) return;
        setEvents(json.data?.events ?? []);
        setTotal(json.data?.total ?? json.data?.events?.length ?? 0);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load");
          setEvents([]);
          setTotal(0);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open, riderId]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[10000] flex justify-end bg-slate-900/50 backdrop-blur-[2px]"
      role="dialog"
      aria-modal="true"
      aria-label="Logout history"
      onClick={onClose}
    >
      <div
        className="flex h-full w-full max-w-md flex-col border-l border-gray-200 bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-start justify-between gap-3 border-b border-gray-200 px-5 py-4">
          <div className="flex items-start gap-3 min-w-0">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-teal-50 text-teal-700">
              <LogOut className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <h2 className="text-lg font-bold text-gray-900">Logout history</h2>
              <p className="text-sm text-gray-500 truncate">
                {riderName?.trim() || `Rider #${riderId}`} · {total} logout{total === 1 ? "" : "s"}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 hover:text-gray-800"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {loading ? (
            <div className="flex justify-center py-16">
              <LoadingSpinner text="Loading logout history..." />
            </div>
          ) : error ? (
            <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </p>
          ) : events.length === 0 ? (
            <p className="text-sm text-gray-500 py-8 text-center">No logout events recorded yet.</p>
          ) : (
            <ul className="space-y-3">
              {events.map((ev) => (
                <li
                  key={ev.id}
                  className="rounded-xl border border-gray-200 bg-gray-50/80 px-4 py-3"
                >
                  <p className="text-sm font-semibold text-gray-900">{ev.reasonLabel}</p>
                  <p className="mt-1 text-xs text-gray-500">
                    {new Date(ev.createdAt).toLocaleString("en-IN", {
                      day: "2-digit",
                      month: "short",
                      year: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </p>
                  {ev.reasonCode === "OTHER" && ev.reasonText ? (
                    <p className="mt-2 text-xs text-gray-600 border-t border-gray-200 pt-2">
                      {ev.reasonText}
                    </p>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
