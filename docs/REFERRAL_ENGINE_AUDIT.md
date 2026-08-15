# GatiMitra Referral & Rewards Engine — Implementation Audit

**Document type:** implementation audit (not a PRD).  
**Audit date:** 15 August 2026.  
**Scope:** Customer, Rider, and Merchant referral as implemented in this repository and its referral migrations.  
**Companion (design/overview, not this audit):** `backend/docs/REFERRAL_REWARDS_ENGINE.md`.

Status labels used throughout:

| Label | Meaning |
| ----- | ------- |
| `IMPLEMENTED` | Present in code and/or schema and wired into a live path. |
| `PARTIALLY IMPLEMENTED` | Schema, API, or UI exists, but a required path is missing, unused, or incomplete. |
| `NOT IMPLEMENTED` | Requested or implied by names/enums, but no working path was found. |
| `CONFIGURED BUT NOT VERIFIED` | Seeded or Super Admin–editable; this audit did not SELECT live production values. |

Live Super Admin amounts, toggles, and rule rows were **not** queried from a production database for this document. Seed defaults come from migrations. An operator may have changed them.

No referral business logic was changed while writing this audit.

---

## 1. Executive Summary

The system currently runs a **unified referral engine** in `backend/src/modules/referral/`. Customer App, Rider App, and Merchant App all call the same Fastify module (`/v1/referral`) and the same tables (`referral_settings`, `referral_codes`, `referral_relationships`, `referral_reward_rules`, `referral_reward_jobs`, `referral_reward_transactions`). Super Admin edits the singleton `referral_settings` row (`id = 1`) and `referral_reward_rules` through Dashboard APIs; apps are not supposed to compute rewards.

**Apps that participate**

| App | Package / identity | Referral UI | Apply path |
| --- | ------------------- | ----------- | ---------- |
| Customer App | JWT `role=customer`, `customers.id` | `IMPLEMENTED` (fail-closed on `referralEnabled`) | `IMPLEMENTED` (`PendingReferralResume` in `_layout.tsx`) |
| Rider App | JWT `sub` = `usr_{riders.id}` | `IMPLEMENTED` (fail-closed) | `PARTIALLY IMPLEMENTED` (capture helpers exist; no login bootstrap posts `/apply`) |
| Merchant App | JWT `parent_merchant_id` → `merchant_parents.id` | `IMPLEMENTED` (fail-closed) | `IMPLEMENTED` (`MerchantReferralAttribution`) |
| Super Admin Dashboard | `requireSuperAdminApi` | `IMPLEMENTED` | N/A (config / rules / retry) |

**Referral types currently modeled**

- Customer → Customer (`user_type = 'customer'`).
- Rider → Rider (`user_type = 'rider'`).
- Merchant → Merchant at **parent merchant** level (`user_type = 'merchant'`, `user_id` = `merchant_parents.id`). Child stores are **not** referrers.

**How backend/database control the system**

- Master + per-service toggles live on `referral_settings`.
- Reward amounts, milestones, `also_credit_referred`, KYC flags, and event types live on `referral_reward_rules`.
- Qualification and credit run in backend evaluators + a Postgres job queue polled every 30s (`backend/src/index.ts`).
- Apps fetch `GET /v1/referral/config?userType=` and hide UI unless `referralEnabled === true`.

**Do Customer, Rider, and Merchant use the same engine?**  
Yes for tracking, codes, apply, rules, jobs, ledger rows, and Super Admin. Wallet credit **strategies** differ: Customer → `customer_wallet_credit` (GatiCash `BONUS` / lot `REFERRAL`); Rider → `wallet_ledger` `referral_bonus`; Merchant → `merchant_wallet_credit` on the **first child store** of the parent.

**Current implementation status (overall): `PARTIALLY IMPLEMENTED`.**

Working core: unified tables, Super Admin config, customer apply + first delivered order → GatiCash, rider milestone evaluation on delivery/KYC, merchant apply + store-approved + delivered-order aggregation, two-sided jobs when a rule has `also_credit_referred`, idempotent job keys and reward transaction keys, three independent service toggles with backend `apply`/`share` 403.

Not complete: Rider App never calls `/apply` after capturing a pending code; no seeded merchant rule; relationship `expires_at` is never stamped on apply; `referral_validity_days` / `campaign_budget` / `first_order_only` / `block_returned` / `block_duplicate_reward` / advanced fraud are stored or typed but not enforced on the live path; Fastify `/v1/referral/admin/*` is authenticated but not Super-Admin role-gated; two-sided credits are **separate jobs**, not one atomic wallet transaction; merchant notifications use the rider template; BullMQ `q.referral.reward` is enqueued but no dedicated worker consumes it (Postgres poller is the real processor).

---

## 2. Architecture Overview

### 2.1 Runtime topology (actual)

```text
Customer App  ─┐
Rider App     ─┼──► Fastify  /v1/referral/*  ──► PostgreSQL (referral_* + wallets)
Merchant App  ─┘         │
                         ├── customer_wallet_credit / wallet_ledger / merchant_wallet_credit
                         ├── notifications eventBus  referral.reward_credited
                         ├── referral_funnel_daily + Super Admin analytics
                         └── Dashboard /api/super-admin/referral (direct SQL, not Fastify)

Public HTML landings (no auth):
  GET /ref/:code  GET /invite/:code  GET /rider-ref/:code  GET /merchant-ref/:code
  nginx: infra/nginx/nginx.conf  (proxy_pass backend)
```

Mount: `backend/src/index.ts` registers `referralRoutes` at `/v1/referral` and `referralPublicLandingRoutes` at `""`.

### 2.2 Module map

| Layer | Path |
| ----- | ---- |
| Public + authed HTTP | `backend/src/modules/referral/referral.routes.ts` |
| Admin Fastify (weak role check) | `backend/src/modules/referral/referral.admin.routes.ts` |
| Config cache | `backend/src/modules/referral/referral.config.service.ts` (`CACHE_TTL_MS = 5000`) |
| Toggles / prefixes | `backend/src/modules/referral/referral.participants.ts` |
| Codes | `backend/src/modules/referral/referral.codes.ts` |
| Apply / profile | `backend/src/modules/referral/referral.tracking.service.ts` |
| Qualification | `backend/src/modules/referral/referral.engine.ts` |
| Rule match | `backend/src/modules/referral/referral.rule-engine.ts` |
| Jobs | `backend/src/modules/referral/referral.queue.ts` |
| Wallet credit | `backend/src/modules/referral/referral.reward.service.ts` |
| Base fraud | `backend/src/modules/referral/referral.fraud.ts` |
| Advanced fraud (unused) | `backend/src/modules/referral/referral.fraud.advanced.ts` |
| Lifecycle enum | `backend/src/modules/referral/referral.lifecycle.ts` |
| Lifecycle persist + funnel | `backend/src/modules/referral/referral.lifecycle.service.ts` |
| Landing HTML | `backend/src/modules/referral/referral.deep-link.ts` |
| Share copy | `backend/src/modules/referral/referral.reward-summary.ts` |
| Super Admin SQL | `dashboard/src/lib/db/operations/referral-engine.ts` |
| Super Admin UI | `dashboard/src/components/super-admin/ReferralEngineAdminClient.tsx` |
| Super Admin page | `dashboard/src/app/dashboard/super-admin/referral-rewards/page.tsx` |

### 2.3 Lifecycle the code actually runs

```text
Referral code (referral_codes + profile column for customer/rider)
        ↓
Share URL  {publicBase}{/ref|/rider-ref|/merchant-ref}/{CODE}
        ↓
Landing GET → referral_install_clicks (click_token, 30-day expires_at)
        ↓
App stores pending code (customer + merchant wired; rider capture-only)
        ↓
POST /v1/referral/apply → referral_relationships (UNIQUE user_type + referred_user_id)
        ↓
Qualification event (delivery / KYC / store approved / merchant apply signup)
        ↓
evaluateRules() against referral_reward_rules
        ↓
enqueueRewardJobs() → referral_reward_jobs.job_key UNIQUE
        ↓
processReferralRewardJobs() every 30s (FOR UPDATE SKIP LOCKED)
        ↓
creditReferralReward() → wallet function + referral_reward_transactions.idempotency_key UNIQUE
        ↓
emitEvent("referral.reward_credited") → notification templates
        ↓
recordLifecycleEvent → referral_lifecycle_events + referral_funnel_daily
```

Delivery hook: `backend/src/lib/credit-rider-order-on-delivered.ts` `runReferralEvalAfterDelivery`.  
Rider KYC hook: `backend/src/lib/rider-onboarding-activation.ts`.  
Merchant store approval: `dashboard/src/lib/db/operations/merchant-stores.ts` → `triggerMerchantReferralOnStoreApproved`.

Workers: in-process `setInterval` 30s (queue) and 6h (reconcile). BullMQ topic `q.referral.reward` (`packages/queue/src/topics.ts`) is **best-effort enqueue only**; no worker file consumes it.

---

## 3. Supported Referral Types

| Referral Type | Referrer | Referred | Two-sided? | Qualification | Reward | Status |
| ------------- | -------- | -------- | ---------- | ------------- | ------ | ------ |
| Customer → Customer | `customers.id` | `customers.id` | Yes when rule `also_credit_referred` | First delivered order meeting `min_order_amount` + eligible services + delivered/not cancelled/not refunded | GatiCash via `customer_wallet_credit` | `IMPLEMENTED` |
| Rider → Rider | `riders.id` | `riders.id` | Seeded rules are **referrer-only**; two-sided only if admin sets `also_credit_referred` | KYC (`riders.kyc_status = APPROVED`) when required + delivered-order count | `wallet_ledger` `referral_bonus` | `PARTIALLY IMPLEMENTED` (engine yes; Rider App apply path missing) |
| Merchant → Merchant | `merchant_parents.id` | `merchant_parents.id` | Only if admin creates a rule with `also_credit_referred` | Depends on Super Admin rule `event_type`; production hooks: apply (`SIGNUP` / `REGISTRATION_COMPLETED`), store approved, parent-scoped delivered orders | `merchant_wallet_credit` on **first** child `merchant_stores.id` | `PARTIALLY IMPLEMENTED` (no seed rule; MENU_COMPLETED / ACTIVE_DAYS have no production hook) |

### 3.1 Customer → Customer

Seeded rule `CUSTOMER_FIRST_ORDER` (migration `0470`): `milestone_orders = 1`, `reward_amount = 50`, `also_credit_referred = true`, `referred_reward_amount = 50`, `reward_type = GATICASH`.  
Trigger: `evaluateCustomerReferralOnOrderDelivered` with `eventType = FIRST_ORDER_DELIVERED`.  
Min amount: `referral_settings.min_order_amount` (DB default `249`; code fallback `249` if null).

### 3.2 Rider → Rider

Seeded rules (`0470`), **referrer-only** (`also_credit_referred = false`):

| rule_code | milestone_orders | reward_amount | require_kyc (seed) |
| --------- | ---------------- | ------------- | ------------------ |
| `RIDER_M20` | 20 | 300 | true |
| `RIDER_M50` | 50 | 500 | true |
| `RIDER_M100` | 100 | 1000 | true |

These are **seed defaults**, not guaranteed live values (`CONFIGURED BUT NOT VERIFIED`).  
Triggers: `evaluateRiderReferralOnOrderDelivered` (`ORDER_DELIVERED_COUNT`) and `evaluateRiderReferralOnKycApproved` (`KYC_APPROVED` then re-check count).

### 3.3 Merchant → Merchant

No merchant row is inserted in `0470`/`0536`. Super Admin must create a rule.  
Identity: `referral_codes.user_id` = `merchant_parents.id` (not `merchant_stores.id`).  
Qualification scope column: `referral_settings.merchant_qualification_scope` ∈ `ALL_CHILD_STORES` \| `SINGLE_STORE` \| `SELECTED_STORES` (migration `0537`).

---

## 4. Customer Referral — Complete Flow

1. **How Customer gets a referral code** — `GET /v1/referral/me` → `getOrCreateReferralCode('customer', customers.id)`. Prefers `customers.referral_code`. If tracking is ON and none exists, generates `code_prefix_customer` default `GM` + Crockford body (`referral.codes.ts`). Syncs into `referral_codes`. If tracking is OFF, returns existing code only (no new allocation).

2. **How the referral link is generated** — `getMyReferralProfile` builds `{publicBase}{deep_link.customer_path_prefix}/{CODE}` (default `/ref`). `POST /v1/referral/share` returns the same plus `buildPersonalizedShareMessage`. Share is blocked with `403 referral_disabled` when tracking is off.

3. **How deep link works** — Public `GET /ref/:code` and `GET /invite/:code` (`referralPublicLandingRoutes`). Records `referral_install_clicks` (click_token unique, `expires_at` default now+30 days), writes lifecycle `LINK_CLICKED` then `PLAY_STORE_OPENED`, returns HTML with Play referrer `ref_{CODE}` (`referral.deep-link.ts`). Nginx proxies `/ref/` and `/invite/`.

4. **How a new Customer enters** — Customer App `PendingReferralResume` (`apps/customer_app/app/_layout.tsx`): Play Install Referrer and/or pending deep-link code. After login, if `getConfig().referralEnabled === true`, calls `referralService.apply`.

5. **How attribution is created** — `POST /v1/referral/apply` → `applyReferral`. Looks up code in `referral_codes`, then `customers.referral_code`, then `riders.referral_code`. Customer codes never match rider/merchant (`code_user_type_mismatch`).

6. **How the referrer is stored** — `referral_relationships.referrer_id` = referrer `customers.id`. Also writes `customers.referred_by` / `referrer_customer_id` and `customer_referrals` (`ON CONFLICT (referred_customer_id) DO NOTHING`) for legacy.

7. **Whether attribution is permanent** — One relationship per `(user_type, referred_user_id)` (`UNIQUE`). Re-apply returns `alreadyApplied: true` with the existing row. No admin “reassign referrer” API was found.

8. **Duplicate attribution** — Unique constraint + pre-select. Second apply is a no-op success.

9. **Self-referral** — DB `CHECK (referrer_id <> referred_user_id)` plus fraud `block_self_referral` (default true). Same hashed phone blocked when `block_same_phone`. `POST /validate` also rejects self.

10. **Qualifying event** — Order reaches delivered and `credit-rider-order-on-delivered.ts` calls `evaluateCustomerReferralOnOrderDelivered`. Relationship must be `pending` / `attributed` / `first_order_pending` / `cap_reached`. If `auto_apply_enabled` and `auto_applied` is false, evaluation returns without reward.

11. **Minimum / qualifying order** — `isOrderQualifyingForReferral`: status `DELIVERED` if `require_delivered_status`; not cancelled; no `customer_wallet_transactions` `REFUND` for that order if `block_refunded`; `order_type` in `eligible_services` (food also matches grocery listing); `grand_total`/`fare_amount` ≥ `min_order_amount`. **`block_returned` is not read.**

12. **Reward calculation** — Matched `CUSTOMER_FIRST_ORDER` (or whatever admin configured) amounts from DB. Engine always sends `completedOrders: 1` and `FIRST_ORDER_DELIVERED`. **`first_order_only` is exposed on public config but not read by the evaluator.**

13. **Referrer reward** — Job `ref_job_{rel}_rule_{id}_referrer` → idempotency `ref_cust_{rel}_rule_{id}_referrer` → GatiCash.

14. **Referred Customer reward** — Only if `also_credit_referred`; amount `referred_reward_amount ?? reward_amount`. Seeded both-sides ₹50.

15. **Wallet/ledger** — `customer_wallet_credit(..., 'BONUS', relationshipId, 'referral', ..., lot 'REFERRAL')`. Monthly cap on **referrer** via `referral_monthly_usage`. Cap skip status `skipped_cap` / relationship `cap_reached`.

16. **Notification** — `emitEvent("referral.reward_credited")` with `role: "customer"` and `userId` = `customers.customer_id` (string id, not PK). Template `REFERRAL_REWARD_CUSTOMER`. Copy from `notification_templates.customer_referrer` / `customer_reward`.

17. **Analytics** — Lifecycle + `referral_funnel_daily` increments on recorded states. Super Admin totals include `customer_referrals`.

18. **Expiry** — Column `expires_at` exists. **Apply INSERT does not set it.** Reconcile expires rows only if `expires_at IS NOT NULL`. Click tokens expire in 30 days. **`referral_expiry_enabled` / `referral_validity_days` are not applied on create.** `PARTIALLY IMPLEMENTED`.

19. **Limits/caps** — `max_successful_referrals` counted at apply (all non-blocked statuses). `monthly_reward_cap` at credit (referrer). `campaign_budget` **not enforced**.

20. **If referral is disabled** — `referralTrackingEnabled`: master `enabled` AND `customer_referral_enabled`. Apply/share 403 `referral_disabled`. Evaluator returns immediately. UI hidden (`referralEnabled !== true`). Landings still serve HTML. `/me` still returns an existing code.

21. **Backend APIs** — `GET /v1/referral/config?userType=customer`, `/milestones`, `/me`, `/history`, `POST /share`, `/apply`, `/validate`. Dashboard `GET/PATCH /api/super-admin/referral`.

22. **DB tables/columns** — `customers.referral_code`, `referred_by`, `referrer_customer_id`; `customer_referrals`; `referral_codes`; `referral_relationships` (`user_type=customer`); `referral_reward_*`; `referral_install_clicks`; `referral_monthly_usage`; customer wallet tables via `customer_wallet_credit`.

---

## 5. Rider Referral — Complete Flow

### 5.1 Code and link — `IMPLEMENTED`

- Profile: `riders.referral_code` (trigger from migration `0041_auto_generate_rider_referral_code`, format `RIDER` + 6 chars).
- Unified: `getOrCreateReferralCode` prefers published `riders.referral_code` and will restore `regenerated_from` if the unified row looks engine-generated (`referral.codes.ts`).
- Share URL: `{publicBase}{rider_path_prefix}/{CODE}` default `/rider-ref/{CODE}`.
- Landing: `GET /rider-ref/:code` (nginx `/rider-ref/`).
- Play package: migration `0475` corrects DB `play_store_rider_package` from `com.gatimitra.rider` to `com.raghubhunia.gatimitrariderapp` when still the bad default. Code fallback in `DEFAULT_DEEP_LINK` is still `com.gatimitra.rider` if JSON key missing.

### 5.2 Attribution — `PARTIALLY IMPLEMENTED`

Backend `applyReferral` for `userType=rider` is complete (unique relationship, legacy `riders.referred_by` + `referrals` insert).

Rider App:

- `apps/gatimitra-riderApp/src/lib/playInstallReferrer.ts` can store a pending code.
- `applyCapturedInstallReferrer` exists.
- **No layout/bootstrap imports those helpers.** Repo-wide search found no Rider call to `POST /v1/referral/apply` after login.

Deep-link landing still records clicks. Without `/apply`, **no `referral_relationships` row is created from the Rider App.** Manual apply is possible only if some other client posts `/apply`.

### 5.3 KYC — `IMPLEMENTED` (engine)

- `evaluateRiderReferralOnKycApproved` from `rider-onboarding-activation.ts`.
- Sets `referral_relationships.kyc_approved = true`.
- Queues `KYC_APPROVED` rules, then re-evaluates `ORDER_DELIVERED_COUNT`.
- `evaluateRules`: `require_kyc ?? settings.require_kyc` blocks rider/merchant match until `kycApproved`.
- On delivery, engine also reads `riders.kyc_status`.

Seeded rider rules set `require_kyc = true` on insert (all three M20/M50/M100 rows).

### 5.4 Order milestones — `IMPLEMENTED` (engine)

`evaluateRiderReferralOnOrderDelivered`:

- Increments `completed_orders` unless `orders_core.id` already in `metadata.counted_order_ids` (last 500 ids).
- Sets status `milestone_pending` unless already `reward_credited`.
- Does **not** call `isOrderQualifyingForReferral` (no min amount / service filter on rider orders).
- Event `ORDER_DELIVERED_COUNT`.
- If `auto_apply_enabled` and not `auto_applied`, returns without counting.

`reward_mode` `incremental` (default) vs `highest_only`: `highest_only` only collapses matches when **every** matched count-rule uses `highest_only`.

### 5.5 Two-sided rewards

Seeded `also_credit_referred = false` → **referrer only**. Referred rider wallet credit requires Super Admin to enable `also_credit_referred` and set `referred_reward_amount`.

### 5.6 Wallet / notification / expiry / limits

- Wallet: `wallet_ledger` `entry_type='referral_bonus'`, `ref` = idempotency key, `ref_type='referral'`. Unique index `wallet_ledger_rider_rider_earn_ref_uidx` on `(rider_id, ref)` (migration `0311`) — `ON CONFLICT DO NOTHING` then fallback select.
- Rider monthly cap applies to **both** parties (unlike customer referrer-only cap).
- Notification: `role: "rider"`, `userId: String(rider numeric id)` — not `usr_{id}`. Template always `REFERRAL_REWARD_RIDER` in `eventBus.ts`.
- Expiry / `max_successful_referrals`: same as customer (expiry stamp missing).
- Duplicate / self: same unique + CHECK + fraud.

### 5.7 Retry / idempotency — `IMPLEMENTED` (jobs)

`job_key = ref_job_{rel}_rule_{id}_{party}`; reward key `ref_rider_{rel}_rule_{id}_{party}`; poller `attempts < max_attempts` (default 8), exponential backoff capped 1h.

### 5.8 Super Admin configuration

Toggles `rider_referral_enabled`, `rider_reward_enabled`, `require_kyc`, rider rules CRUD, `reward_mode`. Legacy rider UI still exists at `/dashboard/riders/referrals` (`RiderReferralsClient`) reading older rider referral APIs — parallel to the unified engine.

---

## 6. Merchant Referral — Complete Flow

### 6.1 Code and link — `IMPLEMENTED`

- Codes live only in `referral_codes` (`user_type='merchant'`, `user_id=merchant_parents.id`). There is **no** `merchant_parents.referral_code` column in the lookup path.
- Prefix default `MX` (`code_prefix_merchant`).
- Migration `0538` insert-only backfill: `MX` + 8 hex of md5(`gatimitra-merchant-ref-v1-{id}`), collision pass v2. Does not rewrite `merchant_parents` / `merchant_stores`.
- Share: `/merchant-ref/{CODE}`. Landing `GET /merchant-ref/:code`. Package default `com.gatimitra.partner`.
- `/me` allocates a code when merchant tracking is ON (`getOrCreateReferralCode`).

### 6.2 Attribution — `IMPLEMENTED` (backend + Merchant App)

`MerchantReferralAttribution` captures `gatimitra-merchant://` / HTTPS merchant-ref URLs, stores pending, after login checks config, `POST /apply`.  
On successful apply, engine immediately evaluates `REGISTRATION_COMPLETED` and `SIGNUP` (best-effort).

No merchant legacy table sync (unlike `customer_referrals` / `referrals`).

### 6.3 Registration / approval / KYC

- Apply does not require an approved store.
- `kyc_approved` is set when **any** non-deleted `merchant_stores` row for that parent has `approval_status = 'APPROVED'` (engine), or by `triggerMerchantReferralOnStoreApproved` (Dashboard store approval).
- Merchant “KYC” in the engine **is store approval**, not a separate KYC table.

### 6.4 Qualification events that actually fire

| Event | Caller | Status |
| ----- | ------ | ------ |
| `SIGNUP` / `REGISTRATION_COMPLETED` | `applyReferral` after merchant insert | `IMPLEMENTED` |
| `STORE_APPROVED` / `KYC_APPROVED` | Dashboard `triggerMerchantReferralOnStoreApproved` (direct job insert, not `evaluateMerchantReferralOnEvent`) | `IMPLEMENTED` |
| `FIRST_ORDER_DELIVERED` | Delivery hook with `incrementOrder: true` (fires on **every** delivered order for that parent, not only the first) | `IMPLEMENTED` |
| `ORDER_DELIVERED_COUNT` | Same delivery, second call, no extra increment | `IMPLEMENTED` |
| `MENU_COMPLETED` | Enum + Super Admin dropdown + `matchesEvent` | `NOT IMPLEMENTED` (no production caller) |
| `ACTIVE_DAYS` | Same | `NOT IMPLEMENTED` (no production caller; would reuse `completedOrders` if called) |

Store-approved path **bypasses** `evaluateRules` / qualification scope / `auto_applied` checks and enqueues jobs if an active `STORE_APPROVED` or `KYC_APPROVED` rule exists.

### 6.5 Reward / two-sided / wallet

- Amounts from admin-created rules only (no seed).
- Two-sided if `also_credit_referred`.
- Credit: first `merchant_stores.id` for parent (`ORDER BY id ASC`), `get_or_create_merchant_wallet`, `merchant_wallet_credit` category `BONUS`, balance `AVAILABLE`, reference type `SYSTEM`, reference id = relationship id, idempotency = reward key. If no store: `failed` / `no_store_wallet`.
- Monthly cap uses parent PK in `referral_monthly_usage`.
- Notification: `role: "merchant"`, `userId: parent_merchant_id`, but `eventBus` maps non-customer → **`REFERRAL_REWARD_RIDER`**. Merchant-specific templates exist in settings JSON but the notification **template code** is the rider one.

### 6.6 Analytics / expiry / limits / duplicates / self

Same engine tables. Super Admin extra: `merchantParents` list (last 25 merchant relationships + child store count). Expiry stamp still missing. Self-referral CHECK uses numeric `merchant_parents.id`. Duplicate referred parent blocked by unique `(merchant, referred_user_id)`.

---

## 7. Parent Merchant → Child Store Architecture

The system currently treats **parent merchant** as the only referral actor.

```text
Merchant A  (merchant_parents.id = referrer_id)
 ├── Store A1   (not a referrer)
 ├── Store A2
 └── Store A3

Merchant B  (merchant_parents.id = referred_user_id)
 ├── Store B1   (orders may count toward B’s qualification)
 ├── Store B2
 ├── Store B3
 └── Store B4
```

| Question | Actual behavior |
| -------- | ---------------- |
| Who owns the referral? | Parent. `referral_codes.user_id` = `merchant_parents.id`. |
| Child store referral code? | **Not implemented.** |
| How is referred parent identified? | JWT `parent_merchant_id` or numeric id → `merchant_parents.id` (`resolveActor`). |
| Do child stores inherit the relationship? | They do not get their own relationship. Their delivered orders can increment the **parent** relationship. |
| How are orders counted? | Delivery reads `orders_core.merchant_parent_id` + `merchant_store_id`. Dedupes `counted_order_ids`. Stores counts in `metadata.store_order_counts`. |
| Aggregation | See scope below. |
| Rewards once per parent or per store? | **Once per relationship + rule + party** via `job_key`. Not per store. |
| Duplicate child-store rewards | Job uniqueness + counted order ids. Credit always hits **one** store wallet (lowest `merchant_stores.id`), not the store that produced the order. |

### 7.1 Qualification scope (exists in DB + engine)

Values actually in CHECK (`0537`) and `evaluateMerchantReferralOnEvent`:

| Value | Behavior |
| ----- | -------- |
| `ALL_CHILD_STORES` (default) | Any child store’s new delivered order increments `completed_orders` by 1 (sum). |
| `SINGLE_STORE` | `completed_orders` = **max** of per-store counts in `store_order_counts` (one store’s volume, whichever is highest). |
| `SELECTED_STORES` | Only `merchant_store_id` listed in `referral_settings.merchant_qualification_store_ids` increment. Others ignored. |

`SELECTED_STORES` with an empty id list: `storeAllowed` is false for every concrete store id → orders are not counted. Events without `incrementOrder` (signup, second `ORDER_DELIVERED_COUNT` call) still run `evaluateRules` with the current count.

Scope is **global** on `referral_settings`, not per relationship or per referrer.

Store-approved jobs **ignore** this scope.

---

## 8. Two-Sided Reward Engine

```text
Referrer A
    ↓
refers B
    ↓
B qualifies → evaluateRules
    ↓
enqueueRewardJobs
    ├── job referrer  (always if amount > 0)
    └── job referred  (only if also_credit_referred)
```

| Topic | Actual |
| ----- | ------ |
| Atomic both wallets? | **No.** Separate `referral_reward_jobs` rows. Processor credits one party per job. |
| One DB transaction? | **No** across both sides. Each credit is its own SQL (wallet function + `referral_reward_transactions`). |
| One side fails | Other side can still `succeeded`. Relationship `status` is set `reward_credited` when **that job’s** credit succeeds (`creditReferralReward`), so one successful side can mark the whole relationship credited while the other is still queued/failed. |
| Retry | Poller retries `queued`/`retrying`/`failed` until `max_attempts`. Reconcile requeues stale failed jobs. |
| Idempotency | `job_key` UNIQUE; `referral_reward_transactions.idempotency_key` UNIQUE; wallet function keys. |
| Duplicate protection | `queueMatchedRewards` skips enqueue if **any** job for `(relationship, rule)` is queued/processing/retrying/succeeded/skipped — **not per party**. If referrer job exists and referred job was never inserted, a later event will **not** create the referred job. |
| Ledger | Customer GatiCash tx; rider `wallet_ledger`; merchant store wallet ledger via `merchant_wallet_credit`. |
| Processor forces `also_credit_referred: false` on each job | Intentional: each job is single-party (`referral.queue.ts`). |

Admin `POST /v1/referral/admin/manual-credit` enqueues via `enqueueRewardJobs` using the rule’s `also_credit_referred` flag, but the Fastify handler always builds the rule from DB (referred side included only if that flag is true). Dashboard retry is job-level.

---

## 9. Super Admin Configuration

**UI:** `/dashboard/super-admin/referral-rewards` → `ReferralEngineAdminClient`.  
**API:** `GET/PATCH /api/super-admin/referral` (`requireSuperAdminApi`). Rules: `/api/super-admin/referral/rules` and `/rules/[id]`. Jobs: `/api/super-admin/referral/jobs/retry`.

### 9.1 Service toggles (actual)

| Setting | ON | OFF (actual) |
| ------- | -- | ------------ |
| `enabled` (master) | Tracking allowed if per-service flag on | `referralTrackingEnabled` false for all types; apply/share 403; evaluators no-op; rewards also off via `referralRewardsEnabled` |
| `customer_referral_enabled` | Customer UI + apply | Customer UI hidden; customer apply 403; customer evaluator returns |
| `rider_referral_enabled` | Rider UI + apply API | Rider UI hidden; rider apply 403; rider evaluator returns |
| `merchant_referral_enabled` | Merchant UI + apply | Merchant UI hidden; merchant apply 403; merchant evaluator returns |
| `reward_enabled` | Credits allowed if per-type reward flag on | Credit functions insert `skipped_disabled` |
| `customer_reward_enabled` / `rider_reward_enabled` / `merchant_reward_enabled` | Per-wallet credits | Skip credit, keep tracking |

**Landings are not toggle-gated.** Clicks still insert when the code exists.

**Backend apply/share are toggle-gated.** `IMPLEMENTED`.

**UI hide:** fail-closed (`!== true`). `IMPLEMENTED` in the three apps. Config cache 5s + app `staleTime` (customer 30s) can show stale UI briefly. `PARTIALLY` for freshness.

### 9.2 Settings Super Admin can PATCH (schema in `dashboard/.../referral/route.ts`)

Toggles listed above, plus:

- `auto_apply_enabled`
- `require_kyc`
- `first_order_only` (stored; **not used in evaluator**)
- `min_order_amount`
- `monthly_reward_cap`
- `currency`
- `eligible_services`
- `fraud_checks` JSON
- `deep_link` JSON
- `notification_templates` JSON
- `referral_validity_days`, `reward_expiry_days`, `reward_claim_window_days` (columns exist; **`mapSettings` does not copy them into the runtime settings object**)
- `code_prefix_customer` / `code_prefix_rider` / `code_prefix_merchant`
- `reward_mode` `incremental` \| `highest_only`
- `referral_expiry_enabled` (stored; apply does not stamp `expires_at`)
- `max_successful_referrals` (enforced on apply if set)
- `campaign_budget` (**not enforced** at credit)
- `merchant_qualification_scope` / `merchant_qualification_store_ids`
- `reason` (audit)

### 9.3 Per-rule fields (create/update via Dashboard)

`user_type`, `rule_code`, `name`, `description`, `milestone_orders`, `reward_amount`, `reward_type`, `reward_party`, `also_credit_referred`, `referred_reward_amount`, `require_kyc`, `min_order_amount`, `active`, `priority`, `event_type`, `reward_mode`, campaign/window/city fields from `0471`.

Event types in Super Admin dropdown include `MENU_COMPLETED` and `ACTIVE_DAYS` even though no hook fires them.

---

## 10. Frontend Referral Visibility

Public config field: `referralEnabled: referralTrackingEnabled(settings, userType)` (`toPublicReferralConfig`).

Fail-closed pattern in all three apps: hide unless `referralEnabled === true`. Fetch failures default `referralEnabled: false` (rider/merchant services).

| App | Config fetch | Hidden when OFF | Deep links | Backend apply |
| --- | ------------ | --------------- | ---------- | ------------- |
| Customer | `GET /v1/referral/config?userType=customer` (`apps/customer_app/services/referral.service.ts`) | Profile menu + referrals screen + `_layout` skips apply | Landing still opens | 403 `referral_disabled` |
| Rider | `fetchRiderReferralConfig` | `ProfileReferralCard` returns null; profile/view-profile code gated; `ReferralsScreen` unavailable | Landing still opens | 403 if something called apply; **app currently does not apply** |
| Merchant | `fetchMerchantReferralConfig` | Profile “Referral” row; `ReferralsScreen` unavailable; attribution skips apply | Landing still opens | 403 |

Customer referrals screen can still be opened by URL; it shows an unavailable state when config says off.

Stale cache: backend config cache 5s; customer React Query `staleTime: 30_000`. A toggle OFF can remain visible up to that window. `CONFIGURED BUT NOT VERIFIED` for Redis pubsub `publishReferralConfigUpdated` actually pushing into apps (apps poll HTTP, they do not subscribe to Redis).

Apps **do not** credit wallets. They only display `rewardSummary` / `milestones` from the server.

---

## 11. Backend API Inventory

Prefix unless noted: Fastify `/v1/referral`. Auth plugin `auth` required except public rows.

| Method | Endpoint | App | Purpose | Auth | DB impact |
| ------ | -------- | --- | ------- | ---- | --------- |
| GET | `/v1/referral/config` | All | Public live config + milestones | None | Read `referral_settings` + rules (cached 5s) |
| GET | `/v1/referral/settings` | Legacy alias | Same, optional `unchanged` | None | Read |
| GET | `/v1/referral/milestones` | All | Milestones only | None | Read |
| GET | `/v1/referral/me` | All | Code, share URL, history, stats, config | JWT customer/rider/merchant | Read + maybe insert `referral_codes` |
| GET | `/v1/referral/history` | All | History + stats | JWT | Read |
| POST | `/v1/referral/share` | All | Share payload + lifecycle share | JWT | Read; lifecycle event |
| POST | `/v1/referral/apply` | All | Create relationship | JWT | Insert relationship + legacy columns |
| POST | `/v1/referral/validate` | All | Code check | JWT | Read `referral_codes` only (not profile fallback) |
| GET | `/ref/:code` | Customer web | Landing HTML + click | None | Insert `referral_install_clicks` |
| GET | `/invite/:code` | Customer | Same handler | None | Same |
| GET | `/rider-ref/:code` | Rider | Landing | None | Insert click |
| GET | `/merchant-ref/:code` | Merchant | Landing | None | Insert click |
| GET | `/v1/referral/rules` | Internal | List rules | Any JWT (`auth` required; **no super_admin check**) | Read |
| GET | `/v1/referral/campaigns` | Internal | List campaigns | Any JWT | Read |
| GET | `/v1/referral/analytics` | Internal | Funnel/overview | Any JWT | Heavy aggregations |
| POST | `/v1/referral/admin/retry` | Internal | Retry/force/fail/skip job | Any JWT | Update jobs / credit |
| POST | `/v1/referral/admin/manual-credit` | Internal | Enqueue credit | Any JWT | Insert jobs |
| POST | `/v1/referral/admin/regenerate-code` | Internal | Rotate code | Any JWT | Update `referral_codes` |
| POST | `/v1/referral/admin/suspend` | Internal | Suspend code | Any JWT | Update `referral_codes.suspended` |
| POST | `/v1/referral/admin/reconcile` | Internal | Run reconcile | Any JWT | Updates |
| POST | `/v1/referral/admin/process-queue` | Internal | Process 50 jobs | Any JWT | Credits |
| GET | `/api/super-admin/referral` | Dashboard | Settings, rules, analytics, audit | Super Admin | Read |
| PATCH | `/api/super-admin/referral` | Dashboard | Update settings + audit + bump version | Super Admin | Update `referral_settings` |
| POST | `/api/super-admin/referral/rules` | Dashboard | Create rule | Super Admin | Insert rule |
| PATCH/DELETE | `/api/super-admin/referral/rules/[id]` | Dashboard | Update/delete rule | Super Admin | Update/delete |
| POST | `/api/super-admin/referral/jobs/retry` | Dashboard | Retry job | Super Admin | Queue |

**Not found:** public “create referral” besides `/me` code allocation; webhook dedicated to referral; GraphQL.

**Internal/event (not HTTP):** `evaluate*`, `triggerMerchantReferralOnStoreApproved`, `processReferralRewardJobs`, `runReferralReconciliation`, `emitEvent("referral.reward_credited")`, Redis publish on config bump.

`requireAdmin` in `referral.admin.routes.ts` is defined then `void requireAdmin` — **never applied**. Dashboard routes are the properly gated surface.

---

## 12. Database Schema

### 12.1 Core tables

**`referral_settings`** (singleton `id=1`)  
Purpose: global config.  
Important columns: `enabled`, `reward_enabled`, `customer_referral_enabled`, `rider_referral_enabled`, `merchant_referral_enabled`, `customer_reward_enabled`, `rider_reward_enabled`, `merchant_reward_enabled`, `auto_apply_enabled`, `require_kyc`, `first_order_only`, `min_order_amount`, `monthly_reward_cap`, `currency`, `eligible_services`, `fraud_checks`, `deep_link`, `notification_templates`, `config_version`, `referral_validity_days`, `reward_expiry_days`, `reward_claim_window_days`, `code_prefix_*`, `advanced_fraud`, `reward_mode`, `referral_expiry_enabled`, `max_successful_referrals`, `campaign_budget`, `merchant_qualification_scope`, `merchant_qualification_store_ids`, timestamps.

**`referral_reward_rules`**  
Purpose: DB-driven rewards. Unique `rule_code`. CHECK: customer=`GATICASH`; rider/merchant=`WALLET_CREDIT`.  
Columns: `user_type`, `milestone_orders`, `reward_amount`, `reward_type`, `reward_party`, `also_credit_referred`, `referred_reward_amount`, `require_kyc`, `min_order_amount`, `active`, `priority`, `metadata`, `event_type`, `campaign_id`, `starts_at`, `ends_at`, `monthly_cap_override`, `reward_expiry_days`, `city_ids`, `reward_mode`.

**`referral_codes`**  
Purpose: lookup. Unique `referral_code`; unique `(user_type, user_id)`. `active`, `suspended`, `regenerated_from` (`0471`).

**`referral_relationships`**  
Purpose: one referred user per type. Unique `(user_type, referred_user_id)`. CHECK no self.  
Columns: `referrer_id`, `referred_user_id`, `referral_code`, `source`, `install_at`, `app_open_at`, `auto_applied`, `status`, `reward_status`, `completed_orders`, `kyc_approved`, `qualifying_order_id`, `qualifying_order_amount`, `device_fingerprint`, `phone_hash`, `fraud_flags`, `metadata`, `lifecycle_state`, `campaign_id`, `expires_at`, `city_id`, legacy ids, timestamps.  
Status enum: `pending`, `attributed`, `first_order_pending`, `milestone_pending`, `reward_credited`, `cap_reached`, `ineligible`, `fraud_blocked`, `cancelled`.  
Indexes: referrer `(user_type, referrer_id)`, `status`, `referral_code`.

**`referral_reward_jobs`**  
`job_key` UNIQUE. FK relationship, rule, campaign. `status`, `attempts`, `max_attempts`, `next_attempt_at`. Poll index on `(status, next_attempt_at)` partial.

**`referral_reward_transactions`**  
`idempotency_key` UNIQUE. `reward_party`, `reward_amount`, `status` (`pending`, `credited`, `skipped_disabled`, `skipped_cap`, `failed`, `reversed`), wallet ids, `milestone_orders`, `campaign_id`, `referral_code`, `referrer_id`, `referred_user_id`.

**`referral_monthly_usage`**  
Unique `(user_type, user_id, month)`.

**`referral_install_clicks`**  
`click_token` UNIQUE. `expires_at` default 30 days. Index unused consumed.

**`referral_campaigns`**, **`referral_lifecycle_events`**, **`referral_funnel_daily`**, **`referral_configuration_audit`**, **`referral_code_blacklist`**.

### 12.2 Legacy / profile

- `customers.referral_code`, `referred_by`, `referrer_customer_id`
- `customer_referrals`
- `riders.referral_code`, `referred_by`
- `referrals` (legacy rider pairs)
- `referral_offers` (0470 migrates active offers into rules)

### 12.3 Relationship diagram (actual)

```text
Referrer (customers.id | riders.id | merchant_parents.id)
   ↓  referral_codes
Referral relationship (referral_relationships)
   ↓  referred_user_id
Referred entity
   ↓  engine event
Qualification (completed_orders / kyc_approved / qualifying_order_*)
   ↓
referral_reward_jobs
   ↓
referral_reward_transactions
   ↓
customer_wallet_credit | wallet_ledger | merchant_wallet_credit
```

Lifecycle column `lifecycle_state` is a **parallel** state machine to `status`; both exist.

---

## 13. Database Migrations

| File | What it adds/changes | Tables | Indexes/constraints | Applied in this repo’s history |
| ---- | -------------------- | ------ | ------------------- | ------------------------------ |
| `0041_auto_generate_rider_referral_code.sql` | Rider insert trigger `RIDER`+6 | `riders` | Unique codes | Pre-unified |
| `0069_uppercase_referral_codes.sql` | Uppercase existing codes | rider/customer codes | — | Pre-unified |
| `0470_unified_referral_rewards_engine.sql` | Enums, settings, rules, codes, relationships, tx, monthly usage, audit, clicks, seed rules, notification templates | Many `referral_*` | Uniques listed above | Required for engine |
| `0471_referral_engine_hardening.sql` | Lifecycle, campaigns, jobs, blacklist, funnel, rule event types, validity columns, `suspended` on codes | Many | `job_key` unique, funnel PK | Required |
| `0472_referral_codes_resync.sql` | Row-loop upsert of existing customer/rider codes | `referral_codes` | — | **High I/O; may be skipped** |
| `0474_legacy_referral_relationships_backfill.sql` | Backfill from profile `referred_by` | `referral_relationships` | — | **High I/O; may be skipped** |
| `0475_referral_deep_link_packages.sql` | Fix rider Play package in settings JSON | `referral_settings` 1 row | — | Intended |
| `0536a_referral_merchant_enum.sql` | `ALTER TYPE` add `merchant` + merchant event values (**must COMMIT before 0536**) | Catalog | — | Required before 0536 |
| `0536_referral_engine_merchant_and_modes.sql` | Merchant toggles, prefixes, reward_mode, expiry flags, caps, budget, rule reward_mode, type CHECK | settings + rules | CHECKs | Required for merchant |
| `0537_referral_scope_and_rider_code_restore.sql` | `merchant_qualification_scope` + store ids | `referral_settings` | CHECK | Required for scope |
| `0538_merchant_parent_referral_codes.sql` | Insert missing parent codes | `referral_codes` | Insert-only | Optional backfill |
| Rollbacks | Matching `*_rollback.sql` files | — | — | Not run in normal deploy |

**Does the current unified engine require a new migration?**  
Not for the behavior audited here. Remaining gaps are **code wiring** (expiry stamp, rider apply bootstrap, Fastify admin auth, unused events), not missing columns. A new migration would only be needed if product requires enforced expiry defaults, campaign budget tracking, merchant seed rules, or parent-level wallet (none exist today).

`0470` originally created `referral_user_type` as `customer|rider` only; merchant was added in `0536a`.

---

## 14. Database-Driven Configuration Audit

| Value | Source | Hardcoded? | Runtime DB-driven? |
| ----- | ------ | ---------- | ------------------ |
| Customer referrer reward | `referral_reward_rules.reward_amount` (seed 50) | Seed only | Yes, if rule exists |
| Customer referred reward | `referred_reward_amount` (seed 50) | Seed only | Yes |
| Rider M20/M50/M100 amounts | Seed 300/500/1000 | Seed only | Yes after admin edit |
| Merchant threshold / amount | **No seed rule** | N/A | Only after Super Admin creates a rule |
| Minimum order | `referral_settings.min_order_amount` default 249 | **Fallback 249** in `mapSettings` if null (`referral.config.service.ts`) | Yes |
| Eligible services | settings array default food/parcel/grocery | Fallback `["food","parcel","grocery"]` if not an array | Yes |
| Monthly reward cap | settings default 1000 | **Fallback 1000** in `mapSettings` | Yes |
| Referral expiry | `expires_at` on relationship | Click default 30 days in table DDL | **Not stamped on apply** |
| `referral_validity_days` | settings/campaigns columns | Default 365 in DDL | **Not mapped in `mapSettings`** |
| Reward cap (campaign_budget) | settings column | — | **Not enforced** |
| Code prefixes | settings / `codePrefixFor` | Fallbacks `GM` / `RIDER` / `MX` | Yes |
| Deep link paths | `deep_link` JSON | `DEFAULT_DEEP_LINK` merge | Yes |
| Play rider package | JSON | Code default `com.gatimitra.rider`; DB may be `0475` value | Mixed |
| Play merchant package | JSON | Fallback `com.gatimitra.partner` | Yes |
| Cache TTL | `CACHE_TTL_MS = 5_000` | **Hardcoded** | No |
| Queue poll 30s / reconcile 6h | `backend/src/index.ts` | **Hardcoded** | No |
| Job max_attempts 8 | table default | DDL | Yes if altered |
| `also_credit_referred` | rules | Seed customer true, rider false | Yes |
| KYC required | settings + rule override | Seed rider true | Yes |
| Merchant scope | settings default `ALL_CHILD_STORES` | Fallback in `mapSettings` | Yes |
| Advanced fraud defaults | `referral.fraud.advanced.ts` object | **Hardcoded** in that unused module | Column `advanced_fraud` unused by apply |
| Notification copy | settings JSON + `DEFAULT_TEMPLATES` | Merge defaults | Yes |
| Currency | settings default INR | Fallback `"INR"` | Yes |

Frontend: reward amounts come from config/milestones APIs, not hardcoded rupee constants in the referral screens audited. Customer `minOrderAmount` is displayed from config.

---

## 15. Wallet & Ledger Audit

| Party | Wallet | Credit API | Type / category | Reference | Idempotency |
| ----- | ------ | ---------- | --------------- | --------- | ----------- |
| Customer | GatiCash customer wallet | `public.customer_wallet_credit` | `BONUS` + lot `REFERRAL` | `reference_id` = relationship id, type `referral` | Passed as p_idempotency_key `ref_cust_{rel}_rule_{id}_{party}` |
| Rider | `rider_wallet` via trigger on `wallet_ledger` | Direct `INSERT wallet_ledger` | `referral_bonus` | `ref` = idempotency key, `ref_type='referral'` | `(rider_id, ref)` unique index + tx table |
| Merchant | Store wallet of **lowest** `merchant_stores.id` for parent | `merchant_wallet_credit` | `BONUS` / `AVAILABLE` / `SYSTEM` | relationship id | Same key as `ref_merchant_{rel}_rule_{id}_{party}` |

**Balance update:** customer and merchant functions update balances internally; rider insert plus `wallet_ledger_update_wallet_trigger`.

**Transaction boundaries:** not a single encompassing DB transaction for “evaluate + both credits + notify”. Evaluators tolerate errors (`console.warn`). Job processor: mark processing → credit → mark succeeded/failed. `FOR UPDATE SKIP LOCKED` on claim.

**Rollback:** no compensation if notify fails after credit. Failed jobs retry credit; unique keys prevent double wallet credit if the wallet write succeeded first.

**Notification failure** does not roll back wallet (`emitEvent` after credit).

---

## 16. Idempotency & Duplicate Protection

| Threat | Protection | Status |
| ------ | ---------- | ------ |
| Duplicate apply API | Unique `(user_type, referred_user_id)` + pre-select | `IMPLEMENTED` |
| Duplicate orders counted (rider/merchant) | `metadata.counted_order_ids` | `IMPLEMENTED` |
| Duplicate reward jobs | `job_key` UNIQUE `ON CONFLICT DO NOTHING` | `IMPLEMENTED` |
| Duplicate wallet credit | Tx `idempotency_key`; wallet function keys; rider `(rider_id, ref)` | `IMPLEMENTED` |
| Worker retries | Same keys; poller attempts | `IMPLEMENTED` |
| Concurrent qualification | Job unique; relationship row updates not serialized with `SELECT FOR UPDATE` on the relationship itself | `PARTIALLY` (jobs yes; relationship increment is read-modify-write without row lock) |
| App / network retries | Apply conflict; job unique | `IMPLEMENTED` |
| Multiple child stores | One relationship; job once per rule; one store wallet | `IMPLEMENTED` for not double-paying rule; **wrong store** possible |
| Multiple milestone triggers | Separate rule ids (incremental) | `IMPLEMENTED` |
| Referral code reuse by many invitees | Allowed (one code, many referred users) | `IMPLEMENTED` |
| Same referred, two referrers | Unique referred user | `IMPLEMENTED` |
| Click token reuse | `consumed` flag | `IMPLEMENTED` |
| Webhooks | No referral webhook | N/A |
| BullMQ retries | Topic unused by a worker; DB poller is source of truth | `PARTIALLY` |
| `block_duplicate_reward` fraud flag | Present in JSON, **never read** | `NOT IMPLEMENTED` as a check (uniques cover most of it) |

---

## 17. Eligibility & Fraud Protection

| Control | Status | Where |
| ------- | ------ | ----- |
| Self-referral | `IMPLEMENTED` | CHECK + `evaluateReferralFraud` + `/validate` |
| Duplicate referral (same referred) | `IMPLEMENTED` | Unique |
| Multiple referrers | `IMPLEMENTED` (blocked) | Unique referred |
| Expired relationship | `PARTIALLY` | Evaluators honor `expires_at` **if set**; apply never sets it; reconcile only then |
| Invalid code | `IMPLEMENTED` | `invalid_code` |
| Wrong user type code | `IMPLEMENTED` | `code_user_type_mismatch` |
| Inactive/suspended code | `PARTIALLY` | Lookup requires `referral_codes.active`; `suspended` skipped in `findUnifiedReferralCode`; profile `customers`/`riders` lookup **does not check suspended** |
| Inactive account | `NOT IMPLEMENTED` | No status check on customer/rider/merchant at apply |
| Suspended account | `NOT IMPLEMENTED` except code `suspended` |
| Same phone | `IMPLEMENTED` if phones present | SHA-256 digit hash |
| Same device | `PARTIALLY` | Only if client sends `deviceFingerprint`; customer `_layout` apply passes `undefined` |
| Install attribution | `PARTIALLY` | If `auto_apply_enabled` and source not treated as attributed → `fraud_blocked` / `no_install_attribution`. Deep link and play_install_referrer force `installAttributed=true`. Manual still allowed (commented policy not enforced). |
| KYC rider | `IMPLEMENTED` | Rule + settings |
| Min order (customer) | `IMPLEMENTED` | `isOrderQualifyingForReferral` |
| Qualifying services | `IMPLEMENTED` | `eligible_services` |
| Cancelled / refunded order | `IMPLEMENTED` | cancelled + REFUND wallet tx |
| Returned order | `NOT IMPLEMENTED` | `block_returned` unused |
| Merchant approval | `IMPLEMENTED` as store APPROVED for `kycApproved` | |
| Child-store qualification | `IMPLEMENTED` for increment path | |
| Already rewarded | `IMPLEMENTED` | Customer evaluator skips non-pending statuses; job unique |
| Advanced: emulator, root, loops, velocity, VPN | `NOT IMPLEMENTED` on apply | `evaluateAdvancedReferralFraud` never imported |
| Disposable phone prefixes | Unused module hardcoded `140` | `NOT IMPLEMENTED` |

---

## 18. Notifications

Engine: `backend/src/modules/notifications/eventBus.ts` `on("referral.reward_credited")` → `sendNotification`.

| Event | Implemented? |
| ----- | ------------ |
| Referral created / accepted | `NOT IMPLEMENTED` as a user push (lifecycle only) |
| Qualification | `NOT IMPLEMENTED` as a dedicated template |
| Reward credited (customer) | `IMPLEMENTED` `REFERRAL_REWARD_CUSTOMER` |
| Reward credited (rider) | `IMPLEMENTED` `REFERRAL_REWARD_RIDER` |
| Reward credited (merchant) | `PARTIALLY` — emits with `role: merchant` but template code is `REFERRAL_REWARD_RIDER` |
| Milestone achieved | Same as rider credit (template `rider_milestone` copy) |
| Referrer vs referred copy | `IMPLEMENTED` via settings templates before emit |
| Reward failed / disabled / fraud_blocked templates in settings JSON | **Stored**; no `emitEvent` for those keys found |

`0471` JSON also has `reward_failed`, `reward_disabled`, `fraud_blocked` titles — unused by `referral.reward.service.ts`.

Deep link on customer template: `/profile/referrals` (`0470` insert into `notification_templates`).

---

## 19. Analytics

**Super Admin (`getReferralAnalyticsAdmin`) actually returns:**

- `totalReferrals`, `successful`, `pending`, `failed`
- `customerReferrals`, `riderReferrals`, `merchantReferrals`
- `expiredReferrals` (status/lifecycle EXPIRED)
- `rewardDistributed`, `rewardCount`
- `referrerRewardAmount` / `referredRewardAmount` and counts
- `conversionRate` (successful/total)
- 30-day `referral_funnel_daily` sums: links_shared, link_clicks, play_store_opens, installs, first_app_opens, referrals_applied, first_orders, delivered_orders, rewards_granted
- `topReferrers` (mixed types, limit 10)
- `monthlyTrend` (12 months)
- `rewardJobs` (failed/retrying/dead/queued, 30)
- `merchantParents` (25 rows: names, status, completed_orders, child_store_count)

**Fastify `/analytics`:** overview counts, funnel, byUserType, byCampaign, top customers, top riders, job status counts — **no merchant top list**.

Funnel counters increment only when `recordLifecycleEvent` runs (`bumpFunnelCounter`). Not every apply path records every funnel stage. Funnel can be sparse. `CONFIGURED BUT NOT VERIFIED` for production completeness.

**Not implemented as named metrics:** per-child-store reward totals; qualified vs rewarded split beyond status filters; `failed` mixes fraud + cancelled + reward_failed.

---

## 20. Error Handling

| Condition | API | Frontend |
| --------- | --- | -------- |
| Invalid code | 400 `{ ok:false, error:"invalid_code" }` | Apply catch; pending kept (customer/merchant) |
| Type mismatch | 400 `code_user_type_mismatch` | Same |
| Self | 400 `self_referral` | Validate + apply |
| Same phone | 400 `same_phone` | Apply |
| Disabled | 403 `referral_disabled` | UI hidden; apply skipped if config off |
| Referrer limit | 400 `referrer_limit_reached` | Apply |
| Forbidden actor | 403 `forbidden` | Rider `/me` previously 403 if `sub` parsed wrong — **fixed** via `usr_(\d+)` |
| `/me` failure | 500 `referral_profile_failed` | Screens show error/unavailable |
| Config missing migration | 503 `referral_not_migrated` | Apps fail-closed hide UI |
| Duplicate apply | 200 `alreadyApplied: true` | Treated success |
| Insufficient qualification | No API error; evaluator silent return | History stays pending |
| Wallet failure | Job `failed`, `last_error`; tx `failed` | User sees pending until retry |
| DB failure | 500 / tolerated warn in evaluators | — |
| Notification failure | After credit; not returned to apply | User may have money without push |
| Concurrent qualification | Job unique; possible missed increment without row lock | — |
| Invalid configuration | Admin PATCH zod; runtime fallbacks 249/1000 | — |
| Landing bad code | 400/404 HTML text | Browser |
| Validate invalid | `{ ok:false, valid:false }` **HTTP 200** | — |

Fraud blocked apply: relationship may still be inserted with `fraud_blocked`, then `{ ok:false, error }`.

---

## 21. Performance / I/O Audit

| Area | Behavior | Risk |
| ---- | -------- | ---- |
| Config | 5s process cache; Super Admin bump invalidates | Low |
| `/me` history | Per-row subquery `SUM(referral_reward_transactions)` for 100 rows | N+1-style; bounded 100 |
| Apply | Several lookups + inserts | Moderate, one-shot |
| Delivery | Extra `orders_core` select + up to 3 evaluators per delivered order | Adds write/read on every delivery |
| Merchant eval | Parent relationship lookup + optional store APPROVED probe | Per delivery |
| Queue poll | Every 30s, `FOR UPDATE SKIP LOCKED` limit 25 | Acceptable |
| Reconcile | Every 6h | Updates expired + requeue |
| Super Admin analytics | Multiple full-table `COUNT`/`SUM` on `referral_relationships` and transactions | Grows with table size; no date filter on totals |
| `0472`/`0474` | Row loops / backfills | Intentionally avoided for I/O |
| Funnel increment | Extra upsert per lifecycle event | Extra writes on share/click/apply/credit |
| counted_order_ids | JSON array capped 500 | Large metadata updates |
| BullMQ enqueue | Extra Redis write, unused consumer | Wasteful but small |

No Redis cache of `/me` profiles. No materialized analytics table besides `referral_funnel_daily`.

---

## 22. Security Audit

| Topic | Actual |
| ----- | ------ |
| App APIs | JWT required; `resolveActor` binds userType to role (customer/rider/merchant). Cannot apply as another type with the same token. |
| Rider `sub` | `usr_{id}` parsed; numeric and phone fallback. |
| Merchant | `merchant_parents.parent_merchant_id` or id. Child-store tokens are not a separate referral actor. |
| Reward amounts | Server-side rules only. Body of apply has no amount field. |
| Admin Fastify | **Any authenticated JWT** can hit `/v1/referral/admin/*` and `/rules` `/analytics` if the route is reachable. **Gap.** |
| Dashboard Super Admin | `requireSuperAdminApi` on Next routes. **OK.** |
| Manual credit | Fastify admin; amount override allowed — dangerous if Fastify admin is exposed. |
| Code regenerate/suspend | Same weak Fastify gate. |
| Client cannot credit | Confirmed; apps only POST apply/share. |
| Landing | Unauthenticated; records hashed IP. Rate limit nginx `limit_req` burst 40. |
| Validate | Does not consult `customers`/`riders` profile codes — only `referral_codes`. |
| Wallet | Credits use system SQL functions, not client-supplied wallet ids (merchant resolves first store server-side). |

---

## 23. Complete End-to-End Examples

Amounts below are **0470 seed defaults**, not a live DB dump (`CONFIGURED BUT NOT VERIFIED`).

### Customer

```text
Customer A  GET /me → code e.g. GMXXXXXXXX  share https://…/ref/GMXXXXXXXX
        ↓
Customer B opens /ref/GMXXXXXXXX → click_token, Play referrer ref_GMXXXXXXXX
        ↓
B logs into Customer App → PendingReferralResume → POST /apply
        ↓
referral_relationships (customer, referrer=A, referred=B, status=first_order_pending)
        ↓
B’s order DELIVERED, grand_total ≥ min_order_amount (seed 249), service eligible
        ↓
evaluateCustomerReferralOnOrderDelivered → CUSTOMER_FIRST_ORDER
        ↓
Jobs: referrer ₹50 GatiCash, referred ₹50 GatiCash (seed also_credit_referred)
        ↓
customer_wallet_credit both sides (separate jobs) + REFERRAL_REWARD_CUSTOMER
```

If `customer_referral_enabled` is false: B’s app never applies; A’s profile hides Referrals.

### Rider

```text
Rider A  GET /me → riders.referral_code (RIDER…)  /rider-ref/{CODE}
        ↓
Rider B installs (landing records click)
        ↓
GAP: Rider App does not POST /apply after login in current code
        ↓
If apply happened (other client): relationship milestone_pending
        ↓
B KYC APPROVED → kyc_approved=true → KYC_APPROVED rules (none seeded)
        ↓
B deliveries increment completed_orders (deduped by orders_core.id)
        ↓
At 20 / 50 / 100: RIDER_M20 ₹300, M50 ₹500, M100 ₹1000 to A’s wallet_ledger
        ↓
B (referred) is NOT paid unless admin sets also_credit_referred
```

### Merchant

```text
Merchant A (parent)  GET /me → MX…  /merchant-ref/{CODE}
        ↓
Merchant B parent signs up → MerchantReferralAttribution → POST /apply
        ↓
evaluate SIGNUP + REGISTRATION_COMPLETED (no seed rule → usually no job)
        ↓
Dashboard approves a child store of B → triggerMerchantReferralOnStoreApproved
        (jobs only if an active STORE_APPROVED / KYC_APPROVED rule exists)
        ↓
Delivered orders on B’s children → ALL_CHILD_STORES sum (default)
        SINGLE_STORE = max one store; SELECTED_STORES = listed merchant_stores.id
        ↓
Matching ORDER_DELIVERED_COUNT / FIRST_ORDER_DELIVERED rule → jobs
        ↓
merchant_wallet_credit on B or A’s first child store wallet (BONUS)
```

Without a Super Admin merchant rule, tracking can exist with **zero rewards**.

---

## 24. State Machine

Two parallel machines exist.

### 24.1 `referral_relationships.status` (enum)

Typical customer apply: `first_order_pending` → (credit) `reward_credited` or `cap_reached` or `fraud_blocked`.  
Typical rider/merchant apply: `milestone_pending` → `reward_credited`.  
Also: `pending`, `attributed`, `ineligible`, `cancelled` (reconcile uses `cancelled` when expiring).

There is **no** `REWARD_PENDING` status. Jobs carry `queued`/`processing`/….

### 24.2 `lifecycle_state` (`referral.lifecycle.ts`)

```text
LINK_SHARED → LINK_CLICKED → PLAY_STORE_OPENED → APP_INSTALLED → FIRST_APP_OPEN
    → REFERRAL_APPLIED → FIRST_ORDER_PLACED → ORDER_DELIVERED
    → REWARD_ELIGIBLE → REWARD_GRANTED → REWARD_NOTIFIED
```

Failure/terminal also in enum: `REWARD_FAILED`, `FRAUD_BLOCKED`, `EXPIRED`, `SUSPENDED`, `SKIPPED`.

Transitions are enforced unless `force: true`. Production callers mostly use `force: true`, so the graph is **advisory**.

Apply does not always write `REFERRAL_APPLIED` (default column default is `REFERRAL_APPLIED` from `0471`). Share/click use force transitions even without a relationship id.

---

## 25. Missing / Risk / Gap Report

| Area | Status | Finding | Risk | Required Action |
| ---- | ------ | ------- | ---- | --------------- |
| Rider App apply | `PARTIALLY IMPLEMENTED` | Play/pending helpers exist; no bootstrap calls `/apply` | Referred riders never attach; milestones never start | Wire apply after rider login (gap only; not changed in this audit) |
| Merchant seed rule | `NOT IMPLEMENTED` | `0536` explicitly does not seed amounts | Merchant referral tracks with no payout until admin adds a rule | Document for ops; create rule in Super Admin if product wants payouts |
| MENU_COMPLETED / ACTIVE_DAYS | `NOT IMPLEMENTED` | Enum + UI only | Admin can configure rules that never fire | Hide events or add hooks |
| Relationship expiry | `PARTIALLY IMPLEMENTED` | Columns and reconcile exist; apply does not set `expires_at`; `mapSettings` omits `referral_validity_days` | Super Admin “expiry” toggle does not expire rows | Stamp `expires_at` on insert when enabled |
| `first_order_only` | `PARTIALLY IMPLEMENTED` | Stored and published; evaluator always first-order-style anyway | Toggle OFF does not enable later orders | Wire or remove toggle |
| `campaign_budget` | `NOT IMPLEMENTED` | Column + PATCH only | Budget can be exceeded | Enforce at enqueue/credit or remove UI |
| Advanced fraud | `NOT IMPLEMENTED` on apply | Module unused | Emulator/root/loop settings are theater | Call from apply or drop UI |
| `block_returned` / `block_duplicate_reward` | `NOT IMPLEMENTED` | JSON keys unused | Returned orders may qualify | Implement or remove flags |
| Two-sided atomicity | `PARTIALLY IMPLEMENTED` | Separate jobs; relationship marked credited on first success | One party paid, other not; referred job can be skipped if sibling job exists | Per-party enqueue check; don’t mark relationship credited until both jobs done |
| Fastify admin auth | `PARTIALLY IMPLEMENTED` | `void requireAdmin` | Any logged-in user who can reach `/v1/referral/admin/*` can retry/credit/regenerate | Enforce super_admin on those routes |
| Merchant notification template | `PARTIALLY IMPLEMENTED` | Uses `REFERRAL_REWARD_RIDER` | Wrong channel/role targeting | Add `REFERRAL_REWARD_MERCHANT` |
| Merchant wallet target | `PARTIALLY IMPLEMENTED` | Always first child store | Reward not on qualifying store; parent with no store cannot be paid | Parent-level wallet or qualifying store |
| Store-approved bypass | `PARTIALLY IMPLEMENTED` | Dashboard enqueue ignores `auto_applied` and scope | Rewards on approval even if apply was not auto-attributed | Route through engine |
| Concurrent order increment | `PARTIALLY IMPLEMENTED` | No `SELECT FOR UPDATE` on relationship | Lost updates under concurrent deliveries | Lock row when incrementing |
| Rider landing package fallback | `PARTIALLY IMPLEMENTED` | Code default `com.gatimitra.rider` vs `0475` real package | Broken Play URL if JSON missing | Align `DEFAULT_DEEP_LINK` |
| BullMQ worker | `NOT IMPLEMENTED` | Enqueue only | Confusion; unused Redis jobs | Document poller as SoT or add worker |
| Funnel completeness | `PARTIALLY IMPLEMENTED` | Sparse increments | Analytics undercount | Instrument remaining events |
| 0472 / 0474 | `CONFIGURED BUT NOT VERIFIED` | May not have been applied | Missing legacy relationships in analytics | Apply only with I/O plan |
| Live seed vs admin edits | `CONFIGURED BUT NOT VERIFIED` | This audit did not SELECT production `referral_reward_rules` | Amounts in §23 may differ in prod | Query `referral_settings` + rules in the target environment |
| Device fingerprint | `PARTIALLY IMPLEMENTED` | Customer apply passes `undefined` | Same-device abuse unused | Collect fingerprint if required |
| Validate vs lookup | `PARTIALLY IMPLEMENTED` | `/validate` ignores profile-only codes | False invalid until `/me` syncs `referral_codes` | Use `lookupCode` |
| Campaigns | `PARTIALLY IMPLEMENTED` | Tables + rule windows; apply does not attach `campaign_id` | DEFAULT campaign unused on new rows | Set campaign on insert |
| `reward_expiry_days` / claim window | `NOT IMPLEMENTED` | Columns only | Dead settings | Wire or remove |
| Inactive user eligibility | `NOT IMPLEMENTED` | No account status check | Banned users can still refer/be referred | Check account flags |
| Redis live config in apps | `NOT IMPLEMENTED` | Apps poll HTTP | Up to 5–30s stale UI | Accept or shorten staleTime |

This is **not** “no known implementation gap.” The unified engine is real and largely wired for Customer + Merchant apply and for Rider **server-side** milestones, with the gaps above.

---

## 26. Final Audit Checklist

- [x] Customer referral — engine + Customer App apply (`IMPLEMENTED`)
- [x] Rider referral — engine (`IMPLEMENTED`); Rider App apply (`PARTIALLY IMPLEMENTED`)
- [x] Merchant referral — apply + parent codes (`IMPLEMENTED`); payouts need admin rules (`PARTIALLY`)
- [x] Parent merchant referral (`IMPLEMENTED`)
- [x] Child store aggregation (`IMPLEMENTED` for ALL_CHILD_STORES / SINGLE_STORE / SELECTED_STORES)
- [x] Two-sided rewards (`IMPLEMENTED` when `also_credit_referred`; not atomic)
- [x] Referral attribution (`IMPLEMENTED` backend unique)
- [x] Referral code (`IMPLEMENTED`)
- [x] Referral link (`IMPLEMENTED`)
- [x] Deep link landings (`IMPLEMENTED`); Rider consume (`PARTIALLY`)
- [x] Service toggles (`IMPLEMENTED` UI + apply/share + evaluators)
- [x] Backend toggle enforcement (`IMPLEMENTED` for apply/share/evaluate; landings still open)
- [x] Database configuration (`IMPLEMENTED` singleton + rules)
- [x] Reward calculation (`IMPLEMENTED` in `evaluateRules` / rule amounts)
- [x] Wallet (`IMPLEMENTED` three strategies)
- [x] Ledger (`IMPLEMENTED` tx table + wallet ledgers)
- [x] Idempotency (`IMPLEMENTED` job_key + idempotency_key)
- [x] Duplicate protection (`IMPLEMENTED` uniques; relationship increment not locked)
- [x] Self-referral protection (`IMPLEMENTED`)
- [ ] Expiry — stamp missing (`PARTIALLY IMPLEMENTED`)
- [x] Limits — `max_successful_referrals` on apply (`IMPLEMENTED` if set)
- [x] Caps — monthly (`IMPLEMENTED`); campaign_budget (`NOT IMPLEMENTED`)
- [x] KYC — rider (`IMPLEMENTED`); merchant = store approved (`IMPLEMENTED`)
- [x] Notifications — credit only (`PARTIALLY IMPLEMENTED`)
- [x] Analytics — Super Admin totals/funnel/merchant parents (`IMPLEMENTED` as listed)
- [x] Super Admin UI/API (`IMPLEMENTED`; Fastify admin weakly gated)
- [x] APIs (inventory §11)
- [x] Database schema (§12)
- [x] Migrations (§13)
- [x] Performance notes (§21)
- [x] Security notes (§22)
- [x] Error handling (§20)
- [x] Customer E2E (§23) — implemented in code
- [ ] Rider E2E — blocked on App `/apply` (`PARTIALLY`)
- [x] Merchant E2E — attribution implemented; rewards depend on admin rules (`PARTIALLY`)

---

## Appendix A — Key files (apps)

| App | Files |
| --- | ----- |
| Customer | `apps/customer_app/services/referral.service.ts`, `app/_layout.tsx` (`PendingReferralResume`), `app/(tabs)/profile.tsx`, `app/profile/referrals.tsx`, `lib/pendingReferral.ts`, `lib/playInstallReferrer.ts` |
| Rider | `apps/gatimitra-riderApp/src/services/referral.service.ts`, `src/components/profile/{ProfileReferralCard,ReferralsScreen,ProfilePage,ViewProfileScreen}.tsx`, `src/lib/pendingReferral.ts`, `src/lib/playInstallReferrer.ts` (unused from layout) |
| Merchant | `apps/merchant_app/services/referral.service.ts`, `components/MerchantReferralAttribution.tsx`, `lib/pendingMerchantReferral.ts`, `app/(tabs)/profile/index.tsx`, `app/(tabs)/profile/ReferralsScreen.tsx` |
| Dashboard | `dashboard/src/app/api/super-admin/referral/**`, `dashboard/src/lib/db/operations/referral-engine.ts`, `ReferralEngineAdminClient.tsx`, `merchant-stores.ts` (store approved hook), legacy `dashboard/src/components/riders/RiderReferralsClient.tsx` |

## Appendix B — Repository search coverage

This audit searched the repo for `referral`, `referrer`, `referred`, `milestone`, `invite`, `referral_code`, `referral_link`, `also_credit_referred`, `merchant_qualification_scope`, `REFERRAL_REWARD`, and related module paths. Additional non-engine hits (legacy rider dashboard, `referral_bonus` ledger display, nginx landings, `0041` rider code trigger) are included above. A shorter design doc remains at `backend/docs/REFERRAL_REWARDS_ENGINE.md` and must not be treated as proof of features this audit marked missing.
