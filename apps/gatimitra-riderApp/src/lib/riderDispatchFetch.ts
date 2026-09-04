import { NetworkTimeoutError } from "@gatimitra/sdk";
import { riderApi, type RiderOrderSummary } from "@/src/services/api/riderApi";
import { riderDispatchLog, riderDispatchWarn } from "@/src/lib/rider-dispatch-log";

const FETCH_G = "__gmRiderDispatchFetchV2";

type FetchRuntime = {
  availableInFlight: Promise<RiderOrderSummary[]> | null;
  pendingInFlight: Promise<RiderOrderSummary[]> | null;
};

function fetchRuntime(): FetchRuntime {
  const root = globalThis as typeof globalThis & { [FETCH_G]?: FetchRuntime };
  if (!root[FETCH_G]) {
    root[FETCH_G] = { availableInFlight: null, pendingInFlight: null };
  }
  return root[FETCH_G]!;
}

function coalesceInFlight(
  slot: "availableInFlight" | "pendingInFlight",
  run: Promise<RiderOrderSummary[]>
): Promise<RiderOrderSummary[]> {
  const rt = fetchRuntime();
  const existing = rt[slot];
  if (existing) return existing;
  const tracked = run.finally(() => {
    if (rt[slot] === tracked) rt[slot] = null;
  });
  rt[slot] = tracked;
  return tracked;
}

async function loadAvailable(signal?: AbortSignal): Promise<RiderOrderSummary[]> {
  const t0 = Date.now();
  riderDispatchLog("fetch available start");
  try {
    const rows = await riderApi.getAvailableOrders(signal);
    riderDispatchLog("fetch available done", {
      count: rows.length,
      duration: Date.now() - t0,
    });
    return rows;
  } catch (err) {
    riderDispatchWarn("fetch available failed", {
      message: err instanceof Error ? err.message : String(err),
      duration: Date.now() - t0,
    });
    throw err;
  }
}

/**
 * Session-layer fetches for the dispatch recovery loop.
 * Not shared with React Query abort signals — a cancelled observer must not
 * kill the lifecycle poll that idle Home depends on.
 */
export async function fetchAvailableOrdersForDispatch(
  signal?: AbortSignal
): Promise<RiderOrderSummary[]> {
  if (signal) return loadAvailable(signal);
  return coalesceInFlight("availableInFlight", loadAvailable());
}

export async function fetchPendingOffersForDispatch(
  signal?: AbortSignal
): Promise<RiderOrderSummary[]> {
  const run = (async () => {
    const t0 = Date.now();
    riderDispatchLog("fetch pending start");
    try {
      const rows = await riderApi.getPendingOffers(signal);
      riderDispatchLog("fetch pending done", {
        count: rows.length,
        duration: Date.now() - t0,
      });
      return rows;
    } catch (err) {
      riderDispatchWarn("fetch pending failed", {
        message: err instanceof Error ? err.message : String(err),
        duration: Date.now() - t0,
      });
      throw err;
    }
  })();
  if (signal) return run;
  return coalesceInFlight("pendingInFlight", run);
}

export function clearDispatchFetchInFlight(): void {
  const rt = fetchRuntime();
  rt.availableInFlight = null;
  rt.pendingInFlight = null;
}

export function isDispatchFetchTimeoutError(err: unknown): boolean {
  return err instanceof NetworkTimeoutError;
}
