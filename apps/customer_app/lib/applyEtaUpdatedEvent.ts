/**
 * Apply server `eta.updated.v1` into React Query — version-gated, no local ETA math.
 */
import type { QueryClient } from "@tanstack/react-query";
import type {
  CustomerEtaView,
  OrderEtaResponse,
  StageAwareEta,
} from "@/services/eta.service";
import { noteServerNow } from "@/lib/server-time-offset";

export const ETA_UPDATED_EVENT = "eta.updated.v1";

export type EtaUpdatedWsEvent = {
  type?: string;
  orderIdText?: string;
  orderId?: string;
  etaVersion?: number;
  reason?: string;
  customer?: CustomerEtaView;
  stageAware?: StageAwareEta;
  livePromisedDeliveryAt?: string | null;
  prepReadyByAt?: string | null;
  prepMinutes?: number | null;
  currentEtaMinutes?: number;
  serverNow?: string | null;
  at?: string;
};

export function isEtaUpdatedEvent(payload: { type?: string } | null | undefined): boolean {
  const t = String(payload?.type ?? "");
  return t === ETA_UPDATED_EVENT || t === "eta.updated";
}

/** Accept only monotonic etaVersion (ignore stale / out-of-order). */
export function shouldAcceptEtaVersion(
  incoming: number | null | undefined,
  lastAccepted: number | null | undefined
): boolean {
  const next = Number(incoming);
  if (!Number.isFinite(next) || next <= 0) return false;
  const prev = Number(lastAccepted);
  if (!Number.isFinite(prev) || prev <= 0) return true;
  return next > prev;
}

export function applyEtaUpdatedToQueryCache(
  queryClient: QueryClient,
  orderKeys: string[],
  event: EtaUpdatedWsEvent,
  lastAcceptedVersion: Map<string, number>
): boolean {
  if (!isEtaUpdatedEvent(event) || !event.stageAware || !event.customer) return false;

  const version = Number(event.etaVersion);
  if (!Number.isFinite(version) || version <= 0) return false;

  const keys = Array.from(
    new Set(
      orderKeys
        .map((k) => String(k ?? "").trim())
        .filter(Boolean)
        .concat(
          String(event.orderIdText ?? "").trim(),
          String(event.orderId ?? "").trim()
        )
        .filter(Boolean)
    )
  );
  if (keys.length === 0) return false;

  let newestKnown = 0;
  for (const key of keys) {
    newestKnown = Math.max(newestKnown, lastAcceptedVersion.get(key.toUpperCase()) ?? 0);
    const cached = queryClient.getQueryData<OrderEtaResponse>(["orderEta", key]);
    const cachedV = Number(cached?.stageAware?.etaVersion ?? 0);
    if (Number.isFinite(cachedV)) newestKnown = Math.max(newestKnown, cachedV);
  }
  if (!shouldAcceptEtaVersion(version, newestKnown)) return false;

  noteServerNow(event.serverNow ?? event.at ?? event.stageAware.lastUpdatedAt);

  const at = event.at ?? event.stageAware.lastUpdatedAt ?? new Date().toISOString();
  const stageAware: StageAwareEta = {
    ...event.stageAware,
    etaVersion: version,
    lastUpdatedAt: event.stageAware.lastUpdatedAt || at,
  };
  const liveMinutes =
    event.currentEtaMinutes ??
    stageAware.totalEta ??
    event.customer.etaMinutes ??
    0;

  const incomingPromised =
    event.livePromisedDeliveryAt?.trim() ||
    stageAware.promisedAt?.trim() ||
    null;
  const incomingPrepReady = event.prepReadyByAt?.trim() || null;

  for (const orderId of keys) {
    queryClient.setQueryData<OrderEtaResponse>(["orderEta", orderId], (prev) => {
      const base: OrderEtaResponse = prev ?? {
        ok: true,
        orderIdText: orderId,
        promise: {
          minMinutes: null,
          maxMinutes: null,
          promisedDeliveryAt: null,
          generatedAt: null,
          bufferMinutes: null,
          routeKm: null,
          confidenceScore: null,
        },
        live: null,
        customer: event.customer!,
        stageAware,
      };

      const prevPromised = prev?.live?.promisedDeliveryAt?.trim() || null;
      const nextPromised = incomingPromised || prevPromised || null;

      const prevPrep = prev?.prep;
      const nextPrep = {
        minutes:
          event.prepMinutes != null && Number.isFinite(event.prepMinutes)
            ? Number(event.prepMinutes)
            : prevPrep?.minutes ?? null,
        readyByAt: incomingPrepReady || prevPrep?.readyByAt || null,
      };

      return {
        ...base,
        ok: true,
        orderIdText: base.orderIdText || orderId,
        serverNow: event.serverNow ?? base.serverNow ?? at,
        customer: event.customer!,
        stageAware,
        prep: nextPrep,
        live: nextPromised
          ? {
              minMinutes: liveMinutes,
              maxMinutes: liveMinutes,
              promisedDeliveryAt: nextPromised,
              reason: event.reason ?? stageAware.etaSource ?? "STATUS_CHANGE",
              createdAt: at,
            }
          : prev?.live ?? null,
      };
    });
    lastAcceptedVersion.set(orderId.toUpperCase(), version);
  }

  return true;
}
