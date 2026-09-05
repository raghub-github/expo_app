import assert from "node:assert/strict";
import { test } from "node:test";
import { computeHotZoneRows, type NormalizedOrder, type NormalizedSupply } from "./hot-zone-reconciler.js";
import { DEFAULT_ENGINE_CONFIG, type HotZoneEngineConfig } from "./hot-zone-config.js";
import type { ZoneStatus } from "./pressure-model.js";

const cfg: HotZoneEngineConfig = DEFAULT_ENGINE_CONFIG;

// A single res-8 cell (~460m) — all these coords bucket together.
const A = { lat: 19.076, lng: 72.8777 };
// A far-away cell/region (~15km NE) — a genuinely separate zone.
const B = { lat: 19.21, lng: 73.01 };

const order = (
  o: Partial<NormalizedOrder> & Pick<NormalizedOrder, "service">,
  at = A
): NormalizedOrder => ({
  service: o.service,
  assigned: o.assigned ?? false,
  lat: o.lat ?? at.lat,
  lng: o.lng ?? at.lng,
  ageSec: o.ageSec ?? 0,
});

const rider = (service: NormalizedSupply["service"], cap: number, at = A): NormalizedSupply => ({
  service,
  lat: at.lat,
  lng: at.lng,
  remainingCapacity: cap,
});

const empty = new Map<string, ZoneStatus>();

test("A: merchant online but zero orders → no zone (demand gate, store-online ≠ hot)", () => {
  const rows = computeHotZoneRows({
    orders: [],
    supply: [rider("food", 5), rider("food", 5)],
    cfg,
    prevStatusByKey: empty,
  });
  assert.equal(rows.length, 0);
});

test("B: meaningful unassigned demand + no supply → elevated zone", () => {
  const orders = Array.from({ length: 5 }, () => order({ service: "food" }));
  const rows = computeHotZoneRows({ orders, supply: [], cfg, prevStatusByKey: empty });
  assert.equal(rows.length, 1);
  assert.equal(rows[0]!.service, "food");
  assert.ok(["WARM", "HOT", "CRITICAL"].includes(rows[0]!.status));
  assert.equal(rows[0]!.unassignedDemand, 5);
  assert.equal(rows[0]!.assignedDemand, 0);
});

test("C: assigned orders are NOT demand (backlog split; weight 0) → no zone", () => {
  const orders = Array.from({ length: 8 }, () => order({ service: "food", assigned: true }));
  const rows = computeHotZoneRows({ orders, supply: [], cfg, prevStatusByKey: empty });
  assert.equal(rows.length, 0); // weighted demand is 0 → gate holds
});

test("D: service-aware — food demand hot, parcel with supply stays normal", () => {
  const orders = [
    ...Array.from({ length: 5 }, () => order({ service: "food" })),
    // parcel demand at the SAME cell but well supplied
    ...Array.from({ length: 4 }, () => order({ service: "parcel" })),
  ];
  const supply = [rider("parcel", 20)]; // lots of parcel headroom, no food supply
  const rows = computeHotZoneRows({ orders, supply, cfg, prevStatusByKey: empty });
  const services = rows.map((r) => r.service);
  assert.ok(services.includes("food"), "food should be elevated");
  assert.ok(!services.includes("parcel"), "well-supplied parcel should not be elevated");
});

test("E: multiple simultaneous zones in different cells", () => {
  const orders = [
    ...Array.from({ length: 5 }, () => order({ service: "food" }, A)),
    ...Array.from({ length: 5 }, () => order({ service: "food" }, B)),
  ];
  const rows = computeHotZoneRows({ orders, supply: [], cfg, prevStatusByKey: empty });
  assert.equal(rows.length, 2);
  assert.notEqual(rows[0]!.h3Index, rows[1]!.h3Index);
});

test("F: effective supply relieves pressure (more riders → normal)", () => {
  const orders = Array.from({ length: 5 }, () => order({ service: "food" }));
  const hot = computeHotZoneRows({ orders, supply: [], cfg, prevStatusByKey: empty });
  const relieved = computeHotZoneRows({
    orders,
    supply: [rider("food", 50)],
    cfg,
    prevStatusByKey: empty,
  });
  assert.equal(hot.length, 1);
  // 5 demand / 50 supply = 0.1 pressure → below warmAt → normal → dropped.
  assert.equal(relieved.length, 0);
});

test("G: hysteresis — a level between (enter-margin) and enter sticks only if prev was there", () => {
  // 8 unassigned orders, supply capacity 6 in-cell → pressure = 8 / 6 = 1.333.
  // Rising (strict): pressure 1.333 ≥ warmAt(1.0) but < hotAt(1.5) → WARM.
  // Sticky (margin 0.25): pressure 1.333 ≥ hotAt-margin(1.25) → HOT.
  const orders = Array.from({ length: 8 }, () => order({ service: "food" }));
  const supply = [rider("food", 6)];

  const fresh = computeHotZoneRows({ orders, supply, cfg, prevStatusByKey: empty });
  assert.equal(fresh[0]!.status, "WARM"); // no history → strict thresholds

  const prev = new Map<string, ZoneStatus>([[`${fresh[0]!.h3Index}:food`, "HOT"]]);
  const held = computeHotZoneRows({ orders, supply, cfg, prevStatusByKey: prev });
  assert.equal(held[0]!.status, "HOT"); // was HOT → hysteresis holds it against the small dip
});

test("H: time-decayed demand — old orders count less and can fall below the gate", () => {
  // 4 orders but all ~1 half-life old (600s) → weight ~0.5 each → ~2 weighted < gate(3).
  const orders = Array.from({ length: 4 }, () =>
    order({ service: "food", ageSec: cfg.demandHalfLifeSeconds })
  );
  const rows = computeHotZoneRows({ orders, supply: [], cfg, prevStatusByKey: empty });
  assert.equal(rows.length, 0);
});
