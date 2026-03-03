# Merchant Migration Checklist

Use this checklist to track migration of each merchant_db API and page into the dashboard.

## API Routes

### Auth (merchant + shared)
- [ ] `auth/register` → dashboard `api/auth/register` (parent/child registration)
- [x] `auth/resolve-parent` → dashboard `api/auth/resolve-parent`
- [ ] `auth/register-store-progress`
- [ ] `auth/resolve-session`
- [ ] `auth/set-cookie` (dashboard has; align if needed)
- [ ] `auth/merchant-session-status`
- [ ] `auth/registered-emails`
- [ ] `auth/check-existing`
- [ ] `auth/send-sms`
- [ ] `auth/merchant-agreement-template`
- [ ] `auth/store-menu-media-signed`
- [ ] `auth/delete-r2-object`
- [ ] `auth/callback`
- [ ] `auth/login` (dashboard has; merchant flow may need alignment)

### Parent merchant
- [x] `parent-merchant/get-by-phone` → dashboard `api/parent-merchant/get-by-phone`
- [ ] `parent-merchant/route` (POST/GET)
- [ ] `parent-merchant/get-by-id`
- [ ] `parent-merchant/phone`

### Stores / onboarding
- [ ] `stores/register`
- [ ] `store-registration/submit`
- [ ] `store-registration/submit-subabse`
- [ ] `store-status`
- [ ] `store-status-by-id`
- [ ] `store-id`
- [ ] `store/documents`
- [ ] `outlet-timings`

### Onboarding payments
- [ ] `onboarding/create-order`
- [ ] `onboarding/verify-payment`
- [ ] `onboarding/payment-status`

### Merchant portal (`/api/merchant/`)
- [x] `merchant/verifications` (dashboard: list for verification UI)
- [ ] `merchant/store-settings`
- [ ] `merchant/store-settings-activity`
- [ ] `merchant/store-profile`
- [ ] `merchant/store-activities`
- [ ] `merchant/store-status-log`
- [ ] `merchant/store-image-count`
- [ ] `merchant/agreement`
- [ ] `merchant/bank-account/verify`
- [ ] `merchant/bank-accounts`
- [ ] `merchant/bank-accounts/[id]`
- [ ] `merchant/wallet`
- [ ] `merchant/wallet/ledger`
- [ ] `merchant/payout-quote`
- [ ] `merchant/payout-request/[id]`
- [ ] `merchant/invoice/[payoutRequestId]`
- [ ] `merchant/subscription`
- [ ] `merchant/subscription/upgrade`
- [ ] `merchant/subscription/create-payment-order`
- [ ] `merchant/subscription/verify-payment`
- [ ] `merchant/subscription/auto-renew`
- [ ] `merchant/plans`
- [ ] `merchant/tickets`
- [ ] `merchant/tickets/list`
- [ ] `merchant/tickets/[ticketId]`
- [ ] `merchant/tickets/messages`
- [ ] `merchant/tickets/reopen`
- [ ] `merchant/tickets/rate`
- [ ] `merchant/reviews`
- [ ] `merchant/reviews/respond`
- [ ] `merchant/order-details`
- [ ] `merchant/onboarding-payments`
- [ ] `merchant/audit-logs`
- [ ] `merchant/self-delivery-riders/[id]`
- [ ] `merchant/pos-integration`
- [ ] `merchant/menu-items`
- [ ] `merchant/menu-items/upload-image`

### Other
- [ ] `menu/route`
- [ ] `menu/replace-files`
- [ ] `customizations`
- [ ] `offers` (dashboard has offers; align)
- [ ] `food-orders/*`
- [ ] `orders`
- [ ] `withdrawals`
- [ ] `upload/r2`
- [ ] `r2/signed-url`
- [ ] `images/signed-url`
- [ ] `media/renew-signed-url`
- [ ] `attachments/proxy`
- [ ] `next-restaurant-id`
- [ ] `dashboard-analytics`
- [ ] `health`
- [ ] `cleanup-stale-progress`
- [ ] `send-sms`
- [ ] `webhooks/rider`

## Pages (merchant_db → dashboard)

### Auth / registration
- [ ] Parent Registration → dashboard `auth/register-parent` or `dashboard/merchants/register-parent`
- [ ] Child (store) Registration → dashboard `auth/register-store` or `dashboard/merchants/register-store`
- [ ] Remove/replace old Merchant Sign In in Area Manager flow

### MX portal (merchant-facing)
- [ ] `mx/dashboard`
- [ ] `mx/menu`
- [ ] `mx/orders`
- [ ] `mx/store-settings`
- [ ] `mx/offers`
- [ ] `mx/payments`
- [ ] Other mx/* pages as needed

### Internal (unified merchant management)
- [x] Merchants list / Verifications → `dashboard/merchants`, `dashboard/merchants/verifications`
- [ ] Document verification (approve/reject) UI
- [ ] Onboarding progress view
- [ ] Payment setup / status view

## Lib / schema
- [x] `lib/merchant/audit-merchant.ts`
- [x] `lib/merchant/validation/parentMerchantSchema.ts`
- [x] `lib/merchant/validation/storeSchema.ts`
- [x] `lib/merchant/bank-verification.ts`
- [ ] Any remaining merchant_db lib (store.ts, merchantStore.ts, invoice PDF, etc.) as needed by migrated APIs

## RBAC & audit
- [ ] Enforce Agent / Area Manager / Super Admin on every merchant API (verify/reject, approve, etc.)
- [ ] Log all merchant actions with store_id, user_id, role, action, timestamp (reuse `api/audit/track` + `merchant_audit_logs` where applicable)
