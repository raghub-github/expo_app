# Customer Domain - Part 1: Core & Authentication

## 👤 **CUSTOMER CORE TABLES**

### 1. **`customers`** - Core Customer Profile
**Purpose**: Main table storing customer profile information and account status.

**Key Attributes**:
- `id` (BIGSERIAL, PRIMARY KEY) - Auto-increment customer ID
- `customer_id` (TEXT, UNIQUE) - Human-readable customer ID (e.g., "CUST-123456")
- `full_name` (TEXT) - Customer's full name
- `first_name`, `last_name` (TEXT) - Name components
- `email` (TEXT, UNIQUE) - Email address
- `email_verified` (BOOLEAN) - Whether email is verified
- `primary_mobile` (TEXT, UNIQUE) - Primary mobile number (used for login)
- `primary_mobile_normalized` (TEXT) - Normalized mobile (for matching)
- `primary_mobile_country_code` (TEXT) - Country code (default: '+91')
- `mobile_verified` (BOOLEAN) - Whether mobile is verified
- `alternate_mobile`, `whatsapp_number` (TEXT) - Additional contact numbers
- `gender` (ENUM) - `male`, `female`, `other`, `prefer_not_to_say`
- `date_of_birth` (DATE) - Date of birth
- `profile_image_url` (TEXT) - Profile picture URL
- `bio` (TEXT) - Customer bio/description
- `preferred_language` (TEXT) - Language preference (default: 'en')
- `referral_code` (TEXT, UNIQUE) - Unique referral code
- `referred_by` (TEXT) - Referral code of referrer
- `referrer_customer_id` (BIGINT, FK → customers.id) - Referrer customer ID
- `account_status` (ENUM) - `ACTIVE`, `INACTIVE`, `SUSPENDED`, `BLOCKED`, `DELETED`
- `status_reason` (TEXT) - Reason for status change
- `risk_flag` (ENUM) - `LOW`, `MEDIUM`, `HIGH`, `CRITICAL`
- `trust_score` (NUMERIC) - Trust score (0-100, default: 100.0)
- `fraud_score` (NUMERIC) - Fraud risk score (0-100, default: 0.0)
- `wallet_balance` (NUMERIC) - Current wallet balance
- `wallet_locked_amount` (NUMERIC) - Locked wallet amount (for pending orders)
- `is_identity_verified`, `is_email_verified`, `is_mobile_verified` (BOOLEAN) - Verification flags
- `last_login_at`, `last_order_at`, `last_activity_at` (TIMESTAMP) - Activity timestamps
- `deleted_at`, `deleted_by`, `deletion_reason` (TIMESTAMP/INTEGER/TEXT) - Soft delete fields
- `created_at`, `updated_at` (TIMESTAMP) - Auto-managed timestamps
- `created_via` (TEXT) - `app`, `web`, `admin`
- `updated_by` (TEXT) - Who last updated

**When to Update**:
- ✅ Auto-updated: `updated_at` (via trigger), `last_login_at`, `last_order_at`, `last_activity_at`
- ⚠️ Manual update: `account_status`, `risk_flag`, `trust_score`, `fraud_score` (by admin/system)
- 🔒 Never update: `id`, `customer_id`, `primary_mobile`, `created_at`

**Relationships**:
- Self-referencing: `referrer_customer_id` → `customers.id`
- Referenced by: All customer-related tables

---

### 2. **`customer_auth`** - Authentication Data
**Purpose**: Stores sensitive authentication data separately from profile (security best practice).

**Key Attributes**:
- `id` (BIGSERIAL, PRIMARY KEY)
- `customer_id` (BIGINT, FK → customers.id, UNIQUE) - One auth record per customer
- `auth_provider` (TEXT) - `phone`, `email`, `google`, `facebook`
- `auth_uid` (TEXT) - Provider's user ID (for OAuth)
- `last_otp` (TEXT) - Last OTP sent (encrypted)
- `last_otp_sent_at` (TIMESTAMP) - When OTP was sent
- `otp_attempts` (INTEGER) - Number of OTP attempts (for rate limiting)
- `otp_locked_until` (TIMESTAMP) - Account locked until (if too many failed attempts)
- `password_hash`, `password_salt` (TEXT) - Password hash and salt (if password auth)
- `password_last_changed_at` (TIMESTAMP) - When password was last changed
- `two_factor_enabled` (BOOLEAN) - Whether 2FA is enabled
- `two_factor_secret` (TEXT) - 2FA secret (encrypted)
- `recovery_email`, `recovery_mobile` (TEXT) - Account recovery contacts
- `created_at`, `updated_at` (TIMESTAMP) - Auto-managed

**When to Update**:
- ✅ Auto-updated: `updated_at` (via trigger), `last_otp_sent_at`, `otp_attempts`
- ⚠️ Manual update: `password_hash`, `password_salt`, `two_factor_enabled` (by auth system)
- 🔒 Never update: `id`, `customer_id`, `created_at`

**Relationships**:
- References: `customers.id` (1:1 relationship)

**Security Note**: This table contains sensitive data. Access should be restricted.

---

### 3. **`customer_devices`** - Device Management
**Purpose**: Tracks all devices used by customers for security and push notifications.

**Key Attributes**:
- `id` (BIGSERIAL, PRIMARY KEY)
- `customer_id` (BIGINT, FK → customers.id)
- `device_id` (TEXT) - Unique device identifier
- `device_fingerprint` (TEXT) - Device fingerprint for fraud detection
- `device_type` (ENUM) - `android`, `ios`, `web`
- `device_os`, `device_os_version` (TEXT) - OS information
- `device_model`, `device_brand` (TEXT) - Device hardware info
- `app_version`, `app_build_number` (TEXT) - App version info
- `ip_address`, `ip_location` (TEXT) - Network information
- `network_type` (TEXT) - `WIFI`, `4G`, `5G`
- `fcm_token`, `apns_token` (TEXT) - Push notification tokens
- `push_enabled` (BOOLEAN) - Whether push notifications are enabled
- `is_primary` (BOOLEAN) - Whether this is the primary device
- `is_trusted` (BOOLEAN) - Whether device is trusted (for 2FA bypass)
- `is_active` (BOOLEAN) - Whether device is currently active
- `first_seen_at`, `last_active_at` (TIMESTAMP) - Activity timestamps
- `last_ip` (TEXT) - Last known IP address
- `created_at`, `updated_at` (TIMESTAMP) - Auto-managed

**When to Update**:
- ✅ Auto-updated: `last_active_at`, `last_ip`, `updated_at` (on each app activity)
- ⚠️ Manual update: `is_primary`, `is_trusted`, `push_enabled`, `fcm_token` (by customer or system)
- 🔒 Never update: `id`, `customer_id`, `device_id`, `first_seen_at`, `created_at`

**Relationships**:
- References: `customers.id`
- Used by: Push notification system, security monitoring, fraud detection

---

### 4. **`customer_sessions`** - Active Sessions
**Purpose**: Tracks active customer sessions for authentication and security.

**Key Attributes**:
- `id` (BIGSERIAL, PRIMARY KEY)
- `customer_id` (BIGINT, FK → customers.id)
- `device_id` (BIGINT, FK → customer_devices.id) - Optional device reference
- `session_token` (TEXT, UNIQUE) - Session token (JWT or similar)
- `refresh_token` (TEXT) - Refresh token for token renewal
- `ip_address`, `user_agent` (TEXT) - Session metadata
- `location_lat`, `location_lon` (NUMERIC) - Location where session was created
- `is_active` (BOOLEAN) - Whether session is active
- `created_at` (TIMESTAMP) - When session was created
- `expires_at` (TIMESTAMP) - When session expires
- `last_activity_at` (TIMESTAMP) - Last activity timestamp
- `logged_out_at` (TIMESTAMP) - When session was logged out

**When to Update**:
- ✅ Auto-updated: `last_activity_at` (on each request), `is_active` (on logout)
- ⚠️ Manual update: `logged_out_at` (on logout)
- 🔒 Never update: `id`, `customer_id`, `session_token`, `created_at`, `expires_at`

**Relationships**:
- References: `customers.id`, `customer_devices.id` (optional)
- Used by: Authentication middleware, session management

**Note**: Expired sessions should be cleaned up periodically.

---

### 5. **`customer_profiles_history`** - Profile Change History
**Purpose**: Immutable audit trail of all profile changes.

**Key Attributes**:
- `id` (BIGSERIAL, PRIMARY KEY)
- `customer_id` (BIGINT, FK → customers.id)
- `field_name` (TEXT) - Name of field that changed
- `old_value`, `new_value` (TEXT) - Old and new values
- `change_reason` (TEXT) - Reason for change
- `changed_by` (TEXT) - `CUSTOMER`, `ADMIN`, `SYSTEM`
- `changed_by_id` (INTEGER) - ID of user who made change
- `created_at` (TIMESTAMP) - When change occurred

**When to Update**:
- ✅ Auto-updated: `created_at`
- 🔒 Never update: This is an **immutable audit log** - never update or delete

**Relationships**:
- References: `customers.id`
- Used by: Audit reports, compliance, customer support

**Note**: Trigger should automatically create records when profile fields change.

---

## 🔗 **RELATIONSHIPS**

```
customers (1) ──→ (1) customer_auth
customers (1) ──→ (many) customer_devices
customers (1) ──→ (many) customer_sessions
customers (1) ──→ (many) customer_profiles_history
customer_devices (1) ──→ (many) customer_sessions
```

---

## 📊 **SUMMARY**

| Table | Purpose | Key Features |
|-------|---------|--------------|
| `customers` | Core profile | Main customer data, account status, wallet balance |
| `customer_auth` | Authentication | OTP, passwords, 2FA (sensitive data) |
| `customer_devices` | Device tracking | Security, push notifications |
| `customer_sessions` | Session management | Active sessions, tokens |
| `customer_profiles_history` | Audit trail | Immutable change history |

**Total**: 5 tables in Part 1

---

**Next**: See `DATABASE_SCHEMA_CUSTOMER_DOMAIN_PART2_ADDRESSES_PREFERENCES.md` for addresses and preferences tables.
