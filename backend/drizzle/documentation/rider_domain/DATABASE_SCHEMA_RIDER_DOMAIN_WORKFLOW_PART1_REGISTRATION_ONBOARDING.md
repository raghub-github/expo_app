# Rider Domain - Workflow Documentation
## Part 1: Registration & Onboarding Process

This document explains **WHICH tables are used** and **IN WHICH ORDER** during the rider registration and onboarding process.

---

## 📋 **WORKFLOW OVERVIEW**

The rider onboarding process follows these steps:
1. **Rider Registration** → `riders`
2. **Document Upload** → `rider_documents`
3. **Device Registration** → `rider_devices`
4. **Vehicle Registration** → `rider_vehicles`
5. **Insurance** → `insurance_policies`
6. **Bank Account** → `rider_bank_accounts`
7. **Onboarding Payment** → `onboarding_payments`
8. **KYC Verification** → `riders.kyc_status` (updated)
9. **Status Tracking** → `blacklist_history` (if blocked)

---

## 🏍️ **STEP 1: RIDER REGISTRATION**

### **Table: `riders`**

**When to Use**: First step - When a rider registers on the platform via mobile number.

**Purpose**: Main table storing rider profile information and status. This is the core rider entity.

**Table Attributes** (Detailed):

```sql
id                          INTEGER PRIMARY KEY  -- Auto-increment rider ID
mobile                      TEXT UNIQUE          -- Primary mobile number (used for login)
name                        TEXT                 -- Rider's full name
onboarding_stage            ENUM                 -- 'MOBILE_VERIFIED', 'KYC', 'PAYMENT', 'APPROVAL', 'ACTIVE'
kyc_status                  ENUM                 -- 'PENDING', 'REJECTED', 'APPROVED', 'REVIEW'
status                      ENUM                 -- 'INACTIVE', 'ACTIVE', 'BLOCKED', 'BANNED'

-- Location
city                        TEXT                 -- City name
state                       TEXT                 -- State name
pincode                     TEXT                 -- Pincode
lat                         DOUBLE PRECISION     -- Current latitude
lon                         DOUBLE PRECISION     -- Current longitude

-- Referral
referral_code               TEXT UNIQUE          -- Unique referral code for this rider
referred_by                 INTEGER              -- ID of rider who referred (FK → riders.id)

-- Profile
email                       TEXT                 -- Email address
date_of_birth               DATE                 -- Date of birth
gender                      TEXT                 -- 'MALE', 'FEMALE', 'OTHER'
profile_image_url           TEXT                 -- Profile image URL

-- Settings
default_language            TEXT                 -- Default language (default: 'en')

-- Audit
created_at                  TIMESTAMP            -- Auto: When rider registered
updated_at                  TIMESTAMP            -- Auto: Last update time
```

**What Happens**:
1. Rider enters mobile number and receives OTP
2. System creates record in `riders` with:
   - `mobile = entered_mobile`
   - `onboarding_stage = 'MOBILE_VERIFIED'`
   - `kyc_status = 'PENDING'`
   - `status = 'INACTIVE'`
   - `referral_code = generated_unique_code`
3. Rider completes profile (name, email, DOB, etc.)
4. System updates `onboarding_stage = 'KYC'` (next step)

**Onboarding Stages Flow**:
```
MOBILE_VERIFIED → KYC → PAYMENT → APPROVAL → ACTIVE
```

**Next Step**: After registration, proceed to **Document Upload (Step 2)**

---

## 📄 **STEP 2: DOCUMENT UPLOAD**

### **Table: `rider_documents`**

**When to Use**: Second step - After mobile verification, rider uploads KYC documents.

**Purpose**: Stores all KYC documents uploaded by riders (Aadhaar, PAN, Driving License, RC, etc.).

**Table Attributes** (Detailed):

```sql
id                          BIGSERIAL PRIMARY KEY
rider_id                    INTEGER FK            -- References riders.id
doc_type                    ENUM                 -- 'aadhaar', 'dl', 'rc', 'pan', 'selfie', 'rental_proof', 'ev_proof'
file_url                    TEXT NOT NULL        -- Document file URL (stored in S3/cloud)
extracted_name              TEXT                 -- Name extracted from document via OCR
extracted_dob               DATE                 -- Date of birth extracted from document
verified                    BOOLEAN              -- Whether document verified by admin
verifier_user_id            INTEGER              -- Admin user who verified
rejected_reason             TEXT                 -- Reason if document was rejected
metadata                    JSONB                -- Additional document metadata

-- Audit
created_at                  TIMESTAMP            -- Auto: When document uploaded
```

**What Happens**:
1. Rider uploads document (e.g., Aadhaar card)
2. System creates record in `rider_documents`:
   - `doc_type = 'aadhaar'`
   - `file_url = uploaded_file_url`
   - `verified = FALSE`
   - OCR extracts name and DOB: `extracted_name`, `extracted_dob`
3. Admin reviews document
4. Admin updates:
   - `verified = TRUE`
   - `verifier_user_id = admin_id`
5. If rejected:
   - `verified = FALSE`
   - `rejected_reason = 'Document unclear'`

**Required Documents** (typically):
- **Aadhaar Card**: Identity proof
- **PAN Card**: Tax identification
- **Driving License (DL)**: License to drive
- **RC (Registration Certificate)**: Vehicle registration
- **Selfie**: Face verification
- **Rental Proof**: If vehicle is rented
- **EV Proof**: If using electric vehicle

**Next Step**: After documents uploaded, proceed to **Device Registration (Step 3)**

---

## 📱 **STEP 3: DEVICE REGISTRATION**

### **Table: `rider_devices`**

**When to Use**: Third step - When rider installs app on their device.

**Purpose**: Tracks all devices used by riders for security and push notifications.

**Table Attributes** (Detailed):

```sql
id                          BIGSERIAL PRIMARY KEY
rider_id                    INTEGER FK            -- References riders.id
device_id                   TEXT NOT NULL        -- Unique device identifier
ip_address                  TEXT                 -- Device IP address
sim_id                      TEXT                 -- SIM card identifier
model                       TEXT                 -- Device model (e.g., "Samsung Galaxy S21")
os_version                  TEXT                 -- Operating system version
fcm_token                   TEXT                 -- Firebase Cloud Messaging token for push notifications
allowed                     BOOLEAN               -- Whether device is allowed (can be blocked for security)
last_seen                   TIMESTAMP            -- Last time device was active

-- Audit
created_at                  TIMESTAMP            -- Auto: When device registered
```

**What Happens**:
1. Rider installs app on device
2. App sends device information to server
3. System creates record in `rider_devices`:
   - `device_id = unique_device_id`
   - `fcm_token = firebase_token`
   - `allowed = TRUE`
   - `last_seen = NOW()`
4. System auto-updates `last_seen` on each app activity
5. If device is suspicious, admin can block:
   - `allowed = FALSE`

**Security Features**:
- Multiple devices can be registered per rider
- Device can be blocked if suspicious activity detected
- `last_seen` helps identify inactive/compromised devices

**Next Step**: After device registered, proceed to **Vehicle Registration (Step 4)**

---

## 🚗 **STEP 4: VEHICLE REGISTRATION**

### **Table: `rider_vehicles`**

**When to Use**: Fourth step - Rider registers their vehicle.

**Purpose**: Stores vehicle details for each rider (bike, car, bicycle, etc.).

**Table Attributes** (Detailed):

```sql
id                          BIGSERIAL PRIMARY KEY
rider_id                    INTEGER FK            -- References riders.id
vehicle_type                TEXT NOT NULL        -- 'bike', 'car', 'bicycle', 'scooter', 'auto'
registration_number         TEXT NOT NULL        -- Vehicle registration number
make                        TEXT                 -- Vehicle manufacturer (e.g., "Honda")
model                       TEXT                 -- Vehicle model (e.g., "Activa")
year                        INTEGER              -- Manufacturing year
color                       TEXT                 -- Vehicle color
insurance_expiry            DATE                 -- Insurance expiry date
rc_document_url             TEXT                 -- Registration certificate document URL
insurance_document_url       TEXT                 -- Insurance document URL
verified                    BOOLEAN               -- Whether vehicle is verified
verified_at                 TIMESTAMP            -- When verified
verified_by                 INTEGER              -- Admin user who verified
is_active                   BOOLEAN               -- Whether this is the active vehicle

-- Audit
created_at                  TIMESTAMP            -- Auto: When vehicle registered
updated_at                  TIMESTAMP            -- Auto: Last update time
```

**What Happens**:
1. Rider enters vehicle details (registration number, make, model, etc.)
2. Rider uploads RC document
3. System creates record in `rider_vehicles`:
   - `vehicle_type = 'bike'`
   - `registration_number = 'DL01AB1234'`
   - `rc_document_url = uploaded_rc_url`
   - `verified = FALSE`
   - `is_active = TRUE` (if first vehicle)
4. Admin verifies vehicle:
   - `verified = TRUE`
   - `verified_by = admin_id`
   - `verified_at = NOW()`
5. Rider can add multiple vehicles, but only one can be `is_active = TRUE`

**Important**: Trigger ensures only **one active vehicle per rider**.

**Next Step**: After vehicle registered, proceed to **Insurance (Step 5)**

---

## 🛡️ **STEP 5: INSURANCE**

### **Table: `insurance_policies`**

**When to Use**: Fifth step - Rider provides insurance policy details.

**Purpose**: Tracks vehicle insurance policies (expiry dates, renewal reminders, etc.).

**Table Attributes** (Detailed):

```sql
id                          BIGSERIAL PRIMARY KEY
rider_id                    INTEGER FK            -- References riders.id
vehicle_id                  BIGINT FK            -- References rider_vehicles.id (optional)
policy_number               TEXT                 -- Insurance policy number
provider                    TEXT                 -- Insurance company name
coverage_amount             NUMERIC              -- Coverage amount
premium_amount              NUMERIC              -- Premium paid
start_date                  DATE                 -- Policy start date
end_date                    DATE                 -- Policy end date
document_url                TEXT                 -- Insurance document URL
status                      TEXT                 -- 'active', 'expired', 'pending', 'cancelled'
renewal_reminder_sent       BOOLEAN               -- Whether renewal reminder was sent

-- Audit
created_at                  TIMESTAMP            -- Auto: When insurance added
updated_at                  TIMESTAMP            -- Auto: Last update time
```

**What Happens**:
1. Rider enters insurance policy details
2. Rider uploads insurance document
3. System creates record in `insurance_policies`:
   - `policy_number = 'POL123456'`
   - `provider = 'Bajaj Allianz'`
   - `start_date = '2024-01-01'`
   - `end_date = '2025-01-01'`
   - `status = 'active'`
4. System checks expiry dates and updates `status = 'expired'` when expired
5. System sends renewal reminders before expiry

**Next Step**: After insurance added, proceed to **Bank Account (Step 6)**

---

## 🏦 **STEP 6: BANK ACCOUNT**

### **Table: `rider_bank_accounts`**

**When to Use**: Sixth step - Rider adds bank account for receiving payouts.

**Purpose**: Stores rider bank account information for withdrawals and payouts.

**Table Attributes** (Detailed):

```sql
id                          BIGSERIAL PRIMARY KEY
rider_id                    INTEGER FK            -- References riders.id
account_holder_name         TEXT                 -- Account holder name
account_number              TEXT                 -- Bank account number (ENCRYPTED)
ifsc_code                   TEXT                 -- IFSC code
bank_name                   TEXT                 -- Bank name
branch_name                 TEXT                 -- Branch name
account_type                TEXT                 -- 'savings', 'current'
is_primary                  BOOLEAN               -- Whether this is the primary account
is_verified                 BOOLEAN               -- Whether account is verified
verified_at                 TIMESTAMP            -- When account was verified

-- Audit
created_at                  TIMESTAMP            -- Auto: When bank account added
updated_at                  TIMESTAMP            -- Auto: Last update time
```

**What Happens**:
1. Rider enters bank account details
2. System creates record in `rider_bank_accounts`:
   - `account_number = encrypted_account_number`
   - `ifsc_code = 'HDFC0001234'`
   - `is_primary = TRUE` (if first account)
   - `is_verified = FALSE`
3. System verifies account (via bank API or manual verification)
4. Updates `is_verified = TRUE`, `verified_at = NOW()`
5. Rider can add multiple accounts, but only one can be `is_primary = TRUE`

**Important**: Account number is **ENCRYPTED** - never store plain text.

**Next Step**: After bank account added, proceed to **Onboarding Payment (Step 7)**

---

## 💳 **STEP 7: ONBOARDING PAYMENT**

### **Table: `onboarding_payments`**

**When to Use**: Seventh step - Rider pays onboarding fee (if applicable).

**Purpose**: Tracks onboarding fee payments made by riders.

**Table Attributes** (Detailed):

```sql
id                          BIGSERIAL PRIMARY KEY
rider_id                    INTEGER FK            -- References riders.id
amount                      NUMERIC(10,2)         -- Payment amount
provider                    TEXT NOT NULL        -- Payment provider ('razorpay', 'stripe', etc.)
ref_id                      TEXT UNIQUE          -- Reference ID (unique)
payment_id                  TEXT                 -- Payment gateway payment ID
status                      TEXT                 -- 'pending', 'completed', 'failed', 'refunded'
metadata                    JSONB                -- Additional payment data

-- Audit
created_at                  TIMESTAMP            -- Auto: When payment initiated
updated_at                  TIMESTAMP            -- Auto: Last update time
```

**What Happens**:
1. Rider initiates onboarding fee payment (e.g., ₹500)
2. System creates record in `onboarding_payments`:
   - `amount = 500.00`
   - `provider = 'razorpay'`
   - `ref_id = unique_ref_id`
   - `status = 'pending'`
3. Payment gateway processes payment
4. Webhook updates:
   - `status = 'completed'`
   - `payment_id = gateway_payment_id`
5. System updates `riders.onboarding_stage = 'PAYMENT'` (completed)

**Next Step**: After payment completed, proceed to **KYC Verification (Step 8)**

---

## ✅ **STEP 8: KYC VERIFICATION**

### **Table: `riders` (KYC Status Update)**

**When to Use**: Eighth step - Admin verifies all documents and approves/rejects KYC.

**Purpose**: Updates KYC status in `riders` table after document verification.

**What Happens**:
1. Admin reviews all uploaded documents (`rider_documents`)
2. Admin verifies each document:
   - Updates `rider_documents.verified = TRUE`
3. After all documents verified, admin approves KYC:
   - Updates `riders.kyc_status = 'APPROVED'`
   - Updates `riders.onboarding_stage = 'APPROVAL'`
4. If documents are insufficient:
   - Updates `riders.kyc_status = 'REJECTED'`
   - Updates `rider_documents.rejected_reason = 'reason'`
5. Final approval:
   - Updates `riders.status = 'ACTIVE'`
   - Updates `riders.onboarding_stage = 'ACTIVE'`

**KYC Status Flow**:
```
PENDING → REVIEW → APPROVED
              ↓
          REJECTED
              ↓
         (can resubmit)
```

**Next Step**: After KYC approved, rider is **ACTIVE** and can start accepting orders

---

## 🚫 **STEP 9: BLACKLIST HISTORY (If Blocked)**

### **Table: `blacklist_history`**

**When to Use**: When rider needs to be blocked/banned - Admin blocks rider.

**Purpose**: Tracks when riders are blacklisted/banned and reasons.

**Table Attributes** (Detailed):

```sql
id                          BIGSERIAL PRIMARY KEY
rider_id                    INTEGER FK            -- References riders.id
reason                      TEXT NOT NULL        -- Reason for blacklisting
banned                      BOOLEAN               -- Whether rider is banned (TRUE) or unbanned (FALSE)
admin_user_id               INTEGER              -- Admin who performed the action

-- Audit
created_at                  TIMESTAMP            -- Auto: When action was taken
```

**What Happens**:
1. Admin blocks rider (e.g., for fraud, policy violation)
2. System creates record in `blacklist_history`:
   - `reason = 'Fraudulent activity detected'`
   - `banned = TRUE`
   - `admin_user_id = admin_id`
3. System updates `riders.status = 'BLOCKED'` or `'BANNED'`
4. If rider is unbanned:
   - New record: `banned = FALSE`
   - Updates `riders.status = 'ACTIVE'`

**This is an IMMUTABLE log** - never update or delete records.

---

## 🔗 **RELATIONSHIPS IN REGISTRATION FLOW**

```
riders (1)
    ↓
    ├─→ rider_documents (many)
    ├─→ rider_devices (many)
    ├─→ rider_vehicles (many)
    │       └─→ insurance_policies (many)
    ├─→ rider_bank_accounts (many)
    ├─→ onboarding_payments (many)
    └─→ blacklist_history (many)
```

---

## 📝 **SUMMARY: REGISTRATION & ONBOARDING TABLES**

| Step | Table | Purpose | Key Fields |
|------|-------|---------|------------|
| 1 | `riders` | Rider registration | `mobile`, `onboarding_stage`, `kyc_status`, `status` |
| 2 | `rider_documents` | Document upload | `doc_type`, `file_url`, `verified` |
| 3 | `rider_devices` | Device registration | `device_id`, `fcm_token`, `allowed` |
| 4 | `rider_vehicles` | Vehicle registration | `vehicle_type`, `registration_number`, `verified` |
| 5 | `insurance_policies` | Insurance details | `policy_number`, `end_date`, `status` |
| 6 | `rider_bank_accounts` | Bank account | `account_number`, `ifsc_code`, `is_primary` |
| 7 | `onboarding_payments` | Onboarding payment | `amount`, `status`, `payment_id` |
| 8 | `riders` (update) | KYC verification | `kyc_status`, `onboarding_stage`, `status` |
| 9 | `blacklist_history` | Block/unblock | `reason`, `banned`, `admin_user_id` |

**Total Tables in Part 1**: 8 tables (including updates to `riders`)

---

**Next**: See `DATABASE_SCHEMA_RIDER_DOMAIN_WORKFLOW_PART2_OPERATIONS_EARNINGS.md` for duty management, location tracking, wallet, earnings, and withdrawals.
