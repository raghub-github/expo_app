"use client";

/**
 * Admin ETA timeline — operational by default, Advanced for debug fields.
 */
import { useEffect, useMemo, useState } from "react";
import { Clock3, X } from "lucide-react";
import { OrderPageOverlay } from "@/components/orders/OrderPageOverlay";
import {
  toOperationalEtaCards,
  type EtaHistoryRawEntry,
} from "@/lib/orders/eta-operational-timeline";

function formatAt(iso: string): string {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return iso;
  return d.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function formatAtShort(iso: string): string {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return iso;
  return d.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function deltaClass(d: number | null): string {
  if (d == null || Math.abs(d) < 1) return "text-slate-500";
  return d > 0 ? "text-amber-700" : "text-emerald-700";
}

export function OrderEtaHistorySideSheet({
  open,
  onClose,
  orderIdText,
}: {
  open: boolean;
  onClose: () => void;
  orderIdText: string | null;
}) {
  const [entries, setEntries] = useState<EtaHistoryRawEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [advanced, setAdvanced] = useState(false);

  useEffect(() => {
    if (!open || !orderIdText) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    void (async () => {
      try {
        const res = await fetch(
          `/api/orders/${encodeURIComponent(orderIdText)}/eta/history?audience=admin&order=desc`,
          { cache: "no-store" }
        );
        const json = (await res.json()) as {
          success?: boolean;
          entries?: EtaHistoryRawEntry[];
          error?: string;
        };
        if (cancelled) return;
        if (!res.ok || json.success === false) {
          setError(json.error ?? "Failed to load ETA history");
          setEntries([]);
          return;
        }
        setEntries(json.entries ?? []);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Failed to load ETA history");
          setEntries([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, orderIdText]);

  const opsCards = useMemo(
    () => toOperationalEtaCards(entries, { order: "desc" }),
    [entries]
  );

  if (!open) return null;

  return (
    <OrderPageOverlay
      className="fixed inset-0 z-[200] flex justify-end bg-black/30 backdrop-blur-sm"
      onBackdropClick={onClose}
    >
      <aside
        className="flex h-full w-full max-w-md flex-col bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b border-slate-200 px-4 py-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex min-w-0 items-center gap-2">
              <Clock3 className="h-4 w-4 shrink-0 text-emerald-600" />
              <h2 className="truncate text-sm font-semibold text-slate-800">
                ETA timeline
                {orderIdText ? (
                  <span className="font-normal text-slate-500">
                    {" "}
                    · <span className="font-semibold text-slate-700">{orderIdText}</span>
                  </span>
                ) : null}
              </h2>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="shrink-0 rounded-full p-1 text-slate-500 hover:bg-slate-100"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="mt-2.5 flex items-center justify-between gap-2">
            <p className="text-[11px] text-slate-500">
              {advanced
                ? "Developer view — raw audit rows"
                : "Operational view — meaningful events only"}
            </p>
            <label className="inline-flex cursor-pointer items-center gap-1.5 text-[11px] font-semibold text-slate-700">
              <input
                type="checkbox"
                className="h-3.5 w-3.5 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                checked={advanced}
                onChange={(e) => setAdvanced(e.target.checked)}
              />
              Advanced
            </label>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-3">
          {loading ? (
            <p className="text-sm text-slate-500">Loading…</p>
          ) : error ? (
            <p className="text-sm text-red-600">{error}</p>
          ) : entries.length === 0 ? (
            <p className="text-sm text-slate-500">No ETA events recorded yet.</p>
          ) : advanced ? (
            <ul className="space-y-3">
              {entries.map((e) => (
                <li
                  key={e.id}
                  className="rounded-lg border border-slate-200 bg-slate-50/80 px-3 py-2.5 text-[11px]"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-semibold text-slate-800">{e.label}</p>
                      <p className="text-slate-500">{formatAt(e.at)}</p>
                    </div>
                    <span className="shrink-0 rounded bg-white px-1.5 py-0.5 font-mono text-[10px] text-slate-600 border border-slate-200">
                      v{e.etaVersion}
                    </span>
                  </div>
                  <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-slate-700">
                    <span>Trigger</span>
                    <span className="text-right font-medium">{e.etaSource ?? e.reason}</span>
                    <span>Stage</span>
                    <span className="text-right font-medium">{e.stage ?? "—"}</span>
                    <span>Old → New</span>
                    <span className="text-right font-medium tabular-nums">
                      {e.oldEtaMinutes ?? "—"} → {e.newEtaMinutes ?? "—"} min
                    </span>
                    <span>Delta</span>
                    <span
                      className={`text-right font-semibold tabular-nums ${deltaClass(e.deltaMinutes)}`}
                    >
                      {e.deltaMinutes == null
                        ? "—"
                        : e.deltaMinutes > 0
                          ? `+${e.deltaMinutes} min`
                          : `${e.deltaMinutes} min`}
                    </span>
                    <span>Total / Display</span>
                    <span className="text-right tabular-nums">
                      {e.totalEta ?? "—"} / {e.displayEta ?? "—"}
                    </span>
                    <span>Confidence</span>
                    <span className="text-right font-medium">{e.confidence ?? "—"}</span>
                    {e.orderStatus ? (
                      <>
                        <span>Order status</span>
                        <span className="text-right font-medium">{e.orderStatus}</span>
                      </>
                    ) : null}
                  </div>
                  {e.detail ? <p className="mt-1.5 text-slate-600">{e.detail}</p> : null}
                </li>
              ))}
            </ul>
          ) : (
            <ul className="space-y-3">
              {opsCards.map((c) => (
                <li
                  key={c.key}
                  className="rounded-xl border border-slate-200 bg-white px-3.5 py-3 shadow-sm"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-slate-900">{c.title}</p>
                      <p className="mt-0.5 text-[11px] text-slate-500">
                        {formatAtShort(c.at)}
                        {c.atEnd ? ` – ${formatAtShort(c.atEnd)}` : ""}
                      </p>
                    </div>
                    {c.isGrouped ? (
                      <span className="shrink-0 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-800 ring-1 ring-emerald-200">
                        {c.groupedCount} updates
                      </span>
                    ) : null}
                  </div>

                  <p className="mt-2 text-[12px] leading-snug text-slate-700">{c.summary}</p>

                  <div className="mt-2.5 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-slate-600">
                    {c.etaBefore != null || c.etaAfter != null ? (
                      <span>
                        <span className="text-slate-400">ETA </span>
                        <span className="font-semibold tabular-nums text-slate-800">
                          {c.etaBefore != null ? `${Math.round(c.etaBefore)} min` : "—"}
                          {" → "}
                          {c.etaAfter != null ? `${Math.round(c.etaAfter)} min` : "—"}
                        </span>
                      </span>
                    ) : null}
                    <span>
                      <span className="text-slate-400">Reason </span>
                      <span className="font-medium text-slate-800">{c.reasonLabel}</span>
                    </span>
                    {c.confidence ? (
                      <span>
                        <span className="text-slate-400">Confidence </span>
                        <span className="font-medium text-slate-800">{c.confidence}</span>
                      </span>
                    ) : null}
                  </div>
                  {c.etaTrail ? (
                    <p className="mt-1.5 font-mono text-[10px] text-slate-500">{c.etaTrail}</p>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </div>
      </aside>
    </OrderPageOverlay>
  );
}
