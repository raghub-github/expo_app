/**
 * Pure, bounded normalizers for the ranking engine. Every function returns a value in [0,1]
 * (except `applyCap`), is defensive against NaN/Infinity/negatives, and is unit-tested. No signal
 * is allowed to produce unbounded influence — that is what keeps one signal from dominating.
 */

export function clamp01(x: number): number {
  if (!Number.isFinite(x)) return 0;
  if (x < 0) return 0;
  if (x > 1) return 1;
  return x;
}

/** Cap a non-negative additive amount at `cap` (used for boosts/penalties). */
export function applyCap(amount: number, cap: number): number {
  const a = Number.isFinite(amount) && amount > 0 ? amount : 0;
  const c = Number.isFinite(cap) && cap > 0 ? cap : 0;
  return Math.min(a, c);
}

/**
 * Distance score: 1 at 0 km, linearly down to 0 at `refKm`, floored at 0 beyond.
 * Bounded and stable near zero — deliberately NOT 1/distance (§7).
 */
export function distanceScore(roadKm: number, refKm: number): number {
  const d = Number.isFinite(roadKm) && roadKm > 0 ? roadKm : 0;
  const ref = Number.isFinite(refKm) && refKm > 0 ? refKm : 1;
  return clamp01(1 - d / ref);
}

/**
 * Bayesian (confidence-adjusted) rating in [0,1]. Few reviews are pulled toward the global mean C,
 * so 5.0 (8 reviews) does not beat 4.7 (2500 reviews) purely on the raw average (§10).
 * (v*R + m*C) / (v+m), then /5.
 */
export function bayesianRating(avg: number, count: number, priorMean: number, minVotes: number): number {
  const R = Number.isFinite(avg) && avg > 0 ? Math.min(avg, 5) : 0;
  const v = Number.isFinite(count) && count > 0 ? count : 0;
  const C = Number.isFinite(priorMean) && priorMean > 0 ? Math.min(priorMean, 5) : 0;
  const m = Number.isFinite(minVotes) && minVotes > 0 ? minVotes : 0;
  if (v + m <= 0) return 0;
  return clamp01((v * R + m * C) / (v + m) / 5);
}

/**
 * Reliability of a promise (ETA or KPT): rewards actual ≈ promised, penalizes over-promising.
 * ratio = promised / actual, clamped to [0,1]. Delivering on time or faster ⇒ ~1; a store that
 * promises 25 but takes 45 ⇒ 0.55 (§8/§9). Unknown inputs ⇒ neutral (0.5), never a free 1.
 */
export function promiseReliability(promisedMin: number | null, actualMin: number | null): number {
  if (promisedMin == null || actualMin == null) return 0.5;
  const p = Number.isFinite(promisedMin) && promisedMin > 0 ? promisedMin : 0;
  const a = Number.isFinite(actualMin) && actualMin > 0 ? actualMin : 0;
  if (p <= 0 || a <= 0) return 0.5;
  return clamp01(p / a);
}

/**
 * Velocity score from a recent (already-decayed) order count. log-scaled so a huge store doesn't
 * run away, and mapped to [0,1] against `refOrders`. Below `minSample` ⇒ neutral 0.5 (avoids
 * punishing genuinely new/low-traffic stores as if they were bad — exploration handles them).
 */
export function velocityScore(recentOrders: number, refOrders: number, minSample: number): number {
  const n = Number.isFinite(recentOrders) && recentOrders > 0 ? recentOrders : 0;
  if (n < (Number.isFinite(minSample) ? minSample : 0)) return 0.5;
  const ref = Number.isFinite(refOrders) && refOrders > 1 ? refOrders : 2;
  return clamp01(Math.log10(n + 1) / Math.log10(ref + 1));
}

/**
 * Penalty magnitude in [0, cap] from a windowed rate. Below `minSample` observations the rate is
 * unreliable, so no penalty is applied (neutral) — avoids nuking a tiny-sample store on one bad
 * event (§11/§26). `rate` is 0..1; it reaches full `cap` at `rateRef`.
 */
export function ratePenalty(
  rate: number,
  sampleCount: number,
  rateRef: number,
  cap: number,
  minSample: number
): number {
  const s = Number.isFinite(sampleCount) ? sampleCount : 0;
  if (s < (Number.isFinite(minSample) ? minSample : 0)) return 0;
  const r = Number.isFinite(rate) && rate > 0 ? rate : 0;
  const ref = Number.isFinite(rateRef) && rateRef > 0 ? rateRef : 1;
  return applyCap((r / ref) * cap, cap);
}
