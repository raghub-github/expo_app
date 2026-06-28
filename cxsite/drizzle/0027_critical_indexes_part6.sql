-- ============================================================================
-- CRITICAL INDEXES - PART 6: Tickets, Providers & Other Tables
-- Migration: 0027_critical_indexes_part6
-- Database: Supabase PostgreSQL
-- 
-- This file adds indexes for tickets, provider integration, and other tables
-- ============================================================================

-- ============================================================================
-- UNIFIED TICKETS INDEXES
-- ============================================================================

CREATE UNIQUE INDEX IF NOT EXISTS unified_tickets_ticket_id_idx ON unified_tickets(ticket_id);
CREATE INDEX IF NOT EXISTS unified_tickets_ticket_type_idx ON unified_tickets(ticket_type);
CREATE INDEX IF NOT EXISTS unified_tickets_ticket_source_idx ON unified_tickets(ticket_source);
CREATE INDEX IF NOT EXISTS unified_tickets_service_type_idx ON unified_tickets(service_type);
CREATE INDEX IF NOT EXISTS unified_tickets_ticket_title_idx ON unified_tickets(ticket_title);
CREATE INDEX IF NOT EXISTS unified_tickets_ticket_category_idx ON unified_tickets(ticket_category);
CREATE INDEX IF NOT EXISTS unified_tickets_order_id_idx ON unified_tickets(order_id) WHERE order_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS unified_tickets_customer_id_idx ON unified_tickets(customer_id) WHERE customer_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS unified_tickets_rider_id_idx ON unified_tickets(rider_id) WHERE rider_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS unified_tickets_merchant_store_id_idx ON unified_tickets(merchant_store_id) WHERE merchant_store_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS unified_tickets_priority_idx ON unified_tickets(priority);
CREATE INDEX IF NOT EXISTS unified_tickets_status_idx ON unified_tickets(status);
CREATE INDEX IF NOT EXISTS unified_tickets_assigned_to_agent_id_idx ON unified_tickets(assigned_to_agent_id) WHERE assigned_to_agent_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS unified_tickets_raised_by_idx ON unified_tickets(raised_by_type, raised_by_id);
CREATE INDEX IF NOT EXISTS unified_tickets_created_at_idx ON unified_tickets(created_at);
CREATE INDEX IF NOT EXISTS unified_tickets_open_idx ON unified_tickets(status, priority, created_at) 
  WHERE status = 'OPEN';
CREATE INDEX IF NOT EXISTS unified_tickets_assigned_open_idx ON unified_tickets(assigned_to_agent_id, status, created_at) 
  WHERE assigned_to_agent_id IS NOT NULL AND status = 'OPEN';

-- ============================================================================
-- UNIFIED TICKET MESSAGES INDEXES
-- ============================================================================

CREATE INDEX IF NOT EXISTS unified_ticket_messages_ticket_id_idx ON unified_ticket_messages(ticket_id);
CREATE INDEX IF NOT EXISTS unified_ticket_messages_sender_type_idx ON unified_ticket_messages(sender_type);
CREATE INDEX IF NOT EXISTS unified_ticket_messages_sender_id_idx ON unified_ticket_messages(sender_id) WHERE sender_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS unified_ticket_messages_is_read_idx ON unified_ticket_messages(is_read) WHERE is_read = FALSE;
CREATE INDEX IF NOT EXISTS unified_ticket_messages_is_internal_note_idx ON unified_ticket_messages(is_internal_note) WHERE is_internal_note = TRUE;
CREATE INDEX IF NOT EXISTS unified_ticket_messages_created_at_idx ON unified_ticket_messages(created_at);
CREATE INDEX IF NOT EXISTS unified_ticket_messages_ticket_created_idx ON unified_ticket_messages(ticket_id, created_at DESC);

-- ============================================================================
-- UNIFIED TICKET ACTIVITIES INDEXES
-- ============================================================================

CREATE INDEX IF NOT EXISTS unified_ticket_activities_ticket_id_idx ON unified_ticket_activities(ticket_id);
CREATE INDEX IF NOT EXISTS unified_ticket_activities_activity_type_idx ON unified_ticket_activities(activity_type);
CREATE INDEX IF NOT EXISTS unified_ticket_activities_actor_type_idx ON unified_ticket_activities(actor_type);
CREATE INDEX IF NOT EXISTS unified_ticket_activities_created_at_idx ON unified_ticket_activities(created_at);

-- ============================================================================
-- TICKET TITLE CONFIG INDEXES
-- ============================================================================

CREATE UNIQUE INDEX IF NOT EXISTS ticket_title_config_ticket_title_idx ON ticket_title_config(ticket_title);
CREATE INDEX IF NOT EXISTS ticket_title_config_is_active_idx ON ticket_title_config(is_active) WHERE is_active = TRUE;
CREATE INDEX IF NOT EXISTS ticket_title_config_display_order_idx ON ticket_title_config(display_order);

-- ============================================================================
-- PROVIDER ORDER MAPPING INDEXES
-- ============================================================================

CREATE INDEX IF NOT EXISTS provider_order_mapping_order_id_idx ON provider_order_mapping(order_id);
CREATE INDEX IF NOT EXISTS provider_order_mapping_provider_type_idx ON provider_order_mapping(provider_type);
CREATE UNIQUE INDEX IF NOT EXISTS provider_order_mapping_provider_order_id_idx ON provider_order_mapping(provider_type, provider_order_id);
CREATE INDEX IF NOT EXISTS provider_order_mapping_sync_status_idx ON provider_order_mapping(sync_status);
CREATE INDEX IF NOT EXISTS provider_order_mapping_pending_sync_idx ON provider_order_mapping(provider_type, sync_status, created_at) 
  WHERE sync_status = 'pending';

-- ============================================================================
-- PROVIDER ORDER STATUS SYNC INDEXES
-- ============================================================================

CREATE INDEX IF NOT EXISTS provider_order_status_sync_order_id_idx ON provider_order_status_sync(order_id);
CREATE INDEX IF NOT EXISTS provider_order_status_sync_provider_type_idx ON provider_order_status_sync(provider_type);
CREATE INDEX IF NOT EXISTS provider_order_status_sync_sync_direction_idx ON provider_order_status_sync(sync_direction);
CREATE INDEX IF NOT EXISTS provider_order_status_sync_success_idx ON provider_order_status_sync(success);
CREATE INDEX IF NOT EXISTS provider_order_status_sync_pending_idx ON provider_order_status_sync(provider_type, success, created_at) 
  WHERE success = FALSE;

-- ============================================================================
-- PROVIDER ORDER CONFLICTS INDEXES
-- ============================================================================

CREATE INDEX IF NOT EXISTS provider_order_conflicts_order_id_idx ON provider_order_conflicts(order_id);
CREATE INDEX IF NOT EXISTS provider_order_conflicts_provider_type_idx ON provider_order_conflicts(provider_type);
CREATE INDEX IF NOT EXISTS provider_order_conflicts_conflict_type_idx ON provider_order_conflicts(conflict_type);
CREATE INDEX IF NOT EXISTS provider_order_conflicts_resolved_idx ON provider_order_conflicts(resolved) WHERE resolved = FALSE;
CREATE INDEX IF NOT EXISTS provider_order_conflicts_unresolved_idx ON provider_order_conflicts(order_id, provider_type, created_at DESC) 
  WHERE resolved = FALSE;

-- ============================================================================
-- PROVIDER RIDER MAPPING INDEXES
-- ============================================================================

CREATE INDEX IF NOT EXISTS provider_rider_mapping_rider_id_idx ON provider_rider_mapping(rider_id);
CREATE INDEX IF NOT EXISTS provider_rider_mapping_provider_type_idx ON provider_rider_mapping(provider_type);
CREATE UNIQUE INDEX IF NOT EXISTS provider_rider_mapping_provider_rider_id_idx ON provider_rider_mapping(provider_type, provider_rider_id);
CREATE INDEX IF NOT EXISTS provider_rider_mapping_is_verified_idx ON provider_rider_mapping(is_verified) WHERE is_verified = TRUE;

-- ============================================================================
-- PROVIDER CONFIGS INDEXES
-- ============================================================================

CREATE UNIQUE INDEX IF NOT EXISTS provider_configs_provider_type_idx ON provider_configs(provider_type);
CREATE INDEX IF NOT EXISTS provider_configs_status_idx ON provider_configs(status);
CREATE INDEX IF NOT EXISTS provider_configs_active_idx ON provider_configs(status) WHERE status = 'active';

-- ============================================================================
-- WEBHOOK EVENTS INDEXES
-- ============================================================================

CREATE INDEX IF NOT EXISTS webhook_events_provider_type_idx ON webhook_events(provider_type);
CREATE INDEX IF NOT EXISTS webhook_events_event_type_idx ON webhook_events(event_type);
CREATE INDEX IF NOT EXISTS webhook_events_status_idx ON webhook_events(status);
CREATE INDEX IF NOT EXISTS webhook_events_order_id_idx ON webhook_events(order_id) WHERE order_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS webhook_events_created_at_idx ON webhook_events(created_at);
CREATE INDEX IF NOT EXISTS webhook_events_pending_processing_idx ON webhook_events(provider_type, status, created_at)
  WHERE status IN ('pending', 'processing');

-- ============================================================================
-- WEBHOOK CONFIGURATIONS INDEXES
-- ============================================================================

CREATE INDEX IF NOT EXISTS webhook_configurations_provider_type_idx ON webhook_configurations(provider_type);
CREATE INDEX IF NOT EXISTS webhook_configurations_event_type_idx ON webhook_configurations(event_type);
CREATE INDEX IF NOT EXISTS webhook_configurations_enabled_idx ON webhook_configurations(enabled) WHERE enabled = TRUE;

-- ============================================================================
-- API CALL LOGS INDEXES
-- ============================================================================

CREATE INDEX IF NOT EXISTS api_call_logs_provider_type_idx ON api_call_logs(provider_type);
CREATE INDEX IF NOT EXISTS api_call_logs_endpoint_idx ON api_call_logs(endpoint);
CREATE INDEX IF NOT EXISTS api_call_logs_success_idx ON api_call_logs(success);
CREATE INDEX IF NOT EXISTS api_call_logs_order_id_idx ON api_call_logs(order_id) WHERE order_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS api_call_logs_created_at_idx ON api_call_logs(created_at);

-- ============================================================================
-- API RATE LIMITS INDEXES
-- ============================================================================

CREATE INDEX IF NOT EXISTS api_rate_limits_rider_id_idx ON api_rate_limits(rider_id) WHERE rider_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS api_rate_limits_endpoint_idx ON api_rate_limits(endpoint);
CREATE INDEX IF NOT EXISTS api_rate_limits_limit_exceeded_idx ON api_rate_limits(limit_exceeded) WHERE limit_exceeded = TRUE;
CREATE INDEX IF NOT EXISTS api_rate_limits_window_start_idx ON api_rate_limits(window_start);

-- ============================================================================
-- PROVIDER RATE LIMITS INDEXES
-- ============================================================================

CREATE INDEX IF NOT EXISTS provider_rate_limits_provider_type_idx ON provider_rate_limits(provider_type);
CREATE INDEX IF NOT EXISTS provider_rate_limits_endpoint_idx ON provider_rate_limits(endpoint);
CREATE INDEX IF NOT EXISTS provider_rate_limits_limit_exceeded_idx ON provider_rate_limits(limit_exceeded) WHERE limit_exceeded = TRUE;
CREATE INDEX IF NOT EXISTS provider_rate_limits_window_start_idx ON provider_rate_limits(window_start);

-- ============================================================================
-- OTP VERIFICATION LOGS INDEXES
-- ============================================================================

CREATE INDEX IF NOT EXISTS otp_verification_logs_phone_idx ON otp_verification_logs(phone_e164);
CREATE INDEX IF NOT EXISTS otp_verification_logs_status_idx ON otp_verification_logs(status);
CREATE INDEX IF NOT EXISTS otp_verification_logs_created_at_idx ON otp_verification_logs(created_at);
CREATE INDEX IF NOT EXISTS otp_verification_logs_device_id_idx ON otp_verification_logs(device_id) WHERE device_id IS NOT NULL;

-- ============================================================================
-- PAYMENT WEBHOOKS INDEXES
-- ============================================================================

CREATE INDEX IF NOT EXISTS payment_webhooks_provider_idx ON payment_webhooks(provider);
CREATE INDEX IF NOT EXISTS payment_webhooks_event_type_idx ON payment_webhooks(event_type);
CREATE INDEX IF NOT EXISTS payment_webhooks_processing_status_idx ON payment_webhooks(processing_status);
CREATE INDEX IF NOT EXISTS payment_webhooks_webhook_id_idx ON payment_webhooks(webhook_id) WHERE webhook_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS payment_webhooks_created_at_idx ON payment_webhooks(created_at);

-- ============================================================================
-- SYSTEM CONFIG INDEXES
-- ============================================================================

CREATE UNIQUE INDEX IF NOT EXISTS system_config_config_key_idx ON system_config(config_key);
CREATE INDEX IF NOT EXISTS system_config_category_idx ON system_config(category);
CREATE INDEX IF NOT EXISTS system_config_updated_at_idx ON system_config(updated_at);

-- ============================================================================
-- APP VERSIONS INDEXES
-- ============================================================================

CREATE INDEX IF NOT EXISTS app_versions_platform_idx ON app_versions(platform);
CREATE INDEX IF NOT EXISTS app_versions_active_idx ON app_versions(active) WHERE active = TRUE;
CREATE UNIQUE INDEX IF NOT EXISTS app_versions_platform_version_code_idx ON app_versions(platform, version_code);
CREATE INDEX IF NOT EXISTS app_versions_platform_version_code_desc_idx ON app_versions(platform, version_code DESC);

-- ============================================================================
-- NOTIFICATION LOGS INDEXES
-- ============================================================================

CREATE INDEX IF NOT EXISTS notification_logs_rider_id_idx ON notification_logs(rider_id);
CREATE INDEX IF NOT EXISTS notification_logs_notification_type_idx ON notification_logs(notification_type);
CREATE INDEX IF NOT EXISTS notification_logs_status_idx ON notification_logs(status);
CREATE INDEX IF NOT EXISTS notification_logs_created_at_idx ON notification_logs(created_at);
CREATE INDEX IF NOT EXISTS notification_logs_rider_created_idx ON notification_logs(rider_id, created_at DESC);

-- ============================================================================
-- NOTIFICATION PREFERENCES INDEXES
-- ============================================================================

CREATE INDEX IF NOT EXISTS notification_preferences_rider_id_idx ON notification_preferences(rider_id);
CREATE INDEX IF NOT EXISTS notification_preferences_notification_type_idx ON notification_preferences(notification_type);
CREATE INDEX IF NOT EXISTS notification_preferences_enabled_idx ON notification_preferences(enabled) WHERE enabled = TRUE;
CREATE UNIQUE INDEX IF NOT EXISTS notification_preferences_rider_type_channel_idx ON notification_preferences(rider_id, notification_type, channel);

-- ============================================================================
-- OFFERS INDEXES
-- ============================================================================

CREATE INDEX IF NOT EXISTS offers_scope_idx ON offers(scope);
CREATE INDEX IF NOT EXISTS offers_reward_type_idx ON offers(reward_type);
CREATE INDEX IF NOT EXISTS offers_active_idx ON offers(active) WHERE active = TRUE;
CREATE INDEX IF NOT EXISTS offers_start_date_idx ON offers(start_date);
CREATE INDEX IF NOT EXISTS offers_end_date_idx ON offers(end_date);
-- Note: Cannot use NOW() in index predicate (not IMMUTABLE)
-- Index on active and dates - application should filter by current date
CREATE INDEX IF NOT EXISTS offers_active_date_range_idx ON offers(active, start_date, end_date) 
  WHERE active = TRUE;

-- ============================================================================
-- OFFER PARTICIPATION INDEXES
-- ============================================================================

CREATE INDEX IF NOT EXISTS offer_participation_rider_id_idx ON offer_participation(rider_id);
CREATE INDEX IF NOT EXISTS offer_participation_offer_id_idx ON offer_participation(offer_id);
CREATE INDEX IF NOT EXISTS offer_participation_completed_idx ON offer_participation(completed) WHERE completed = FALSE;
CREATE INDEX IF NOT EXISTS offer_participation_reward_claimed_idx ON offer_participation(reward_claimed) WHERE reward_claimed = FALSE;
CREATE UNIQUE INDEX IF NOT EXISTS offer_participation_rider_offer_idx ON offer_participation(rider_id, offer_id);

-- ============================================================================
-- RIDER DAILY ANALYTICS INDEXES
-- ============================================================================

CREATE INDEX IF NOT EXISTS rider_daily_analytics_rider_id_idx ON rider_daily_analytics(rider_id);
CREATE INDEX IF NOT EXISTS rider_daily_analytics_date_idx ON rider_daily_analytics(date);
CREATE UNIQUE INDEX IF NOT EXISTS rider_daily_analytics_rider_date_idx ON rider_daily_analytics(rider_id, date);

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON INDEX unified_tickets_open_idx IS 'Optimizes queries for open tickets by priority';
COMMENT ON INDEX webhook_events_pending_processing_idx IS 'Optimizes queries for pending webhook processing';
COMMENT ON INDEX offer_participation_rider_offer_idx IS 'Ensures one participation record per rider per offer';
