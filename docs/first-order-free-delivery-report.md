# First Order Free Delivery — Implementation Report

**Date:** 2026-10-28  
**Status:** Code + migration ready. **Production DB not mutated** (requires explicit authorization).

## Confirmed root causes

1. **NORMAL analytics budget bleed** — `SUM(budget_used)` / `SUM(budget_total)` included all `billing_platform_offers`, so Flash Sale ₹521.15 appeared on NORMAL even with 0 normal redemptions.
2. **Client-trusted `userSegment`** — quote/checkout accepted client `NEW`/`EXISTING`, bypassing server order history.
3. **NEW segment alone was insufficient** — delivered-order count was not FOOD-scoped; no cross-campaign one-time lock for duplicate FREE_DELIVERY / coupon aliases.
4. **Default cancel/refund restore** — would allow cancel-and-reorder to re-claim first-order free delivery while still NEW.
5. **No dedicated FREE DELIVERY analytics tab** — only NORMAL | FLASH; FREE_DELIVERY mixed into NORMAL.

## Existing offer configuration (recommended corrections)

Do **not** create a second campaign. Migration `0645` / dashboard `0642` updates the existing FOOD `FREE_DELIVERY` row in place (preserves `id`, `budget_used`, usage history):

| Field | Target |
|-------|--------|
| name | Free Delivery -- First Order |
| coupon_code | FIRSTDELIVERY (when current is empty / FREEDELIVERYFEE / FREEDELIVERY / FIRSTDELIVERY) |
| service | FOOD |
| offer_kind | FREE_DELIVERY |
| audience | CUSTOMER |
| customer_segment | NEW |
| delivery_discount_type | FULL_WAIVE |
| min_order_amount | 99 |
| auto_apply | true (`promo_config`) |
| max_uses_per_user | 1 |
| is_stackable | false |
| restore_on_cancel / restore_on_refund | **false** (anti abuse) |
| conditions | `first_order_only`, `benefit_family=first_order_free_delivery` |
| budget_total | keep existing or default 1500 |

**Authorization required** before applying the migration to production.

## First-order eligibility definition

Authoritative (server-only):

1. Offer is first-order FREE_DELIVERY when `conditions.first_order_only` **or** `benefit_family=first_order_free_delivery` **or** (`offer_kind=FREE_DELIVERY` ∧ `customer_segment=NEW`).
2. Service must be **FOOD** (Grocery / Ride / Parcel rejected by service gate).
3. `completedFoodOrderCount === 0` — delivered `orders_core` with `order_type=food` + `status=delivered`. Cancelled/failed/unpaid never-delivered do **not** count as qualifying prior orders.
4. `firstOrderFreeDeliveryUsageCount === 0` — no active (`reserved`|`consumed`) usage in benefit family across campaigns.
5. Client `userSegment` / `isNewUser` is **ignored**; segment is derived from delivered order history.

## Redemption enforcement

- Per-offer `max_uses_per_user=1` + usage ledger.
- Shared `benefit_family` on `platform_offer_usages` + partial unique index `(customer_id, benefit_family) WHERE status IN ('reserved','consumed')`.
- Placement locks offer row; concurrent checkouts serialize; benefit-family conflict returns `first_order_benefit_already_used`.
- Same-order retries → `already_recorded` (idempotent).
- On cancel/refund for this family: **budget may release**, but a **lifetime lock** usage row is written so eligibility is never restored (blocks cancel-and-reorder).

## Budget accounting & analytics reconciliation

| Tab | Scope |
|-----|--------|
| NORMAL | Excludes `FLASH_SALE` and `FREE_DELIVERY` from offer counts, applications, and budget KPIs |
| FLASH | `flash_sale_redemptions` only (unchanged) |
| FREE DELIVERY | FREE_DELIVERY offers + `platform_offer_usages` only |

₹521.15 on prior NORMAL view = Flash Sale lifetime `budget_used`, not a normal redemption bug.

## Files changed

### Backend
- `backend/src/modules/billing/platformOfferFirstOrderFood.ts` (+ tests)
- `backend/src/modules/billing/platformOffersApply.ts`
- `backend/src/modules/billing/platformOfferUsage.service.ts`
- `backend/src/modules/billing/billing.service.ts`
- `backend/src/modules/billing/types.ts`
- `backend/src/db/schema.ts` (`benefit_family` + unique index)
- `backend/drizzle/0645_first_order_free_delivery_safety.sql` (+ rollback)

### Dashboard
- `dashboard/drizzle/0642_first_order_free_delivery_safety.sql` (+ rollback)
- `dashboard/src/components/super-admin/OfferAnalyticsModeToggle.tsx`
- `dashboard/src/lib/db/operations/platform-offer-analytics.ts`
- `dashboard/src/lib/db/operations/free-delivery-tracker.ts`
- `dashboard/src/app/api/super-admin/billing/free-delivery-tracker/route.ts`
- `dashboard/src/app/dashboard/super-admin/offers-coupons/free-delivery-tracker/*`
- `dashboard/src/lib/db/operations/billing-advanced.ts`
- `dashboard/src/components/super-admin/PlatformOfferEditorClient.tsx`
- `dashboard/src/app/dashboard/super-admin/offers-coupons/analytics/PlatformOfferAnalyticsClient.tsx`

## FREE DELIVERY tracker features

- Tab after FLASH: NORMAL | FLASH | FREE DELIVERY
- KPI cards (offers, active, orders, redeems, customers, waived ₹, budget, avg, cancelled/refunded, conversion)
- Per-offer table with edit links
- Customer redemption ledger (search/filter, order links, no phone/address)
- Daily redemption + discount charts + budget utilization bar
- Conflict warning for multiple active FREE_DELIVERY campaigns
- Admin audit log filtered to FREE_DELIVERY mutations
- Eligible-customers KPI intentionally `null` (avoids full-customer scan)

## Tests run

- `platformOfferFirstOrderFood.test.ts` — 10/10 pass
- `platformOffersApply.test.ts` — 41/41 pass

## Remaining limitations / blockers

1. **Production migration not applied** — needs explicit approval.
2. **Eligible customers KPI** not computed (by design).
3. **Concurrent stress tests** against live DB not run in this session.
4. **Grocery delivered orders** share `order_type=food` — a prior delivered grocery order makes the customer ineligible for FOOD first-order free delivery (documented).
5. Lifetime lock rows use `order_id_text` prefix `lifetime-lock:` — excluded from analytics.

## Deployment checklist

1. Review migration SQL + run validation SELECTs.
2. Backup `billing_platform_offers` / `platform_offer_usages`.
3. Apply `0645` (backend) / `0642` (dashboard mirror) via authorized process.
4. Confirm offer row config; map geo if still unmapped (unmapped stays hidden at checkout).
5. Smoke-test checkout: new customer free delivery once; second attempt blocked; grocery/ride unaffected.
