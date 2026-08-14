"use client";

import { useCallback, useEffect, useState } from "react";
import { History, Lock, Unlock } from "lucide-react";

type FreezeAction = {
  action: string;
  reason: string | null;
  createdAt: string | null;
  performedByEmail: string | null;
  performedByName: string | null;
};

type FreezeState = {
  isFrozen: boolean;
  freezeReason: string | null;
  frozenAt: string | null;
  frozenByEmail?: string | null;
  frozenByName?: string | null;
  latestAction: FreezeAction | null;
};

type HistoryRow = FreezeAction & {
  id?: number;
  previousState?: string | null;
  newState?: string | null;
};

export function MerchantWalletFreezeCard({
  storeId,
  canEdit,
}: {
  storeId: string;
  canEdit: boolean;
}) {
  const [state, setState] = useState<FreezeState | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [modal, setModal] = useState<"freeze" | "unfreeze" | null>(null);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [history, setHistory] = useState<HistoryRow[]>([]);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/merchant/stores/${storeId}/wallet-freeze`, {
        credentials: "include",
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setState(data.data as FreezeState);
      }
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, [storeId]);

  useEffect(() => {
    void load();
  }, [load]);

  const fetchHistory = async () => {
    try {
      const res = await fetch(
        `/api/merchant/stores/${storeId}/wallet-freeze-history?limit=20`,
        { credentials: "include" },
      );
      const data = await res.json();
      if (res.ok && data.data?.history) setHistory(data.data.history);
    } catch {
      setHistory([]);
    }
  };

  const submit = async () => {
    if (!modal) return;
    if (modal === "freeze" && !reason.trim()) {
      setError("Freeze reason is required");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/merchant/stores/${storeId}/wallet-freeze`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ action: modal, reason: reason.trim() || undefined }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Request failed");
        return;
      }
      setModal(null);
      setReason("");
      if (data.data) setState(data.data as FreezeState);
      else await load();
      if (historyOpen) void fetchHistory();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request failed");
    } finally {
      setSubmitting(false);
    }
  };

  const isFrozen = Boolean(state?.isFrozen);
  const latest = state?.latestAction;
  const latestDate = latest?.createdAt ? new Date(latest.createdAt) : null;

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <h3 className="text-sm font-semibold text-gray-900 mb-1">Merchant Wallet</h3>
      <p className="text-xs text-gray-500 mb-3">
        Freeze this store wallet to block withdrawals. Store open/closed status is not changed.
        All actions are tracked with agent email.
      </p>

      <div
        className={`rounded-lg border-2 p-3 mb-3 ${
          isFrozen ? "bg-red-50/80 border-red-200" : "bg-emerald-50/80 border-emerald-200"
        }`}
      >
        <div className="flex items-center gap-2 mb-1">
          {isFrozen ? (
            <Lock className="h-4 w-4 text-red-600 shrink-0" />
          ) : (
            <Unlock className="h-4 w-4 text-emerald-600 shrink-0" />
          )}
          <span className={`text-sm font-semibold ${isFrozen ? "text-red-800" : "text-emerald-800"}`}>
            {loading ? "Loading…" : isFrozen ? "Wallet Frozen" : "Wallet Active"}
          </span>
        </div>
        {isFrozen && state?.freezeReason ? (
          <p className="text-xs text-gray-700 mt-1">
            <span className="font-medium">Reason: </span>
            {state.freezeReason}
          </p>
        ) : null}
        {latest ? (
          <p className="text-xs text-gray-700 mt-1">
            <span className="font-medium">Latest: </span>
            {latest.action === "freeze" ? "Frozen" : "Unfrozen"} by{" "}
            <span className="font-medium">
              {latest.performedByEmail ?? latest.performedByName ?? "Agent"}
            </span>
            {latestDate && !Number.isNaN(latestDate.getTime())
              ? ` on ${latestDate.toLocaleString()}`
              : ""}
          </p>
        ) : (
          !loading && <p className="text-xs text-gray-500 mt-1">No freeze/unfreeze history yet.</p>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {canEdit ? (
          <>
            <button
              type="button"
              onClick={() => {
                setModal("freeze");
                setError(null);
                setReason("");
              }}
              disabled={isFrozen || submitting || loading}
              className="px-3 py-1.5 text-sm font-medium bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Freeze Wallet
            </button>
            <button
              type="button"
              onClick={() => {
                setModal("unfreeze");
                setError(null);
                setReason("");
              }}
              disabled={!isFrozen || submitting || loading}
              className="px-3 py-1.5 text-sm font-medium bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Unfreeze Wallet
            </button>
          </>
        ) : null}
        <button
          type="button"
          onClick={() => {
            setHistoryOpen(!historyOpen);
            if (!historyOpen) void fetchHistory();
          }}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
        >
          <History className="h-4 w-4" /> View history
        </button>
      </div>

      {historyOpen ? (
        <div className="mt-3 rounded-lg border border-gray-200 bg-gray-50 p-3 max-h-40 overflow-y-auto">
          <p className="text-xs font-semibold text-gray-800 mb-2">Freeze / Unfreeze history</p>
          {history.length === 0 ? (
            <p className="text-xs text-gray-600">No history or loading…</p>
          ) : (
            <ul className="space-y-2 text-xs text-gray-800">
              {history.map((h, i) => (
                <li key={h.id ?? i} className="flex flex-wrap gap-x-2 gap-y-0.5 items-baseline">
                  <span className="font-semibold text-gray-900">
                    {h.action === "freeze" ? "Frozen" : "Unfrozen"}
                  </span>
                  <span className="text-gray-800">
                    by {h.performedByEmail ?? h.performedByName ?? "—"}
                  </span>
                  <span className="text-gray-700">
                    {h.createdAt ? new Date(h.createdAt).toLocaleString() : ""}
                  </span>
                  {h.reason ? <span className="text-gray-800">— {h.reason}</span> : null}
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}

      {modal ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
          onClick={() => !submitting && setModal(null)}
        >
          <div
            className="bg-white rounded-xl shadow-xl max-w-md w-full p-6 space-y-4 border border-gray-100"
            onClick={(e) => e.stopPropagation()}
          >
            <h4 className="font-semibold text-gray-900 text-lg flex items-center gap-2">
              {modal === "freeze" ? (
                <Lock className="h-5 w-5 text-red-500" />
              ) : (
                <Unlock className="h-5 w-5 text-emerald-500" />
              )}
              {modal === "freeze" ? "Freeze Merchant Wallet" : "Unfreeze Merchant Wallet"}
            </h4>
            <p className="text-sm text-gray-600">
              {modal === "freeze"
                ? "Withdrawals from this store wallet will be blocked until unfrozen. Store open/closed status is not changed."
                : "Withdrawals from this store wallet will be available again."}
            </p>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Reason {modal === "freeze" ? "*" : "(optional)"}
              </label>
              <input
                type="text"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Enter reason"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-500 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
            {error ? (
              <p className="text-sm text-red-700 bg-red-50 px-3 py-2 rounded-lg">{error}</p>
            ) : null}
            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => !submitting && setModal(null)}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-200 hover:bg-gray-300 rounded-lg"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void submit()}
                disabled={submitting || (modal === "freeze" && !reason.trim())}
                className="px-4 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                {submitting ? "Submitting..." : modal === "freeze" ? "Freeze Wallet" : "Unfreeze Wallet"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
