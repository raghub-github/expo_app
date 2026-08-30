/**
 * Waiting reconciliation (Step 8 / §41–42). Money conservation for the waiting component:
 * whatever the rider is paid for waiting must be exactly funded by the split across
 * customer + company + merchant — no rupee created or lost, in any funding mode, at any
 * scale. Property-style grid over the full input space.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { computeWaitingCharge, type ComponentFundingMode } from "./rideWaitingCharge.ts";

const SEC = (m: number) => m * 60;
const modes: ComponentFundingMode[] = ["CUSTOMER_100", "COMPANY_100", "MERCHANT_100", "SHARED"];

test("rider waiting = customer + company + merchant funding, always (money conservation)", () => {
  for (const waitMin of [0, 1, 5, 20, 45, 120, 600]) {
    for (const freeMin of [0, 2, 10]) {
      for (const rate of [0, 1, 2, 5, 50]) {
        for (const maxMin of [null, 15, 30]) {
          for (const maxCharge of [null, 60, 100, 1000]) {
            for (const mode of modes) {
              const r = computeWaitingCharge(SEC(waitMin), {
                freeMinutes: freeMin,
                chargePerMin: rate,
                maxMinutes: maxMin,
                maxCharge,
                fundingMode: mode,
                customerSharePct: 60,
                companySharePct: 40,
              });
              const funded = Math.round((r.customerShare + r.companyShare + r.merchantShare) * 100) / 100;
              const label = `${waitMin}m free${freeMin} ₹${rate}/m maxMin${maxMin} maxAmt${maxCharge} ${mode}`;

              // 1. Funders sum to exactly what the rider is paid (the capped amount).
              assert.equal(funded, r.capped, `conservation: ${label}`);
              // 2. No negative components.
              assert.ok(r.customerShare >= 0 && r.companyShare >= 0 && r.merchantShare >= 0, `non-neg: ${label}`);
              // 3. Bounded by BOTH caps → can never explode (the ₹1000 invariant).
              assert.ok(r.capped <= r.gross + 0.001, `capped ≤ gross: ${label}`);
              if (maxCharge != null) assert.ok(r.capped <= maxCharge + 0.001, `≤ amount cap: ${label}`);
              if (maxMin != null) assert.ok(r.chargeableMinutes <= maxMin, `≤ minutes cap: ${label}`);
              // 4. Funding mode routes to the right funder.
              if (mode === "CUSTOMER_100") assert.equal(r.companyShare + r.merchantShare, 0, `cust-only: ${label}`);
              if (mode === "COMPANY_100") assert.equal(r.customerShare + r.merchantShare, 0, `co-only: ${label}`);
              if (mode === "MERCHANT_100") assert.equal(r.customerShare + r.companyShare, 0, `merch-only: ${label}`);
              if (mode === "SHARED") assert.equal(r.merchantShare, 0, `shared cust/co only: ${label}`);
            }
          }
        }
      }
    }
  }
});

test("with any non-null cap pair, waiting can never reach ₹1000 (the reported bug is impossible)", () => {
  for (const rate of [1, 2, 5, 20, 100]) {
    for (const maxMin of [15, 30, 45]) {
      for (const maxCharge of [50, 100, 150]) {
        const r = computeWaitingCharge(SEC(100_000), {
          freeMinutes: 0, chargePerMin: rate, maxMinutes: maxMin, maxCharge, fundingMode: "COMPANY_100",
        });
        assert.ok(r.capped <= maxCharge, `capped ${r.capped} ≤ ${maxCharge}`);
        assert.ok(r.capped < 1000);
      }
    }
  }
});
