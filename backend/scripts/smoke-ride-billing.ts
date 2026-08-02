/**
 * Live DB smoke test for ride settlement policy + cancel rule loaders.
 */
import { loadEnv } from "../src/config/loadEnv.js";
import { getEnv } from "../src/config/env.js";
import postgres from "postgres";
import { computeRideSettlement } from "../src/modules/rides/settlement/rideSettlement.math.js";
import { computeWaitingCharge } from "../src/modules/rides/pricing/rideWaitingCharge.js";
import { computeNightCharge } from "../src/modules/rides/pricing/rideNightCharge.js";
import { computeCancellationCompensation } from "../src/modules/rides/cancellation/cancelCompensation.math.js";

loadEnv();
getEnv();

async function main() {
  // Dynamic import after env load so db client picks up DATABASE_URL
  const { loadRideWalletPolicy, clearRideWalletPolicyCache } = await import(
    "../src/modules/rides/settlement/rideSettlement.repository.js"
  );
  clearRideWalletPolicyCache();
  const policy = await loadRideWalletPolicy();
  console.log("policy from DB:", policy);
  if (policy.commissionOnToll !== false) throw new Error("expected commissionOnToll=false");
  if (policy.cashSettlementEnabled !== true) throw new Error("expected cashSettlementEnabled=true");

  const online = computeRideSettlement({
    customerBill: 550,
    customerPaid: 550,
    paymentMode: "online",
    platformPercentage: 20,
    riderPercentage: 80,
    commissionOnToll: policy.commissionOnToll,
    components: {
      baseFare: 30,
      distanceFare: 350,
      platformFee: 20,
      convenienceFee: 5,
      taxTotal: 20,
      waitingCharge: 20,
      tollCharge: 50,
      tipAmount: 10,
    },
  });
  console.log("online settlement:", {
    riderEarnings: online.riderEarnings,
    companyReceivable: online.companyReceivable,
    walletCredit: online.walletCredit,
    tollPassthrough: online.components.tollCharge,
  });
  if (online.walletCredit !== online.riderEarnings) throw new Error("online credit mismatch");
  // Toll must not inflate company receivable when commissionOnToll=false
  const withoutToll = computeRideSettlement({
    customerBill: 500,
    customerPaid: 500,
    paymentMode: "online",
    platformPercentage: 20,
    riderPercentage: 80,
    commissionOnToll: false,
    components: {
      baseFare: 30,
      distanceFare: 350,
      platformFee: 20,
      convenienceFee: 5,
      taxTotal: 20,
      waitingCharge: 20,
      tipAmount: 10,
    },
  });
  if (online.companyReceivable !== withoutToll.companyReceivable) {
    throw new Error("toll incorrectly changed company receivable");
  }
  if (online.riderEarnings !== withoutToll.riderEarnings + 50) {
    throw new Error("toll not fully passed to rider");
  }

  const cash = computeRideSettlement({
    customerBill: 550,
    customerPaid: 550,
    paymentMode: "cash",
    platformPercentage: 20,
    riderPercentage: 80,
    commissionOnToll: false,
    components: {
      baseFare: 30,
      distanceFare: 350,
      platformFee: 20,
      convenienceFee: 5,
      taxTotal: 20,
      tollCharge: 50,
    },
  });
  if (cash.walletDebit !== cash.companyReceivable) throw new Error("cash debit != receivable");
  if (cash.walletDebit >= 550) throw new Error("cash incorrectly debited full bill");
  console.log("cash settlement:", {
    walletDebit: cash.walletDebit,
    riderEarnings: cash.riderEarnings,
  });

  const wait = computeWaitingCharge(600, {
    freeMinutes: 2,
    chargePerMin: 2,
    maxCharge: 15,
    fundingMode: "SHARED",
    customerSharePct: 50,
    companySharePct: 50,
  });
  console.log("waiting:", wait);
  if (wait.capped !== 15) throw new Error("waiting max not applied");

  const night = computeNightCharge({
    at: new Date("2026-01-01T23:00:00"),
    tripKm: 10,
    baseAmount: 200,
    config: {
      startTime: "22:00",
      endTime: "06:00",
      calcType: "FIXED",
      valueNumeric: 25,
      fundingMode: "CUSTOMER_100",
    },
  });
  if (night.total !== 25) throw new Error("night charge failed");
  console.log("night:", night);

  const cancel = computeCancellationCompensation({
    pickupKm: 5,
    waitingMinutes: 4,
    rule: {
      calcType: "FIXED",
      valueNumeric: 30,
      waitingCompensationPerMin: 2,
      payerMode: "SHARED",
      customerSharePct: 50,
      companySharePct: 50,
    },
  });
  console.log("cancel compensation:", cancel);
  if (cancel.totalCompensation !== 38) throw new Error("cancel math failed");

  // Confirm cancel rules + tax configs readable from DB
  const { getSql } = await import("../src/db/client.js");
  const sql = getSql();
  const rules = await sql`
    SELECT service_type, is_active, calc_type FROM service_cancellation_compensation_rules
    WHERE metadata->>'source' = 'cancel_comp_seed_v1'
    ORDER BY service_type
  `;
  console.log("cancel rules in DB:", rules);

  const taxes = await sql`
    SELECT t.name, t.rate::text, t.applicable_base::text, r.is_active
    FROM billing_tax_configs t
    JOIN billing_pricing_rules r ON r.tax_config_id = t.id
    WHERE r.metadata->>'source' = 'ride_component_tax_seed_v1'
  `;
  console.log("component tax seeds:", taxes);

  await sql.end({ timeout: 5 });
  console.log("\nLive implementation smoke tests passed.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
