"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Ban, Loader2, ShieldOff, X } from "lucide-react";
import { toast } from "sonner";
import type {
  CustomerServiceBlockHistoryRow,
  CustomerServiceBlockRow,
  CustomerServiceType,
} from "@/lib/db/operations/customer-service-blocks";
import {
  CUSTOMER_HOME_SERVICES,
  customerServiceLabel,
  formatBlockTimestamp,
} from "@/lib/customers/customer-home-services";

type CustomerBlockSideSheetProps = {
  open: boolean;
  onClose: () => void;
  customerId: string;
  customerName: string;
  activeBlocks: CustomerServiceBlockRow[];
  blockHistory?: CustomerServiceBlockHistoryRow[];
  onUpdated: () => void;
};

export function CustomerBlockSideSheet({
  open,
  onClose,
  customerId,
  customerName,
  activeBlocks,
  blockHistory = [],
  onUpdated,
}: CustomerBlockSideSheetProps) {
  const [mode, setMode] = useState<"block" | "unblock">("block");
  const [selected, setSelected] = useState<CustomerServiceType[]>([]);
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [unblockingId, setUnblockingId] = useState<number | null>(null);

  const MIN_REASON_LENGTH = 5;

  const blockedServiceTypes = useMemo(
    () => new Set(activeBlocks.map((b) => b.serviceType)),
    [activeBlocks]
  );

  const blockableOptions = useMemo(
    () => CUSTOMER_HOME_SERVICES.filter((opt) => !blockedServiceTypes.has(opt.serviceType)),
    [blockedServiceTypes]
  );

  const unblockHistory = useMemo(
    () => blockHistory.filter((h) => h.action === "unblock").slice(0, 20),
    [blockHistory]
  );

  useEffect(() => {
    if (!open) return;
    setMode("block");
    setSelected([]);
    setReason("");
    setUnblockingId(null);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const toggleService = (id: CustomerServiceType) => {
    setSelected((prev) => (prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]));
  };

  const canBlockSubmit =
    selected.length > 0 &&
    reason.trim().length >= MIN_REASON_LENGTH &&
    blockableOptions.length > 0 &&
    !submitting;

  const handleBlockSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (selected.length === 0) {
      toast.error("Select at least one service.");
      return;
    }
    if (reason.trim().length < MIN_REASON_LENGTH) {
      toast.error(
        `Enter a reason (min ${MIN_REASON_LENGTH} characters). This will be shown to the customer.`
      );
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch(`/api/customers/${encodeURIComponent(customerId)}/service-blocks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          services: selected,
          reason: reason.trim(),
        }),
      });
      const json = (await res.json()) as { success?: boolean; error?: string };
      if (!res.ok || !json.success) {
        throw new Error(typeof json.error === "string" ? json.error : "Action failed");
      }
      onUpdated();
      onClose();
      toast.success("Selected services blocked.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Action failed");
    } finally {
      setSubmitting(false);
    }
  };

  const handleUnblockOne = async (block: CustomerServiceBlockRow) => {
    setUnblockingId(block.id);
    try {
      const res = await fetch(`/api/customers/${encodeURIComponent(customerId)}/service-blocks`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          services: [block.serviceType],
        }),
      });
      const json = (await res.json()) as { success?: boolean; error?: string };
      if (!res.ok || !json.success) {
        throw new Error(typeof json.error === "string" ? json.error : "Unblock failed");
      }
      onUpdated();
      toast.success(`${customerServiceLabel(block.serviceType)} unblocked.`);
      if (activeBlocks.length <= 1) {
        setMode("block");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Unblock failed");
    } finally {
      setUnblockingId(null);
    }
  };

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[10000] flex justify-end bg-slate-900/50 backdrop-blur-[2px]"
      role="dialog"
      aria-modal="true"
      aria-label="Block customer services"
      onClick={onClose}
    >
      <div
        className="flex h-full w-full max-w-lg flex-col border-l border-slate-200 bg-white shadow-2xl animate-[slideInRight_0.28s_cubic-bezier(0.16,1,0.3,1)]"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="shrink-0 border-b border-gray-200 px-4 py-3">
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2.5">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-rose-100 text-rose-700">
                <Ban className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <h2 className="text-sm font-semibold text-[#121212]">Block services</h2>
                <p className="mt-0.5 truncate text-[11px] text-[#121212]/55">{customerName}</p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-100"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
          <div className="mb-4 flex rounded-lg border border-gray-200 bg-gray-50 p-0.5">
            <button
              type="button"
              onClick={() => setMode("block")}
              className={`flex-1 rounded-md py-1.5 text-xs font-semibold ${mode === "block" ? "bg-white text-rose-700 shadow-sm" : "text-gray-500"}`}
            >
              Block
            </button>
            <button
              type="button"
              onClick={() => {
                setMode("unblock");
                setSelected([]);
              }}
              className={`flex-1 rounded-md py-1.5 text-xs font-semibold ${mode === "unblock" ? "bg-white text-teal-700 shadow-sm" : "text-gray-500"}`}
            >
              Unblock
              {activeBlocks.length > 0 ? (
                <span className="ml-1.5 inline-flex min-w-[1.125rem] items-center justify-center rounded-full bg-teal-100 px-1 text-[10px] text-teal-800">
                  {activeBlocks.length}
                </span>
              ) : null}
            </button>
          </div>

          {mode === "block" ? (
            <form id="customer-block-form" onSubmit={handleBlockSubmit} className="space-y-4">
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Services</p>
                <div className="grid grid-cols-2 gap-2">
                  {CUSTOMER_HOME_SERVICES.map((opt) => {
                    const isBlocked = blockedServiceTypes.has(opt.serviceType);
                    const isSelected = selected.includes(opt.serviceType);
                    return (
                      <label
                        key={opt.homeId}
                        className={`flex min-h-[6.75rem] flex-col items-center justify-center gap-1.5 rounded-xl border px-2 py-3 text-center transition ${
                          isBlocked
                            ? "cursor-not-allowed border-gray-100 bg-gray-50 opacity-70"
                            : isSelected
                              ? "cursor-pointer border-teal-300 bg-teal-50/60"
                              : "cursor-pointer border-gray-200 hover:border-gray-300"
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={isSelected}
                          disabled={isBlocked}
                          onChange={() => toggleService(opt.serviceType)}
                          className="size-4 shrink-0 rounded border-gray-300 text-teal-600 disabled:opacity-40"
                        />
                        <span className="block text-sm font-semibold leading-tight text-gray-900">{opt.label}</span>
                        {opt.pill ? (
                          <span className="block text-[10px] leading-snug text-gray-500">{opt.pill}</span>
                        ) : null}
                        {isBlocked ? (
                          <span className="rounded-full bg-rose-100 px-1.5 py-0.5 text-[9px] font-bold uppercase text-rose-700">
                            Blocked
                          </span>
                        ) : null}
                      </label>
                    );
                  })}
                </div>
                {blockableOptions.length === 0 ? (
                  <p className="mt-2 text-xs text-gray-500">All home page services are already blocked.</p>
                ) : null}
              </div>

              <div>
                <label
                  htmlFor="block-reason"
                  className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-500"
                >
                  Reason (shown to customer)
                </label>
                <textarea
                  id="block-reason"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  rows={4}
                  placeholder="Explain why this customer is blocked from the selected service(s)…"
                  className="w-full resize-none rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-teal-400 focus:outline-none focus:ring-2 focus:ring-teal-400/20"
                />
              </div>
            </form>
          ) : (
            <div className="space-y-4">
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
                  Blocked services
                </p>
                {activeBlocks.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50 px-4 py-8 text-center">
                    <p className="text-sm font-medium text-gray-700">No blocked services</p>
                    <p className="mt-1 text-xs text-gray-500">
                      When you block a service, it will appear here with an unblock option.
                    </p>
                  </div>
                ) : (
                  <ul className="space-y-2">
                    {activeBlocks.map((block) => {
                      const isUnblocking = unblockingId === block.id;
                      return (
                        <li
                          key={block.id}
                          className="rounded-xl border border-rose-100 bg-rose-50/50 p-3"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-semibold text-gray-900">
                                {customerServiceLabel(block.serviceType)}
                              </p>
                              <p className="mt-1 text-sm text-rose-900/90">{block.reason}</p>
                              <p className="mt-2 text-[11px] text-gray-500">
                                Blocked {formatBlockTimestamp(block.createdAt)}
                                {block.blockedByEmail ? ` · by ${block.blockedByEmail}` : ""}
                              </p>
                            </div>
                            <button
                              type="button"
                              disabled={isUnblocking || submitting}
                              onClick={() => void handleUnblockOne(block)}
                              className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-teal-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-teal-800 disabled:opacity-60"
                            >
                              {isUnblocking ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <ShieldOff className="h-3.5 w-3.5" />
                              )}
                              Unblock
                            </button>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>

              {unblockHistory.length > 0 ? (
                <div>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
                    Unblock history
                  </p>
                  <ul className="space-y-2">
                    {unblockHistory.map((entry) => (
                      <li
                        key={entry.id}
                        className="rounded-xl border border-teal-100 bg-teal-50/40 px-3 py-2.5"
                      >
                        <p className="text-sm font-semibold text-gray-900">
                          {customerServiceLabel(entry.serviceType)}
                        </p>
                        <p className="mt-1 text-[11px] text-gray-600">
                          Unblocked {formatBlockTimestamp(entry.createdAt)}
                          {entry.actorEmail ? (
                            <>
                              {" "}
                              · by <span className="font-medium text-teal-800">{entry.actorEmail}</span>
                            </>
                          ) : null}
                        </p>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          )}
        </div>

        {mode === "block" ? (
          <footer className="shrink-0 border-t border-gray-200 px-4 py-3">
            <button
              type="submit"
              form="customer-block-form"
              disabled={!canBlockSubmit}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-rose-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-45"
            >
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Ban className="h-4 w-4" />}
              Block selected services
            </button>
          </footer>
        ) : null}
      </div>
    </div>,
    document.body
  );
}
