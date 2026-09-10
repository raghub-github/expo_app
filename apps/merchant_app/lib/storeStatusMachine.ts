/**
 * Pure store-status notification state machine.
 *
 * The store-status tray notification ("🟢 …is online / Waiting for orders", the kitchen
 * Prep·Ready·Out sticky, and the offline tray) must be driven by STATE TRANSITIONS, never by a
 * timer, poll, render, or AppState event. This module owns that decision as a pure reducer so it is
 * fully unit-testable and cannot accidentally couple a state *sync* to a notification *trigger*.
 *
 * Operational states (notification-facing):
 *   OFFLINE       store is not accepting orders (backend-authoritative — NOT app lifecycle)
 *   ONLINE_IDLE   store online, zero active orders → "Waiting for orders"
 *   ORDER_ACTIVE  store online with ≥1 active order → kitchen Prep·Ready·Out sticky
 *
 * The "Waiting for orders" notification fires exactly ONCE per idle session. A new idle session
 * begins only on a real transition INTO idle (OFFLINE→ONLINE_IDLE or ORDER_ACTIVE→ONLINE_IDLE).
 * Staying ONLINE_IDLE (idle→idle) produces NOTHING — clearing the tray, polling, foregrounding, or
 * an app restart mid-idle must never re-post it.
 */

export type StoreOpState = "OFFLINE" | "ONLINE_IDLE" | "ORDER_ACTIVE";

/** Persisted per store so the idle session survives background / kill / restart (§10, §42). */
export type StoreStatusSessionState = {
  opState: StoreOpState | null;
  idleSessionId: string | null;
  /** Idle session for which the "Waiting for orders" notification has already been posted. */
  idleNotifiedSessionId: string | null;
};

export type StoreStatusInputs = {
  authenticated: boolean;
  storeId: number | null;
  /** Backend-authoritative online flag (never derived from AppState/process liveness). */
  isOnline: boolean;
  /** Live active-order count (pending + preparing + ready + out-for-delivery). */
  activeOrders: number;
  /** Did the ORDER_ACTIVE kitchen body content change since the last post? */
  kitchenBodyChanged: boolean;
  /** A fresh idle-session id the caller supplies (e.g. `${storeId}:${Date.now()}`). */
  newIdleSessionId: string;
};

export type StoreStatusAction =
  | { type: "NONE"; reason: string }
  | { type: "POST_IDLE"; idleSessionId: string }
  | { type: "UPDATE_KITCHEN" }
  | { type: "POST_OFFLINE" }
  | { type: "REMOVE"; reason: string };

export function createInitialSessionState(): StoreStatusSessionState {
  return { opState: null, idleSessionId: null, idleNotifiedSessionId: null };
}

export function deriveStoreOpState(isOnline: boolean, activeOrders: number): StoreOpState {
  if (!isOnline) return "OFFLINE";
  return activeOrders > 0 ? "ORDER_ACTIVE" : "ONLINE_IDLE";
}

/**
 * Pure transition reducer: given the previous persisted session + current facts, return the next
 * session state and the single notification action to take. No side effects, no I/O.
 */
export function reduceStoreStatusSession(
  prev: StoreStatusSessionState,
  input: StoreStatusInputs
): { next: StoreStatusSessionState; action: StoreStatusAction } {
  // Logged out / no store selected → remove the tray and forget the session (§15 isolation).
  if (!input.authenticated || input.storeId == null) {
    return {
      next: createInitialSessionState(),
      action: { type: "REMOVE", reason: input.authenticated ? "NO_STORE" : "LOGOUT" },
    };
  }

  const nextState = deriveStoreOpState(input.isOnline, input.activeOrders);
  const prevState = prev.opState;

  if (nextState === "OFFLINE") {
    // Only the transition INTO offline posts the offline tray; offline→offline is silent (§16/§17).
    const action: StoreStatusAction =
      prevState !== "OFFLINE"
        ? { type: "POST_OFFLINE" }
        : { type: "NONE", reason: "OFFLINE_STABLE" };
    // Leaving online clears the idle session so the next idle entry is a fresh session.
    return {
      next: { opState: "OFFLINE", idleSessionId: null, idleNotifiedSessionId: null },
      action,
    };
  }

  if (nextState === "ORDER_ACTIVE") {
    // Kitchen sticky updates only on a real content change (new/prep/ready/out counts) — never on
    // a bare poll tick. Idle session is preserved so ORDER_ACTIVE→ONLINE_IDLE later starts anew.
    const changed = prevState !== "ORDER_ACTIVE" || input.kitchenBodyChanged;
    return {
      next: {
        opState: "ORDER_ACTIVE",
        idleSessionId: prev.idleSessionId,
        idleNotifiedSessionId: prev.idleNotifiedSessionId,
      },
      action: changed ? { type: "UPDATE_KITCHEN" } : { type: "NONE", reason: "KITCHEN_UNCHANGED" },
    };
  }

  // nextState === ONLINE_IDLE
  const enteringIdle = prevState !== "ONLINE_IDLE";
  if (enteringIdle) {
    // OFFLINE→IDLE, ORDER_ACTIVE→IDLE, or first run (prev=null): a genuinely new idle session.
    const sid = input.newIdleSessionId;
    return {
      next: { opState: "ONLINE_IDLE", idleSessionId: sid, idleNotifiedSessionId: sid },
      action: { type: "POST_IDLE", idleSessionId: sid },
    };
  }

  // Staying ONLINE_IDLE.
  const sid = prev.idleSessionId ?? input.newIdleSessionId;
  if (prev.idleNotifiedSessionId === sid) {
    // Already shown for this idle session — clear/poll/foreground/restart must not re-post (§4/§7).
    return {
      next: { opState: "ONLINE_IDLE", idleSessionId: sid, idleNotifiedSessionId: sid },
      action: { type: "NONE", reason: "SAME_IDLE_SESSION" },
    };
  }
  // Idle but this session was never notified (e.g. restored session with no prior post) → post once.
  return {
    next: { opState: "ONLINE_IDLE", idleSessionId: sid, idleNotifiedSessionId: sid },
    action: { type: "POST_IDLE", idleSessionId: sid },
  };
}
