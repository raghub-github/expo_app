import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildMerchantCtmLineInputs,
  buildCtmLineInputsFromFrozenItems,
  buildSettlementBreakdownFromCtmRows,
  prepareCtmRows,
  platformFundingFromBilling,
  merchantRefundFromPlatformFunding,
  resolveBackfillCtmLineInput,
  type BackfillOrderItemRow,
  type FrozenOrderItemForCtm,
  type MerchantCtmLineInput,
} from "./writeMerchantCtmPricingSnapshots.js";
import { resolveItemPricing, serializeCanonicalPricing } from "../pricing/canonicalItemPricing.js";

type CtmRow = { gross: number; disc: number; offerType: string };

function ctmLine(overrides: Partial<MerchantCtmLineInput> = {}): MerchantCtmLineInput {
  return {
    orderItemId: 1,
    menuItemId: 10,
    quantity: 1,
    customerCatalogLine: 200,
    customerOfferDiscount: 0,
    offerType: null,
    offerName: null,
    offerDiscountPct: null,
    offerDiscountFlat: null,
    ...overrides,
  };
}

function precisionBillingSnapshot(customerAmount: number) {
  return {
    discounts: [
      {
        label: "Precision Offer",
        amount: customerAmount,
        offerSource: "merchant_offers",
        meta: {
          merchantOfferId: 55,
          offerType: "PRECISION",
          conditionsMode: "precision",
        },
      },
    ],
  };
}

/**
 * The production persistence path (post-redesign): each CTM line is projected 1:1 from its OWN
 * frozen orders_core_items row via buildCtmLineInputsFromFrozenItems, then classified by
 * prepareCtmRows. No cross-item billing-array matching exists here — one item's offer CANNOT
 * reach another item's row by construction. This block is the regression matrix the issue asks
 * for: BOOST / BOGO / NONE in every combination, each row matching only its own line.
 */
describe("buildCtmLineInputsFromFrozenItems → prepareCtmRows — per-item independence (redesign)", () => {
  // A frozen orders_core_items row exactly as placement stores it.
  const frozen = (o: Partial<FrozenOrderItemForCtm> & { orderItemId: number }): FrozenOrderItemForCtm => ({
    menuItemId: 10,
    quantity: 1,
    catalogLineTotal: 100,
    offerDiscountAmount: 0,
    appliedOfferType: null,
    appliedOfferLabel: null,
    appliedOfferId: null,
    isItemPromo: undefined,
    ...o,
  });
  const bogoItem = (orderItemId: number, menuItemId: number, catalog: number): FrozenOrderItemForCtm =>
    frozen({ orderItemId, menuItemId, catalogLineTotal: catalog, offerDiscountAmount: catalog / 2,
      appliedOfferType: "BUY_X_GET_Y", appliedOfferLabel: "Buy One Get One", appliedOfferId: 30, isItemPromo: true });
  const boostItem = (orderItemId: number, menuItemId: number, catalog: number, disc: number): FrozenOrderItemForCtm =>
    frozen({ orderItemId, menuItemId, catalogLineTotal: catalog, offerDiscountAmount: disc,
      appliedOfferType: "PERCENTAGE", appliedOfferLabel: "Boost Offer Applied", appliedOfferId: 21, isItemPromo: true });
  const noneItem = (orderItemId: number, menuItemId: number, catalog: number): FrozenOrderItemForCtm =>
    frozen({ orderItemId, menuItemId, catalogLineTotal: catalog, appliedOfferType: "", appliedOfferLabel: "" });

  const run = (rows: FrozenOrderItemForCtm[]) =>
    prepareCtmRows(buildCtmLineInputsFromFrozenItems(rows), 0, null).rows;
  const shape = (r: { orderItemId: number; offerType: string; disc: number; gross: number; net: number }) =>
    [r.orderItemId, r.offerType, r.disc, r.gross, r.net];

  it("BOOST only", () => {
    assert.deepEqual(run([boostItem(1, 2, 60, 9)]).map(shape), [[1, "PERCENTAGE", 9, 60, 51]]);
  });
  it("BOGO only — discount 0, net = selling price", () => {
    assert.deepEqual(run([bogoItem(1, 5, 180)]).map(shape), [[1, "BOGO", 0, 180, 180]]);
  });
  it("NONE only", () => {
    assert.deepEqual(run([noneItem(1, 7, 140)]).map(shape), [[1, "NONE", 0, 140, 140]]);
  });
  it("BOOST + BOGO — neither leaks into the other", () => {
    assert.deepEqual(run([boostItem(1, 2, 60, 9), bogoItem(2, 5, 180)]).map(shape),
      [[1, "PERCENTAGE", 9, 60, 51], [2, "BOGO", 0, 180, 180]]);
  });
  it("BOOST + NONE", () => {
    assert.deepEqual(run([boostItem(1, 2, 60, 9), noneItem(2, 7, 140)]).map(shape),
      [[1, "PERCENTAGE", 9, 60, 51], [2, "NONE", 0, 140, 140]]);
  });
  it("BOGO + NONE — NONE never inherits the BOGO", () => {
    assert.deepEqual(run([bogoItem(1, 5, 180), noneItem(2, 7, 140)]).map(shape),
      [[1, "BOGO", 0, 180, 180], [2, "NONE", 0, 140, 140]]);
  });
  it("BOOST + BOGO + NONE — all three independent", () => {
    assert.deepEqual(run([boostItem(1, 2, 60, 9), bogoItem(2, 5, 180), noneItem(3, 7, 140)]).map(shape),
      [[1, "PERCENTAGE", 9, 60, 51], [2, "BOGO", 0, 180, 180], [3, "NONE", 0, 140, 140]]);
  });
  it("multiple BOOST items keep their own discounts", () => {
    assert.deepEqual(run([boostItem(1, 2, 60, 9), boostItem(2, 3, 200, 30)]).map(shape),
      [[1, "PERCENTAGE", 9, 60, 51], [2, "PERCENTAGE", 30, 200, 170]]);
  });
  it("multiple BOGO items — each is type BOGO with discount 0", () => {
    assert.deepEqual(run([bogoItem(1, 5, 180), bogoItem(2, 6, 200)]).map(shape),
      [[1, "BOGO", 0, 180, 180], [2, "BOGO", 0, 200, 200]]);
  });
  it("two lines share a menu id (BOGO then NONE) — NONE stays NONE (the classic leak)", () => {
    // Same dish on two lines: with per-row projection there is no shared pricing row to inherit.
    assert.deepEqual(run([bogoItem(1, 5, 180), noneItem(2, 5, 140)]).map(shape),
      [[1, "BOGO", 0, 180, 180], [2, "NONE", 0, 140, 140]]);
  });
  it("mixed quantities & a full four-item cart persist only their own offer", () => {
    const rows = run([
      boostItem(348, 102, 120, 14),
      bogoItem(349, 88, 150),
      noneItem(350, 90, 100),
      bogoItem(351, 25, 60),
    ]);
    assert.deepEqual(rows.map((r) => [r.orderItemId, r.offerType]), [
      [348, "PERCENTAGE"], [349, "BOGO"], [350, "NONE"], [351, "BOGO"],
    ]);
  });

  it("a Precision line stamped onto the item as PERCENTAGE+ITEM_PROMO stays NONE (appliedOfferId surface)", () => {
    // orders_core_items froze appliedOfferId 17 (a cart/precision offer). Its intrinsic surface —
    // looked up per line in discounts[] — keeps it out of CTM even though the line looks like a Boost.
    const precisionSnapshot = {
      discounts: [
        { label: "Flat 20% Off", amount: 80, meta: { source: "merchant_offers", offerType: "PERCENTAGE", itemSurface: false, conditionsMode: "precision", merchantOfferId: 17 } },
      ],
    };
    const rows = prepareCtmRows(
      buildCtmLineInputsFromFrozenItems([
        frozen({ orderItemId: 1, menuItemId: 102, catalogLineTotal: 141, offerDiscountAmount: 13,
          appliedOfferType: "PERCENTAGE", appliedOfferLabel: "Flat 20% Off", appliedOfferId: 17, isItemPromo: true }),
      ]),
      0,
      precisionSnapshot,
    ).rows;
    assert.equal(rows[0]!.offerType, "NONE");
    assert.equal(rows[0]!.disc, 0);
    assert.equal(rows[0]!.net, rows[0]!.gross);
  });
});

/**
 * Cross-path / cross-device persistence guarantee: a Billing-Engine BOGO must persist as BOGO
 * from ANY order-placement path — including one that inserts orders_core_items WITHOUT freezing
 * the applied_offer_* columns (the "different Android device / different flow" repro where BOGO
 * was being stored as NONE). resolveBackfillCtmLineInput is the single deterministic resolver the
 * backfill uses for every path: own frozen columns when present, else recover the line's offer
 * from the finalized billing snapshot. It must NEVER default to NONE while billing tagged the line.
 */
describe("resolveBackfillCtmLineInput — BOGO survives any placement path (never silently NONE)", () => {
  // A bare orders_core_items row (offer columns never frozen) — the vulnerable insert path.
  const bareRow = (o: Partial<BackfillOrderItemRow> & { orderItemId: number }): BackfillOrderItemRow => ({
    menuItemId: 10,
    quantity: 1,
    catalogLineTotal: 120,
    ownOfferType: null,
    ownOfferLabel: null,
    ownOfferId: null,
    ownOfferDiscount: 0,
    ownIneligibilityReason: null,
    ...o,
  });
  const frozenRow = (o: Partial<BackfillOrderItemRow> & { orderItemId: number }): BackfillOrderItemRow =>
    bareRow(o);

  type Olp = Record<string, unknown>;
  const bogoOlp = (menuItemId: string, catalog: number): Olp => ({
    menuItemId, appliedOfferId: 30, appliedOfferType: "BUY_X_GET_Y",
    appliedOfferLabel: "Buy One Get One", offerDiscountAmount: catalog / 2,
    ineligibilityReason: "ITEM_PROMO", catalogLineTotal: catalog,
  });
  const boostOlp = (menuItemId: string, catalog: number, disc: number): Olp => ({
    menuItemId, appliedOfferId: 21, appliedOfferType: "PERCENTAGE",
    appliedOfferLabel: "Boost Offer Applied", offerDiscountAmount: disc,
    ineligibilityReason: "ITEM_PROMO", catalogLineTotal: catalog,
  });
  const noneOlp = (menuItemId: string, catalog: number): Olp => ({
    menuItemId, appliedOfferType: "", appliedOfferLabel: "", offerDiscountAmount: 0, catalogLineTotal: catalog,
  });

  const finalType = (input: MerchantCtmLineInput, snap: Record<string, unknown> | null = null) =>
    prepareCtmRows([input], 0, snap).rows[0]!;

  it("BARE row (no frozen columns) + billing says BOGO → BOGO with recovered free-unit discount", () => {
    const input = resolveBackfillCtmLineInput(
      bareRow({ orderItemId: 1, menuItemId: 25, catalogLineTotal: 120 }),
      [bogoOlp("25", 120)],
      0
    );
    const r = finalType(input);
    assert.equal(r.offerType, "BOGO");
    assert.equal(r.disc, 0);
    assert.equal(r.net, 120);
    assert.equal(r.gross, 120);
  });

  it("BARE row + billing says BOOST → BOOST with the billed discount", () => {
    const input = resolveBackfillCtmLineInput(
      bareRow({ orderItemId: 1, menuItemId: 85, catalogLineTotal: 200 }),
      [boostOlp("85", 200, 30)],
      0
    );
    const r = finalType(input);
    assert.equal(r.offerType, "PERCENTAGE");
    assert.equal(r.disc, 30);
    assert.equal(r.net, 170);
  });

  it("BARE row + billing has no offer → NONE (genuine no-offer item)", () => {
    const input = resolveBackfillCtmLineInput(
      bareRow({ orderItemId: 1, menuItemId: 26, catalogLineTotal: 71 }),
      [noneOlp("26", 71)],
      0
    );
    assert.equal(finalType(input).offerType, "NONE");
  });

  it("FROZEN BOGO row → BOGO directly, billing not needed", () => {
    const input = resolveBackfillCtmLineInput(
      frozenRow({ orderItemId: 1, menuItemId: 25, catalogLineTotal: 120,
        ownOfferType: "BUY_X_GET_Y", ownOfferLabel: "Buy One Get One", ownOfferId: 30, ownIneligibilityReason: "ITEM_PROMO" }),
      [],
      0
    );
    assert.equal(finalType(input).offerType, "BOGO");
  });

  it("mixed bare cart — each line recovers ONLY its own billing row (BOGO / BOOST / NONE)", () => {
    const pricing = [bogoOlp("25", 120), boostOlp("85", 200, 30), noneOlp("26", 71)];
    const rows = [
      bareRow({ orderItemId: 1, menuItemId: 25, catalogLineTotal: 120 }),
      bareRow({ orderItemId: 2, menuItemId: 85, catalogLineTotal: 200 }),
      bareRow({ orderItemId: 3, menuItemId: 26, catalogLineTotal: 71 }),
    ].map((row, i) => resolveBackfillCtmLineInput(row, pricing, i));
    const out = prepareCtmRows(rows, 0, null).rows;
    assert.deepEqual(out.map((r) => [r.orderItemId, r.offerType]), [
      [1, "BOGO"], [2, "PERCENTAGE"], [3, "NONE"],
    ]);
  });

  it("multiple bare BOGO items all recover to BOGO", () => {
    const pricing = [bogoOlp("25", 120), bogoOlp("40", 90)];
    const rows = [
      bareRow({ orderItemId: 1, menuItemId: 25, catalogLineTotal: 120 }),
      bareRow({ orderItemId: 2, menuItemId: 40, catalogLineTotal: 90 }),
    ].map((row, i) => resolveBackfillCtmLineInput(row, pricing, i));
    assert.deepEqual(
      prepareCtmRows(rows, 0, null).rows.map((r) => r.offerType),
      ["BOGO", "BOGO"]
    );
  });

  it("Precision + BOGO (bare) — precision line stays NONE via its own offerId surface; BOGO stays BOGO", () => {
    const precisionOlp: Olp = {
      menuItemId: "47", appliedOfferId: 17, appliedOfferType: "PERCENTAGE",
      appliedOfferLabel: "Flat 20% Off up to ₹80", offerDiscountAmount: 9,
      ineligibilityReason: "ITEM_PROMO", catalogLineTotal: 129,
    };
    const snap = {
      order_line_pricing: [precisionOlp, bogoOlp("25", 120)],
      discounts: [
        { label: "Flat 20% Off up to ₹80", amount: 80, meta: { source: "merchant_offers", offerType: "PERCENTAGE", itemSurface: false, conditionsMode: "precision", merchantOfferId: 17 } },
      ],
    };
    const rows = [
      bareRow({ orderItemId: 1, menuItemId: 47, catalogLineTotal: 129 }),
      bareRow({ orderItemId: 2, menuItemId: 25, catalogLineTotal: 120 }),
    ].map((row, i) => resolveBackfillCtmLineInput(row, snap.order_line_pricing, i));
    const out = prepareCtmRows(rows, 0, snap).rows;
    assert.equal(out[0]!.offerType, "NONE"); // precision → never CTM
    assert.equal(out[1]!.offerType, "BOGO");
  });

  it("positional drift — a bare line still recovers by its own menu id, not by index", () => {
    // billing rows arrive in a different order than the item rows; menu-id match must win.
    const pricing = [boostOlp("85", 200, 30), bogoOlp("25", 120)];
    const input = resolveBackfillCtmLineInput(
      bareRow({ orderItemId: 1, menuItemId: 25, catalogLineTotal: 120 }),
      pricing,
      0 // index 0 is the BOOST row, but this line's menu id is 25 (the BOGO row)
    );
    assert.equal(finalType(input).offerType, "BOGO");
  });
});

describe("buildSettlementBreakdownFromCtmRows", () => {
  it("no offer: all discount buckets stay 0, merchantGross equals sum of gross", () => {
    const rows: CtmRow[] = [
      { gross: 200, disc: 0, offerType: "NONE" },
      { gross: 150, disc: 0, offerType: "NONE" },
    ];
    const b = buildSettlementBreakdownFromCtmRows(rows, null, 20);
    // CTM gross is catalog selling ₹; settlement scales by (100 − commission%).
    assert.equal(b.itemTotal, 280);
    assert.equal(b.couponOfferDiscount, 0);
    assert.equal(b.percentageFlatOfferDiscount, 0);
    assert.equal(b.comboOfferDiscount, 0);
    assert.equal(b.freeDeliveryOfferDiscount, 0);
    assert.equal(b.merchantGross, 280);
  });

  it("BOOST: falls into percentage_flat_offer_discount, never coupon or combo", () => {
    const rows: CtmRow[] = [{ gross: 200, disc: 30, offerType: "BOOST" }];
    const b = buildSettlementBreakdownFromCtmRows(rows, null, 0);
    assert.equal(b.percentageFlatOfferDiscount, 30);
    assert.equal(b.couponOfferDiscount, 0);
    assert.equal(b.comboOfferDiscount, 0);
    assert.equal(b.merchantGross, 170);
  });

  it("PRECISION (merchant cart discount) also buckets under percentage_flat_offer_discount", () => {
    const rows: CtmRow[] = [
      { gross: 100, disc: 0, offerType: "NONE" },
      { gross: 200, disc: 20, offerType: "PRECISION" },
    ];
    const b = buildSettlementBreakdownFromCtmRows(rows, null, 0);
    assert.equal(b.percentageFlatOfferDiscount, 20);
    assert.equal(b.itemTotal, 300);
    assert.equal(b.merchantGross, 280);
  });

  it("BOGO/COMBO/FREE_ITEM bucket under combo_offer_discount", () => {
    const rows: CtmRow[] = [
      { gross: 100, disc: 40, offerType: "BOGO" },
      { gross: 50, disc: 10, offerType: "COMBO" },
      { gross: 30, disc: 5, offerType: "FREE_ITEM" },
    ];
    const b = buildSettlementBreakdownFromCtmRows(rows, null, 0);
    assert.equal(b.comboOfferDiscount, 55);
    assert.equal(b.percentageFlatOfferDiscount, 0);
    assert.equal(b.couponOfferDiscount, 0);
  });

  it("COUPON buckets separately from percentage/flat/precision offers", () => {
    const rows: CtmRow[] = [{ gross: 200, disc: 25, offerType: "COUPON" }];
    const b = buildSettlementBreakdownFromCtmRows(rows, null, 0);
    assert.equal(b.couponOfferDiscount, 25);
    assert.equal(b.percentageFlatOfferDiscount, 0);
  });

  it("multiple merchant offers across lines sum into their respective buckets", () => {
    const rows: CtmRow[] = [
      { gross: 200, disc: 30, offerType: "BOOST" },
      { gross: 100, disc: 15, offerType: "PRECISION" },
      { gross: 80, disc: 20, offerType: "BOGO" },
    ];
    const b = buildSettlementBreakdownFromCtmRows(rows, null, 0);
    assert.equal(b.percentageFlatOfferDiscount, 45);
    assert.equal(b.comboOfferDiscount, 20);
    assert.equal(b.itemTotal, 380);
    assert.equal(b.merchantGross, 380 - 45 - 20);
  });

  it("commission percent scales packaging charge to merchant rupee terms", () => {
    const rows: CtmRow[] = [{ gross: 100, disc: 0, offerType: "NONE" }];
    const billingSnapshot = { packaging_fee: 20 };
    const b = buildSettlementBreakdownFromCtmRows(rows, billingSnapshot, 20);
    // packaging 20 at (100-20)/100 commission factor => 16
    // catalog item 100 at same factor => 80
    assert.equal(b.packagingCharge, 16);
    assert.equal(b.itemTotal, 80);
    assert.equal(b.merchantGross, 96);
  });

  it("high quantity / large discount never drives merchantGross negative", () => {
    const rows: CtmRow[] = [{ gross: 500, disc: 500, offerType: "BOOST" }];
    const b = buildSettlementBreakdownFromCtmRows(rows, null, 0);
    assert.equal(b.merchantGross, 0);
  });

  it("platform-funded rows are never passed in and never surface in any bucket (NONE offerType with disc=0 no-ops)", () => {
    // Platform-funded discounts are excluded upstream in prepareCtmRows before rows
    // reach this function — simulate the resulting row (no merchant discount recorded).
    const rows: CtmRow[] = [{ gross: 200, disc: 0, offerType: "NONE" }];
    const b = buildSettlementBreakdownFromCtmRows(rows, null, 0);
    assert.equal(b.couponOfferDiscount, 0);
    assert.equal(b.percentageFlatOfferDiscount, 0);
    assert.equal(b.comboOfferDiscount, 0);
    assert.equal(b.merchantGross, 200);
  });

  it("precisionMerchantAmount folds into percentage_flat bucket and reduces merchantGross, with no CTM rows involved", () => {
    const rows: CtmRow[] = [{ gross: 300, disc: 0, offerType: "NONE" }];
    const b = buildSettlementBreakdownFromCtmRows(rows, null, 0, 40);
    assert.equal(b.percentageFlatOfferDiscount, 40);
    assert.equal(b.itemTotal, 300);
    assert.equal(b.merchantGross, 260);
  });

  it("precisionMerchantAmount adds on top of genuine item-surface discounts in the same bucket", () => {
    const rows: CtmRow[] = [{ gross: 300, disc: 30, offerType: "BOOST" }];
    const b = buildSettlementBreakdownFromCtmRows(rows, null, 0, 40);
    assert.equal(b.percentageFlatOfferDiscount, 70);
    assert.equal(b.merchantGross, 230);
  });
});

describe("prepareCtmRows — Merchant Precision must never populate CTM lines", () => {
  it("a line whose offer is raw PRECISION is zeroed: NONE type, 0 discount, net === gross", () => {
    const lines = [
      ctmLine({ orderItemId: 1, offerType: "PRECISION", customerOfferDiscount: 50, offerName: "Precision Offer" }),
    ];
    const { rows } = prepareCtmRows(lines, 0, precisionBillingSnapshot(50));
    assert.equal(rows.length, 1);
    assert.equal(rows[0]!.offerType, "NONE");
    assert.equal(rows[0]!.disc, 0);
    assert.equal(rows[0]!.net, rows[0]!.gross);
    assert.equal(rows[0]!.offerName, null);
  });

  it("raw CART_PERCENTAGE and CART_FLAT are also zeroed (not just literal PRECISION)", () => {
    const lines = [
      ctmLine({ orderItemId: 1, offerType: "CART_PERCENTAGE", customerOfferDiscount: 20 }),
      ctmLine({ orderItemId: 2, offerType: "CART_FLAT", customerOfferDiscount: 15 }),
    ];
    const { rows } = prepareCtmRows(lines, 0, null);
    for (const r of rows) {
      assert.equal(r.offerType, "NONE");
      assert.equal(r.disc, 0);
    }
  });

  it("never produces a row with offerType PRECISION under any input", () => {
    const lines = [
      ctmLine({ orderItemId: 1, offerType: "PRECISION", customerOfferDiscount: 50 }),
      ctmLine({ orderItemId: 2, offerType: "BOOST", customerOfferDiscount: 30, offerDiscountPct: 15 }),
      ctmLine({ orderItemId: 3, offerType: "BOGO", customerOfferDiscount: 40 }),
    ];
    const { rows } = prepareCtmRows(lines, 10, precisionBillingSnapshot(50));
    assert.ok(rows.every((r) => r.offerType !== "PRECISION"));
  });

  it("genuine item-surface Boost is unaffected by the precision fix", () => {
    // A real merchant Boost is an item-surface %/flat offer on an ITEM_PROMO line — that
    // flag is what authorizes the BOOST tag (the engine never emits a literal "BOOST" type).
    const lines = [
      ctmLine({
        orderItemId: 1,
        offerType: "BOOST",
        customerOfferDiscount: 30,
        offerDiscountPct: 15,
        isItemPromo: true,
      }),
    ];
    const { rows } = prepareCtmRows(lines, 0, null);
    assert.equal(rows[0]!.offerType, "BOOST");
    assert.equal(rows[0]!.disc, 30);
  });

  it("cartPrecisionMerchant still reflects the billing snapshot's precision total for orders_core, even though no CTM row carries it", () => {
    const lines = [ctmLine({ orderItemId: 1, offerType: "PRECISION", customerOfferDiscount: 50 })];
    const { rows, cartPrecisionMerchant } = prepareCtmRows(lines, 0, precisionBillingSnapshot(50));
    assert.equal(cartPrecisionMerchant, 50);
    assert.ok(rows.every((r) => r.disc === 0));
  });

  it("a line with no identifiable offer type never gets mislabeled BOOST, even if a stray discount leaked onto it", () => {
    // offerType is null (no genuine merchant offer on this line — matches order_line_pricing
    // for an item with no offer applied) but customerOfferDiscount is nonzero, simulating any
    // upstream leak/data anomaly. The CTM writer must never launder this into a fake Boost tag.
    const lines = [
      ctmLine({ orderItemId: 1, offerType: null, offerName: null, customerOfferDiscount: 76 }),
    ];
    const { rows } = prepareCtmRows(lines, 0, null);
    assert.equal(rows[0]!.offerType, "NONE");
    assert.equal(rows[0]!.offerName, null);
    assert.equal(rows[0]!.disc, 0);
    assert.equal(rows[0]!.net, rows[0]!.gross);
  });
});

/**
 * Regression matrix for the "every line saved as BOOST" production bug.
 *
 * SSOT: merchant_ctm_pricing_snapshot.merchant_offer_type may be PERCENTAGE, FLAT,
 * BOOST (legacy), BOGO, or NONE. The billing engine represents a store %/flat offer as
 * appliedOfferType PERCENTAGE/FLAT + ineligibilityReason ITEM_PROMO. A %/flat discount on a
 * NON-ITEM_PROMO line is a cart-level (Merchant Precision) or platform/coupon attribution
 * and must NEVER become a merchant item offer here.
 */
describe("prepareCtmRows — merchant_offer_type reflects ONLY genuine merchant ITEM offers", () => {
  /** billing snapshot carrying just the per-line ITEM_PROMO/eligibility array (index-based fallback path). */
  const eligibilitySnapshot = (reasons: Array<"ITEM_PROMO" | "MRP" | null>) => ({
    order_line_eligibility: reasons.map((ineligibilityReason) => ({ ineligibilityReason })),
  });

  it("CASE 2 — Boost (PERCENTAGE on an ITEM_PROMO line): BOOST, gross original, net discounted", () => {
    const lines = [
      ctmLine({
        orderItemId: 330,
        offerType: "PERCENTAGE",
        customerCatalogLine: 60,
        customerOfferDiscount: 9,
        offerDiscountPct: 15,
        isItemPromo: true,
      }),
    ];
    const { rows } = prepareCtmRows(lines, 0, null);
    assert.equal(rows[0]!.offerType, "PERCENTAGE");
    assert.equal(rows[0]!.gross, 60);
    assert.equal(rows[0]!.disc, 9);
    assert.equal(rows[0]!.net, 51);
    assert.equal(rows[0]!.offerName, "Store Offer Applied");
  });

  it("CASE 2 — FLAT item offer on an ITEM_PROMO line also maps to BOOST", () => {
    const lines = [
      ctmLine({ offerType: "FLAT", customerCatalogLine: 200, customerOfferDiscount: 40, offerDiscountFlat: 40, isItemPromo: true }),
    ];
    const { rows } = prepareCtmRows(lines, 0, null);
    assert.equal(rows[0]!.offerType, "FLAT");
    assert.equal(rows[0]!.disc, 40);
    assert.equal(rows[0]!.net, 160);
  });

  it("CASE 1 — BOGO: type BOGO, discount 0, net = selling price, name Buy One Get One", () => {
    const lines = [
      ctmLine({
        offerType: "BOGO",
        offerName: "Buy One Get One",
        customerCatalogLine: 120,
        customerOfferDiscount: 60,
        isItemPromo: true,
      }),
    ];
    const { rows } = prepareCtmRows(lines, 0, null);
    assert.equal(rows[0]!.offerType, "BOGO");
    assert.equal(rows[0]!.disc, 0);
    assert.equal(rows[0]!.gross, 120);
    assert.equal(rows[0]!.net, 120);
    assert.equal(rows[0]!.offerName, "Buy One Get One");
  });

  it("CASE 3 — no merchant offer: NONE / NONE name / 0 discount / net === gross", () => {
    const lines = [ctmLine({ offerType: null, offerName: null, customerCatalogLine: 140, customerOfferDiscount: 0 })];
    const { rows } = prepareCtmRows(lines, 0, null);
    assert.equal(rows[0]!.offerType, "NONE");
    assert.equal(rows[0]!.offerName, null);
    assert.equal(rows[0]!.disc, 0);
    assert.equal(rows[0]!.net, 140);
  });

  it("gross_value is catalog selling price; net_ctm matches when there is no store offer", () => {
    const { rows } = prepareCtmRows(
      [ctmLine({ customerCatalogLine: 99, customerOfferDiscount: 0 })],
      15,
      null
    );
    assert.equal(rows[0]!.gross, 99);
    assert.equal(rows[0]!.net, 99);
    assert.equal(rows[0]!.disc, 0);
  });

  it("BOOST: gross is catalog selling; net is selling minus offer (commission stays out)", () => {
    const { rows } = prepareCtmRows(
      [
        ctmLine({
          customerCatalogLine: 99,
          customerOfferDiscount: 20,
          offerType: "PERCENTAGE",
          offerDiscountPct: 15,
          isItemPromo: true,
        }),
      ],
      15,
      null
    );
    assert.equal(rows[0]!.offerType, "PERCENTAGE");
    assert.equal(rows[0]!.gross, 99);
    assert.equal(rows[0]!.disc, 20);
    assert.equal(rows[0]!.net, 79);
    assert.equal(rows[0]!.offerName, "Store Offer Applied");
  });

  it("FLAT store offer: type/name/discount captured; net is selling minus offer", () => {
    const { rows } = prepareCtmRows(
      [
        ctmLine({
          customerCatalogLine: 117,
          customerOfferDiscount: 20,
          offerType: "FLAT",
          offerName: "₹20 off",
          offerDiscountFlat: 20,
          isItemPromo: true,
        }),
      ],
      15,
      null
    );
    assert.equal(rows[0]!.offerType, "FLAT");
    assert.equal(rows[0]!.gross, 117);
    assert.equal(rows[0]!.disc, 20);
    assert.equal(rows[0]!.net, 97);
    assert.equal(rows[0]!.offerName, "₹20 off");
  });

  it("BOOST percent with missing rupee discount still reduces net from the percent", () => {
    const { rows } = prepareCtmRows(
      [
        ctmLine({
          customerCatalogLine: 99,
          customerOfferDiscount: 0,
          offerType: "PERCENTAGE",
          offerDiscountPct: 40,
          isItemPromo: true,
        }),
      ],
      15,
      {
        discounts: [
          {
            label: "Boost Offer Applied",
            amount: 39.6,
            meta: {
              source: "merchant_offers",
              offerType: "PERCENTAGE",
              itemSurface: true,
              conditionsMode: "boost",
              discountPercentage: 40,
            },
          },
        ],
        order_line_eligibility: [{ ineligibilityReason: "ITEM_PROMO" }],
      }
    );
    assert.equal(rows[0]!.offerType, "PERCENTAGE");
    assert.equal(rows[0]!.gross, 99);
    assert.equal(rows[0]!.disc, 39.6);
    assert.equal(rows[0]!.net, 59.4);
  });

  it("THE BUG — PERCENTAGE discount on a NON-ITEM_PROMO line (Precision/platform attribution) must be NONE, never BOOST", () => {
    const lines = [
      ctmLine({ offerType: "PERCENTAGE", customerCatalogLine: 60, customerOfferDiscount: 9, isItemPromo: false }),
    ];
    const { rows } = prepareCtmRows(lines, 0, null);
    assert.equal(rows[0]!.offerType, "NONE");
    assert.equal(rows[0]!.disc, 0);
    assert.equal(rows[0]!.net, 60);
    assert.equal(rows[0]!.offerName, null);
  });

  it("CASE 5 — a platform COUPON amount attributed to a line never populates merchant_offer_type/discount", () => {
    const lines = [
      ctmLine({ offerType: "COUPON", offerName: "SAVE50", customerCatalogLine: 200, customerOfferDiscount: 50, isItemPromo: false }),
    ];
    const { rows } = prepareCtmRows(lines, 0, null);
    assert.equal(rows[0]!.offerType, "NONE");
    assert.equal(rows[0]!.disc, 0);
    assert.equal(rows[0]!.net, 200);
  });

  it("Mixed cart — BOOST + normal + BOGO + Precision each persist independently and correctly", () => {
    const lines = [
      ctmLine({ orderItemId: 1, offerType: "PERCENTAGE", customerCatalogLine: 60, customerOfferDiscount: 9, offerDiscountPct: 15, isItemPromo: true }),
      ctmLine({ orderItemId: 2, offerType: null, customerCatalogLine: 140, customerOfferDiscount: 0, isItemPromo: false }),
      ctmLine({ orderItemId: 3, offerType: "BOGO", offerName: "Buy One Get One", customerCatalogLine: 180, customerOfferDiscount: 90, isItemPromo: true }),
      ctmLine({ orderItemId: 4, offerType: "PRECISION", customerCatalogLine: 200, customerOfferDiscount: 20, isItemPromo: false }),
    ];
    const { rows } = prepareCtmRows(lines, 0, null);
    assert.deepEqual(
      rows.map((r) => [r.orderItemId, r.offerType, r.disc, r.net]),
      [
        [1, "PERCENTAGE", 9, 51],
        [2, "NONE", 0, 140],
        [3, "BOGO", 0, 180],
        [4, "NONE", 0, 200],
      ]
    );
  });

  it("BOOST + BOGO on separate item lines keep their own types (no cross-contamination)", () => {
    const lines = [
      ctmLine({ orderItemId: 1, offerType: "PERCENTAGE", customerCatalogLine: 100, customerOfferDiscount: 20, offerDiscountPct: 20, isItemPromo: true }),
      ctmLine({ orderItemId: 2, offerType: "BOGO", offerName: "Buy One Get One", customerCatalogLine: 100, customerOfferDiscount: 50, isItemPromo: true }),
    ];
    const { rows } = prepareCtmRows(lines, 0, null);
    assert.equal(rows[0]!.offerType, "PERCENTAGE");
    assert.equal(rows[0]!.disc, 20);
    assert.equal(rows[1]!.offerType, "BOGO");
    assert.equal(rows[1]!.disc, 0);
    assert.equal(rows[1]!.net, 100);
  });

  it("fallback path — ITEM_PROMO sourced from order_line_eligibility (no per-line isItemPromo) still yields BOOST", () => {
    const lines = [
      ctmLine({ offerType: "PERCENTAGE", customerCatalogLine: 60, customerOfferDiscount: 9, offerDiscountPct: 15 }),
    ];
    const { rows } = prepareCtmRows(lines, 0, eligibilitySnapshot(["ITEM_PROMO"]));
    assert.equal(rows[0]!.offerType, "PERCENTAGE");
    assert.equal(rows[0]!.disc, 9);
  });

  it("fallback path — a %/flat line NOT flagged ITEM_PROMO by eligibility stays NONE", () => {
    const lines = [
      ctmLine({ offerType: "PERCENTAGE", customerCatalogLine: 60, customerOfferDiscount: 9 }),
    ];
    const { rows } = prepareCtmRows(lines, 0, eligibilitySnapshot([null]));
    assert.equal(rows[0]!.offerType, "NONE");
    assert.equal(rows[0]!.disc, 0);
  });

  it("per-line isItemPromo=false overrides a stale ITEM_PROMO in the index-based eligibility array", () => {
    const lines = [
      ctmLine({ offerType: "PERCENTAGE", customerCatalogLine: 60, customerOfferDiscount: 9, isItemPromo: false }),
    ];
    // eligibility array (index 0) says ITEM_PROMO, but the authoritative per-line flag says no.
    const { rows } = prepareCtmRows(lines, 0, eligibilitySnapshot(["ITEM_PROMO"]));
    assert.equal(rows[0]!.offerType, "NONE");
  });

  it("never emits PRECISION or COUPON as a merchant_offer_type", () => {
    const lines = [
      ctmLine({ orderItemId: 1, offerType: "PERCENTAGE", customerOfferDiscount: 9, isItemPromo: true }),
      ctmLine({ orderItemId: 2, offerType: "PRECISION", customerOfferDiscount: 20, isItemPromo: false }),
      ctmLine({ orderItemId: 3, offerType: "COUPON", customerOfferDiscount: 25, isItemPromo: false }),
      ctmLine({ orderItemId: 4, offerType: "FLAT", customerOfferDiscount: 10, isItemPromo: false }),
      ctmLine({ orderItemId: 5, offerType: "BOGO", customerOfferDiscount: 40, isItemPromo: true }),
    ];
    const { rows } = prepareCtmRows(lines, 0, null);
    const allowed = new Set(["PERCENTAGE", "FLAT", "BOOST", "BOGO", "NONE"]);
    for (const r of rows) assert.ok(allowed.has(r.offerType), `unexpected offerType ${r.offerType}`);
    assert.equal(rows[0]!.offerType, "PERCENTAGE");
    assert.equal(rows[1]!.offerType, "NONE");
    assert.equal(rows[2]!.offerType, "NONE");
    assert.equal(rows[3]!.offerType, "NONE");
    assert.equal(rows[4]!.offerType, "BOGO");
  });
});

/**
 * A BOGO must NEVER be treated or stored as a BOOST — regardless of how the merchant row
 * spelled its offer type, whether the line is ITEM_PROMO, and whether a per-unit discount
 * was recorded. BOGO always: type BOGO; discount 0; net = catalog selling price.
 */
describe("prepareCtmRows — BOGO is never stored as BOOST", () => {
  const bogoCase = (offerType: string) => {
    const lines = [
      ctmLine({
        offerType,
        offerName: "Buy One Get One",
        customerCatalogLine: 90,
        customerOfferDiscount: 45,
        isItemPromo: true,
      }),
    ];
    return prepareCtmRows(lines, 0, null).rows[0]!;
  };

  for (const variant of [
    "BOGO",
    "BUY_X_GET_Y",
    "BUY_N_GET_M",
    "BUY_ONE_GET_ONE",
    "Buy 2 Get 1",
    "bogo_50",
  ]) {
    it(`offer type "${variant}" → BOGO (never BOOST), discount 0, net = selling price`, () => {
      const r = bogoCase(variant);
      assert.equal(r.offerType, "BOGO");
      assert.notEqual(r.offerType, "BOOST");
      assert.equal(r.disc, 0);
      assert.equal(r.gross, 90);
      assert.equal(r.net, 90);
      assert.equal(r.offerName, "Buy One Get One");
    });
  }

  it("BOGO on an ITEM_PROMO line is NOT reclassified as BOOST even though ITEM_PROMO gates Boost", () => {
    // ITEM_PROMO + a nonzero line discount is exactly the shape of a Boost line — the BOGO
    // type must still win and keep the free-unit discount (never reclassify as BOOST).
    const lines = [
      ctmLine({ offerType: "BOGO", customerCatalogLine: 120, customerOfferDiscount: 60, isItemPromo: true }),
    ];
    const { rows } = prepareCtmRows(lines, 0, null);
    assert.equal(rows[0]!.offerType, "BOGO");
    assert.equal(rows[0]!.disc, 0);
    assert.equal(rows[0]!.net, 120);
  });

  it("a BOGO line and a Boost line in the same cart never bleed into each other", () => {
    const lines = [
      ctmLine({ orderItemId: 1, offerType: "BUY_ONE_GET_ONE", customerCatalogLine: 90, customerOfferDiscount: 45, isItemPromo: true }),
      ctmLine({ orderItemId: 2, offerType: "PERCENTAGE", customerCatalogLine: 60, customerOfferDiscount: 9, offerDiscountPct: 15, isItemPromo: true }),
    ];
    const { rows } = prepareCtmRows(lines, 0, null);
    assert.equal(rows[0]!.offerType, "BOGO");
    assert.equal(rows[0]!.disc, 0);
    assert.equal(rows[0]!.net, 90);
    assert.equal(rows[1]!.offerType, "PERCENTAGE");
    assert.equal(rows[1]!.disc, 9);
  });
});

/**
 * orders_core.merchant_precision_discount must reflect ONLY the merchant store cart/precision
 * discount — never a BOGO free-unit value, a Boost, or any platform offer. `prepareCtmRows`
 * returns this figure (merchant-rupee scale) as cartPrecisionMerchant.
 */
describe("prepareCtmRows — cartPrecisionMerchant excludes BOGO / Boost / platform", () => {
  const snapshotWith = (discounts: unknown[]) => ({ discounts });

  it("a BOGO free-unit discount row is never counted as merchant precision", () => {
    const snap = snapshotWith([
      {
        label: "Buy One Get One",
        amount: 90,
        offerSource: "merchant_offers",
        meta: { merchantOfferId: 10, offerType: "BOGO", itemSurface: true, cartSurface: false },
      },
    ]);
    const { cartPrecisionMerchant } = prepareCtmRows([ctmLine({ offerType: "BOGO", isItemPromo: true })], 0, snap);
    assert.equal(cartPrecisionMerchant, 0);
  });

  it("a BOGO variant WITHOUT an itemSurface flag is still excluded from precision (spelling-robust)", () => {
    const snap = snapshotWith([
      {
        label: "Buy One Get One",
        amount: 90,
        offerSource: "merchant_offers",
        meta: { merchantOfferId: 10, offerType: "BUY_ONE_GET_ONE" },
      },
    ]);
    const { cartPrecisionMerchant } = prepareCtmRows([ctmLine({ offerType: "BOGO", isItemPromo: true })], 0, snap);
    assert.equal(cartPrecisionMerchant, 0);
  });

  it("only the genuine precision row counts when a BOGO and a Precision row coexist (no inflation)", () => {
    const snap = snapshotWith([
      {
        label: "Buy One Get One",
        amount: 90,
        offerSource: "merchant_offers",
        meta: { merchantOfferId: 10, offerType: "BOGO", itemSurface: true },
      },
      {
        label: "Precision Offer",
        amount: 77,
        offerSource: "merchant_offers",
        meta: { merchantOfferId: 55, offerType: "PRECISION", conditionsMode: "precision" },
      },
    ]);
    const { cartPrecisionMerchant } = prepareCtmRows([ctmLine({ offerType: "BOGO", isItemPromo: true })], 0, snap);
    // Exactly the precision total (77) — never 77+90, and never the larger of two derivations.
    assert.equal(cartPrecisionMerchant, 77);
  });

  it("a platform offer/coupon never counts as merchant precision", () => {
    const snap = snapshotWith([
      {
        label: "Platform Coupon",
        amount: 50,
        offerSource: "PLATFORM",
        meta: { platformOfferId: 900, offerType: "PRECISION", conditionsMode: "precision" },
      },
    ]);
    const { cartPrecisionMerchant } = prepareCtmRows([ctmLine({ offerType: null })], 0, snap);
    assert.equal(cartPrecisionMerchant, 0);
  });

  it("commission scales precision to merchant-rupee terms", () => {
    const snap = snapshotWith([
      {
        label: "Precision Offer",
        amount: 100,
        offerSource: "merchant_offers",
        meta: { merchantOfferId: 55, offerType: "PRECISION", conditionsMode: "precision" },
      },
    ]);
    // 20% commission → factor 0.8 → 100 * 0.8 = 80
    const { cartPrecisionMerchant } = prepareCtmRows([ctmLine({ offerType: null })], 20, snap);
    assert.equal(cartPrecisionMerchant, 80);
  });
});

/**
 * Issue 1 regression: orders_core.merchant_precision_discount must store the EXACT Merchant
 * Precision the Billing Engine finalized (customer ₹, as shown in the billing breakdown) — NOT
 * the commission-scaled figure. `prepareCtmRows` exposes this as `cartPrecisionCustomer`, which
 * is what the persistence layer freezes onto orders_core.
 */
describe("prepareCtmRows — cartPrecisionCustomer is the verbatim Billing Engine value", () => {
  const snapshotWith = (discounts: unknown[]) => ({ discounts });
  const precisionRow = (amount: number) => ({
    label: "Precision Offer",
    amount,
    offerSource: "merchant_offers",
    meta: { merchantOfferId: 55, offerType: "PRECISION", conditionsMode: "precision" },
  });

  it("₹90 precision stays ₹90 in cartPrecisionCustomer regardless of commission (the ₹90→₹77 bug)", () => {
    const snap = snapshotWith([precisionRow(90)]);
    // Commission ~14.4% would have produced the wrong stored ₹77 on the merchant-scaled value.
    const at14 = prepareCtmRows([ctmLine({ offerType: null })], 14.44, snap);
    const at0 = prepareCtmRows([ctmLine({ offerType: null })], 0, snap);
    const at30 = prepareCtmRows([ctmLine({ offerType: null })], 30, snap);
    assert.equal(at14.cartPrecisionCustomer, 90);
    assert.equal(at0.cartPrecisionCustomer, 90);
    assert.equal(at30.cartPrecisionCustomer, 90);
    // The commission-scaled figure (settlement-only) still tracks the factor and is NOT what we store.
    assert.ok(at14.cartPrecisionMerchant < 90);
  });

  it("customer-scale precision is never the same as the commission-scaled figure when commission > 0", () => {
    const snap = snapshotWith([precisionRow(100)]);
    const { cartPrecisionCustomer, cartPrecisionMerchant } = prepareCtmRows(
      [ctmLine({ offerType: null })],
      20,
      snap
    );
    assert.equal(cartPrecisionCustomer, 100);
    assert.equal(cartPrecisionMerchant, 80);
  });

  it("no precision → cartPrecisionCustomer is 0", () => {
    const { cartPrecisionCustomer } = prepareCtmRows([ctmLine({ offerType: null })], 20, snapshotWith([]));
    assert.equal(cartPrecisionCustomer, 0);
  });
});

/**
 * Issue 2 regression: a BOGO must never be stored as BOOST even when its raw offer TYPE arrives
 * spelled as a bare %/flat, as long as the finalized Billing Engine LABEL is a buy-get deal.
 * The engine always stamps "Buy One Get One" on targeted BOGO lines, so the label is authoritative.
 */
describe("prepareCtmRows — buy-get label forces BOGO even when the raw type is %/flat", () => {
  it("PERCENTAGE type + 'Buy One Get One' label on an ITEM_PROMO line → BOGO, not BOOST", () => {
    const lines = [
      ctmLine({
        offerType: "PERCENTAGE",
        offerName: "Buy One Get One",
        customerCatalogLine: 90,
        customerOfferDiscount: 45,
        offerDiscountPct: 50,
        isItemPromo: true,
      }),
    ];
    const { rows } = prepareCtmRows(lines, 0, null);
    assert.equal(rows[0]!.offerType, "BOGO");
    assert.equal(rows[0]!.disc, 0);
    assert.equal(rows[0]!.net, 90);
    assert.equal(rows[0]!.offerName, "Buy One Get One");
  });

  it("FLAT type + 'Buy 2 Get 1' label → BOGO with canonical name and captured discount", () => {
    const lines = [
      ctmLine({
        offerType: "FLAT",
        offerName: "Buy 2 Get 1 Free",
        customerCatalogLine: 120,
        customerOfferDiscount: 40,
        offerDiscountFlat: 40,
        isItemPromo: true,
      }),
    ];
    const { rows } = prepareCtmRows(lines, 0, null);
    assert.equal(rows[0]!.offerType, "BOGO");
    assert.equal(rows[0]!.disc, 0);
    assert.equal(rows[0]!.net, 120);
    assert.equal(rows[0]!.offerName, "Buy Two Get One");
  });

  it("a genuine Boost label ('Boost Offer Applied') is NOT misread as BOGO", () => {
    const lines = [
      ctmLine({
        offerType: "PERCENTAGE",
        offerName: "Boost Offer Applied",
        customerCatalogLine: 60,
        customerOfferDiscount: 9,
        offerDiscountPct: 15,
        isItemPromo: true,
      }),
    ];
    const { rows } = prepareCtmRows(lines, 0, null);
    assert.equal(rows[0]!.offerType, "PERCENTAGE");
    assert.equal(rows[0]!.disc, 9);
  });
});

/**
 * Production repro (order GM10000190 / core 54): a cart-level PRECISION offer ("Flat 20% Off up
 * to ₹80", merchantOfferId 17, meta.conditionsMode "precision", itemSurface false) was stamped
 * onto every targeted line as appliedOfferType "PERCENTAGE" + ITEM_PROMO. The CTM mapper then
 * mislabelled those lines BOOST. A line may only be BOOST when its appliedOfferId resolves to a
 * genuine ITEM-surface offer in the finalized discounts[]. Precision → always NONE.
 */
describe("prepareCtmRows — a Precision offer's lines are NONE, never BOOST (appliedOfferId surface)", () => {
  const precisionSnapshot = {
    discounts: [
      {
        label: "Flat 20% Off up to ₹80",
        amount: 80,
        meta: {
          source: "merchant_offers",
          offerType: "PERCENTAGE",
          cartSurface: false,
          itemSurface: false,
          conditionsMode: "precision",
          merchantOfferId: 17,
          discountPercentage: 20,
        },
      },
    ],
  };

  const precisionLine = (over: Partial<MerchantCtmLineInput>) =>
    ctmLine({
      offerType: "PERCENTAGE",
      offerName: "Flat 20% Off up to ₹80",
      appliedOfferId: 17,
      offerDiscountPct: 20,
      isItemPromo: true,
      ...over,
    });

  it("the exact order-54 cart: every Precision-attributed line persists NONE (was BOOST)", () => {
    const lines = [
      precisionLine({ orderItemId: 339, menuItemId: 102, customerCatalogLine: 141, customerOfferDiscount: 13 }),
      precisionLine({ orderItemId: 340, menuItemId: 88, customerCatalogLine: 176, customerOfferDiscount: 16 }),
      precisionLine({ orderItemId: 341, menuItemId: 53, customerCatalogLine: 423, customerOfferDiscount: 39, isItemPromo: false }),
      precisionLine({ orderItemId: 342, menuItemId: 47, customerCatalogLine: 129, customerOfferDiscount: 12 }),
    ];
    const { rows } = prepareCtmRows(lines, 0, precisionSnapshot);
    for (const r of rows) {
      assert.equal(r.offerType, "NONE", `item ${r.orderItemId} must be NONE`);
      assert.equal(r.offerName, null);
      assert.equal(r.disc, 0);
      assert.equal(r.net, r.gross);
    }
  });

  it("the Precision total still flows to cartPrecisionCustomer (orders_core), not onto CTM lines", () => {
    const lines = [precisionLine({ orderItemId: 342, menuItemId: 47, customerCatalogLine: 129, customerOfferDiscount: 12 })];
    const { rows, cartPrecisionCustomer } = prepareCtmRows(lines, 0, precisionSnapshot);
    assert.equal(rows[0]!.offerType, "NONE");
    assert.equal(cartPrecisionCustomer, 80);
  });

  it("a genuine item-surface BOOST (its offerId maps to an itemSurface discount row) still persists BOOST", () => {
    const boostSnapshot = {
      discounts: [
        {
          label: "Boost Offer Applied",
          amount: 9,
          meta: {
            source: "merchant_offers",
            offerType: "PERCENTAGE",
            cartSurface: false,
            itemSurface: true,
            conditionsMode: "boost",
            merchantOfferId: 21,
            discountPercentage: 15,
          },
        },
      ],
    };
    const lines = [
      ctmLine({
        orderItemId: 500,
        offerType: "PERCENTAGE",
        offerName: "Boost Offer Applied",
        appliedOfferId: 21,
        customerCatalogLine: 60,
        customerOfferDiscount: 9,
        offerDiscountPct: 15,
        isItemPromo: true,
      }),
    ];
    const { rows } = prepareCtmRows(lines, 0, boostSnapshot);
    assert.equal(rows[0]!.offerType, "PERCENTAGE");
    assert.equal(rows[0]!.disc, 9);
    assert.equal(rows[0]!.net, 51);
  });

  it("mixed: a BOOST line (item offer 21) + a Precision line (offer 17) resolve independently", () => {
    const snapshot = {
      discounts: [
        { label: "Boost Offer Applied", amount: 9, meta: { source: "merchant_offers", offerType: "PERCENTAGE", itemSurface: true, conditionsMode: "boost", merchantOfferId: 21, discountPercentage: 15 } },
        { label: "Flat 20% Off up to ₹80", amount: 80, meta: { source: "merchant_offers", offerType: "PERCENTAGE", itemSurface: false, conditionsMode: "precision", merchantOfferId: 17, discountPercentage: 20 } },
      ],
    };
    const lines = [
      ctmLine({ orderItemId: 1, offerType: "PERCENTAGE", offerName: "Boost Offer Applied", appliedOfferId: 21, customerCatalogLine: 60, customerOfferDiscount: 9, offerDiscountPct: 15, isItemPromo: true }),
      ctmLine({ orderItemId: 2, offerType: "PERCENTAGE", offerName: "Flat 20% Off up to ₹80", appliedOfferId: 17, customerCatalogLine: 129, customerOfferDiscount: 12, offerDiscountPct: 20, isItemPromo: true }),
    ];
    const { rows } = prepareCtmRows(lines, 0, snapshot);
    assert.equal(rows[0]!.offerType, "PERCENTAGE");
    assert.equal(rows[0]!.disc, 9);
    assert.equal(rows[1]!.offerType, "NONE");
    assert.equal(rows[1]!.disc, 0);
  });

  it("a real BOGO (offer maps to itemSurface, buy-get label) still persists BOGO, not BOOST", () => {
    const snapshot = {
      discounts: [
        { label: "Buy One Get One", amount: 90, meta: { source: "merchant_offers", offerType: "BOGO", itemSurface: true, conditionsMode: "bogo", merchantOfferId: 30 } },
      ],
    };
    const lines = [
      ctmLine({ orderItemId: 1, offerType: "BUY_X_GET_Y", offerName: "Buy One Get One", appliedOfferId: 30, customerCatalogLine: 90, customerOfferDiscount: 45, isItemPromo: true }),
    ];
    const { rows } = prepareCtmRows(lines, 0, snapshot);
    assert.equal(rows[0]!.offerType, "BOGO");
    assert.equal(rows[0]!.disc, 0);
    assert.equal(rows[0]!.net, 90);
  });
});

/**
 * Mixed-cart line independence: build CTM rows end-to-end through buildMerchantCtmLineInputs (the
 * layer that matches each cart line to its order_line_pricing row) + prepareCtmRows, and assert
 * EACH row on its own. Guards the cross-item contamination bug where a plain rows.find() reused
 * one line's pricing row for another line sharing the same menuItemId.
 */
describe("CTM mixed cart — every order item persists only its own merchant offer", () => {
  type Olp = Record<string, unknown>;
  const bogoRow = (menuItemId: string, catalog: number, disc: number, offerId = 30): Olp => ({
    menuItemId, appliedOfferId: offerId, appliedOfferType: "BUY_X_GET_Y",
    appliedOfferLabel: "Buy One Get One", offerDiscountAmount: disc,
    ineligibilityReason: "ITEM_PROMO", catalogLineTotal: catalog,
  });
  const boostRow = (menuItemId: string, catalog: number, disc: number, pct = 15, offerId = 21): Olp => ({
    menuItemId, appliedOfferId: offerId, appliedOfferType: "PERCENTAGE",
    appliedOfferLabel: "Boost Offer Applied", offerDiscountAmount: disc, appliedOfferDiscountPct: pct,
    ineligibilityReason: "ITEM_PROMO", catalogLineTotal: catalog,
  });
  const noneRow = (menuItemId: string, catalog: number): Olp => ({
    menuItemId, appliedOfferType: "", appliedOfferLabel: "", offerDiscountAmount: 0,
    catalogLineTotal: catalog,
  });
  const discounts = [
    { label: "Buy One Get One", amount: 90, meta: { source: "merchant_offers", offerType: "BOGO", itemSurface: true, conditionsMode: "bogo", merchantOfferId: 30 } },
    { label: "Boost Offer Applied", amount: 9, meta: { source: "merchant_offers", offerType: "PERCENTAGE", itemSurface: true, conditionsMode: "boost", merchantOfferId: 21, discountPercentage: 15 } },
  ];

  const build = (
    items: Array<{ menuItemId: number; quantity: number; basePrice: number }>,
    olp: Olp[]
  ) => {
    const snapshot = { order_line_pricing: olp, discounts };
    const lines = buildMerchantCtmLineInputs({
      insertedItemIds: items.map((_, i) => 1000 + i + 1),
      items: items.map((it) => ({ ...it, addons: [] })),
      billingSnapshot: snapshot,
    });
    return prepareCtmRows(lines, 0, snapshot).rows;
  };
  const shape = (r: { orderItemId: number; offerType: string; offerName: string | null; disc: number; gross: number; net: number }) =>
    [r.orderItemId, r.offerType, r.offerName, r.disc, r.gross, r.net];

  it("BOGO + BOOST + NONE (distinct items): three fully independent rows", () => {
    const rows = build(
      [
        { menuItemId: 1, quantity: 2, basePrice: 90 },
        { menuItemId: 2, quantity: 1, basePrice: 60 },
        { menuItemId: 3, quantity: 1, basePrice: 140 },
      ],
      [bogoRow("1", 180, 90), boostRow("2", 60, 9), noneRow("3", 140)]
    );
    assert.deepEqual(shape(rows[0]!), [1001, "BOGO", "Buy One Get One", 0, 180, 180]);
    assert.deepEqual(shape(rows[1]!), [1002, "PERCENTAGE", "Boost Offer Applied", 9, 60, 51]);
    assert.deepEqual(shape(rows[2]!), [1003, "NONE", null, 0, 140, 140]);
  });

  it("THE LEAK — two lines share a menuItemId (BOGO then NONE): NONE must NOT inherit the BOGO row", () => {
    const rows = build(
      [
        { menuItemId: 5, quantity: 2, basePrice: 90 },
        { menuItemId: 5, quantity: 1, basePrice: 140 },
      ],
      [bogoRow("5", 180, 90), noneRow("5", 140)]
    );
    assert.deepEqual(shape(rows[0]!), [1001, "BOGO", "Buy One Get One", 0, 180, 180]);
    // Before the 1:1 fix this line reused the first "5" row and was stored BOGO — must be NONE.
    assert.deepEqual(shape(rows[1]!), [1002, "NONE", null, 0, 140, 140]);
  });

  it("BOOST + NONE: NONE stays NONE", () => {
    const rows = build(
      [{ menuItemId: 2, quantity: 1, basePrice: 60 }, { menuItemId: 3, quantity: 1, basePrice: 140 }],
      [boostRow("2", 60, 9), noneRow("3", 140)]
    );
    assert.deepEqual(shape(rows[0]!), [1001, "PERCENTAGE", "Boost Offer Applied", 9, 60, 51]);
    assert.deepEqual(shape(rows[1]!), [1002, "NONE", null, 0, 140, 140]);
  });

  it("BOGO + NONE: NONE stays NONE, BOGO keeps free-unit discount", () => {
    const rows = build(
      [{ menuItemId: 1, quantity: 2, basePrice: 90 }, { menuItemId: 3, quantity: 1, basePrice: 140 }],
      [bogoRow("1", 180, 90), noneRow("3", 140)]
    );
    assert.deepEqual(shape(rows[0]!), [1001, "BOGO", "Buy One Get One", 0, 180, 180]);
    assert.deepEqual(shape(rows[1]!), [1002, "NONE", null, 0, 140, 140]);
  });

  it("BOGO + BOOST: neither contaminates the other", () => {
    const rows = build(
      [{ menuItemId: 1, quantity: 2, basePrice: 90 }, { menuItemId: 2, quantity: 1, basePrice: 60 }],
      [bogoRow("1", 180, 90), boostRow("2", 60, 9)]
    );
    assert.deepEqual(shape(rows[0]!), [1001, "BOGO", "Buy One Get One", 0, 180, 180]);
    assert.deepEqual(shape(rows[1]!), [1002, "PERCENTAGE", "Boost Offer Applied", 9, 60, 51]);
  });

  it("multiple BOGO + multiple BOOST + NONE: each row independent", () => {
    const rows = build(
      [
        { menuItemId: 1, quantity: 2, basePrice: 90 },
        { menuItemId: 2, quantity: 1, basePrice: 60 },
        { menuItemId: 3, quantity: 1, basePrice: 140 },
        { menuItemId: 4, quantity: 2, basePrice: 100 },
        { menuItemId: 6, quantity: 1, basePrice: 200 },
      ],
      [
        bogoRow("1", 180, 90),
        boostRow("2", 60, 9),
        noneRow("3", 140),
        bogoRow("4", 200, 100),
        boostRow("6", 200, 30, 15),
      ]
    );
    assert.deepEqual(shape(rows[0]!), [1001, "BOGO", "Buy One Get One", 0, 180, 180]);
    assert.deepEqual(shape(rows[1]!), [1002, "PERCENTAGE", "Boost Offer Applied", 9, 60, 51]);
    assert.deepEqual(shape(rows[2]!), [1003, "NONE", null, 0, 140, 140]);
    assert.deepEqual(shape(rows[3]!), [1004, "BOGO", "Buy One Get One", 0, 200, 200]);
    assert.deepEqual(shape(rows[4]!), [1005, "PERCENTAGE", "Boost Offer Applied", 30, 200, 170]);
  });
});

describe("v2 settlement — Boost on CTM, platform funding", () => {
  it("TEST 3 — company-funded platform ₹20 does not reduce merchant CTM", () => {
    const b = buildSettlementBreakdownFromCtmRows(
      [{ gross: 100, disc: 40, offerType: "BOOST", net: 60, calculationVersion: 2 }],
      {
        discounts: [
          {
            amount: 20,
            offerSource: "PLATFORM",
            meta: {
              platformOfferId: 9,
              fundingMode: "PLATFORM_ONLY",
              platformContribution: 20,
              merchantContribution: 0,
            },
          },
        ],
      },
      15
    );
    assert.equal(b.calculationVersion, 2);
    assert.equal(b.itemTotal, 60);
    assert.equal(b.platformMerchantShare, 0);
    assert.equal(b.companyFundedDiscount, 20);
    assert.equal(b.merchantGross, 60);
  });

  it("TEST 4 — 40/60 split of ₹20 reduces merchant settlement by ₹8 only", () => {
    const b = buildSettlementBreakdownFromCtmRows(
      [{ gross: 100, disc: 40, offerType: "BOOST", net: 60, calculationVersion: 2 }],
      {
        discounts: [
          {
            amount: 20,
            offerSource: "PLATFORM",
            meta: {
              platformOfferId: 9,
              fundingMode: "CO_FUNDED",
              platformContribution: 12,
              merchantContribution: 8,
            },
          },
        ],
      },
      15
    );
    assert.equal(b.platformMerchantShare, 8);
    assert.equal(b.companyFundedDiscount, 12);
    assert.equal(b.merchantGross, 52);
  });

  it("platformFundingFromBilling prefers apply-time contribution fields", () => {
    const f = platformFundingFromBilling({
      discounts: [
        {
          amount: 20,
          meta: {
            platformOfferId: 1,
            platformShare: 20,
            merchantShare: 0,
            platformContribution: 12,
            merchantContribution: 8,
          },
        },
      ],
    });
    assert.equal(f.merchantShare, 8);
    assert.equal(f.companyShare, 12);
    assert.equal(f.total, 20);
  });

  it("TEST 5 — Plus delivery waiver does not change v2 item CTM", () => {
    const b = buildSettlementBreakdownFromCtmRows(
      [{ gross: 100, disc: 40, offerType: "BOOST", net: 60, calculationVersion: 2 }],
      {
        discounts: [
          {
            amount: 40,
            offerSource: "PLATFORM",
            meta: { source: "customer_subscription_free_delivery" },
          },
        ],
        delivery_fee: 0,
      },
      15
    );
    assert.equal(b.merchantGross, 60);
    assert.equal(b.platformMerchantShare, 0);
    assert.equal(b.companyFundedDiscount, 0);
  });

  it("TEST 12 — refunds debit merchant share only; company share is absorbed", () => {
    const adj = merchantRefundFromPlatformFunding({ merchantShare: 8, companyShare: 12 });
    assert.equal(adj.merchantDebit, 8);
    assert.equal(adj.companyAbsorbed, 12);
    const companyOnly = merchantRefundFromPlatformFunding({ merchantShare: 0, companyShare: 20 });
    assert.equal(companyOnly.merchantDebit, 0);
    assert.equal(companyOnly.companyAbsorbed, 20);
  });

  it("v1 snapshots still reverse-scale catalog by the commission factor", () => {
    const b = buildSettlementBreakdownFromCtmRows(
      [{ gross: 118, disc: 0, offerType: "NONE" }],
      {},
      15
    );
    assert.equal(b.calculationVersion, 1);
    assert.equal(b.itemTotal, Math.round(118 * 0.85));
    assert.equal(b.merchantGross, b.itemTotal);
  });

  it("TEST 2 snapshot — ₹149 / 40% / 15%: type PERCENTAGE, discount ₹59.60, gross ≠ net", () => {
    const priced = resolveItemPricing({
      baseCtmUnit: 149,
      quantity: 1,
      commissionPercent: 15,
      offers: [
        {
          id: 1,
          offerId: "o1",
          title: "Flat 40% OFF",
          offerType: "PERCENTAGE",
          offerSubType: "SPECIFIC_ITEM",
          discountValue: null,
          discountPercentage: 40,
          maxDiscountAmount: null,
          minOrderAmount: null,
          maxOrderAmount: null,
          buyQuantity: null,
          getQuantity: null,
          couponCode: null,
          autoApply: true,
          isStackable: false,
          perOrderLimit: 1,
          firstOrderOnly: false,
          newUserOnly: false,
          maxUsesTotal: null,
          maxUsesPerUser: null,
          currentUses: 0,
          applicableOnDays: null,
          applicableTimeStart: null,
          applicableTimeEnd: null,
          maxDiscountPerOrder: null,
          metadata: { conditions_mode: "boost", menu_item_ids: ["10"] },
          displayPriority: 10,
          priority: 10,
          createdSourcePlatform: "MERCHANT_APP",
          createdByRole: "MERCHANT",
          approvalStatus: "AUTO_APPROVED",
        },
      ],
      menuItemId: 10,
    });
    const { rows } = prepareCtmRows(
      [ctmLine({ canonicalPricing: priced, customerCatalogLine: priced.customerItemPriceLine })],
      15,
      null
    );
    const r = rows[0]!;
    assert.equal(r.offerType, "PERCENTAGE");
    assert.equal(r.offerName, "Flat 40% OFF");
    assert.equal(r.disc, 59.6);
    assert.equal(r.gross, 149);
    assert.equal(r.net, 89.4);
    assert.notEqual(r.gross, r.net);
    assert.equal(priced.customerItemPriceUnit, 105.18);
    assert.equal(priced.commissionAmount, 15.78);
  });

  it("GM10000275 — billing canonical_pricing is CTM SSOT even when frozen item has no snapshot and disc=0", () => {
    const priced = resolveItemPricing({
      baseCtmUnit: 149,
      quantity: 1,
      commissionPercent: 15,
      offers: [
        {
          id: 20,
          offerId: "o20",
          title: "Flat 40% Off",
          offerType: "PERCENTAGE",
          offerSubType: "SPECIFIC_ITEM",
          discountValue: 40,
          discountPercentage: 40,
          maxDiscountAmount: null,
          minOrderAmount: null,
          maxOrderAmount: null,
          buyQuantity: null,
          getQuantity: null,
          couponCode: null,
          autoApply: true,
          isStackable: false,
          perOrderLimit: 1,
          firstOrderOnly: false,
          newUserOnly: false,
          maxUsesTotal: null,
          maxUsesPerUser: null,
          currentUses: 0,
          applicableOnDays: null,
          applicableTimeStart: null,
          applicableTimeEnd: null,
          maxDiscountPerOrder: null,
          metadata: { conditions_mode: "boost", menu_item_ids: ["10"] },
          displayPriority: 10,
          priority: 10,
          createdSourcePlatform: "MERCHANT_APP",
          createdByRole: "MERCHANT",
          approvalStatus: "AUTO_APPROVED",
        },
      ],
      menuItemId: 10,
    });
    const snap = serializeCanonicalPricing(priced);
    const frozen = buildCtmLineInputsFromFrozenItems([
      {
        orderItemId: 465,
        menuItemId: 10,
        quantity: 1,
        catalogLineTotal: 175,
        offerDiscountAmount: 0,
        appliedOfferType: "PERCENTAGE",
        appliedOfferLabel: "Flat 40% Off",
        appliedOfferId: 20,
        isItemPromo: true,
        itemSnapshot: {},
      },
    ]);
    assert.equal(frozen[0]!.canonicalPricing, null);
    const { rows } = prepareCtmRows(frozen, 15, {
      order_line_pricing: [
        {
          menuItemId: "10",
          catalogLineTotal: 175,
          offerDiscountAmount: 0,
          appliedOfferId: 20,
          appliedOfferLabel: "Flat 40% Off",
          appliedOfferType: "PERCENTAGE",
          appliedOfferDiscountPct: 40,
          boostAlreadyInPrice: true,
          ineligibilityReason: "ITEM_PROMO",
          canonical_pricing: snap,
        },
      ],
      discounts: [],
    });
    const r = rows[0]!;
    assert.equal(r.calculationVersion, 2);
    assert.equal(r.offerType, "PERCENTAGE");
    assert.equal(r.offerName, "Flat 40% Off");
    assert.equal(r.disc, 59.6);
    assert.equal(r.gross, 149);
    assert.equal(r.net, 89.4);
    assert.notEqual(r.gross, r.net);
    const b = buildSettlementBreakdownFromCtmRows(rows, { discounts: [] }, 15);
    assert.equal(b.calculationVersion, 2);
    assert.equal(b.merchantGross, Math.round(89.4));
  });

  it("no-offer canonical_pricing still writes MX CTM, not customer catalog", () => {
    const priced = resolveItemPricing({
      baseCtmUnit: 149,
      quantity: 1,
      commissionPercent: 15,
      offers: [],
      menuItemId: 10,
    });
    const { rows } = prepareCtmRows(
      [
        ctmLine({
          customerCatalogLine: 175.29,
          customerOfferDiscount: 0,
          canonicalPricing: null,
        }),
      ],
      15,
      {
        order_line_pricing: [
          {
            menuItemId: "10",
            catalogLineTotal: 175.29,
            offerDiscountAmount: 0,
            appliedOfferType: "",
            canonical_pricing: serializeCanonicalPricing(priced),
          },
        ],
      }
    );
    const r = rows[0]!;
    assert.equal(r.calculationVersion, 2);
    assert.equal(r.offerType, "NONE");
    assert.equal(r.gross, 149);
    assert.equal(r.net, 149);
    assert.equal(r.disc, 0);
  });
});
