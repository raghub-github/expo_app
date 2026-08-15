# REFERRAL_REWARDS_FINAL_AUDIT.md

**Document type:** final implementation audit after code fixes.  
**Date:** 15 August 2026.  
**Companion PRD:** `backend/docs/REFERRAL_REWARDS_ENGINE.md`  
**Prior analysis-only audit (superseded for status):** `docs/REFERRAL_ENGINE_AUDIT.md`

Status labels:

| Label | Meaning |
| ----- | ------- |
| `IMPLEMENTED & VERIFIED` | Present in code and covered by passing unit tests, or a deterministic static path was inspected |
| `IMPLEMENTED BUT NOT VERIFIED` | Present in code; no live DB / device E2E in this session |
| `PARTIALLY IMPLEMENTED` | Path exists but a required piece is still missing |
| `NOT IMPLEMENTED` | No working path |
| `INTENTIONALLY DEFERRED` | Explicitly out of scope, with reason |

---

## 1. Executive Summary

The unified Referral & Rewards Engine in `backend/src/modules/referral/` now matches the intended product behavior for Customer, Rider, and Merchant (parent-level) referrals.

This pass **implemented** the previous P0/P1 gaps: Rider App apply-after-login, two-sided per-party job state, campaign budget lock, Fastify Super Admin auth, `expires_at` on apply, merchant seed rule + merchant notification template, merchant store wallet targeting, `first_order_only` / `block_returned`, atomic order counters, campaign attach, blocked-user eligibility, canonical code lookup including merchant parents, and Super Admin budget visibility.

**Overall production-readiness:** `IMPLEMENTED BUT NOT VERIFIED` for live Postgres concurrency and store-install E2E. Core logic is `IMPLEMENTED & VERIFIED` at unit level (service-toggle + engine/lifecycle/onboarding/reward-summary tests).

Do **not** treat the older `docs/REFERRAL_ENGINE_AUDIT.md` as current status.

---

## 2. What was fixed

- Rider pending referral: `RiderPendingReferralResume` + `POST /v1/referral/apply` after session hydrate
- Two-sided rewards: removed “any job exists → skip rule”; per-party `job_key`; relationship not fully credited until all required parties succeed
- Campaign budget: combined payout cap at credit time under advisory lock; Super Admin consumed/remaining/exhausted
- Fastify `/v1/referral/admin/*`, `/rules`, `/analytics`, `/campaigns`: Super Admin or internal secret only
- Apply stamps `expires_at` and `campaign_id`
- Merchant seed rule `MERCHANT_STORE_APPROVED` (migration 0540) + `REFERRAL_REWARD_MERCHANT`
- Merchant credit uses triggering/selected store wallet, not blindly the first child unless no store id
- Merchant notifications use merchant template
- `first_order_only` ON/OFF, `block_returned`, advanced loop/velocity/IP wired into apply
- Atomic `completed_orders` increment with counted-order guard
- Blocked/banned users rejected on apply and credit
- Lookup falls back to customer / rider / merchant_parent profile codes
- Deep-link packages from settings (audience-specific defaults only)
- Super Admin rider/merchant rule modal widened (`max-w-4xl`) with wrapping grids so helper text does not overlap toggles

---

## 3. What was already working

- Unified tables and Super Admin Dashboard config (Next `requireSuperAdminApi`)
- Customer apply bootstrap (`PendingReferralResume`)
- Merchant apply bootstrap (`MerchantReferralAttribution`)
- Customer first-delivered GatiCash path
- Rider milestone evaluation on delivery / KYC
- Merchant STORE_APPROVED / order aggregation evaluators
- Idempotent job keys and reward transaction keys
- Independent customer / rider / merchant service toggles
- Play Install Referrer helpers in all three apps
- Postgres job poller with `FOR UPDATE SKIP LOCKED`

---

## 4. Database / migrations reviewed

| Migration | Required | Notes |
|-----------|----------|-------|
| 0470–0475, 0536a, 0536–0538 | Already in repo | Do not edit if deployed |
| **0540** | New, I/O-safe | Seed merchant rule + merchant notify template only |

No full-table backfill. Unique `(user_type, referred_user_id)` and unique `job_key` / `idempotency_key` remain the duplicate guards. Indexes on queue status/`next_attempt_at` used by the poller.

**Status:** `IMPLEMENTED BUT NOT VERIFIED` (0540 not applied against a live DB in this session).

---

## 5. Security review

- Fastify admin routes: `IMPLEMENTED & VERIFIED` (unit: only `super_admin` / `system` pass `isReferralSuperAdminRole`)
- Manual credit: same preHandler
- Reward amounts: server/DB only
- Blocked users: `IMPLEMENTED & VERIFIED` (unit status helpers) / `IMPLEMENTED BUT NOT VERIFIED` (live SQL)
- Internal secret still grants admin (dashboard proxy pattern) — expected

---

## 6. Performance / I/O review

- Queue: `SKIP LOCKED`, limited batch
- Evaluators: one relationship per referred user
- Budget check: `SUM` of credited transactions under lock (not a new consumed column)
- 0540: two INSERTs, no rewrite
- Merchant lookup on `merchant_parents.referral_code` is wrapped in `.catch` if the column is absent

**Status:** `IMPLEMENTED BUT NOT VERIFIED` (no load test).

---

## 7. Customer flow verification

Share `/ref/{CODE}` → landing → Play / app → pending → login → `POST /apply` → first delivered order → jobs → GatiCash both sides when configured.

**Status:** `IMPLEMENTED BUT NOT VERIFIED` (apply bootstrap was already present; engine changes inspected in code).

---

## 8. Rider flow verification

Share `/rider-ref/{CODE}` → pending storage → Play Install Referrer → login → `RiderPendingReferralResume` → `POST /apply` → KYC + order milestones → independent party jobs → rider wallet.

**Status:** `IMPLEMENTED BUT NOT VERIFIED` (no device/Play Store E2E in this session). Unit apply-idempotency depends on backend unique constraint (already in schema).

---

## 9. Merchant flow verification

Share `/merchant-ref/{CODE}` → `MerchantReferralAttribution` → apply → `STORE_APPROVED` (seed rule) / Super Admin events → merchant wallet on resolved store.

**Status:** `IMPLEMENTED BUT NOT VERIFIED`.

---

## 10. Parent merchant flow verification

Codes and relationships use `merchant_parents.id`. Child stores aggregate per `merchant_qualification_scope`. One referred parent qualifies once.

**Status:** `IMPLEMENTED BUT NOT VERIFIED`.

---

## 11. Two-sided reward verification

**Status:** `IMPLEMENTED & VERIFIED` (unit: referrer-only success does not equal both credited; retrying stays pending; both credited only when both parties credited). Live wallet split credit: `IMPLEMENTED BUT NOT VERIFIED`.

---

## 12. Campaign / budget verification

Budget = combined credited payout. ₹5,000 / ₹4,900 / ₹200 overshoot: `IMPLEMENTED & VERIFIED` (unit). Advisory lock + SQL: `IMPLEMENTED BUT NOT VERIFIED`. Super Admin UI fields: `IMPLEMENTED BUT NOT VERIFIED` (code present).

---

## 13. Expiry verification

Stamp on apply, evaluators skip, reconciliation expires. Boundary: `IMPLEMENTED & VERIFIED` (unit). Changing config does not rewrite old rows (documented).

---

## 14. Fraud verification

Self / phone / device / attribution / loop / velocity / returned / cancelled / refunded: `IMPLEMENTED BUT NOT VERIFIED`.  
Emulator / root: `INTENTIONALLY DEFERRED` (no app signals).

---

## 15. Wallet / ledger verification

Customer GatiCash, rider `referral_bonus` ledger, merchant `merchant_wallet_credit` with store wallet. Idempotent keys unchanged.

**Status:** `IMPLEMENTED BUT NOT VERIFIED`.

---

## 16. Idempotency verification

Apply unique, job_key unique, transaction idempotency_key unique, counted_order_ids guard.

**Status:** `IMPLEMENTED & VERIFIED` (constraints + unit state machine). Live double-event: `IMPLEMENTED BUT NOT VERIFIED`.

---

## 17. Concurrency verification

Atomic counter SQL, apply advisory lock for referrer cap, budget advisory lock.

**Status:** `IMPLEMENTED BUT NOT VERIFIED` (no parallel DB test harness in this session).

---

## 18. Deep-link verification

Packages from settings per audience. `IMPLEMENTED & VERIFIED` (unit). Install/open on device: `IMPLEMENTED BUT NOT VERIFIED`.

---

## 19. Test results

Command:

```
node --import tsx/esm --test src/modules/referral/referral.lifecycle.test.ts src/modules/referral/referral.engine.test.ts src/modules/referral/referral.reward-summary.test.ts src/modules/referral/referral.onboarding.test.ts
```

Result: **34 passed, 0 failed** (2026-08-15).

`npm test` in backend on Windows failed to expand `src/**/*.test.ts` (Node glob). That is an environment limitation, not a test failure.

No Customer/Rider/Merchant device E2E suite was executed.

---

## 20. Remaining limitations

- Emulator/root flags unused until apps send signals — `INTENTIONALLY DEFERRED`
- BullMQ worker not required; poller is processor — `INTENTIONALLY DEFERRED`
- Existing relationships without `expires_at` stay non-expiring until reconciliation/backfill — `PARTIALLY IMPLEMENTED` for legacy rows
- 0540 not applied to production in this session — `IMPLEMENTED BUT NOT VERIFIED`
- Live concurrent credit / Play Store install E2E — `NOT IMPLEMENTED` as automated tests

---

## 21. Final production-readiness status

| Area | Status |
|------|--------|
| Engine code vs PRD | `IMPLEMENTED & VERIFIED` (static + unit) |
| Super Admin UI modal layout | `IMPLEMENTED BUT NOT VERIFIED` (visual QA in browser still recommended) |
| Rider apply bootstrap | `IMPLEMENTED BUT NOT VERIFIED` |
| Two-sided completion semantics | `IMPLEMENTED & VERIFIED` |
| Campaign budget | `IMPLEMENTED & VERIFIED` (math) / `IMPLEMENTED BUT NOT VERIFIED` (DB lock) |
| Admin auth | `IMPLEMENTED & VERIFIED` (role helper) / `IMPLEMENTED BUT NOT VERIFIED` (HTTP) |
| Merchant seed + notify | `IMPLEMENTED BUT NOT VERIFIED` (needs 0540 applied) |
| Store install E2E | `NOT IMPLEMENTED` |

**Ship recommendation:** apply migration 0540, then smoke-test apply + two-sided credit + budget cap on staging before production.

Production-ready for staging validation: **yes, with 0540 applied**. Production-ready without staging smoke: **no**.

---

## 22. Merchant referral attribution across onboarding channels (15 Aug 2026, follow-up)

Parent-scoped merchant referral can now be supplied on every merchant **parent** create path. No new referral table. No second engine.

| Onboarding path | Referral code UI | Apply target | Status |
|-----------------|------------------|--------------|--------|
| Partner Site `/auth/register` | Optional field + Apply | Parent PK via apply-onboarding | `IMPLEMENTED BUT NOT VERIFIED` (HTTP) |
| Partner Site `/auth/register-parent`, `/auth/register-business` | Same shared field | Parent PK | `IMPLEMENTED BUT NOT VERIFIED` |
| Partner Site `/merchant-ref/{CODE}` | Cookie + redirect to register | Pending → parent create / apply-pending | `IMPLEMENTED BUT NOT VERIFIED` |
| Partner Site `/auth/register-store` (child) | No new relationship | Parent only (pending apply after login) | `IMPLEMENTED` (by design) |
| AM Dashboard register parent | Optional field + Apply | Parent PK | `IMPLEMENTED BUT NOT VERIFIED` |
| AM Dashboard add child store | Optional field; attributed to parent | Parent PK; unique relationship | `IMPLEMENTED BUT NOT VERIFIED` |
| Merchant App share / apply | Share URL = partner.gatimitra.com | Existing `/v1/referral/apply` | `IMPLEMENTED BUT NOT VERIFIED` |
| `GET /v1/referral/preview` | Public validate + invitee copy | — | `IMPLEMENTED & VERIFIED` (message unit tests) |
| `POST /v1/referral/internal/apply-onboarding` | Internal secret | `applyReferral` merchant parent | `IMPLEMENTED BUT NOT VERIFIED` (HTTP) |

Priority: explicit form code > deep-link > stored pending. Existing relationship is not overwritten.

**Migration:** none. Existing `referral_codes` + unique `(user_type, referred_user_id)` are sufficient.

**Tests added:** `referral.onboarding.test.ts` (error copy, priority, merchant share base). Combined with engine/lifecycle/reward-summary.

**Reward privacy:** preview and Partner/AM UI never send `referrerRewardLabel`.

---

## 23. Global Referral Service Toggles (15 Aug 2026)

The three Super Admin flags (`customer_referral_enabled`, `rider_referral_enabled`, `merchant_referral_enabled`) now gate **new** apply + **new** code generation. Backend is authoritative.

| Requirement | Status |
|-------------|--------|
| Independent per-audience OFF | `IMPLEMENTED & VERIFIED` (unit: `referral.service-toggle.test.ts`) |
| Apply rejected with HTTP 409 `REFERRAL_SERVICE_DISABLED` | `IMPLEMENTED & VERIFIED` (payload + status unit) |
| User copy: "This referral code is no longer available." | `IMPLEMENTED & VERIFIED` (onboarding message unit + apps map the code) |
| Old saved / pending / deep-link code cannot bypass OFF | `IMPLEMENTED` (apply checks live toggle; merchant 409 no longer treated as alreadyApplied) |
| Direct API / old app / Partner / AM | `IMPLEMENTED` (same apply + apply-onboarding + preview) |
| No relationship / job / credit on rejected apply | `IMPLEMENTED` (toggle check before insert) |
| Existing relationships not deleted | `IMPLEMENTED` (alreadyApplied short-circuit before OFF reject) |
| Existing rewards / jobs not reversed by OFF | `IMPLEMENTED & VERIFIED` (unit: `referralRewardsEnabled` ignores tracking toggle; credit service uses reward flags only) |
| New code generation disabled while OFF | `IMPLEMENTED` (`getOrCreateReferralCode`, `/me` shareUrl null, customer profile-complete mint gated) |
| Frontend hide/disable | `IMPLEMENTED` (Customer / Rider / Merchant apps, Partner Site, AM Dashboard) |
| AM helper "Merchant referrals are currently unavailable." | `IMPLEMENTED` |
| Partner deep link while OFF does not persist/apply | `IMPLEMENTED` (`/merchant-ref/{code}` skips cookie when config OFF) |
| Re-enable restores unused eligible codes | `IMPLEMENTED` (toggle is non-destructive) |
| Migration | **none** — columns already on `referral_settings` |

**Tests:** `referral.service-toggle.test.ts` plus onboarding error mapping. Device E2E of each app toggle remains `IMPLEMENTED BUT NOT VERIFIED`.

**Frontend stale cache:** apps refresh config on launch / referral screen / apply. A stale ON cannot create a relationship because apply re-reads settings server-side.

