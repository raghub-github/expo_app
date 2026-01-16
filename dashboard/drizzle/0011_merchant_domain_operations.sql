-- ============================================================================
-- MERCHANT DOMAIN SCHEMA - Operations, Financial, Access Control
-- GatiMitra Multi-Service Platform
-- Migration: 0011_merchant_domain_operations
-- Database: Supabase PostgreSQL
-- ============================================================================

-- ============================================================================
-- PHASE 5: OPERATIONS
-- ============================================================================

-- Store Operating Hours
CREATE TABLE IF NOT EXISTS merchant_store_operating_hours (
  id BIGSERIAL PRIMARY KEY,
  store_id BIGINT NOT NULL REFERENCES merchant_stores(id) ON DELETE CASCADE,
  day_of_week day_of_week NOT NULL,
  
  -- Hours
  is_open BOOLEAN DEFAULT TRUE,
  slot1_start TIME,
  slot1_end TIME,
  slot2_start TIME,
  slot2_end TIME,
  
  -- Duration
  total_duration_minutes INTEGER,
  
  -- 24/7 Configuration
  is_24_hours BOOLEAN DEFAULT FALSE,
  same_for_all_days BOOLEAN DEFAULT FALSE,
  
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  
  UNIQUE(store_id, day_of_week)
);

CREATE INDEX IF NOT EXISTS merchant_store_operating_hours_store_id_idx ON merchant_store_operating_hours(store_id);
CREATE INDEX IF NOT EXISTS merchant_store_operating_hours_day_idx ON merchant_store_operating_hours(day_of_week);

-- Store Real-Time Availability
CREATE TABLE IF NOT EXISTS merchant_store_availability (
  id BIGSERIAL PRIMARY KEY,
  store_id BIGINT NOT NULL REFERENCES merchant_stores(id) ON DELETE CASCADE,
  
  -- Availability Status
  is_available BOOLEAN DEFAULT TRUE,
  is_accepting_orders BOOLEAN DEFAULT TRUE,
  unavailable_reason TEXT,
  
  -- Auto-Unavailable
  auto_unavailable_at TIMESTAMP WITH TIME ZONE,
  auto_available_at TIMESTAMP WITH TIME ZONE,
  
  -- Current Load
  current_pending_orders INTEGER DEFAULT 0,
  max_concurrent_orders INTEGER DEFAULT 20,
  
  -- Updated By
  updated_by TEXT, -- 'MERCHANT', 'SYSTEM', 'ADMIN'
  updated_by_id INTEGER,
  
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  
  UNIQUE(store_id)
);

CREATE INDEX IF NOT EXISTS merchant_store_availability_store_id_idx ON merchant_store_availability(store_id);
CREATE INDEX IF NOT EXISTS merchant_store_availability_is_available_idx ON merchant_store_availability(is_available) WHERE is_available = TRUE;

-- Store Holidays
CREATE TABLE IF NOT EXISTS merchant_store_holidays (
  id BIGSERIAL PRIMARY KEY,
  store_id BIGINT NOT NULL REFERENCES merchant_stores(id) ON DELETE CASCADE,
  
  -- Holiday Details
  holiday_name TEXT NOT NULL,
  holiday_type TEXT, -- 'PUBLIC', 'STORE_SPECIFIC', 'EMERGENCY'
  holiday_date DATE NOT NULL,
  
  -- Duration
  is_full_day BOOLEAN DEFAULT TRUE,
  closed_from TIME,
  closed_till TIME,
  
  -- Reason
  closure_reason TEXT,
  
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  created_by INTEGER
);

CREATE INDEX IF NOT EXISTS merchant_store_holidays_store_id_idx ON merchant_store_holidays(store_id);
CREATE INDEX IF NOT EXISTS merchant_store_holidays_holiday_date_idx ON merchant_store_holidays(holiday_date);

-- Store Preparation Times (Per Service/Category)
CREATE TABLE IF NOT EXISTS merchant_store_preparation_times (
  id BIGSERIAL PRIMARY KEY,
  store_id BIGINT NOT NULL REFERENCES merchant_stores(id) ON DELETE CASCADE,
  
  -- Configuration Type
  config_type TEXT NOT NULL, -- 'SERVICE', 'CATEGORY', 'ITEM', 'DEFAULT'
  service_type service_type,
  category_id BIGINT REFERENCES merchant_menu_categories(id) ON DELETE CASCADE,
  menu_item_id BIGINT REFERENCES merchant_menu_items(id) ON DELETE CASCADE,
  
  -- Preparation Time
  preparation_time_minutes INTEGER NOT NULL,
  
  -- Time-Based (Peak hours, etc.)
  applicable_time_start TIME,
  applicable_time_end TIME,
  applicable_days day_of_week[],
  
  -- Priority
  priority INTEGER DEFAULT 0,
  
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS merchant_store_preparation_times_store_id_idx ON merchant_store_preparation_times(store_id);
CREATE INDEX IF NOT EXISTS merchant_store_preparation_times_config_type_idx ON merchant_store_preparation_times(config_type);

-- ============================================================================
-- PHASE 6: MANAGEMENT & CONTROL
-- ============================================================================

-- Area Managers
CREATE TABLE IF NOT EXISTS merchant_area_managers (
  id BIGSERIAL PRIMARY KEY,
  manager_id TEXT NOT NULL UNIQUE,
  
  -- Manager Details
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  mobile TEXT NOT NULL UNIQUE,
  alternate_mobile TEXT,
  
  -- Assignment
  region TEXT NOT NULL,
  cities TEXT[],
  postal_codes TEXT[],
  
  -- Status
  status TEXT DEFAULT 'ACTIVE', -- 'ACTIVE', 'INACTIVE', 'ON_LEAVE'
  
  -- User Link
  user_id INTEGER, -- Link to system user
  
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS merchant_area_managers_manager_id_idx ON merchant_area_managers(manager_id);
CREATE INDEX IF NOT EXISTS merchant_area_managers_region_idx ON merchant_area_managers(region);
CREATE INDEX IF NOT EXISTS merchant_area_managers_status_idx ON merchant_area_managers(status) WHERE status = 'ACTIVE';

-- Store-Area Manager Assignments
CREATE TABLE IF NOT EXISTS merchant_store_manager_assignments (
  id BIGSERIAL PRIMARY KEY,
  store_id BIGINT NOT NULL REFERENCES merchant_stores(id) ON DELETE CASCADE,
  manager_id BIGINT NOT NULL REFERENCES merchant_area_managers(id) ON DELETE RESTRICT,
  
  -- Assignment Details
  assigned_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  assigned_by INTEGER,
  
  -- Status
  is_active BOOLEAN DEFAULT TRUE,
  unassigned_at TIMESTAMP WITH TIME ZONE,
  unassigned_by INTEGER,
  unassignment_reason TEXT,
  
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS merchant_store_manager_assignments_store_id_idx ON merchant_store_manager_assignments(store_id);
CREATE INDEX IF NOT EXISTS merchant_store_manager_assignments_manager_id_idx ON merchant_store_manager_assignments(manager_id);
CREATE INDEX IF NOT EXISTS merchant_store_manager_assignments_is_active_idx ON merchant_store_manager_assignments(is_active) WHERE is_active = TRUE;

-- Store Activity Log (Delist/Relist/Block/Unblock)
CREATE TABLE IF NOT EXISTS merchant_store_activity_log (
  id BIGSERIAL PRIMARY KEY,
  store_id BIGINT NOT NULL REFERENCES merchant_stores(id) ON DELETE CASCADE,
  
  -- Activity Details
  activity_type activity_type NOT NULL,
  activity_reason TEXT NOT NULL,
  activity_reason_code TEXT,
  activity_notes TEXT,
  
  -- Scheduling
  relist_on TIMESTAMP WITH TIME ZONE,
  auto_relist BOOLEAN DEFAULT FALSE,
  
  -- Actor
  actioned_by TEXT NOT NULL, -- 'MERCHANT', 'ADMIN', 'SYSTEM', 'AREA_MANAGER'
  actioned_by_id INTEGER,
  actioned_by_name TEXT,
  actioned_by_email TEXT,
  
  -- Reversal
  reversed BOOLEAN DEFAULT FALSE,
  reversed_at TIMESTAMP WITH TIME ZONE,
  reversed_by INTEGER,
  reversal_notes TEXT,
  
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS merchant_store_activity_log_store_id_idx ON merchant_store_activity_log(store_id);
CREATE INDEX IF NOT EXISTS merchant_store_activity_log_activity_type_idx ON merchant_store_activity_log(activity_type);
CREATE INDEX IF NOT EXISTS merchant_store_activity_log_created_at_idx ON merchant_store_activity_log(created_at);

-- Store Status History
CREATE TABLE IF NOT EXISTS merchant_store_status_history (
  id BIGSERIAL PRIMARY KEY,
  store_id BIGINT NOT NULL REFERENCES merchant_stores(id) ON DELETE CASCADE,
  
  -- Status Change
  from_status store_status,
  to_status store_status NOT NULL,
  
  -- Reason
  change_reason TEXT,
  change_notes TEXT,
  
  -- Actor
  changed_by TEXT NOT NULL, -- 'MERCHANT', 'ADMIN', 'SYSTEM'
  changed_by_id INTEGER,
  changed_by_name TEXT,
  
  -- Metadata
  status_metadata JSONB DEFAULT '{}',
  
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS merchant_store_status_history_store_id_idx ON merchant_store_status_history(store_id);
CREATE INDEX IF NOT EXISTS merchant_store_status_history_to_status_idx ON merchant_store_status_history(to_status);
CREATE INDEX IF NOT EXISTS merchant_store_status_history_created_at_idx ON merchant_store_status_history(created_at);

-- Store Settings
CREATE TABLE IF NOT EXISTS merchant_store_settings (
  id BIGSERIAL PRIMARY KEY,
  store_id BIGINT NOT NULL REFERENCES merchant_stores(id) ON DELETE CASCADE,
  
  -- Notification Settings
  order_notification_enabled BOOLEAN DEFAULT TRUE,
  order_notification_sound BOOLEAN DEFAULT TRUE,
  
  -- Auto-Accept Settings
  auto_accept_orders BOOLEAN DEFAULT FALSE,
  auto_accept_time_seconds INTEGER DEFAULT 30,
  
  -- Delivery Settings
  self_delivery BOOLEAN DEFAULT FALSE,
  platform_delivery BOOLEAN DEFAULT TRUE,
  delivery_charge_type TEXT DEFAULT 'PLATFORM', -- 'PLATFORM', 'MERCHANT', 'CUSTOMER'
  delivery_charge_amount NUMERIC(10, 2),
  
  -- Order Management
  max_concurrent_orders INTEGER DEFAULT 20,
  max_preparation_time_minutes INTEGER DEFAULT 60,
  
  -- Payment Settings
  cash_handling_enabled BOOLEAN DEFAULT TRUE,
  online_payment_enabled BOOLEAN DEFAULT TRUE,
  
  -- Metadata
  settings_metadata JSONB DEFAULT '{}',
  
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  
  UNIQUE(store_id)
);

CREATE INDEX IF NOT EXISTS merchant_store_settings_store_id_idx ON merchant_store_settings(store_id);

-- ============================================================================
-- PHASE 7: FINANCIAL
-- ============================================================================

-- Commission Rules
CREATE TABLE IF NOT EXISTS merchant_store_commission_rules (
  id BIGSERIAL PRIMARY KEY,
  store_id BIGINT REFERENCES merchant_stores(id) ON DELETE CASCADE,
  parent_id BIGINT REFERENCES merchant_parents(id) ON DELETE CASCADE,
  
  -- Rule Details
  service_type service_type NOT NULL,
  commission_type TEXT NOT NULL, -- 'PERCENTAGE', 'FIXED', 'TIERED'
  commission_value NUMERIC(10, 2) NOT NULL,
  
  -- Tier Conditions
  min_order_value NUMERIC(10, 2),
  max_order_value NUMERIC(10, 2),
  
  -- Applicability
  applicable_cities TEXT[],
  
  -- Validity
  effective_from TIMESTAMP WITH TIME ZONE NOT NULL,
  effective_to TIMESTAMP WITH TIME ZONE,
  
  -- Status
  is_active BOOLEAN DEFAULT TRUE,
  
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  created_by INTEGER,
  
  CONSTRAINT check_store_or_parent_commission CHECK (
    (store_id IS NOT NULL AND parent_id IS NULL) OR
    (store_id IS NULL AND parent_id IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS merchant_store_commission_rules_store_id_idx ON merchant_store_commission_rules(store_id);
CREATE INDEX IF NOT EXISTS merchant_store_commission_rules_parent_id_idx ON merchant_store_commission_rules(parent_id);
CREATE INDEX IF NOT EXISTS merchant_store_commission_rules_service_type_idx ON merchant_store_commission_rules(service_type);
CREATE INDEX IF NOT EXISTS merchant_store_commission_rules_is_active_idx ON merchant_store_commission_rules(is_active) WHERE is_active = TRUE;

-- Store Payouts
CREATE TABLE IF NOT EXISTS merchant_store_payouts (
  id BIGSERIAL PRIMARY KEY,
  payout_id TEXT NOT NULL UNIQUE,
  store_id BIGINT NOT NULL REFERENCES merchant_stores(id) ON DELETE RESTRICT,
  parent_id BIGINT REFERENCES merchant_parents(id) ON DELETE RESTRICT,
  bank_account_id BIGINT REFERENCES merchant_store_bank_accounts(id) ON DELETE SET NULL,
  
  -- Payout Amount
  payout_amount NUMERIC(12, 2) NOT NULL,
  processing_fee NUMERIC(10, 2) DEFAULT 0,
  tds_deducted NUMERIC(10, 2) DEFAULT 0,
  adjustment_amount NUMERIC(10, 2) DEFAULT 0,
  net_payout_amount NUMERIC(12, 2) NOT NULL,
  
  -- Payout Period
  period_start_date DATE NOT NULL,
  period_end_date DATE NOT NULL,
  
  -- Order Count
  total_orders_count INTEGER DEFAULT 0,
  completed_orders_count INTEGER DEFAULT 0,
  
  -- Bank Details (Snapshot)
  bank_account_holder TEXT,
  bank_account_number TEXT,
  bank_ifsc_code TEXT,
  bank_name TEXT,
  upi_id TEXT,
  
  -- Transaction
  transaction_id TEXT,
  utr_number TEXT,
  pg_transaction_id TEXT,
  
  -- Status
  status payout_status NOT NULL DEFAULT 'PENDING',
  failure_reason TEXT,
  
  -- Timestamps
  requested_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  processed_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE,
  failed_at TIMESTAMP WITH TIME ZONE,
  
  -- Actor
  requested_by INTEGER,
  processed_by INTEGER,
  
  -- Metadata
  payout_metadata JSONB DEFAULT '{}',
  
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS merchant_store_payouts_store_id_idx ON merchant_store_payouts(store_id);
CREATE INDEX IF NOT EXISTS merchant_store_payouts_parent_id_idx ON merchant_store_payouts(parent_id);
CREATE INDEX IF NOT EXISTS merchant_store_payouts_status_idx ON merchant_store_payouts(status);
CREATE INDEX IF NOT EXISTS merchant_store_payouts_period_idx ON merchant_store_payouts(period_start_date, period_end_date);
CREATE INDEX IF NOT EXISTS merchant_store_payouts_requested_at_idx ON merchant_store_payouts(requested_at);

-- Payout History (Immutable Log)
CREATE TABLE IF NOT EXISTS merchant_store_payout_history (
  id BIGSERIAL PRIMARY KEY,
  payout_id BIGINT NOT NULL REFERENCES merchant_store_payouts(id) ON DELETE CASCADE,
  
  -- Status Change
  from_status payout_status,
  to_status payout_status NOT NULL,
  
  -- Actor
  changed_by TEXT NOT NULL,
  changed_by_id INTEGER,
  
  -- Reason
  change_reason TEXT,
  
  -- Metadata
  change_metadata JSONB DEFAULT '{}',
  
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS merchant_store_payout_history_payout_id_idx ON merchant_store_payout_history(payout_id);
CREATE INDEX IF NOT EXISTS merchant_store_payout_history_created_at_idx ON merchant_store_payout_history(created_at);

-- Settlement Records
CREATE TABLE IF NOT EXISTS merchant_store_settlements (
  id BIGSERIAL PRIMARY KEY,
  settlement_id TEXT NOT NULL UNIQUE,
  store_id BIGINT NOT NULL REFERENCES merchant_stores(id) ON DELETE RESTRICT,
  
  -- Settlement Period
  settlement_date DATE NOT NULL,
  period_start_date DATE NOT NULL,
  period_end_date DATE NOT NULL,
  
  -- Order Summary
  total_orders INTEGER DEFAULT 0,
  completed_orders INTEGER DEFAULT 0,
  cancelled_orders INTEGER DEFAULT 0,
  
  -- Financial Summary
  gross_order_value NUMERIC(12, 2) DEFAULT 0,
  total_discounts NUMERIC(12, 2) DEFAULT 0,
  total_tax NUMERIC(12, 2) DEFAULT 0,
  total_commission NUMERIC(12, 2) DEFAULT 0,
  total_refunds NUMERIC(12, 2) DEFAULT 0,
  total_adjustments NUMERIC(12, 2) DEFAULT 0,
  net_settlement_amount NUMERIC(12, 2) DEFAULT 0,
  
  -- Linked Payout
  payout_id BIGINT REFERENCES merchant_store_payouts(id) ON DELETE SET NULL,
  
  -- Status
  settlement_status TEXT DEFAULT 'PENDING', -- 'PENDING', 'CALCULATED', 'PAID', 'DISPUTED'
  
  -- Metadata
  settlement_breakdown JSONB DEFAULT '{}',
  
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS merchant_store_settlements_store_id_idx ON merchant_store_settlements(store_id);
CREATE INDEX IF NOT EXISTS merchant_store_settlements_settlement_date_idx ON merchant_store_settlements(settlement_date);
CREATE INDEX IF NOT EXISTS merchant_store_settlements_payout_id_idx ON merchant_store_settlements(payout_id);
CREATE INDEX IF NOT EXISTS merchant_store_settlements_settlement_status_idx ON merchant_store_settlements(settlement_status);

-- ============================================================================
-- PHASE 8: ACCESS CONTROL
-- ============================================================================

-- Merchant Users (Store Managers, Staff)
CREATE TABLE IF NOT EXISTS merchant_users (
  id BIGSERIAL PRIMARY KEY,
  user_id TEXT NOT NULL UNIQUE,
  parent_id BIGINT REFERENCES merchant_parents(id) ON DELETE CASCADE,
  
  -- User Details
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  mobile TEXT NOT NULL UNIQUE,
  
  -- Authentication
  password_hash TEXT,
  last_login_at TIMESTAMP WITH TIME ZONE,
  login_count INTEGER DEFAULT 0,
  
  -- Role
  role TEXT NOT NULL DEFAULT 'STORE_MANAGER', -- 'OWNER', 'STORE_MANAGER', 'STAFF', 'ACCOUNTANT'
  
  -- Status
  is_active BOOLEAN DEFAULT TRUE,
  is_verified BOOLEAN DEFAULT FALSE,
  
  -- Metadata
  user_metadata JSONB DEFAULT '{}',
  
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS merchant_users_user_id_idx ON merchant_users(user_id);
CREATE INDEX IF NOT EXISTS merchant_users_parent_id_idx ON merchant_users(parent_id);
CREATE INDEX IF NOT EXISTS merchant_users_email_idx ON merchant_users(email);
CREATE INDEX IF NOT EXISTS merchant_users_mobile_idx ON merchant_users(mobile);
CREATE INDEX IF NOT EXISTS merchant_users_is_active_idx ON merchant_users(is_active) WHERE is_active = TRUE;

-- Merchant User Store Access
CREATE TABLE IF NOT EXISTS merchant_user_store_access (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES merchant_users(id) ON DELETE CASCADE,
  store_id BIGINT NOT NULL REFERENCES merchant_stores(id) ON DELETE CASCADE,
  
  -- Access Level
  access_level TEXT NOT NULL DEFAULT 'READ_ONLY', -- 'FULL', 'READ_WRITE', 'READ_ONLY'
  
  -- Permissions
  can_manage_menu BOOLEAN DEFAULT FALSE,
  can_manage_orders BOOLEAN DEFAULT FALSE,
  can_manage_payouts BOOLEAN DEFAULT FALSE,
  can_view_reports BOOLEAN DEFAULT FALSE,
  
  -- Status
  is_active BOOLEAN DEFAULT TRUE,
  granted_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  granted_by INTEGER,
  revoked_at TIMESTAMP WITH TIME ZONE,
  revoked_by INTEGER,
  
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  
  UNIQUE(user_id, store_id)
);

CREATE INDEX IF NOT EXISTS merchant_user_store_access_user_id_idx ON merchant_user_store_access(user_id);
CREATE INDEX IF NOT EXISTS merchant_user_store_access_store_id_idx ON merchant_user_store_access(store_id);
CREATE INDEX IF NOT EXISTS merchant_user_store_access_is_active_idx ON merchant_user_store_access(is_active) WHERE is_active = TRUE;

-- ============================================================================
-- PHASE 9: COMPLIANCE & AUDIT
-- ============================================================================

-- Merchant Audit Logs
CREATE TABLE IF NOT EXISTS merchant_audit_logs (
  id BIGSERIAL PRIMARY KEY,
  
  -- Entity
  entity_type TEXT NOT NULL, -- 'PARENT', 'STORE', 'MENU_ITEM', 'OFFER', 'PAYOUT', etc.
  entity_id BIGINT NOT NULL,
  
  -- Action
  action TEXT NOT NULL, -- 'CREATE', 'UPDATE', 'DELETE', 'STATUS_CHANGE', 'APPROVE', 'REJECT'
  action_field TEXT,
  
  -- Changes
  old_value JSONB,
  new_value JSONB,
  
  -- Actor
  performed_by TEXT NOT NULL, -- 'MERCHANT', 'ADMIN', 'SYSTEM', 'AREA_MANAGER'
  performed_by_id INTEGER,
  performed_by_name TEXT,
  performed_by_email TEXT,
  
  -- Context
  ip_address TEXT,
  user_agent TEXT,
  
  -- Metadata
  audit_metadata JSONB DEFAULT '{}',
  
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS merchant_audit_logs_entity_idx ON merchant_audit_logs(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS merchant_audit_logs_action_idx ON merchant_audit_logs(action);
CREATE INDEX IF NOT EXISTS merchant_audit_logs_performed_by_idx ON merchant_audit_logs(performed_by, performed_by_id);
CREATE INDEX IF NOT EXISTS merchant_audit_logs_created_at_idx ON merchant_audit_logs(created_at);

-- Store Blocks (Block/Unblock History)
CREATE TABLE IF NOT EXISTS merchant_store_blocks (
  id BIGSERIAL PRIMARY KEY,
  store_id BIGINT NOT NULL REFERENCES merchant_stores(id) ON DELETE CASCADE,
  
  -- Block Details
  block_type TEXT NOT NULL, -- 'TEMPORARY', 'PERMANENT', 'COMPLIANCE', 'PAYMENT'
  block_reason TEXT NOT NULL,
  block_reason_code TEXT,
  block_notes TEXT,
  
  -- Duration
  blocked_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  blocked_until TIMESTAMP WITH TIME ZONE,
  auto_unblock BOOLEAN DEFAULT FALSE,
  
  -- Actor
  blocked_by TEXT NOT NULL,
  blocked_by_id INTEGER,
  blocked_by_name TEXT,
  
  -- Unblock
  is_unblocked BOOLEAN DEFAULT FALSE,
  unblocked_at TIMESTAMP WITH TIME ZONE,
  unblocked_by INTEGER,
  unblock_reason TEXT,
  
  -- Impact
  blocked_services service_type[],
  
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS merchant_store_blocks_store_id_idx ON merchant_store_blocks(store_id);
CREATE INDEX IF NOT EXISTS merchant_store_blocks_is_unblocked_idx ON merchant_store_blocks(is_unblocked) WHERE is_unblocked = FALSE;
CREATE INDEX IF NOT EXISTS merchant_store_blocks_blocked_at_idx ON merchant_store_blocks(blocked_at);

-- Store Compliance Tracking
CREATE TABLE IF NOT EXISTS merchant_store_compliance (
  id BIGSERIAL PRIMARY KEY,
  store_id BIGINT NOT NULL REFERENCES merchant_stores(id) ON DELETE CASCADE,
  
  -- Compliance Type
  compliance_type TEXT NOT NULL, -- 'GST', 'FSSAI', 'TRADE_LICENSE', 'HEALTH_INSPECTION', etc.
  compliance_status verification_status NOT NULL DEFAULT 'PENDING',
  
  -- Details
  compliance_number TEXT,
  compliance_document_url TEXT,
  
  -- Validity
  issued_date DATE,
  expiry_date DATE,
  is_expired BOOLEAN DEFAULT FALSE,
  renewal_required BOOLEAN DEFAULT FALSE,
  renewal_due_date DATE,
  
  -- Verification
  verified_by INTEGER,
  verified_at TIMESTAMP WITH TIME ZONE,
  verification_notes TEXT,
  
  -- Metadata
  compliance_metadata JSONB DEFAULT '{}',
  
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS merchant_store_compliance_store_id_idx ON merchant_store_compliance(store_id);
CREATE INDEX IF NOT EXISTS merchant_store_compliance_compliance_type_idx ON merchant_store_compliance(compliance_type);
CREATE INDEX IF NOT EXISTS merchant_store_compliance_status_idx ON merchant_store_compliance(compliance_status);
CREATE INDEX IF NOT EXISTS merchant_store_compliance_expiry_date_idx ON merchant_store_compliance(expiry_date);

-- ============================================================================
-- PHASE 10: INTEGRATION
-- ============================================================================

-- ONDC Integration Mapping
CREATE TABLE IF NOT EXISTS merchant_store_ondc_mapping (
  id BIGSERIAL PRIMARY KEY,
  store_id BIGINT NOT NULL REFERENCES merchant_stores(id) ON DELETE CASCADE,
  
  -- ONDC IDs
  ondc_store_id TEXT NOT NULL UNIQUE,
  ondc_provider_id TEXT,
  ondc_location_id TEXT,
  
  -- ONDC Details
  ondc_registered_name TEXT,
  ondc_category TEXT,
  ondc_subcategory TEXT,
  
  -- Status
  ondc_status TEXT DEFAULT 'PENDING', -- 'PENDING', 'ACTIVE', 'SUSPENDED', 'DELISTED'
  ondc_registered_at TIMESTAMP WITH TIME ZONE,
  
  -- Sync
  last_synced_at TIMESTAMP WITH TIME ZONE,
  sync_status TEXT DEFAULT 'PENDING',
  
  -- Metadata
  ondc_metadata JSONB DEFAULT '{}',
  
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  
  UNIQUE(store_id)
);

CREATE INDEX IF NOT EXISTS merchant_store_ondc_mapping_store_id_idx ON merchant_store_ondc_mapping(store_id);
CREATE INDEX IF NOT EXISTS merchant_store_ondc_mapping_ondc_store_id_idx ON merchant_store_ondc_mapping(ondc_store_id);

-- External Provider Mapping (Swiggy, Zomato, etc.)
CREATE TABLE IF NOT EXISTS merchant_store_provider_mapping (
  id BIGSERIAL PRIMARY KEY,
  store_id BIGINT NOT NULL REFERENCES merchant_stores(id) ON DELETE CASCADE,
  provider_type order_source_type NOT NULL,
  
  -- Provider IDs
  provider_store_id TEXT NOT NULL,
  provider_restaurant_id TEXT,
  provider_merchant_id TEXT,
  
  -- Provider Details
  provider_store_name TEXT,
  provider_status TEXT,
  
  -- Sync
  is_synced BOOLEAN DEFAULT FALSE,
  last_synced_at TIMESTAMP WITH TIME ZONE,
  sync_status TEXT DEFAULT 'PENDING',
  
  -- Commission
  provider_commission_percentage NUMERIC(5, 2),
  
  -- Metadata
  provider_metadata JSONB DEFAULT '{}',
  
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  
  UNIQUE(store_id, provider_type)
);

CREATE INDEX IF NOT EXISTS merchant_store_provider_mapping_store_id_idx ON merchant_store_provider_mapping(store_id);
CREATE INDEX IF NOT EXISTS merchant_store_provider_mapping_provider_type_idx ON merchant_store_provider_mapping(provider_type);
CREATE INDEX IF NOT EXISTS merchant_store_provider_mapping_provider_store_id_idx ON merchant_store_provider_mapping(provider_store_id);

-- ============================================================================
-- TRIGGERS
-- ============================================================================

-- Trigger: Auto-update updated_at
DROP TRIGGER IF EXISTS merchant_parents_updated_at_trigger ON merchant_parents;
CREATE TRIGGER merchant_parents_updated_at_trigger
  BEFORE UPDATE ON merchant_parents
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS merchant_stores_updated_at_trigger ON merchant_stores;
CREATE TRIGGER merchant_stores_updated_at_trigger
  BEFORE UPDATE ON merchant_stores
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS merchant_store_tax_details_updated_at_trigger ON merchant_store_tax_details;
CREATE TRIGGER merchant_store_tax_details_updated_at_trigger
  BEFORE UPDATE ON merchant_store_tax_details
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS merchant_store_bank_accounts_updated_at_trigger ON merchant_store_bank_accounts;
CREATE TRIGGER merchant_store_bank_accounts_updated_at_trigger
  BEFORE UPDATE ON merchant_store_bank_accounts
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS merchant_menu_categories_updated_at_trigger ON merchant_menu_categories;
CREATE TRIGGER merchant_menu_categories_updated_at_trigger
  BEFORE UPDATE ON merchant_menu_categories
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS merchant_menu_items_updated_at_trigger ON merchant_menu_items;
CREATE TRIGGER merchant_menu_items_updated_at_trigger
  BEFORE UPDATE ON merchant_menu_items
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS merchant_offers_updated_at_trigger ON merchant_offers;
CREATE TRIGGER merchant_offers_updated_at_trigger
  BEFORE UPDATE ON merchant_offers
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS merchant_coupons_updated_at_trigger ON merchant_coupons;
CREATE TRIGGER merchant_coupons_updated_at_trigger
  BEFORE UPDATE ON merchant_coupons
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS merchant_store_payouts_updated_at_trigger ON merchant_store_payouts;
CREATE TRIGGER merchant_store_payouts_updated_at_trigger
  BEFORE UPDATE ON merchant_store_payouts
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Trigger: Create status history on store status change
CREATE OR REPLACE FUNCTION create_merchant_store_status_history()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    INSERT INTO merchant_store_status_history (
      store_id, from_status, to_status, changed_by,
      changed_by_id, created_at
    ) VALUES (
      NEW.id, OLD.status, NEW.status, 'SYSTEM', NULL, NOW()
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS merchant_stores_status_history_trigger ON merchant_stores;
CREATE TRIGGER merchant_stores_status_history_trigger
  AFTER UPDATE OF status ON merchant_stores
  FOR EACH ROW
  WHEN (OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION create_merchant_store_status_history();

-- Trigger: Create audit log entry
CREATE OR REPLACE FUNCTION create_merchant_audit_log()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO merchant_audit_logs (
    entity_type, entity_id, action, old_value, new_value,
    performed_by, created_at
  ) VALUES (
    TG_TABLE_NAME, NEW.id, TG_OP,
    row_to_json(OLD)::jsonb, row_to_json(NEW)::jsonb,
    'SYSTEM', NOW()
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- CONSTRAINTS
-- ============================================================================

-- Merchant Parents
ALTER TABLE merchant_parents
  ADD CONSTRAINT merchant_parents_phone_format CHECK (registered_phone ~ '^\+?[0-9]{10,15}$');

-- Merchant Stores
ALTER TABLE merchant_stores
  ADD CONSTRAINT merchant_stores_latitude_valid CHECK (latitude IS NULL OR (latitude >= -90 AND latitude <= 90)),
  ADD CONSTRAINT merchant_stores_longitude_valid CHECK (longitude IS NULL OR (longitude >= -180 AND longitude <= 180)),
  ADD CONSTRAINT merchant_stores_min_order_valid CHECK (min_order_amount >= 0),
  ADD CONSTRAINT merchant_stores_prep_time_positive CHECK (avg_preparation_time_minutes > 0);

-- Menu Items
ALTER TABLE merchant_menu_items
  ADD CONSTRAINT merchant_menu_items_base_price_positive CHECK (base_price > 0),
  ADD CONSTRAINT merchant_menu_items_selling_price_positive CHECK (selling_price > 0);

-- Payouts
ALTER TABLE merchant_store_payouts
  ADD CONSTRAINT merchant_store_payouts_amount_positive CHECK (payout_amount > 0),
  ADD CONSTRAINT merchant_store_payouts_net_amount_positive CHECK (net_payout_amount >= 0);

-- ============================================================================
-- ENABLE RLS
-- ============================================================================

ALTER TABLE merchant_parents ENABLE ROW LEVEL SECURITY;
ALTER TABLE merchant_stores ENABLE ROW LEVEL SECURITY;
ALTER TABLE merchant_store_services ENABLE ROW LEVEL SECURITY;
ALTER TABLE merchant_store_verification ENABLE ROW LEVEL SECURITY;
ALTER TABLE merchant_store_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE merchant_store_tax_details ENABLE ROW LEVEL SECURITY;
ALTER TABLE merchant_store_bank_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE merchant_menu_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE merchant_menu_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE merchant_menu_item_customizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE merchant_menu_item_addons ENABLE ROW LEVEL SECURITY;
ALTER TABLE merchant_menu_item_variants ENABLE ROW LEVEL SECURITY;
ALTER TABLE merchant_offers ENABLE ROW LEVEL SECURITY;
ALTER TABLE merchant_coupons ENABLE ROW LEVEL SECURITY;
ALTER TABLE merchant_offer_applicability ENABLE ROW LEVEL SECURITY;
ALTER TABLE merchant_store_operating_hours ENABLE ROW LEVEL SECURITY;
ALTER TABLE merchant_store_availability ENABLE ROW LEVEL SECURITY;
ALTER TABLE merchant_store_holidays ENABLE ROW LEVEL SECURITY;
ALTER TABLE merchant_store_preparation_times ENABLE ROW LEVEL SECURITY;
ALTER TABLE merchant_area_managers ENABLE ROW LEVEL SECURITY;
ALTER TABLE merchant_store_manager_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE merchant_store_activity_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE merchant_store_status_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE merchant_store_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE merchant_store_commission_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE merchant_store_payouts ENABLE ROW LEVEL SECURITY;
ALTER TABLE merchant_store_payout_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE merchant_store_settlements ENABLE ROW LEVEL SECURITY;
ALTER TABLE merchant_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE merchant_user_store_access ENABLE ROW LEVEL SECURITY;
ALTER TABLE merchant_audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE merchant_store_blocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE merchant_store_compliance ENABLE ROW LEVEL SECURITY;
ALTER TABLE merchant_store_ondc_mapping ENABLE ROW LEVEL SECURITY;
ALTER TABLE merchant_store_provider_mapping ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TABLE merchant_parents IS 'Parent merchant entities. One parent can have multiple stores (brand/chain model).';
COMMENT ON TABLE merchant_stores IS 'Individual store outlets. Linked to parent merchant. Supports multi-service (food, parcel, ride).';
COMMENT ON TABLE merchant_store_services IS 'Services enabled per store. One store can serve multiple service types.';
COMMENT ON TABLE merchant_menu_items IS 'Menu items catalog. Linked to orders via order_items table.';
COMMENT ON TABLE merchant_offers IS 'Store-specific offers and promotions.';
COMMENT ON TABLE merchant_coupons IS 'Coupon codes. Can be store-specific or parent-level.';
COMMENT ON TABLE merchant_store_payouts IS 'Payout requests and processing. Linked to settlement records.';
COMMENT ON TABLE merchant_audit_logs IS 'Complete audit trail for all merchant-related changes.';
