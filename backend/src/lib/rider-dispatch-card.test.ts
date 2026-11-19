import { test, type TestContext } from "node:test";
import assert from "node:assert/strict";

/**
 * The native rider alert card (floating over other apps / lock screen) renders
 * from the FCM data payload. It must itemise the payout exactly as the in-app
 * offer sheet does, and a re-alert must carry the addresses like a first wave.
 */

type Captured = { metadata: Record<string, unknown>; overrides: { title: string; body: string } };

async function loadNotifier(t: TestContext, opts: { earnings: unknown; locations: Record<string, unknown> | null }) {
  const sent: Captured[] = [];
  let locationLookups = 0;
  const sqlFn = async (strings: TemplateStringsArray) => {
    const text = strings.join("?");
    if (text.includes("pickup_address")) {
      locationLookups += 1;
      return opts.locations ? [opts.locations] : [];
    }
    return [];
  };
  t.mock.module("../db/client.js", { namedExports: { getSql: () => sqlFn, getDb: () => ({}) } });
  t.mock.module("../modules/realtime/publish.js", { namedExports: { publishRiderEvent: async () => undefined } });
  t.mock.module("../modules/notifications/notificationService.js", {
    namedExports: {
      send: async (args: Captured) => {
        sent.push({ metadata: args.metadata, overrides: args.overrides });
        return { accepted: 1, queued: 1, skipped: 0, failedSync: 0 };
      },
    },
  });
  t.mock.module("./rider-dispatch-push.js", { namedExports: { sendRiderDispatchDirectPush: async () => undefined } });
  t.mock.module("./order-dispatch-settings.js", {
    namedExports: { fetchDispatchWaveSettings: async () => ({ waveIntervalSeconds: 30 }) },
  });
  t.mock.module("./build-dispatch-offer-rider-earnings.js", {
    namedExports: { buildDispatchOfferRiderEarnings: async () => opts.earnings },
  });
  const mod = await import(`./rider-dispatch-notify.js?v=${Math.random()}`);
  return { mod, sent, lookups: () => locationLookups };
}

const target = {
  orderId: "ORD9",
  orderCoreId: 439,
  formattedOrderId: "GMR10000439",
  serviceType: "person_ride",
  waveNumber: 2,
  effectiveRadiusMeters: 3000,
};
const rider = { riderId: 1001, distanceMeters: 1200, lat: 22.5, lng: 88.3 };
const earnings = {
  estimatedEarning: 70,
  baseEarning: 50,
  waitingEarning: 0,
  surgeEarning: 20,
  appliedSurges: [{ name: "Rain surge", amount: 20 }],
  customerTipAmount: 5,
  prePickupCompanyFunded: 0,
  totalEarning: 75,
  pickupDistanceKm: 1.2,
  tripDistanceKm: 4.5,
  totalDistanceKm: 5.7,
};

test("breakdown metadata mirrors the in-app sheet (surge from lines, company first-mile only)", async (t) => {
  const { mod } = await loadNotifier(t, { earnings, locations: null });
  assert.deepEqual(mod.dispatchCardBreakdownMetadata(earnings), { surgeEarning: "20", tipAmount: "5" });
  assert.deepEqual(
    mod.dispatchCardBreakdownMetadata({ ...earnings, appliedSurges: [], waitingEarning: 9.6, prePickupCompanyFunded: 4 }),
    { waitingEarning: "10", firstMileEarning: "4", tipAmount: "5" }
  );
  assert.deepEqual(mod.dispatchCardBreakdownMetadata(null), {});
});

test("a re-alert (no caller-supplied addresses) still sends pickup + drop on the card", async (t) => {
  const { mod, sent, lookups } = await loadNotifier(t, {
    earnings,
    locations: { store_name: null, pickup_address: "MG Road, Kolkata", drop_address: "Salt Lake Sector V" },
  });
  await mod.notifyRiderDispatchOffer(target, rider, { realert: true });
  assert.equal(lookups(), 1, "addresses resolved once for the re-alert");
  const m = sent[0].metadata;
  assert.equal(m.pickupAddress, "MG Road, Kolkata");
  assert.equal(m.dropAddress, "Salt Lake Sector V");
  assert.equal(m.amount, "75");
  assert.equal(m.surgeEarning, "20");
  assert.equal(m.tipAmount, "5");
  assert.equal(m.toPickupKm, "1.2");
  assert.equal(m.tripDistanceKm, "4.5");
  assert.equal(m.overallKm, "5.7");
  assert.match(sent[0].overrides.body, /MG Road, Kolkata/);
  assert.match(sent[0].overrides.body, /Drop: Salt Lake Sector V/);
});

test("a wave fan-out that already resolved addresses is not looked up again per rider", async (t) => {
  const { mod, sent, lookups } = await loadNotifier(t, { earnings, locations: null });
  await mod.notifyRiderDispatchOffer(target, rider, {
    pickupStoreName: "",
    pickupAddress: "Park Street",
    dropAddress: "Howrah",
    offerExpiresAtMs: 1_763_546_430_000,
  });
  assert.equal(lookups(), 0);
  assert.equal(sent[0].metadata.pickupAddress, "Park Street");
  assert.equal(sent[0].metadata.expiresAt, "1763546430000");
});

test("no payout → no breakdown parts and no amount (never a ₹0 card)", async (t) => {
  const { mod, sent } = await loadNotifier(t, { earnings: null, locations: null });
  await mod.notifyRiderDispatchOffer(target, rider, { pickupAddress: "A", dropAddress: "B" });
  const m = sent[0].metadata;
  for (const key of ["amount", "surgeEarning", "tipAmount", "waitingEarning", "firstMileEarning"]) {
    assert.equal(key in m, false, key);
  }
});
