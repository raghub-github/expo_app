/**
 * Board / realtime reconciliation for GLOBAL order termination (Guarantee B).
 *
 * When ANY surface (another phone, Admin, Partner Website, timeout) moves an
 * order out of CREATED, stop that order's alert on THIS device — even if the
 * Incoming sheet is closed and the buzzer was already locally muted.
 *
 * Paths:
 *   1. Orders board left CREATED (Supabase postgres_changes / poll)
 *   2. dash-mx-incoming:{storeId} broadcast (incoming.resolved) — same fan-out
 *      partnersite / dashboard already use; Partner App was missing this
 *   3. Authoritative fetch while native FGS still owns a session whose board
 *      row is stale CREATED or missing (FCM stop missed / JS thawed late)
 *
 * This must never publish a mute preference or touch other devices' audio settings.
 */
import { useEffect, useMemo, useRef } from "react";
import { AppState } from "react-native";
import { useAuth } from "@/context/AuthContext";
import { useOrdersContext } from "@/context/OrdersContext";
import { useSelectedStore } from "@/context/SelectedStoreContext";
import {
  applyGlobalOrderAlertStop,
  getNewOrderAlertSession,
  hasLocalNewOrderAlertSession,
} from "@/lib/newOrderAlertManager";
import {
  isIncomingOrderResolved,
  markIncomingOrderResolved,
} from "@/lib/incomingOrderDismissed";
import { getSupabaseAuth } from "@/lib/supabaseClient";
import { fetchFoodOrder } from "@/services/ordersApi";
import { getActiveNativeOrderAlert } from "@gatimitra/expo-push-kit";

const DASH_MX_INCOMING_RESOLVED_EVENT = "resolved";
const PENDING_ACCEPT = new Set(["CREATED", "NEW", "PLACED"]);

function dashMxIncomingChannel(storeId: number | string): string {
  return `dash-mx-incoming:${storeId}`;
}

function stopReasonForStatus(status: string | null | undefined): "accepted" | "rejected" | "expired" | "cancelled" {
  const s = String(status ?? "").trim().toLowerCase();
  if (s === "rejected") return "rejected";
  if (s === "cancelled") return "cancelled";
  if (s === "expired") return "expired";
  return "accepted";
}

function isPendingAcceptStatus(status: string | null | undefined): boolean {
  const u = String(status ?? "").trim().toUpperCase();
  return !u || PENDING_ACCEPT.has(u);
}

function isNumericOrderKey(value: string): boolean {
  return /^\d+$/.test(value);
}

function tokenFromSession(sid: string): string {
  if (!sid) return "";
  const parts = sid.split(":");
  if (parts[0] === "MERCHANT_NEW_ORDER" && parts[1]) return parts[1];
  if (parts[0] === "RIDER_NEW_ORDER" && parts[1]) return parts[1];
  if (sid.startsWith("merchant-order-")) return sid.slice("merchant-order-".length);
  if (sid.startsWith("rider-offer-")) return sid.slice("rider-offer-".length);
  return "";
}

/**
 * Board rows key on numeric orders_food.id. Prefer that over GMF/display text
 * so GlobalOrderAlertStopSync can match CREATED → terminal transitions.
 */
function nativeOwnedOrderKey(active: {
  orderId?: string;
  offerId?: string;
  sessionId?: string;
} | null): string {
  if (!active) return "";
  const fromSession = tokenFromSession(String(active.sessionId ?? "").trim());
  if (fromSession && isNumericOrderKey(fromSession)) return fromSession;
  const direct = String(active.orderId ?? active.offerId ?? "").trim();
  if (direct && isNumericOrderKey(direct)) return direct;
  if (fromSession) return fromSession;
  return direct;
}

function stageFromPipeline(
  pipeline: string | null | undefined
): "preparing" | "ready" | "rejected" | "delivered" {
  const u = String(pipeline ?? "").trim().toUpperCase();
  if (u === "ACCEPTED" || u === "PREPARING") return "preparing";
  if (u === "READY_FOR_PICKUP" || u === "READY") return "ready";
  if (u === "CANCELLED" || u === "REJECTED" || u === "EXPIRED") return "rejected";
  if (u === "DELIVERED") return "delivered";
  return "preparing";
}

export default function GlobalOrderAlertStopSync() {
  const { orders, upsertOrder } = useOrdersContext();
  const { token } = useAuth();
  const { selectedStore, managedStores } = useSelectedStore();
  const seenTerminal = useRef<Set<string>>(new Set());
  const nativeOrderIdRef = useRef<string>("");
  const nativeSessionIdRef = useRef<string>("");
  const verifyInFlightRef = useRef<Set<string>>(new Set());
  const ordersRef = useRef(orders);
  ordersRef.current = orders;
  const upsertOrderRef = useRef(upsertOrder);
  upsertOrderRef.current = upsertOrder;
  const tokenRef = useRef(token);
  tokenRef.current = token;

  const storeIds = useMemo(() => {
    const coerce = (raw: unknown): number | null => {
      const n = Number(raw);
      return Number.isFinite(n) && n > 0 ? n : null;
    };
    const fromManaged = managedStores
      .map((s) => coerce(s.id))
      .filter((id): id is number => id != null);
    if (fromManaged.length > 0) return [...new Set(fromManaged)];
    const selected = coerce(selectedStore?.id);
    return selected != null ? [selected] : [];
  }, [managedStores, selectedStore?.id]);

  const storeIdsKey = storeIds.join(",");

  const maybeStop = (key: string, status: string | null | undefined) => {
    const id = String(key ?? "").trim();
    if (!id || seenTerminal.current.has(id)) return;
    seenTerminal.current.add(id);
    void applyGlobalOrderAlertStop(id, stopReasonForStatus(status));
    // Also stop by the live native session id (store-scoped MERCHANT_NEW_ORDER:…).
    const nativeSid = nativeSessionIdRef.current;
    if (nativeSid) {
      const token = tokenFromSession(nativeSid);
      if (token === id || nativeSid === id) {
        void applyGlobalOrderAlertStop(nativeSid, stopReasonForStatus(status));
      }
    }
  };

  const refreshNative = async (): Promise<{ orderId: string; sessionId: string }> => {
    try {
      const active = await getActiveNativeOrderAlert();
      const orderId = nativeOwnedOrderKey(active);
      const sessionId = String(active?.sessionId ?? "").trim();
      nativeOrderIdRef.current = orderId;
      nativeSessionIdRef.current = sessionId;
      return { orderId, sessionId };
    } catch {
      nativeOrderIdRef.current = "";
      nativeSessionIdRef.current = "";
      return { orderId: "", sessionId: "" };
    }
  };

  /** When board is stale but native is still ringing, ask the API. */
  const verifyOwnedAgainstServer = async (ownedId: string) => {
    const id = String(ownedId ?? "").trim();
    if (!id || !isNumericOrderKey(id) || seenTerminal.current.has(id)) return;
    if (verifyInFlightRef.current.has(id)) return;
    const auth = tokenRef.current;
    if (!auth || storeIds.length === 0) return;

    const local = ordersRef.current.find((o) => String(o.id) === id);
    if (local && local.status !== "created") {
      maybeStop(id, local.status);
      return;
    }

    verifyInFlightRef.current.add(id);
    try {
      const foodId = parseInt(id, 10);
      const tryIds =
        local?.merchantStoreId != null && storeIds.includes(local.merchantStoreId)
          ? [local.merchantStoreId, ...storeIds.filter((s) => s !== local.merchantStoreId)]
          : storeIds;
      for (const sid of tryIds) {
        try {
          const updated = await fetchFoodOrder(sid, foodId, auth);
          const pipeline = String(updated.order_status ?? "").trim().toUpperCase();
          if (!pipeline || isPendingAcceptStatus(pipeline)) return;
          markIncomingOrderResolved({
            orderCoreId: updated.orders_core_id,
            foodId: id,
          });
          const existing = ordersRef.current.find((o) => String(o.id) === id);
          if (existing) {
            upsertOrderRef.current({
              ...existing,
              status: stageFromPipeline(pipeline) as typeof existing.status,
              pipelineStatus: pipeline,
            });
          }
          maybeStop(id, stageFromPipeline(pipeline));
          return;
        } catch {
          /* try next managed store */
        }
      }
    } finally {
      verifyInFlightRef.current.delete(id);
    }
  };

  const reconcileFromBoard = async () => {
    const { orderId: nativeOrderId } = await refreshNative();
    const jsSession = getNewOrderAlertSession();
    const jsOrderId = String(jsSession?.orderId ?? "").trim();
    const jsLive =
      jsSession != null &&
      (jsSession.state === "playing" || jsSession.state === "queued");
    const board = ordersRef.current;

    for (const ownedId of [nativeOrderId, jsLive ? jsOrderId : ""]) {
      if (!ownedId) continue;
      const row = board.find((o) => String(o.id) === ownedId);
      if (!row || row.status !== "created") {
        maybeStop(ownedId, row?.status ?? "accepted");
        continue;
      }
      // Board still says CREATED while native/JS owns it — confirm with server
      // (Partner Website accept can land before postgres_changes / poll).
      void verifyOwnedAgainstServer(ownedId);
    }

    for (const order of board) {
      if (!order?.id || order.id.startsWith("core-")) continue;
      if (order.status === "created") continue;

      const key = String(order.id);
      const watched =
        (jsLive && key === jsOrderId) ||
        key === nativeOrderId ||
        hasLocalNewOrderAlertSession(key) ||
        isIncomingOrderResolved(order.ordersCoreId, key);
      if (!watched) continue;
      maybeStop(key, order.status);
    }

    if (seenTerminal.current.size > 80) {
      seenTerminal.current = new Set([...seenTerminal.current].slice(-40));
    }
  };

  // ── Board changes ────────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (cancelled) return;
      await reconcileFromBoard();
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reconcile reads refs
  }, [orders]);

  // ── App resume + light poll while native owns an alert ───────────────────
  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setInterval> | null = null;

    const tick = async () => {
      if (cancelled) return;
      const { orderId } = await refreshNative();
      if (!orderId) return;
      await reconcileFromBoard();
      void verifyOwnedAgainstServer(orderId);
    };

    void tick();
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") void tick();
    });
    // Native FGS can outlive a missed FCM stop while JS is briefly alive in bg.
    timer = setInterval(() => {
      if (cancelled) return;
      if (!nativeOrderIdRef.current && !hasLocalNewOrderAlertSession(getNewOrderAlertSession()?.orderId)) {
        return;
      }
      void tick();
    }, 8_000);

    return () => {
      cancelled = true;
      sub.remove();
      if (timer) clearInterval(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeIdsKey, token]);

  // ── Supabase broadcast: incoming.resolved (partnersite / other phones) ───
  useEffect(() => {
    const ids = storeIdsKey
      .split(",")
      .map((s) => Number(s))
      .filter((n) => Number.isFinite(n) && n > 0);
    if (ids.length === 0) return undefined;

    const supabase = getSupabaseAuth();
    if (!supabase) return undefined;

    let cancelled = false;
    const channels = ids.map((storeId) => {
      const topic = dashMxIncomingChannel(storeId);
      const channel = supabase.channel(topic, {
        config: { broadcast: { ack: false } },
      });
      channel
        .on("broadcast", { event: DASH_MX_INCOMING_RESOLVED_EVENT }, (msg) => {
          if (cancelled) return;
          const payload = (
            msg as {
              payload?: {
                coreId?: number | null;
                foodId?: number | null;
                status?: string | null;
                storeId?: number | null;
              };
            }
          ).payload;
          if (!payload) return;
          const foodId =
            payload.foodId != null && Number.isFinite(Number(payload.foodId))
              ? String(payload.foodId)
              : "";
          const status = String(payload.status ?? "").trim().toUpperCase();
          if (!foodId || isPendingAcceptStatus(status)) return;

          markIncomingOrderResolved({
            orderCoreId: payload.coreId ?? null,
            foodId,
          });

          const existing = ordersRef.current.find(
            (o) =>
              String(o.id) === foodId ||
              (payload.coreId != null && o.ordersCoreId === Number(payload.coreId))
          );
          if (existing && existing.status === "created") {
            upsertOrderRef.current({
              ...existing,
              status: stageFromPipeline(status) as typeof existing.status,
              pipelineStatus: status,
            });
          }

          maybeStop(foodId, stageFromPipeline(status));
          // Absolute native teardown by whatever session is currently ringing.
          void (async () => {
            const { orderId, sessionId } = await refreshNative();
            if (sessionId && (orderId === foodId || tokenFromSession(sessionId) === foodId)) {
              void applyGlobalOrderAlertStop(sessionId, stopReasonForStatus(stageFromPipeline(status)));
            }
          })();
        })
        .subscribe();
      return channel;
    });

    return () => {
      cancelled = true;
      for (const ch of channels) {
        void supabase.removeChannel(ch);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeIdsKey]);

  return null;
}
