# Rider Onboarding System – Full Redesign (Implementation Plan)

**Audience:** Senior System Architect / Database Designer  
**Scope:** Multi-service delivery and mobility (Food, Parcel, Person Ride)  
**Design principles:** State-machine-driven, rule-engine-based, fraud-resistant, compliance-ready, scalable.

---

## 1. Architecture Overview

### 1.1 Recommended Stack

- **Backend:** Modular monolith (single deployable, domain modules: rider-onboarding, verification, service-activation, rule-engine). Microservices only if team size and scale justify (e.g. separate Document Verification Service with async queue).
- **Database:** PostgreSQL (Supabase). Single DB with clear domain boundaries; partition high-volume tables (e.g. `wallet_ledger`, `location_logs`) when needed.
- **Verification:** Event-driven for heavy checks (OCR, face match, DL/RC validation). Synchronous for quick checks (duplicate doc, fraud flags). Queue (e.g. BullMQ/Inngest) for async verification jobs; webhook/callback to update `rider_documents` and trigger service-activation pipeline.
- **Service activation:** Synchronous post-verification: on document approval, run **Service Activation Engine** in same transaction or immediately after (transactional outbox if async).

### 1.2 High-Level Data Flow

```
Rider Reg → KYC Docs → Document Verification (OCR / Face / DL/RC / Manual fallback)
    → Fraud & Duplicate checks → Approval/Reject
    → Onboarding Status Transition → Service Activation Engine (rule-based)
    → Rider-Vehicle-Service matrix updated → UI reflects active services
```

### 1.3 Existing vs New Components

- **Existing:** `riders`, `rider_documents`, `rider_document_files`, `rider_vehicles`, `vehicle_service_mapping`, `city_vehicle_rules`, `service_types`, `onboarding_stage`, `kyc_status`, `rider_status`, `rider_payment_methods`, `onboarding_payments`.
- **New:** `rider_service_activation` (per-rider per-service status + limitations), `onboarding_status_transitions` (state-machine log), `onboarding_rule_policies` (configurable rules), document fraud/duplicate fields, vehicle ownership/limitation fields, extended `vehicle_type` and seed mapping for all transport modes.

---

## 2. Database Schema (Summary)

- **Core:** `riders`, `rider_documents`, `rider_document_files`, `rider_vehicles`.
- **Reference:** `cities`, `service_types`, `vehicle_service_mapping`, `city_vehicle_rules`.
- **Activation & state:** `rider_service_activation`, `onboarding_status_transitions`.
- **Rules:** `onboarding_rule_policies`.
- **Audit:** `admin_action_logs`, `action_audit_log`; document/verification events in `rider_documents.metadata` or separate `document_verification_events` if needed.

---

## 3. Table Design (Detailed)

### 3.1 Enums (Existing + New/Extended)

- **vehicle_type:** Extend with `taxi`, `e_rickshaw`, `ev_car` (keep `bike` = petrol bike, `ev_bike`, `cycle`, `car`, `auto`, `cng_auto`, `ev_auto`, `other`).
- **ownership_type (new):** `ownership`, `rental`, `authorization_letter` – for vehicles where DL+RC not submitted.
- **service_activation_status (new):** `inactive`, `active`, `limited`, `suspended` – per rider-service.
- **onboarding_rule_scope (new):** `global`, `city`, `service`, `vehicle_type`.

### 3.2 riders (Existing – No Structural Change)

- Keep: `id`, `mobile`, `name`, `onboarding_stage`, `kyc_status`, `status`, `vehicle_choice`, `preferred_service_types`, soft delete, audit columns.
- `vehicle_choice` / vehicle-specific data live in `rider_vehicles` and `rider_service_activation`; do not add vehicle fields to `riders`.

### 3.3 rider_documents (Existing + New Columns)

- **New columns:**  
  - `fraud_flags` JSONB (e.g. `{ "face_mismatch": false, "duplicate_suspected": true }`).  
  - `duplicate_document_id` BIGINT FK to `rider_documents.id)` – set when same doc number found for another rider/document.  
  - `requires_manual_review` BOOLEAN DEFAULT false – set by automation when confidence low or fraud flag.  
  - `verification_method` (existing in dashboard: APP_VERIFIED | MANUAL_UPLOAD).  
- **Existing:** `rider_id`, `doc_type`, `file_url`, `r2_key`, `doc_number`, `verification_status`, `verified`, `verified_at`, `verified_by`, `vehicle_id`, `metadata`, etc.

### 3.4 rider_vehicles (Existing + New Columns)

- **New columns:**  
  - `ownership_type` TEXT – `ownership` | `rental` | `authorization_letter` (when DL+RC not submitted; for bike/EV bike without DL+RC).  
  - `limitation_flags` JSONB – e.g. `{ "max_radius_km": 10, "no_intercity": true }` for limited activation.  
- **Existing:** `is_commercial` (boolean), `vehicle_type`, `registration_number`, `service_types` (jsonb), `vehicle_active_status`, `verified`, etc.  
- **Constraint:** One rider can have multiple vehicles; each vehicle has its own `vehicle_type` and optional `service_types` (derived from vehicle-service mapping + rules).

### 3.5 rider_service_activation (New Table)

- **Purpose:** Per-rider, per-service (food, parcel, person_ride) activation status and limitations.  
- **Columns:**  
  - `id` BIGSERIAL PK.  
  - `rider_id` INT NOT NULL FK → riders(id).  
  - `service_type_id` BIGINT NOT NULL FK → service_types(id).  
  - `status` service_activation_status NOT NULL DEFAULT 'inactive'.  
  - `activated_at` TIMESTAMPTZ.  
  - `deactivated_at` TIMESTAMPTZ.  
  - `vehicle_id` BIGINT NULL FK → rider_vehicles(id) – primary vehicle for this service (if any).  
  - `limitation_flags` JSONB – e.g. radius limit, no intercity.  
  - `activated_by_rule_id` BIGINT NULL FK → onboarding_rule_policies(id).  
  - `created_at`, `updated_at` TIMESTAMPTZ.  
- **Unique:** (rider_id, service_type_id).  
- **Indexes:** rider_id, service_type_id, status, (rider_id, status).

### 3.6 onboarding_status_transitions (New Table – State Machine Log)

- **Purpose:** Audit trail of onboarding_stage / kyc_status / rider_status changes.  
- **Columns:**  
  - `id` BIGSERIAL PK.  
  - `rider_id` INT NOT NULL FK → riders(id).  
  - `from_stage` TEXT, `to_stage` TEXT (onboarding_stage).  
  - `from_kyc` TEXT, `to_kyc` TEXT (kyc_status).  
  - `from_status` TEXT, `to_status` TEXT (rider_status).  
  - `trigger_type` TEXT – 'document_approval' | 'manual' | 'rule' | 'payment' | 'verification'.  
  - `trigger_ref_id` BIGINT (e.g. document id, rule id).  
  - `performed_by_system_user_id` BIGINT NULL FK → system_users(id).  
  - `created_at` TIMESTAMPTZ DEFAULT NOW().  
- **Indexes:** rider_id, created_at, (rider_id, created_at).

### 3.7 onboarding_rule_policies (New Table – Rule Engine)

- **Purpose:** Configurable rules for commercial-only, EV incentives, mandatory documents, service eligibility by vehicle/city.  
- **Columns:**  
  - `id` BIGSERIAL PK.  
  - `rule_code` TEXT NOT NULL UNIQUE.  
  - `rule_name` TEXT NOT NULL.  
  - `scope` onboarding_rule_scope NOT NULL – global, city, service, vehicle_type.  
  - `scope_ref_id` BIGINT NULL (city_id or service_type_id or vehicle_type enum value stored as text).  
  - `rule_type` TEXT NOT NULL – e.g. 'commercial_required', 'ev_incentive', 'mandatory_documents', 'service_eligibility'.  
  - `rule_config` JSONB NOT NULL – e.g. `{ "required_document_types": ["dl","rc"], "allowed_services": ["food","parcel"] }`.  
  - `effective_from` TIMESTAMPTZ, `effective_to` TIMESTAMPTZ.  
  - `is_active` BOOLEAN NOT NULL DEFAULT true.  
  - `priority` INT DEFAULT 0 (higher = applied first).  
  - `created_at`, `updated_at` TIMESTAMPTZ.  
- **Indexes:** rule_code, is_active, scope, (is_active, effective_from, effective_to).

### 3.8 vehicle_service_mapping (Existing – Seed Data)

- **Purpose:** Which vehicle_type can do which service (global).  
- **Seed:** For each (vehicle_type, service_type_id) insert allowed=true/false per business rules (e.g. cycle → food only; car/taxi → person_ride default; bike/ev_bike → all three when docs ok; auto/e_rickshaw → all three).

### 3.9 city_vehicle_rules (Existing)

- **Purpose:** City/service overrides (e.g. commercial-only for person_ride in city X).  
- **rule_type / rule_config:** Used by rule engine; no schema change needed.

### 3.10 Soft Delete & Audit

- **riders:** `deleted_at`, `deleted_by`, `created_by`, `updated_by`.  
- **rider_vehicles:** `deleted_at`, `deleted_by`.  
- **rider_documents:** No soft delete; keep full history. Use `verification_status` and `rejected_reason` for reject flow.

---

## 4. Status Engine

- **Onboarding stages:** MOBILE_VERIFIED → KYC → PAYMENT → APPROVAL → ACTIVE. Transitions driven by: document approval (KYC→APPROVAL), payment success (PAYMENT done), manual approval (APPROVAL→ACTIVE). Every transition logged in `onboarding_status_transitions`.
- **KYC status:** PENDING → REVIEW → APPROVED | REJECTED. Reject allows resubmission (new document row or re-review).
- **Rider status:** INACTIVE → ACTIVE; BLOCKED/BANNED via blacklist_history.
- **Per-service activation:** `rider_service_activation.status`: inactive | active | limited | suspended. Engine computes from: vehicle_service_mapping + document completeness + onboarding_rule_policies + city_vehicle_rules. No enums scattered; single source in `rider_service_activation` and optionally cached on `rider_vehicles.service_types` (jsonb) for read performance.

---

## 5. Verification Engine

- **OCR extraction:** Store in `rider_documents`: `extracted_name`, `extracted_dob`, `doc_number`, `metadata.ocr_raw`.
- **Face match (selfie vs Aadhaar):** Store result in `metadata.face_match_score`, `metadata.face_match_verified`; on failure set `requires_manual_review = true`.
- **DL/RC validation:** Optional external API; result in `metadata.dl_valid`, `metadata.rc_valid`; expiry in `expiry_date`.
- **Fraud flags:** `fraud_flags` jsonb; e.g. `duplicate_document_id` when same doc number found elsewhere.
- **Duplicate detection:** Before approve, query `rider_documents` by `doc_number` (and doc_type); if match on another rider, set `duplicate_document_id` and `requires_manual_review = true`.
- **Manual review fallback:** When `requires_manual_review = true` or verification_status = 'pending', dashboard shows queue for agent approve/reject.

---

## 6. Service Activation Logic

- **Inputs:** Rider id, vehicle(s), documents (verified), city (if available), rule_policies.
- **Steps:**
  1. Resolve vehicle_type(s) and ownership_type (DL+RC vs rental/ownership proof).
  2. For each service_type (food, parcel, person_ride):
     - Check vehicle_service_mapping (vehicle_type → service allowed).
     - Check onboarding_rule_policies (city, vehicle_type, commercial, etc.).
     - Check document completeness per service/vehicle (e.g. cycle: aadhaar, pan, selfie, bank; bike with DL+RC: all services; bike without DL+RC: limited + ownership/rental/authorization).
  3. Set `rider_service_activation.status` = active | limited | inactive; set `limitation_flags` when limited (e.g. radius, no intercity).
  4. On approval of a document or vehicle, run this engine and persist; optionally emit event for UI/notifications.

**Cycle:** Food only; limited radius (from rule or limitation_flags).  
**EV/Petrol bike with DL+RC:** All services.  
**EV/Petrol bike without DL+RC:** All services with limitations (ownership/rental/authorization proof required).  
**Auto/E-Rickshaw:** All three services after verification.  
**Car/Taxi/EV Car:** Default person_ride only; food+parcel after bike documents (DL+RC for bike) verified and linked to same rider.

---

## 7. Upgrade Flow

- **Upgrade vehicle (e.g. cycle → motor):** Rider adds new vehicle in `rider_vehicles` (vehicle_type = ev_bike/bike). Upload DL+RC; on approval, service activation engine runs and expands services (e.g. food+parcel+person_ride). Log in `onboarding_status_transitions` with trigger_type = 'document_approval'.
- **Add second vehicle (e.g. car + bike):** Second row in `rider_vehicles`. Bike documents enable food/parcel; car already enables person_ride. Engine merges services; `rider_service_activation` can show multiple vehicle_id or single “primary” per service.
- **Downgrade:** Deactivate vehicle (vehicle_active_status = inactive) or soft delete; run activation engine again so services shrink (e.g. remove parcel if only bike was providing it).

---

## 8. Rule Engine Design

- **Storage:** `onboarding_rule_policies` (rule_code, scope, rule_type, rule_config, effective_from/to, is_active, priority).
- **Evaluation:** By scope (global → city → service → vehicle_type); filter by effective date; sort by priority; apply in order. Examples:
  - commercial_required: `rule_config = { "city_id": 1, "service_type": "person_ride" }` → in that city, only commercial vehicles allowed for person_ride.
  - ev_incentive: `rule_config = { "vehicle_types": ["ev_bike","ev_car"], "bonus_type": "reduced_commission" }`.
  - mandatory_documents: `rule_config = { "vehicle_type": "bike", "doc_types": ["aadhaar","pan","selfie","dl","rc"] }`.
- **No hardcoding:** All such rules in DB; backend reads and evaluates in Service Activation Engine.

---

## 9. UI Flow

- **Upgrade vehicle:** Screen “Add vehicle” → select type → upload DL+RC or ownership/rental/authorization → submit → status “Under review” → on approval, show “Services updated” and refreshed service toggles.
- **Add second vehicle:** Same as add vehicle; list of vehicles with primary/secondary; service matrix shows which vehicle enables which service.
- **Service toggle visibility:** Show only services that are active or limited (with explanation). Grey out inactive; show “Complete X to unlock”.
- **Status screen:** Single place showing onboarding_stage, kyc_status, per-service status (active/limited/inactive), document status per type, and next steps.

---

## 10. Automation Design

- **On document verify approval:** Webhook or inline after DB commit: run Service Activation Engine for that rider; update `rider_service_activation` and optionally `riders.onboarding_stage` / `riders.kyc_status`; insert `onboarding_status_transitions`. No manual ops dependency for standard path.
- **Scheduled:** Optional job to re-run activation for riders in certain cities when rule_policies change (effective_from).

---

## 11. Fraud Prevention

- **fraud_flags** on rider_documents; **duplicate_document_id**; **requires_manual_review**.
- Duplicate detection: index on (doc_number, doc_type) or query before approve.
- Store verification confidence in metadata; below threshold → requires_manual_review.

---

## 12. Compliance Layer

- **onboarding_rule_policies** hold future rules: commercial-only, EV incentives, insurance validation, background checks, vehicle fitness. rule_type + rule_config; no app code change for new rule types, only config.

---

## 13. Scaling Strategy

- Read replicas for dashboard queries; write to primary. Partition wallet_ledger, location_logs by rider_id or time. Index rider_service_activation by rider_id and status. Cache rider’s active services in Redis if needed for matching.

---

## 14. Common Startup Mistakes to Avoid

- Do not store vehicle fields (e.g. vehicle_type, registration_number) in `riders`; use `rider_vehicles`.
- Do not hardcode services or vehicle–service matrix; use `vehicle_service_mapping` and `onboarding_rule_policies`.
- Do not use booleans for multi-state (e.g. service on/off); use status (inactive/active/limited) in `rider_service_activation`.
- Do not skip state-machine log (`onboarding_status_transitions`); required for audit and debugging.
- Do not forget soft delete and audit columns on core entities.

---

**Next:** Run the SQL migration `0085_rider_onboarding_system_redesign.sql` to create new enums, tables, and columns.
