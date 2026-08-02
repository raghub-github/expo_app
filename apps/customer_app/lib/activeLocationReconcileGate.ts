/**
 * Session gate: cold-start / resume reconcile must finish before background GPS
 * sync or home GPS fill can push to the store / active-location.
 */

type Listener = () => void;

/** `deferred` = try again later (e.g. SMS still blocking); do not open the gate. */
export type ActiveLocationReconcileWorkResult = "done" | "deferred";

let reconcileEpoch = 0;
let coldStartReconcileDone = false;
let inFlight: Promise<void> | null = null;
const listeners = new Set<Listener>();

function notify(): void {
  for (const listener of listeners) {
    try {
      listener();
    } catch {
      // ignore subscriber errors
    }
  }
}

export function beginActiveLocationReconcile(): number {
  coldStartReconcileDone = false;
  reconcileEpoch += 1;
  notify();
  return reconcileEpoch;
}

export function endActiveLocationReconcile(epoch: number): void {
  if (epoch === reconcileEpoch) {
    coldStartReconcileDone = true;
    notify();
  }
}

export function isActiveLocationReconcileReady(): boolean {
  return coldStartReconcileDone;
}

/**
 * Dedup concurrent bootstrap/reconcile runners (RootLayout + SheetsHost).
 * Resume passes `{ force: true }` so a new GPS check still runs.
 * Return `"deferred"` from work when SMS/permission blocks — gate stays closed.
 */
export async function runExclusiveActiveLocationReconcile(
  work: () => Promise<ActiveLocationReconcileWorkResult | void>,
  options?: { force?: boolean }
): Promise<void> {
  if (inFlight) {
    await inFlight;
  }
  if (!options?.force && coldStartReconcileDone) return;

  const epoch = beginActiveLocationReconcile();
  const run = (async () => {
    let deferred = false;
    try {
      const result = await work();
      deferred = result === "deferred";
    } finally {
      if (!deferred) {
        endActiveLocationReconcile(epoch);
      } else {
        // Keep gate closed; allow another caller to begin a new epoch.
        if (epoch === reconcileEpoch) {
          coldStartReconcileDone = false;
          notify();
        }
      }
      inFlight = null;
    }
  })();
  inFlight = run;
  await run;
}

/** Subscribe to gate changes (e.g. React effects waiting to fill GPS). */
export function subscribeActiveLocationReconcileGate(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Tests / logout: allow next cold start to run reconcile again. */
export function resetActiveLocationReconcileGate(): void {
  coldStartReconcileDone = false;
  inFlight = null;
  notify();
}
