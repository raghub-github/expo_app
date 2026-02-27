# Merchant System Migration Plan: merchant_db → Dashboard

## Objective
Move all merchant-related logic, APIs, database handling, and workflows from `merchant_db` into the main Dashboard project so that:
- The system works exactly the same; no feature breaks.
- The `merchant_db` folder can be safely removed.
- Dashboard is the single place for Agent, Area Manager, and Super Admin merchant control.

---

## 1. Full Merchant System Migration

### 1.1 Database & Schema
- **Dashboard** already has Drizzle migrations referencing `merchant_stores`, `merchant_parents`, and related tables (e.g. `0011_merchant_domain_operations.sql`). The dashboard schema has a simplified `stores` table; **merchant_stores** is used in raw SQL in `lib/db/operations/merchant-stores.ts`.
- **Action:** Ensure dashboard `schema.ts` includes (or continues to use via raw SQL) all tables used by merchant_db: `merchant_stores`, `merchant_parents`, `merchant_store_documents`, `merchant_store_operating_hours`, `merchant_store_availability`, `merchant_plans`, `merchant_subscriptions`, wallet/ledger, withdrawals, agreements, onboarding payments, etc. Prefer adding missing Drizzle table definitions if migrations already create them.
- **Action:** Do **not** duplicate migrations. Reuse existing dashboard migrations; add only net-new migrations if merchant_db introduced columns/tables not yet in dashboard.

### 1.2 Lib Migration (merchant_db → dashboard)
Copy/merge into dashboard under `src/lib/` (with import path updates):

| merchant_db | dashboard target |
|-------------|------------------|
| `lib/audit-merchant.ts` | `lib/merchant/audit-merchant.ts` |
| `lib/auth/*` (supabase-client, auth-context, validate-merchant, session-manager, auth-error-handler) | `lib/auth/` (merge with existing; avoid overwriting dashboard auth) |
| `lib/validation/parentMerchantSchema.ts`, `storeSchema.ts`, `menuItemSchema.ts` | `lib/merchant/validation/` |
| `lib/r2.ts`, `lib/uploadImageToR2.ts`, `lib/ticket-attachment-url.ts`, `lib/menu-image-url.ts` | `lib/merchant/` or `lib/r2.ts` if not exists |
| `lib/bank-verification.ts` | `lib/merchant/bank-verification.ts` |
| `lib/invoice-withdrawal-pdf.ts` | `lib/merchant/invoice-withdrawal-pdf.ts` |
| `lib/store.ts`, `lib/merchantStore.ts`, `lib/database.ts`, `lib/dbUtils.ts` | Align with dashboard DB client; add merchant-specific helpers under `lib/merchant/` or `lib/db/operations/` |
| `lib/types.ts` (merchant types) | `lib/merchant/types.ts` or merge into `types/` |

- **Rule:** Refactor all imports from `@/lib/...` (merchant_db) to dashboard paths. No dependency on merchant_db.

### 1.3 API Routes Migration
Recreate under dashboard `src/app/api/`:

- **Auth (merchant + shared):**  
  `auth/register`, `auth/register-store-progress`, `auth/resolve-parent`, `auth/resolve-session`, `auth/set-cookie`, `auth/merchant-session-status`, `auth/registered-emails`, `auth/check-existing`, `auth/send-sms`, `auth/merchant-agreement-template`, `auth/store-menu-media-signed`, `auth/delete-r2-object`, `auth/callback` (if not already present), `auth/login` (align with dashboard login; see §2).
- **Parent merchant:**  
  `parent-merchant/route.ts`, `parent-merchant/get-by-phone`, `parent-merchant/get-by-id`, `parent-merchant/phone`.
- **Stores / onboarding:**  
  `stores/register`, `register-store/route` (if any), `store-registration/submit`, `store-registration/submit-subabse`, `store-status`, `store-status-by-id`, `store-id`, `store/documents`, `outlet-timings`.
- **Onboarding payments:**  
  `onboarding/create-order`, `onboarding/verify-payment`, `onboarding/payment-status`.
- **Merchant portal APIs (under `/api/merchant/`):**  
  `merchant/store-settings`, `merchant/store-settings-activity`, `merchant/store-profile`, `merchant/store-activities`, `merchant/store-status-log`, `merchant/store-image-count`, `merchant/agreement`, `merchant/bank-account/verify`, `merchant/bank-accounts`, `merchant/bank-accounts/[id]`, `merchant/wallet`, `merchant/wallet/ledger`, `merchant/payout-quote`, `merchant/payout-request/[id]`, `merchant/invoice/[payoutRequestId]`, `merchant/subscription`, `merchant/subscription/upgrade`, `merchant/subscription/create-payment-order`, `merchant/subscription/verify-payment`, `merchant/subscription/auto-renew`, `merchant/plans`, `merchant/tickets`, `merchant/tickets/list`, `merchant/tickets/[ticketId]`, `merchant/tickets/messages`, `merchant/tickets/reopen`, `merchant/tickets/rate`, `merchant/reviews`, `merchant/reviews/respond`, `merchant/order-details`, `merchant/onboarding-payments`, `merchant/audit-logs`, `merchant/self-delivery-riders/[id]`, `merchant/pos-integration`, `merchant/menu-items`, `merchant/menu-items/upload-image`.
- **Other:**  
  `menu/route`, `menu/replace-files`, `customizations`, `offers`, `food-orders/*`, `orders`, `withdrawals`, `upload/r2`, `r2/signed-url`, `images/signed-url`, `media/renew-signed-url`, `attachments/proxy`, `next-restaurant-id`, `dashboard-analytics`, `health`, `cleanup-stale-progress`, `send-sms`, `webhooks/rider` (if needed).

Implement each route in dashboard with the same request/response contract; use dashboard DB client and dashboard auth/session.

### 1.4 Merchant Workflows
- Verification logic: Used in area-manager/agent flows; implement in dashboard API routes that approve/reject stores and documents.
- Store onboarding: Multi-step flow (parent → child, documents, payments). Implement in dashboard via existing or new pages and the migrated APIs.
- Payment & operational status: Migrated via merchant wallet, payout, subscription, and store-status APIs above.
- Document management: Migrated via `store/documents`, `merchant/store-settings`, and verification APIs; use dashboard R2/attachments if configured.

---

## 2. Remove Old Auth Flow & Add Registration Forms

- **Remove:** Any dedicated “Sign In / Login” flow that is **only** for the “Merchant Area Manager dashboard” (i.e. a separate merchant-only login that area managers used). The main dashboard login (for agents, area managers, super admin) stays.
- **Add inside Dashboard:**
  - **Parent Registration Form**  
    - Purpose: Register a parent merchant (business owner).  
    - Location: e.g. `/dashboard/merchants/register-parent` or `/auth/register-parent` (if public).  
    - Reuse/port logic from `merchant_db/src/app/auth/register-parent/page.tsx` and related API (`auth/register`, `parent-merchant`).
  - **Child Registration Form**  
    - Purpose: Register a child store under a parent.  
    - Location: e.g. `/dashboard/merchants/register-store` or `/auth/register-store`.  
    - Reuse/port logic from `merchant_db/src/app/auth/register-store/` (multi-step) and APIs (`stores/register`, `auth/register-store-progress`, etc.).
- **Merchant-facing login:** If merchants (parents) log in to the MX portal (e.g. `/mx/dashboard`), keep that flow in dashboard: login → resolve parent → store selection → MX. Port `auth/login-store`, `auth/resolve-parent`, and `auth/post-login` / `auth/search` into dashboard so MX lives under the same app.

---

## 3. Unified Merchant Management Dashboard

Build (or extend) an internal dashboard for the team:

- **Verify store documents** – UI that lists stores with pending documents; agent/AM can approve/reject with reason.
- **Review store operations** – View store status, operating hours, availability, and activity.
- **Manage payment setup/status** – View/edit bank accounts, payout status, subscription/plans.
- **Approve / Reject merchants** – Approve or reject parent or store with reason; update `approval_status` and related fields.
- **Track onboarding progress** – Per-store/per-parent step indicator (e.g. documents, payment, approval).

This should be the central merchant control panel, with:
- **Navigation:** Under `/dashboard/merchants` (and sub-routes: verifications, onboarding, payments, etc.).
- **RBAC:** Only Agent / Area Manager / Super Admin can access; actions gated by role (see §4).

---

## 4. Role-Based Access Control (RBAC)

- **Roles:** Agent, Area Manager, Super Admin (reuse dashboard `system_users` / `dashboard_access` and roles).
- **Permissions:**
  - **Agent:** Limited verification actions (e.g. document verify; no final approval).
  - **Area Manager:** Store onboarding, approvals for their area, assign stores.
  - **Super Admin:** Full system access; override and global settings.
- **Enforcement:** Backend (API routes) must check role/permission for every mutating action; return 403 for unauthorized. Frontend hides/ disables actions the user cannot perform.
- **Implementation:** Use existing dashboard permission helpers and path mapping; add merchant-specific permission checks (e.g. “can approve store”, “can verify document”) and call them from merchant API routes.

---

## 5. Action Logging & Audit Trail

- **Requirement:** Every action by Agent, Area Manager, or Admin must be recorded.
- **Log fields:** Store ID, User ID, Role, Action performed, Timestamp, Status changes (and any other existing fields in `action_audit_log` / `activity` / `merchant_audit_logs`).
- **Implementation:**
  - Reuse dashboard’s existing logging: `lib/audit/logger.ts` (`logActionByAuth`, `logAction`) and `api/audit/track` (and activity tracker).
  - For merchant-scoped actions, also write to `merchant_audit_logs` (port `lib/audit-merchant.ts` and call it from merchant APIs) with `store_id`, `user_id`, role, action, timestamp, status changes.
  - Ensure all merchant verification, approval, onboarding step changes, and payment/status updates go through these loggers.

---

## 6. Super Admin Control Setup

- **Agents:** Use one interface (e.g. Verifications tab) to verify store documents.
- **Area managers:** Use onboarding and store management to onboard merchants and approve within scope.
- **Super Admin:** Sees all activity; can override, change status, and access full merchant list and logs.
- **Configuration:** Ensure dashboard config (env, feature flags) and RBAC allow Super Admin to monitor all activity and that merchant lifecycle (registration → verification → onboarding → approval → active) runs without errors.

---

## 7. Technical Rules

- **Remove dependency on merchant_db:** No imports from merchant_db; no shared packages pointing at merchant_db.
- **Refactor imports:** All migrated code uses `@/lib/...`, `@/app/...` from dashboard root.
- **Modular structure:** Keep merchant APIs under `api/merchant/*` and `api/parent-merchant/*`; merchant lib under `lib/merchant/` and `lib/db/operations/` as needed.
- **No duplicate schemas:** Single source of truth for DB schema (dashboard migrations + dashboard schema.ts or raw SQL); do not copy migration files from merchant_db that duplicate existing dashboard migrations.
- **Backward compatibility:** Existing data in `merchant_stores`, `merchant_parents`, and related tables must remain valid; API contracts should stay compatible with existing clients (e.g. MX app).
- **Stability:** No page reload crashes or broken API calls; test critical paths (login, registration, verification, onboarding, payments).

---

## 8. Final Result Checklist

- [ ] Entire merchant system runs inside Dashboard only.
- [ ] merchant_db folder can be safely deleted (no references from dashboard).
- [ ] Role-based merchant management works (Agent / Area Manager / Super Admin).
- [ ] Verification, onboarding, payments, and tracking work without errors.
- [ ] Parent and Child registration forms exist in Dashboard.
- [ ] Unified merchant control panel (verifications, approvals, onboarding, payments) is available and RBAC-protected.
- [ ] All relevant actions are logged (action_audit_log + merchant_audit_logs where applicable).
- [ ] Super Admin can monitor and control merchant lifecycle from the dashboard.

---

## Execution Order (Suggested)

1. **Phase 1 – Plan & docs** (this file).
2. **Phase 2 – Lib:** Migrate merchant_db lib into dashboard (`lib/merchant/*`, auth/validation/r2/audit-merchant, etc.).
3. **Phase 3 – APIs:** Migrate merchant_db API routes into dashboard; ensure auth and DB use dashboard services.
4. **Phase 4 – Auth & registration:** Add Parent/Child registration pages; align merchant login (resolve-parent, store selection, MX) in dashboard; remove obsolete merchant-only login from flow.
5. **Phase 5 – UI:** Build unified merchant management UI (verifications, onboarding, approvals, payments) and MX portal pages under dashboard.
6. **Phase 6 – RBAC & audit:** Enforce role checks on all merchant APIs; extend audit logging for store_id, user_id, role, status changes.
7. **Phase 7 – Super Admin & polish:** Configure Super Admin access, test full lifecycle, remove any remaining merchant_db references.
