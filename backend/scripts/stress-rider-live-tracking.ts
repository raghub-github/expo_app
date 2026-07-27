/**
 * Lightweight production stress harness for rider location publish + assignment races.
 * Run from backend/: `npx tsx scripts/stress-rider-live-tracking.ts`
 *
 * Does NOT hit production by default — requires STRESS_BASE_URL + tokens.
 */
import { setTimeout as delay } from "node:timers/promises";

const BASE = (process.env.STRESS_BASE_URL ?? "").replace(/\/+$/, "");
const RIDER_TOKEN = process.env.STRESS_RIDER_TOKEN ?? "";
const CONCURRENCY = Number(process.env.STRESS_CONCURRENCY ?? 50);
const ROUNDS = Number(process.env.STRESS_ROUNDS ?? 20);

async function pingOnce(i: number): Promise<{ ok: boolean; ms: number }> {
  const t0 = Date.now();
  const lat = 28.61 + (i % 100) * 0.0001;
  const lng = 77.20 + (i % 100) * 0.0001;
  try {
    const res = await fetch(`${BASE}/v1/rider/location/ping`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${RIDER_TOKEN}`,
      },
      body: JSON.stringify({
        tsMs: Date.now(),
        lat,
        lng,
        accuracyM: 12,
        speedMps: 5,
        headingDeg: (i * 17) % 360,
        provider: "stress",
        deviceId: `stress-device-${i % 8}`,
      }),
    });
    return { ok: res.ok, ms: Date.now() - t0 };
  } catch {
    return { ok: false, ms: Date.now() - t0 };
  }
}

async function main() {
  if (!BASE || !RIDER_TOKEN) {
    console.log(
      "Set STRESS_BASE_URL and STRESS_RIDER_TOKEN to run. Example:\n" +
        "  STRESS_BASE_URL=http://localhost:3000 STRESS_RIDER_TOKEN=... npx tsx scripts/stress-rider-live-tracking.ts"
    );
    process.exit(0);
  }

  let ok = 0;
  let fail = 0;
  let totalMs = 0;

  for (let r = 0; r < ROUNDS; r++) {
    const batch = Array.from({ length: CONCURRENCY }, (_, i) => pingOnce(r * CONCURRENCY + i));
    const results = await Promise.all(batch);
    for (const res of results) {
      if (res.ok) ok += 1;
      else fail += 1;
      totalMs += res.ms;
    }
    console.log(
      `round ${r + 1}/${ROUNDS} ok=${ok} fail=${fail} avgMs=${Math.round(totalMs / (ok + fail))}`
    );
    await delay(200);
  }

  console.log(`done ok=${ok} fail=${fail} avgMs=${Math.round(totalMs / Math.max(1, ok + fail))}`);
  if (fail > ok * 0.05) process.exit(1);
}

void main();
