# GatiMitra Referral & Rewards Engine

This document is the **authoritative PRD for the implemented engine** as of 15 August 2026.
It describes runtime behavior in this repository — not a future design.

Super Admin is the single control plane for amounts, qualifying events, milestones, caps, and eligibility.
Apps never calculate or hardcode rewards. They display backend values and POST captured referral codes.

---

## Architecture

| Module | Responsibility |
|--------|----------------|
| `referral.participants` | Customer / rider / merchant flags, prefixes, deep-link paths |
| `referral.config.service` | Versioned `referral_settings` cache + `config:referral` broadcast |
| `referral.lifecycle` | Funnel state machine |
| `referral.rule-engine` | Event-based rule matching from DB |
| `referral.queue` | Durable Postgres jobs (BullMQ enqueue is best-effort; **Postgres poller is the processor**) |
| `referral.reward.service` | GatiCash / rider wallet / merchant wallet credit |
| `referral.relationship-state` | Per-party two-sided reward state |
| `referral.budget` | Combined campaign-budget enforcement |
| `referral.eligibility` | Expiry stamping, blocked-user checks, merchant wallet store resolution |
| `referral.fraud` + `referral.fraud.advanced` | Self / phone / device / attribution + loop / velocity / IP |
| `referral.codes` | Crypto-safe codes; profile codes win over `referral_codes` sync |
| `referral.tracking` | Apply / share / install clicks |
| `referral.admin-auth` | Super Admin gate for Fastify admin APIs |
| `playInstallReferrer` (apps) | Native Play Install Referrer (Android) |

Supported referral types:

1. Customer → Customer (`customers.id`)
2. Rider → Rider (`riders.id`)
3. Merchant → Merchant at **parent** level (`merchant_parents.id`)
4. Parent merchant → invited parent merchant (same table; child stores are not referrers)

---

## Global Referral Service Toggles

Super Admin Settings has three independent database flags on `referral_settings`:

| Toggle | Column | Audience |
|--------|--------|----------|
| Customer Referral | `customer_referral_enabled` | Customer App + `POST /v1/referral/apply` for customers |
| Rider Referral | `rider_referral_enabled` | Rider App + rider apply |
| Merchant Referral | `merchant_referral_enabled` | Merchant App, Partner Site, AM Dashboard, merchant apply |

These flags are the **single source of truth** for whether **new** referral applications and **new** code generation are allowed for that audience. They are ANDed with the master `enabled` flag (`referralTrackingEnabled`). They do **not** depend on each other: Customer OFF + Rider ON + Merchant ON leaves rider and merchant working.

### Backend enforcement (final authority)

Every apply path checks the current toggle **before** creating attribution:

- `POST /v1/referral/apply`
- `POST /v1/referral/validate`
- `POST /v1/referral/internal/apply-onboarding`
- `GET /v1/referral/preview`
- `POST /v1/referral/share`

If the matching service is OFF:

1. Return HTTP **409**
2. Machine code: `REFERRAL_SERVICE_DISABLED`
3. API message: `Referral service is currently unavailable.`
4. `userMessage`: `This referral code is no longer available.`
5. Do **not** create `referral_relationship`, reward jobs, transactions, campaign attach, qualification progress, wallet credit, or budget reservation.

This check uses live settings (existing `referral_settings` cache + `config:referral` broadcast). Stale app caches, AsyncStorage, pending codes, deep links, old app versions, and direct API calls cannot bypass it.

A code that was saved while the service was ON is **not** grandfathered. Current toggle state always wins.

If a relationship **already exists** for `(user_type, referred_user_id)`, apply returns `{ ok: true, alreadyApplied: true }` even when the service is later OFF. OFF blocks **new** attribution only.

### Frontend / Partner / AM

When the matching `GET /v1/referral/config?userType=` `referralEnabled` is false:

| Surface | Behavior |
|---------|----------|
| Customer App | Hide Invite & Earn; hide onboarding referral field; do not auto-apply pending/deep-link codes |
| Rider App | Hide Refer & Earn; disable onboarding referral field; do not auto-apply pending codes |
| Merchant App | Hide Refer & Earn; pending deep-link apply skipped |
| Partner Site | Disable referral field; deep link `/merchant-ref/{CODE}` opens onboarding but does **not** persist/apply the code |
| AM Dashboard | Referral field disabled with helper: `Merchant referrals are currently unavailable.` Parent/store create still works without a code |

User-facing apply/deep-link copy (all apps + Partner Site): **This referral code is no longer available.** Internal terms (Super Admin, config version, rule IDs) are never shown.

Pending storage (AsyncStorage / localStorage / cookie / Play Install Referrer) may keep the code so that when the service is turned ON again it can be retried. The next apply still hits the backend.

### Code generation and sharing

While a service is OFF:

- Existing published codes remain stored.
- `getOrCreateReferralCode` / profile-complete generation does **not** mint a new code.
- `GET /v1/referral/me` returns an existing code but `shareUrl` is `null`.
- `POST /v1/referral/share` returns 409.

Turning the service ON again does not delete codes. Existing unused codes become usable again if they still pass eligibility (not expired, not self, etc.). The toggle is a service-availability switch, not destructive deletion.

### Existing relationships and rewards

OFF does **not**:

- Delete historical `referral_relationships`
- Reverse already-credited GatiCash / wallet rewards
- Cancel queued jobs that were created while the service was ON

`referralRewardsEnabled` follows `enabled` + `reward_enabled` + the per-audience **reward** toggle only. Evaluators and `referral.reward.service` do not consult the service (tracking) toggle. Use the dedicated reward toggles to pause credits.

### Re-enable

When a toggle is turned ON again:

- New apply works for valid codes.
- Previously stored pending / deep-link codes are retried against current eligibility.
- Existing relationships continue their lifecycle.

### API

```
HTTP 409
{
  "ok": false,
  "valid": false,
  "error": "REFERRAL_SERVICE_DISABLED",
  "code": "REFERRAL_SERVICE_DISABLED",
  "message": "Referral service is currently unavailable.",
  "userMessage": "This referral code is no longer available."
}
```

No migration: the three columns already exist on `referral_settings`.

---

## Referral lifecycle

```
LINK_SHARED → LINK_CLICKED → PLAY_STORE_OPENED → APP_INSTALLED
  → FIRST_APP_OPEN → REFERRAL_APPLIED → FIRST_ORDER_PLACED → ORDER_DELIVERED
  → REWARD_ELIGIBLE → REWARD_GRANTED → REWARD_NOTIFIED
```

Terminal / exception states: `FRAUD_BLOCKED`, `EXPIRED`, `SUSPENDED`, `SKIPPED`, `REWARD_FAILED`.

`REWARD_GRANTED` / relationship `status = reward_credited` is written **only when every required party job for that rule has succeeded**. One successful party does not complete the relationship.

### Per-party reward state (`metadata.reward_state`)

| State | Meaning |
|-------|---------|
| `both_pending` | Required jobs queued / retrying |
| `referrer_credited_referred_pending` | Referrer credited; referred still open or retrying |
| `referred_credited_referrer_pending` | Referred credited; referrer still open or retrying |
| `both_credited` | All required parties credited |
| `permanent_failure` | Required parties dead without credit |
| `skipped_disabled` | Rewards disabled / skipped |

Each party has its own job key `ref_job_{relationshipId}_rule_{ruleId}_{referrer|referred}` and its own transaction idempotency key. Retrying one side cannot be blocked by the other side’s existing job.

---

## Qualification

| Audience | Qualifying event | Notes |
|----------|------------------|-------|
| Customer | First delivered order (default) | `first_order_only` ON: only the first qualifying order. OFF: later delivered orders increment `completed_orders` and can match additional rules. |
| Rider | Delivered-order count + optional KYC | Atomic `completed_orders = completed_orders + 1` with `counted_order_ids` guard |
| Merchant | Super Admin `event_type` (default seed: `STORE_APPROVED`) | Child-store aggregation follows `merchant_qualification_scope` |

Order qualification (`isOrderQualifyingForReferral`):

- `require_delivered_status` — must be DELIVERED
- `block_cancelled` — cancel status / `cancelled_at`
- `block_returned` — RETURN / RTO / UNDELIVER in status
- `block_refunded` — refund wallet tx for the order
- `block_duplicate_reward` — enforced by unique job keys + `referral_reward_transactions.idempotency_key`
- min amount + eligible services from settings

Expired relationships (`expires_at < now`) do not qualify. Reconciliation expires rows whose `expires_at` has passed.

---

## Reward rules

Amounts live only in `referral_reward_rules`. Seed defaults (Super Admin may change them):

- Customer `CUSTOMER_FIRST_ORDER` — GatiCash both sides (0470)
- Rider `RIDER_M20` / `RIDER_M50` / `RIDER_M100` — wallet milestones (0470)
- Merchant `MERCHANT_STORE_APPROVED` — wallet both sides ₹100 default, `require_kyc`, event `STORE_APPROVED` (0540)

`also_credit_referred` creates **two independent jobs**. Wallet credit is per job, not a single two-row transaction, but relationship completion waits for both.

### Merchant wallet target

Merchant wallets are **per store**. Credit uses:

- `ALL_CHILD_STORES` — the store that triggered the event (`merchantStoreId`); if missing, first child store
- `SINGLE_STORE` — triggering store, else the store with the highest counted orders
- `SELECTED_STORES` — triggering store only if it is in `merchant_qualification_store_ids`

The referred beneficiary is the **parent** (`merchant_parents.id`); the ledger lands on the resolved store wallet.

---

## Two-sided rewards

If `also_credit_referred = true` and the referred user qualifies:

1. Enqueue referrer job (own idempotency key)
2. Enqueue referred job (own idempotency key)
3. `ON CONFLICT (job_key) DO NOTHING` — never skip the other party because one job exists
4. Processor credits one party per job
5. `syncRelationshipRewardState` updates `metadata.reward_parties` / `reward_state`
6. Relationship is `reward_credited` only at `both_credited`

Campaign budget, monthly caps, and disabled flags can skip a party independently (`skipped`).

---

## Campaigns and budget

On `POST /v1/referral/apply`, the engine selects the highest-priority enabled `referral_campaigns` row matching `user_type` and date window, and stores `campaign_id` on the relationship.

**Campaign budget** is `referral_settings.campaign_budget` (nullable = unlimited).

- Applies to **combined** credited payout (referrer + referred) in `referral_reward_transactions` where `status = 'credited'`.
- Enforced server-side at credit time under `pg_advisory_lock`.
- Example: budget ₹5,000, consumed ₹4,900, next ₹200 → skipped `campaign_budget_exhausted`.
- Super Admin sees budget, consumed, remaining, exhausted on Referral & Rewards.

Rules with a `campaign_id` only match when the relationship’s campaign matches (or the rule has no campaign).

---

## Expiry

When a relationship is created:

- `expires_at = now + (campaign.referral_validity_days || settings.referral_validity_days || 365 days)`
- If `referral_expiry_enabled = false`, `expires_at` is null (no expiry)

Evaluators skip expired rows. Reconciliation marks them `EXPIRED`. Changing validity days does **not** rewrite existing `expires_at` (new applies only).

---

## Fraud and eligibility

**Enforced on apply / qualification:**

- Self-referral, same phone, same device fingerprint
- Missing install attribution when auto-apply requires it
- Referral loops (A→B→A)
- Velocity (max referrals per referrer per hour from `advanced_fraud`)
- Suspicious IP hash counts on install clicks
- Cancelled / refunded / returned orders
- Duplicate reward via unique keys
- Blocked / suspended / deactivated customers; blocked / banned riders; missing merchant parent

**INTENTIONALLY DEFERRED (no client signal today):**

- Emulator / rooted device blocking — code exists if apps send `isEmulator` / `isRooted`; apps do not currently send these
- Disposable-phone prefix list is a small static heuristic, not a carrier database

---

## Admin authorization

Dashboard Super Admin UI uses Next.js `requireSuperAdminApi` + direct SQL.

Fastify `/v1/referral/rules`, `/campaigns`, `/analytics`, and `/v1/referral/admin/*` (retry, manual-credit, regenerate-code, suspend, reconcile, process-queue) require:

- JWT `role = super_admin` or `system`, **or**
- `X-Internal-Secret` matching `INTERNAL_API_TOKEN` (dashboard proxy)

Customer, rider, merchant, and non–super-admin JWTs receive 403. Manual credit is on the same gate.

Public: `GET /v1/referral/config`, `GET /v1/referral/settings` (version-aware).

---

## APIs

| Method | Path | Auth |
|--------|------|------|
| GET | `/v1/referral/config` | Public |
| GET | `/v1/referral/settings` | Public (version-aware) |
| GET | `/v1/referral/me` | Authenticated actor |
| GET | `/v1/referral/history` | Authenticated actor |
| POST | `/v1/referral/apply` | Authenticated actor; idempotent |
| POST | `/v1/referral/share` | Authenticated actor |
| GET | `/v1/referral/rules` | Super Admin |
| GET | `/v1/referral/campaigns` | Super Admin |
| GET | `/v1/referral/analytics` | Super Admin |
| POST | `/v1/referral/admin/*` | Super Admin |

`POST /apply` is safe to call multiple times: existing `(user_type, referred_user_id)` returns `{ ok: true, alreadyApplied: true }`.

---

## Database / migrations

| Migration | Role |
|-----------|------|
| 0470 | Core tables, customer + rider seed rules, notification templates |
| 0471 | Lifecycle, campaigns, queue, `expires_at`, `referral_validity_days` |
| 0472 | Code resync |
| 0474 | Legacy relationship backfill |
| 0475 | Deep-link packages |
| 0536a | `merchant` enum |
| 0536 | Merchant columns, reward_mode, campaign_budget |
| 0537 | Qualification scope |
| 0538 | Parent merchant codes (insert-only) |
| **0540** | Merchant `MERCHANT_STORE_APPROVED` seed rule + `REFERRAL_REWARD_MERCHANT` template |

Do not edit applied migrations. 0540 is insert-only (`WHERE NOT EXISTS` / `ON CONFLICT DO NOTHING`). No relationship backfill.

`referral_relationships.referred_user_id` is unique per `user_type`.

---

## Queue / workers / reconciliation

- Jobs persist in `referral_reward_jobs`.
- Backend tick + `setImmediate` after enqueue run `processReferralRewardJobs` (`FOR UPDATE SKIP LOCKED`).
- BullMQ `q.referral.reward` is enqueued if Redis is up; **no dedicated consumer is required** — Postgres poller is source of truth.
- Reconciliation requeues stuck jobs, expires overdue relationships, and backfills missing notify transitions.

---

## Notifications

| Template | Role |
|----------|------|
| `REFERRAL_REWARD_CUSTOMER` | Customer GatiCash |
| `REFERRAL_REWARD_RIDER` | Rider wallet |
| `REFERRAL_REWARD_MERCHANT` | Merchant wallet |

Event `referral.reward_credited` picks the template from `role`. Copy comes from Super Admin `notification_templates` (title/body with `{{amount}}`).

---

## Analytics / funnel

`referral_funnel_daily` increments on lifecycle events. Super Admin analytics include totals, referrer vs referred payout, campaign budget consumed/remaining/exhausted, funnel (30 days), top referrers, merchant parent progress.

---

## Deep links / install referrer / apps

| Audience | Landing | Package (from `referral_settings.deep_link`, defaults below) |
|----------|---------|--------------------------------------------------------------|
| Customer | `/ref/{CODE}`, `/invite/{CODE}` | `com.gatimitra.customer` |
| Rider | `/rider-ref/{CODE}` | `com.gatimitra.rider` |
| Merchant | `https://partner.gatimitra.com/merchant-ref/{CODE}` | `com.gatimitra.partner` |

Empty DB package strings fall back to those defaults — not to a different app.

Legacy `https://gatimitra.com/merchant-ref/{CODE}` (Fastify public landing) **302-redirects** to Partner Site after recording the install click. Share URLs generated for merchants always use Partner Site (`resolveReferralPublicBaseFor("merchant")`). `REFERRAL_LINK_BASE_URL` still applies to customer/rider only. Override merchant base with `MERCHANT_REFERRAL_LINK_BASE_URL` or `PARTNER_SITE_URL`.

**Customer App:** `PendingReferralResume` captures Play Install Referrer + pending code, then `POST /v1/referral/apply` after login.

**Rider App:** `RiderPendingReferralResume` does the same (deep link + Play Install Referrer + apply after session hydrate). Pending code survives restart; apply is idempotent.

**Merchant App:** `MerchantReferralAttribution` captures `/merchant-ref` (partner.gatimitra.com and gatimitra.com) and applies after login. Share fallback is `https://partner.gatimitra.com/merchant-ref/{CODE}`.

Play Install Referrer requires a dev-client / production Android build (not Expo Go).

---

## Merchant Referral Attribution Across Onboarding Channels

Merchant referrals are **parent-scoped** (`merchant_parents.id`). Child stores never become `referred_user_id`. Qualification still aggregates child-store activity via `merchant_qualification_scope`.

There is one engine. Partner Site and AM Dashboard are attribution **entry points** only. They send `referralCode` on onboarding and call the existing apply path. They do **not** write `referral_relationships`.

### Channels

| Channel | Path | How the code is captured |
|---------|------|--------------------------|
| Merchant referral deep link | `https://partner.gatimitra.com/merchant-ref/{CODE}` | Cookie + localStorage + `?ref=` on `/auth/register` |
| Partner Site self-onboarding | `/auth/register` | Optional field + Apply (`GET /v1/referral/preview`) |
| Partner Site parent form | `/auth/register-parent`, `/auth/register-business` | Same field; `POST /api/parent-merchant` |
| AM Dashboard parent create | `/dashboard/area-managers/stores/register-parent` | Optional field; `POST /api/area-manager/parent-merchant/register` |
| AM Dashboard child store | `/dashboard/area-managers/stores/add-child` | Optional field; applied to **parent PK**, not store id |
| Merchant App after login | Existing `POST /v1/referral/apply` | Pending SecureStore / Play referrer |

Child-only store wizards on Partner Site (`/auth/register-store`) do not create a new relationship. If a pending code exists after parent login, `PartnerMerchantReferralAttribution` applies it to the parent.

### Code priority (before first successful apply)

1. Explicitly entered code on the form  
2. Deep-link / `?ref=` code  
3. Previously stored pending code (cookie / localStorage / SecureStore)

After a relationship exists for `(merchant, parent_id)`, apply is **locked**: unique `(user_type, referred_user_id)` returns `alreadyApplied` and does not overwrite the referrer.

### APIs

| API | Auth | Role |
|-----|------|------|
| `GET /v1/referral/preview?code=&userType=merchant` | Public | Validate code; return inviter **display name** + invitee-only reward line. Never returns referrer reward or rule names. |
| `POST /v1/referral/internal/apply-onboarding` | `X-Internal-Secret` | After parent insert: `applyReferral({ userType: merchant, referredUserId: parent.id })` |
| `POST /v1/referral/apply` | Merchant JWT | Existing app path (same engine) |

Parent create APIs accept optional `referralCode` and call apply-onboarding **after** insert. Registration succeeds even if referral apply fails (optional). Apply is retry-safe.

### Validation (server-side)

Preview and apply use the unified engine: code exists, active, not suspended, merchant type, tracking enabled, referrer eligible, self/same-phone/loop blocked, duplicate referred parent blocked.

User-facing messages (from backend `message`):

- invalid → `Invalid referral code. Please check the code and try again.`
- expired → `This referral code is no longer valid.`
- self / ineligible / already attributed → `This referral cannot be applied to this account.`

### Reward privacy

Referred merchants may see their own invitee line (from live Super Admin config), e.g. “Get ₹100 when you complete 50 qualifying delivered orders.” They never see the referrer amount. Share messages use the same invitee-only copy.

### Idempotency

Refresh, double submit, AM retry, repeated link opens, and resume all hit the same unique relationship. Child stores under an already-referred parent do not create additional rows.

---

## Idempotency and concurrency

- Apply: unique `(user_type, referred_user_id)` + advisory lock around referrer cap check
- Jobs: unique `job_key`
- Credits: unique `idempotency_key` on `referral_reward_transactions` + wallet ledger keys
- Rider/customer order counters: SQL `completed_orders = completed_orders + 1` with `counted_order_ids` containment guard
- Campaign budget: session advisory lock around check + credit

---

## Security

- Reward amounts never trusted from clients
- Fastify admin routes Super-Admin gated
- Blocked/banned users cannot apply or receive credit
- Self-referral and same-phone blocked

---

## Performance

Queue queries use status + `next_attempt_at` with `SKIP LOCKED`. Evaluators load one relationship by referred user (indexed). Analytics aggregates use existing funnel/transaction tables; no full-table backfill on 0540. Order-delivered hooks evaluate at most one relationship per referred user.

---

## Testing

Unit tests (no DB): `referral.engine.test.ts`, `referral.lifecycle.test.ts`, `referral.reward-summary.test.ts`, `referral.onboarding.test.ts`, `referral.service-toggle.test.ts`.

Covered: two-sided states, budget overshoot math, expiry boundary, Super Admin role allow/deny, blocked statuses, merchant store scopes, deep-link packages, lifecycle transitions, code generation, invitee-only share copy, merchant onboarding error copy, referral-code priority, Partner Site share base, independent service toggles, `REFERRAL_SERVICE_DISABLED` 409 contract, rewards continuing after a service is turned OFF.

Live DB / concurrent credit E2E against Postgres is **not** part of the default `npm test` glob on Windows (the script glob does not expand). Run:

```
node --import tsx/esm --test src/modules/referral/referral.lifecycle.test.ts src/modules/referral/referral.engine.test.ts src/modules/referral/referral.reward-summary.test.ts src/modules/referral/referral.onboarding.test.ts src/modules/referral/referral.service-toggle.test.ts
```

---

## Known limitations

| Item | Status |
|------|--------|
| Emulator / root blocking | INTENTIONALLY DEFERRED until apps send device signals |
| BullMQ dedicated worker | INTENTIONALLY DEFERRED; Postgres poller is the processor |
| Rewriting `expires_at` when Super Admin changes validity days | INTENTIONALLY DEFERRED (applies to new relationships only) |
| Live concurrent DB E2E in CI | NOT VERIFIED in this workspace (unit tests only) |

Historical credited events remain immutable snapshots. Super Admin changing a rule amount does not rewrite past ledger rows.
