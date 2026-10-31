/**
 * Push + realtime delivery for filtered dispatch offers.
 * Always driven by order-assignment-engine eligibility — never broadcast to all riders.
 * Fare/earnings come from Rider Fare Engine v3.0 (service_payout_rules %).
 *
 * Latency: FCM/WS fire immediately with a distance-only body. Earnings are computed
 * in parallel and may enrich a follow-up WS event — push never waits on earnings.
 */


import { publishRiderEvent } from "../modules/realtime/publish.js";
import { send as sendNotification } from "../modules/notifications/notificationService.js";
import type { DispatchOrderTarget, EligibleDispatchRider } from "./order-assignment-engine.js";
import {
  buildDispatchOfferRiderEarnings,
  type DispatchOfferRiderEarnings,
} from "./build-dispatch-offer-rider-earnings.js";
import { sendRiderDispatchDirectPush } from "./rider-dispatch-push.js";
import { fetchDispatchWaveSettings } from "./order-dispatch-settings.js";


const SERVICE_LABEL: Record<DispatchOrderTarget["serviceType"], string> = {
  food: "Food delivery",
  parcel: "Parcel",
  person_ride: "Ride",
};


/**
 * How long the critical alert may wait on card enrichment before going without it.
 *
 * Everything this budget covers — the offer deadline, the rider's payout — is
 * decoration on an alert whose whole job is to ring. One shared deadline for all
 * of it, so adding a second enrichment never adds a second delay.
 */
const CARD_ENRICHMENT_BUDGET_MS = 200;

/**
 * When this offer stops being this rider's to take: one wave interval after it
 * was sent, which is when the next wave supersedes it. Null when the service has
 * no wave configuration — the card then hides its timer rather than inventing one.
 */
export async function resolveOfferDeadlineMs(
  serviceType: DispatchOrderTarget["serviceType"],
  sentAtMs: number
): Promise<number | null> {
  try {
    const cfg = await fetchDispatchWaveSettings(serviceType);
    return sentAtMs + cfg.waveIntervalSeconds * 1000;
  } catch {
    return null;
  }
}

/** Resolves to null at the shared deadline instead of holding up the alert. */
function underDeadline<T>(work: Promise<T>, deadline: Promise<null>): Promise<T | null> {
  return Promise.race([work, deadline]);
}

function startDeadline(ms: number): { deadline: Promise<null>; cancel: () => void } {
  let timer: NodeJS.Timeout | undefined;
  const deadline = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), ms);
  });
  return {
    deadline,
    cancel: () => {
      if (timer) clearTimeout(timer);
    },
  };
}


function formatDistanceKm(meters: number): string {
  const km = meters / 1000;
  if (km < 1) return `${Math.round(meters)} m`;
  return `${km.toFixed(1)} km`;
}


export type DispatchOfferPayload = {
  type: "dispatch_offer";
  orderId: string;
  formattedOrderId: string | null;
  serviceType: DispatchOrderTarget["serviceType"];
  category: "food" | "parcel" | "ride";
  waveNumber: number;
  pickupDistanceMeters: number;
  effectiveRadiusMeters: number;
  alertSessionId?: string;
  /** Rider Fare Engine v3.0 — same fields as GET /orders/available */
  estimatedEarning?: number;
  baseEarning?: number;
  waitingEarning?: number;
  surgeEarning?: number;
  appliedSurges?: { name: string; amount: number }[];
  customerTipAmount?: number;
  prePickupEarning?: number;
  prePickupFromPool?: number;
  prePickupCompanyFunded?: number;
  postPickupEarning?: number;
  prePickupFunding?: "company" | "customer" | "shared";
  totalEarning?: number;
  pickupDistanceKm?: number;
  tripDistanceKm?: number;
  totalDistanceKm?: number;
  pricingEngine?: "rider_percentage_v3";
};


function toCategory(serviceType: DispatchOrderTarget["serviceType"]): "food" | "parcel" | "ride" {
  if (serviceType === "person_ride") return "ride";
  return serviceType;
}


function attachEarnings(
  payload: DispatchOfferPayload,
  earnings: DispatchOfferRiderEarnings | null
): DispatchOfferPayload {
  if (!earnings) return payload;
  return {
    ...payload,
    estimatedEarning: earnings.estimatedEarning,
    baseEarning: earnings.baseEarning,
    waitingEarning: earnings.waitingEarning,
    surgeEarning: earnings.surgeEarning,
    appliedSurges: earnings.appliedSurges,
    customerTipAmount: earnings.customerTipAmount,
    prePickupEarning: earnings.prePickupEarning,
    prePickupFromPool: earnings.prePickupFromPool,
    prePickupCompanyFunded: earnings.prePickupCompanyFunded,
    postPickupEarning: earnings.postPickupEarning,
    prePickupFunding: earnings.prePickupFunding,
    totalEarning: earnings.totalEarning,
    pickupDistanceKm: earnings.pickupDistanceKm,
    tripDistanceKm: earnings.tripDistanceKm,
    totalDistanceKm: earnings.totalDistanceKm,
    pricingEngine: earnings.pricingEngine,
  };
}


function needsDirectFcmFallback(skipReason: string | null | undefined): boolean {
  const reason = String(skipReason ?? "").toLowerCase();
  return (
    reason === "no_push_tokens" ||
    reason === "no_recipients" ||
    reason.includes("no_push_tokens") ||
    reason.includes("no_recipients")
  );
}


/** Notify one eligible rider via push + rider websocket channel. Never throws. */
export async function notifyRiderDispatchOffer(
  target: DispatchOrderTarget,
  rider: EligibleDispatchRider,
  opts?: { realert?: boolean; offerExpiresAtMs?: number | null }
): Promise<void> {
  // A re-alert (GAP 3b) reuses the same wave but MUST carry a distinct idempotency key, otherwise
  // notificationService dedups it against the first offer and nothing is re-sent.
  const keySuffix = opts?.realert ? ":realert" : "";
  const assignment_notify_started_at = Date.now();
  const realert = opts?.realert === true;
  try {
    const displayId = target.formattedOrderId?.trim() || target.orderId;
    const label = SERVICE_LABEL[target.serviceType];
    const dist = formatDistanceKm(rider.distanceMeters);
    const distanceKmNum = Math.round((rider.distanceMeters / 1000) * 10) / 10;


    console.info(
      "[dispatch] assignment_notify_started_at",
      JSON.stringify({
        assignment_notify_started_at,
        orderId: target.orderId,
        riderId: rider.riderId,
        serviceType: target.serviceType,
        realert,
      })
    );


    // Start earnings in parallel — never block FCM on payout compute.
    const earningsPromise: Promise<DispatchOfferRiderEarnings | null> =
      buildDispatchOfferRiderEarnings({
        orderCoreId: target.orderCoreId,
        serviceType: target.serviceType,
        riderId: rider.riderId,
        riderLat: rider.lat,
        riderLng: rider.lng,
        pickupDistanceMeters: rider.distanceMeters,
      }).catch((err) => {
        console.warn(
          "[dispatch] offer payout failed",
          target.orderId,
          rider.riderId,
          (err as Error).message
        );
        return null;
      });


    // Every rider in a wave shares one deadline, so the fan-out resolves it once
    // and passes it in. Reading it here per rider would put an extra round-trip
    // on the critical path for each of them — a 20-rider wave against a pooled
    // connection is exactly where that stops being free.
    const offerExpiryPromise: Promise<number | null> =
      opts?.offerExpiresAtMs !== undefined
        ? Promise.resolve(opts.offerExpiresAtMs)
        : resolveOfferDeadlineMs(target.serviceType, assignment_notify_started_at);


    const alertSessionId = `RIDER_NEW_ORDER:${target.orderId}:${rider.riderId}:${target.waveNumber}`;
    const basePayload: DispatchOfferPayload = {
      type: "dispatch_offer",
      orderId: target.orderId,
      formattedOrderId: target.formattedOrderId,
      serviceType: target.serviceType,
      category: toCategory(target.serviceType),
      waveNumber: target.waveNumber,
      pickupDistanceMeters: Math.round(rider.distanceMeters),
      effectiveRadiusMeters: target.effectiveRadiusMeters,
      alertSessionId,
    };


    // Distance-only body — earnings must not delay the critical alert.
    const title = "🔔 New order received";
    const body = `${label} · ${displayId} · ${dist} to pickup — tap to accept`;


    const push_dispatch_started_at = Date.now();
    console.info(
      "[dispatch] push_dispatch_started_at",
      JSON.stringify({
        push_dispatch_started_at,
        assignment_notify_started_at,
        orderId: target.orderId,
        riderId: rider.riderId,
        serviceType: target.serviceType,
        realert,
      })
    );


    const wsSend = async () => {
      await publishRiderEvent(rider.riderId, { ...basePayload });
      console.info(
        "[dispatch] WS_SEND",
        JSON.stringify({
          rider: rider.riderId,
          order: target.orderId,
          type: "dispatch_offer",
        })
      );
    };


    const fcmSend = async () => {
      try {
        // One deadline, both lookups. Whatever has landed by then rides along; the
        // rest is omitted rather than guessed, and the WS follow-up still carries
        // the full earnings breakdown to the in-app sheet.
        const { deadline, cancel } = startDeadline(CARD_ENRICHMENT_BUDGET_MS);
        const [offerExpiresAtMs, cardEarnings] = await Promise.all([
          underDeadline(offerExpiryPromise, deadline).then((v) => v ?? null),
          underDeadline(earningsPromise, deadline).then((v) => v ?? null),
        ]);
        cancel();

        // The rider must never be shown the customer's bill as if it were theirs.
        // This is the rider's own payout and nothing else.
        const riderPayout =
          cardEarnings && Number.isFinite(cardEarnings.totalEarning) && cardEarnings.totalEarning > 0
            ? cardEarnings.totalEarning
            : null;

        const sharedVariables = {
          orderId: target.orderId,
          formattedOrderId: target.formattedOrderId ?? "",
          serviceLabel: label,
          displayId,
          pickupDistance: dist,
          serviceType: target.serviceType,
          waveNumber: target.waveNumber,
          estimatedEarning: "",
          earningAmount: "",
          payout: "",
          distanceKm: distanceKmNum,
          merchantName: "",
          dropArea: "",
        };
        const sharedMetadata = {
          type: "dispatch_offer",
          gmType: "DISPATCH_OFFER",
          event: "NEW_ORDER",
          orderId: target.orderId,
          pickupDistanceMeters: String(Math.round(rider.distanceMeters)),
          serviceType: String(target.serviceType),
          category: toCategory(target.serviceType),
          skip_in_app_banner: true,
          realert: realert ? "1" : "0",
          alertStartedAt: String(assignment_notify_started_at),
          alertSessionId: `RIDER_NEW_ORDER:${target.orderId}:${rider.riderId}:${target.waveNumber}`,
          gmAlertAction: "start",
          // --- fields the native alert card renders when JS is dead ---
          // Pre-formatted: the card has no locale/unit logic of its own, and the
          // raw pickupDistanceMeters above renders as a bare "1430 m".
          pickupDistance: dist,
          // Without this the card falls back to scraping an id out of the body
          // text, which only ever matched food orders.
          formattedOrderId: target.formattedOrderId ?? "",
          // Omitted, not zeroed, when unknown — the card hides the row rather
          // than showing a timer at zero or a payout of ₹0.
          ...(offerExpiresAtMs != null ? { expiresAt: String(offerExpiresAtMs) } : {}),
          ...(riderPayout != null ? { amount: String(riderPayout) } : {}),
          ...(cardEarnings?.tripDistanceKm
            ? { tripDistanceKm: String(cardEarnings.tripDistanceKm) }
            : {}),
        };
        const sharedOverrides = { title, body };


        let templateUsed = "RIDER_NEW_ORDER";
        let result = await sendNotification({
          templateCode: "RIDER_NEW_ORDER",
          variables: sharedVariables,
          target: { user_id: `usr_${rider.riderId}` },
          priority: "critical",
          deliverNow: true,
          bypassQuietHours: true,
          idempotencyKey: `RIDER_NEW_ORDER:${target.orderId}:${rider.riderId}:${target.waveNumber}${keySuffix}`,
          overrides: sharedOverrides,
          metadata: sharedMetadata,
        });


        if (result.skipReason === "template_missing") {
          console.warn(
            "[dispatch] RIDER_NEW_ORDER template_missing — falling back to RIDER_DISPATCH_OFFER",
            JSON.stringify({
              orderId: target.orderId,
              riderId: rider.riderId,
            })
          );
          templateUsed = "RIDER_DISPATCH_OFFER";
          result = await sendNotification({
            templateCode: "RIDER_DISPATCH_OFFER",
            variables: sharedVariables,
            target: { user_id: `usr_${rider.riderId}` },
            priority: "critical",
            deliverNow: true,
            bypassQuietHours: true,
            idempotencyKey: `RIDER_NEW_ORDER:${target.orderId}:${rider.riderId}:${target.waveNumber}${keySuffix}`,
            overrides: sharedOverrides,
            metadata: {
              ...sharedMetadata,
              alertSessionId,
            },
          });
        }


        const push_provider_response_at = Date.now();
        const delivered = (result.accepted ?? result.queued) > 0 && !result.skipReason;
        if (!delivered) {
          console.warn(
            "[dispatch] FCM_SKIP",
            JSON.stringify({
              push_provider_response_at,
              push_dispatch_started_at,
              rider: rider.riderId,
              order: target.orderId,
              serviceType: target.serviceType,
              realert,
              template: templateUsed,
              skipReason: result.skipReason ?? null,
              warning: result.warning ?? null,
              queued: result.queued,
              accepted: result.accepted ?? 0,
              skipped: result.skipped,
              failedSync: result.failedSync,
            })
          );
          if (needsDirectFcmFallback(result.skipReason)) {
            await sendRiderDispatchDirectPush({
              riderId: rider.riderId,
              orderId: target.orderId,
              serviceType: target.serviceType,
              title,
              body,
              data: {
                ...sharedMetadata,
                waveNumber: target.waveNumber,
              },
            });
          }
        } else {
          console.info(
            "[dispatch] FCM_SEND",
            JSON.stringify({
              push_provider_response_at,
              push_dispatch_started_at,
              rider: rider.riderId,
              order: target.orderId,
              serviceType: target.serviceType,
              waveNumber: target.waveNumber,
              realert,
              template: templateUsed,
              accepted: result.accepted ?? result.queued,
            })
          );
        }
        try {
          const { sendRiderAlertControl } = await import("./critical-alert-control.js");
          await sendRiderAlertControl({
            riderId: rider.riderId,
            action: "start",
            alertSessionId,
            orderId: target.orderId,
            serviceType: target.serviceType,
          });
        } catch {
          /* companion FCM is best-effort */
        }
      } catch (err) {
        console.warn(
          "[dispatch] PUSH_FAILED",
          JSON.stringify({
            push_provider_response_at: Date.now(),
            push_dispatch_started_at,
            riderId: rider.riderId,
            orderId: target.orderId,
            serviceType: target.serviceType,
            realert,
            reason: (err as Error).message,
          })
        );
        await sendRiderDispatchDirectPush({
          riderId: rider.riderId,
          orderId: target.orderId,
          serviceType: target.serviceType,
          title,
          body,
          data: {
            type: "dispatch_offer",
            gmType: "DISPATCH_OFFER",
            event: "NEW_ORDER",
            orderId: target.orderId,
            serviceType: target.serviceType,
            category: toCategory(target.serviceType),
          },
        });
      }
    };


    // WS + FCM in parallel — never wait for WebSocket client connection (Redis pub only).
    await Promise.allSettled([wsSend(), fcmSend()]);


    // Best-effort WS enrichment once earnings resolve (does not affect push).
    void earningsPromise.then((earnings) => {
      if (!earnings) return;
      void publishRiderEvent(rider.riderId, attachEarnings(basePayload, earnings)).catch(() => undefined);
    });
  } catch (err) {
    console.warn(
      "[dispatch] NOTIFY_RIDER_FAILED",
      JSON.stringify({
        riderId: rider.riderId,
        orderId: target.orderId,
        serviceType: target.serviceType,
        realert,
        reason: err instanceof Error ? err.message : String(err),
      })
    );
  }
}


/**
 * Fan-out to every engine-eligible rider in this wave.
 * One rider's WS/FCM failure must not block the others.
 * Offer rows are already persisted as offer_sent before this runs.
 */
export async function notifyEligibleRidersDispatchOffer(
  target: DispatchOrderTarget,
  riders: EligibleDispatchRider[]
): Promise<number> {
  if (riders.length === 0) return 0;
  const { isOrderStillDispatchable } = await import("./order-dispatch.service.js");
  if (!(await isOrderStillDispatchable(target.orderCoreId))) {
    console.info(
      "[dispatch] WAVE_STOPPED",
      JSON.stringify({
        order: target.orderId,
        reason: "ORDER_ASSIGNED",
      })
    );
    return 0;
  }


  // One read for the whole wave, off the per-rider critical path.
  const offerExpiresAtMs = await resolveOfferDeadlineMs(target.serviceType, Date.now());

  const results = await Promise.allSettled(
    riders.map((rider) => notifyRiderDispatchOffer(target, rider, { offerExpiresAtMs }))
  );
  return results.filter((r) => r.status === "fulfilled").length;
}


