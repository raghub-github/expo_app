-- ============================================================================
-- MIGRATE UNIFIED_TICKETS TO ENTERPRISE TICKET SYSTEM
-- ============================================================================
-- This migration migrates data from the existing unified_tickets table
-- to the new enterprise ticket system structure.
-- ============================================================================
-- Migration: 0056_migrate_unified_tickets_to_enterprise
-- Date: 2026-01-23
-- Prerequisites: 0055_enterprise_ticket_system.sql
-- ============================================================================

-- ============================================================================
-- STEP 1: Migrate ticket titles from enum to ticket_titles table
-- ============================================================================

-- Insert default ticket titles for all service/section/source combinations
-- This creates titles based on the existing unified_ticket_title enum values

DO $$
DECLARE
  title_record RECORD;
  service_val ticket_service_type;
  section_val ticket_section;
  source_val ticket_source_role;
BEGIN
  -- Map existing enum values to new structure
  -- This is a simplified migration - you may need to adjust based on your actual enum values
  
  -- Food Service - Customer Section
  INSERT INTO ticket_titles (service_type, ticket_section, source_role, title_code, title_text, description)
  VALUES 
    ('food', 'customer', 'customer', 'ORDER_DELAYED', 'Order Delayed', 'Order delivery is delayed'),
    ('food', 'customer', 'customer', 'ORDER_NOT_RECEIVED', 'Order Not Received', 'Order was not received'),
    ('food', 'customer', 'customer', 'WRONG_ITEM_DELIVERED', 'Wrong Item Delivered', 'Wrong item was delivered'),
    ('food', 'customer', 'customer', 'ITEM_MISSING', 'Item Missing', 'Item is missing from order'),
    ('food', 'customer', 'customer', 'ORDER_CANCELLED_WRONG', 'Order Cancelled Wrong', 'Order was cancelled incorrectly'),
    ('food', 'customer', 'customer', 'PAYMENT_ISSUE', 'Payment Issue', 'Payment related issue'),
    ('food', 'customer', 'customer', 'REFUND_NOT_PROCESSED', 'Refund Not Processed', 'Refund has not been processed'),
    ('food', 'customer', 'customer', 'ORDER_DAMAGED', 'Order Damaged', 'Order was damaged during delivery'),
    ('food', 'customer', 'customer', 'ORDER_QUALITY_ISSUE', 'Order Quality Issue', 'Quality issue with the order'),
    ('food', 'customer', 'customer', 'RIDER_NOT_ARRIVED', 'Rider Not Arrived', 'Rider has not arrived'),
    ('food', 'customer', 'customer', 'RIDER_BEHAVIOUR_ISSUE', 'Rider Behaviour Issue', 'Issue with rider behaviour'),
    ('food', 'customer', 'customer', 'DELIVERY_ADDRESS_WRONG', 'Delivery Address Wrong', 'Delivery address is incorrect'),
    ('food', 'customer', 'customer', 'ACCOUNT_ISSUE', 'Account Issue', 'Account related issue'),
    ('food', 'customer', 'customer', 'PAYMENT_METHOD_ISSUE', 'Payment Method Issue', 'Payment method issue'),
    ('food', 'customer', 'customer', 'WALLET_ISSUE', 'Wallet Issue', 'Wallet related issue'),
    ('food', 'customer', 'customer', 'COUPON_NOT_APPLYING', 'Coupon Not Applying', 'Coupon is not applying'),
    ('food', 'customer', 'customer', 'APP_TECHNICAL_ISSUE', 'App Technical Issue', 'Technical issue with the app'),
    ('food', 'customer', 'customer', 'PROFILE_UPDATE_ISSUE', 'Profile Update Issue', 'Issue updating profile'),
    ('food', 'customer', 'customer', 'ADDRESS_MANAGEMENT_ISSUE', 'Address Management Issue', 'Issue managing addresses'),
    ('food', 'customer', 'customer', 'NOTIFICATION_NOT_RECEIVING', 'Notification Not Receiving', 'Not receiving notifications'),
    ('food', 'customer', 'customer', 'OTHER', 'Other', 'Other issue'),
    ('food', 'customer', 'customer', 'FEEDBACK', 'Feedback', 'General feedback'),
    ('food', 'customer', 'customer', 'COMPLAINT', 'Complaint', 'General complaint'),
    ('food', 'customer', 'customer', 'SUGGESTION', 'Suggestion', 'Suggestion')
  ON CONFLICT (title_code) DO NOTHING;
  
  -- Food Service - Rider Section
  INSERT INTO ticket_titles (service_type, ticket_section, source_role, title_code, title_text, description)
  VALUES 
    ('food', 'rider', 'rider', 'EARNINGS_NOT_CREDITED', 'Earnings Not Credited', 'Earnings have not been credited'),
    ('food', 'rider', 'rider', 'WALLET_WITHDRAWAL_ISSUE', 'Wallet Withdrawal Issue', 'Issue with wallet withdrawal'),
    ('food', 'rider', 'rider', 'APP_CRASH_OR_BUG', 'App Crash or Bug', 'App is crashing or has bugs'),
    ('food', 'rider', 'rider', 'LOCATION_TRACKING_ISSUE', 'Location Tracking Issue', 'Issue with location tracking'),
    ('food', 'rider', 'rider', 'RIDER_ORDER_NOT_RECEIVING', 'Order Not Receiving', 'Not receiving orders'),
    ('food', 'rider', 'rider', 'ONBOARDING_ISSUE', 'Onboarding Issue', 'Issue with onboarding process'),
    ('food', 'rider', 'rider', 'DOCUMENT_VERIFICATION_ISSUE', 'Document Verification Issue', 'Issue with document verification'),
    ('food', 'rider', 'rider', 'DUTY_LOG_ISSUE', 'Duty Log Issue', 'Issue with duty logging'),
    ('food', 'rider', 'rider', 'RATING_DISPUTE', 'Rating Dispute', 'Dispute regarding rating')
  ON CONFLICT (title_code) DO NOTHING;
  
  -- Food Service - Merchant Section
  INSERT INTO ticket_titles (service_type, ticket_section, source_role, title_code, title_text, description)
  VALUES 
    ('food', 'merchant', 'merchant', 'PAYOUT_DELAYED', 'Payout Delayed', 'Payout is delayed'),
    ('food', 'merchant', 'merchant', 'PAYOUT_NOT_RECEIVED', 'Payout Not Received', 'Payout has not been received'),
    ('food', 'merchant', 'merchant', 'SETTLEMENT_DISPUTE', 'Settlement Dispute', 'Dispute regarding settlement'),
    ('food', 'merchant', 'merchant', 'COMMISSION_DISPUTE', 'Commission Dispute', 'Dispute regarding commission'),
    ('food', 'merchant', 'merchant', 'MENU_UPDATE_ISSUE', 'Menu Update Issue', 'Issue updating menu'),
    ('food', 'merchant', 'merchant', 'STORE_STATUS_ISSUE', 'Store Status Issue', 'Issue with store status'),
    ('food', 'merchant', 'merchant', 'MERCHANT_ORDER_NOT_RECEIVING', 'Order Not Receiving', 'Not receiving orders'),
    ('food', 'merchant', 'merchant', 'MERCHANT_APP_TECHNICAL_ISSUE', 'App Technical Issue', 'Technical issue with merchant app'),
    ('food', 'merchant', 'merchant', 'VERIFICATION_ISSUE', 'Verification Issue', 'Issue with verification')
  ON CONFLICT (title_code) DO NOTHING;
  
  -- Parcel Service - Similar titles (adjust as needed)
  INSERT INTO ticket_titles (service_type, ticket_section, source_role, title_code, title_text, description)
  SELECT 
    'parcel'::ticket_service_type,
    ticket_section,
    source_role,
    title_code,
    title_text,
    description
  FROM ticket_titles
  WHERE service_type = 'food'
  ON CONFLICT (title_code) DO NOTHING;
  
  -- Person Ride Service - Similar titles (adjust as needed)
  INSERT INTO ticket_titles (service_type, ticket_section, source_role, title_code, title_text, description)
  SELECT 
    'person_ride'::ticket_service_type,
    ticket_section,
    source_role,
    title_code,
    title_text,
    description
  FROM ticket_titles
  WHERE service_type = 'food'
  ON CONFLICT (title_code) DO NOTHING;
  
  -- Other Service - System titles
  INSERT INTO ticket_titles (service_type, ticket_section, source_role, title_code, title_text, description)
  VALUES 
    ('other', 'system', 'system', 'SYSTEM_ERROR', 'System Error', 'System generated error'),
    ('other', 'system', 'system', 'FRAUD_DETECTED', 'Fraud Detected', 'Fraud detected by system'),
    ('other', 'system', 'system', 'ABUSE_DETECTED', 'Abuse Detected', 'Abuse detected by system'),
    ('other', 'system', 'system', 'TECHNICAL_ISSUE', 'Technical Issue', 'Technical issue detected')
  ON CONFLICT (title_code) DO NOTHING;
END $$;

-- ============================================================================
-- STEP 2: Migrate tickets from unified_tickets to tickets table
-- ============================================================================

-- Create mapping function for service types
CREATE OR REPLACE FUNCTION map_unified_service_type_to_new(unified_type TEXT)
RETURNS ticket_service_type AS $$
BEGIN
  RETURN CASE unified_type
    WHEN 'FOOD' THEN 'food'::ticket_service_type
    WHEN 'PARCEL' THEN 'parcel'::ticket_service_type
    WHEN 'RIDE' THEN 'person_ride'::ticket_service_type
    WHEN 'GENERAL' THEN 'other'::ticket_service_type
    ELSE 'other'::ticket_service_type
  END;
END;
$$ LANGUAGE plpgsql;

-- Create mapping function for ticket categories
CREATE OR REPLACE FUNCTION map_unified_category_to_new(unified_type TEXT)
RETURNS ticket_category AS $$
BEGIN
  RETURN CASE unified_type
    WHEN 'ORDER_RELATED' THEN 'order_related'::ticket_category
    WHEN 'NON_ORDER_RELATED' THEN 'non_order'::ticket_category
    ELSE 'other'::ticket_category
  END;
END;
$$ LANGUAGE plpgsql;

-- Create mapping function for ticket sections
CREATE OR REPLACE FUNCTION map_unified_source_to_section(unified_source TEXT)
RETURNS ticket_section AS $$
BEGIN
  RETURN CASE unified_source
    WHEN 'CUSTOMER' THEN 'customer'::ticket_section
    WHEN 'RIDER' THEN 'rider'::ticket_section
    WHEN 'MERCHANT' THEN 'merchant'::ticket_section
    WHEN 'SYSTEM' THEN 'system'::ticket_section
    ELSE 'other'::ticket_section
  END;
END;
$$ LANGUAGE plpgsql;

-- Create mapping function for source roles
CREATE OR REPLACE FUNCTION map_unified_source_to_role(unified_source TEXT, service_type TEXT)
RETURNS ticket_source_role AS $$
BEGIN
  RETURN CASE 
    WHEN unified_source = 'CUSTOMER' AND service_type = 'PARCEL' THEN 'customer_pickup'::ticket_source_role
    WHEN unified_source = 'CUSTOMER' THEN 'customer'::ticket_source_role
    WHEN unified_source = 'RIDER' THEN 'rider'::ticket_source_role
    WHEN unified_source = 'MERCHANT' THEN 'merchant'::ticket_source_role
    WHEN unified_source = 'SYSTEM' THEN 'system'::ticket_source_role
    ELSE 'customer'::ticket_source_role
  END;
END;
$$ LANGUAGE plpgsql;

-- Create mapping function for status
CREATE OR REPLACE FUNCTION map_unified_status_to_new(unified_status TEXT)
RETURNS ticket_status AS $$
BEGIN
  RETURN CASE unified_status
    WHEN 'OPEN' THEN 'open'::ticket_status
    WHEN 'IN_PROGRESS' THEN 'in_progress'::ticket_status
    WHEN 'RESOLVED' THEN 'resolved'::ticket_status
    WHEN 'CLOSED' THEN 'closed'::ticket_status
    WHEN 'REOPENED' THEN 'reopened'::ticket_status
    WHEN 'ESCALATED' THEN 'in_progress'::ticket_status -- Map escalated to in_progress
    WHEN 'WAITING_FOR_USER' THEN 'in_progress'::ticket_status
    WHEN 'WAITING_FOR_MERCHANT' THEN 'in_progress'::ticket_status
    WHEN 'WAITING_FOR_RIDER' THEN 'in_progress'::ticket_status
    WHEN 'CANCELLED' THEN 'closed'::ticket_status
    ELSE 'open'::ticket_status
  END;
END;
$$ LANGUAGE plpgsql;

-- Create mapping function for priority
CREATE OR REPLACE FUNCTION map_unified_priority_to_new(unified_priority TEXT)
RETURNS ticket_priority AS $$
BEGIN
  RETURN CASE unified_priority
    WHEN 'LOW' THEN 'low'::ticket_priority
    WHEN 'MEDIUM' THEN 'medium'::ticket_priority
    WHEN 'HIGH' THEN 'high'::ticket_priority
    WHEN 'URGENT' THEN 'urgent'::ticket_priority
    WHEN 'CRITICAL' THEN 'critical'::ticket_priority
    ELSE 'medium'::ticket_priority
  END;
END;
$$ LANGUAGE plpgsql;

-- Migrate tickets (only if unified_tickets table exists)
DO $$
DECLARE
  ticket_record RECORD;
  new_title_id BIGINT;
  new_ticket_id BIGINT;
BEGIN
  -- Check if unified_tickets table exists
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'unified_tickets') THEN
    
    FOR ticket_record IN 
      SELECT * FROM unified_tickets
      ORDER BY id
    LOOP
      -- Find matching title_id
      SELECT id INTO new_title_id
      FROM ticket_titles
      WHERE title_code = ticket_record.ticket_title::text
        AND service_type = map_unified_service_type_to_new(ticket_record.service_type::text)
        AND ticket_section = map_unified_source_to_section(ticket_record.ticket_source::text)
        AND source_role = map_unified_source_to_role(ticket_record.ticket_source::text, ticket_record.service_type::text)
        AND is_active = TRUE
      LIMIT 1;
      
      -- If no matching title found, use a default or create one
      IF new_title_id IS NULL THEN
        -- Try to find any title with the same code
        SELECT id INTO new_title_id
        FROM ticket_titles
        WHERE title_code = ticket_record.ticket_title::text
        LIMIT 1;
        
        -- If still not found, use 'OTHER' title
        IF new_title_id IS NULL THEN
          SELECT id INTO new_title_id
          FROM ticket_titles
          WHERE title_code = 'OTHER'
          LIMIT 1;
        END IF;
      END IF;
      
      -- Insert into new tickets table
      INSERT INTO tickets (
        ticket_number,
        service_type,
        ticket_category,
        ticket_section,
        source_role,
        title_id,
        subject,
        description,
        status,
        priority,
        order_id,
        order_service_type,
        created_by_user_id,
        current_assignee_user_id,
        resolved_at,
        closed_at,
        created_at,
        updated_at
      ) VALUES (
        ticket_record.ticket_id, -- Use existing ticket_id as ticket_number
        map_unified_service_type_to_new(ticket_record.service_type::text),
        map_unified_category_to_new(ticket_record.ticket_type::text),
        map_unified_source_to_section(ticket_record.ticket_source::text),
        map_unified_source_to_role(ticket_record.ticket_source::text, ticket_record.service_type::text),
        new_title_id,
        ticket_record.subject,
        ticket_record.description,
        map_unified_status_to_new(ticket_record.status::text),
        map_unified_priority_to_new(ticket_record.priority::text),
        ticket_record.order_id,
        CASE 
          WHEN ticket_record.order_id IS NOT NULL THEN 
            map_unified_service_type_to_new(ticket_record.service_type::text)
          ELSE NULL
        END,
        ticket_record.raised_by_id, -- Assuming raised_by_id maps to created_by_user_id
        ticket_record.assigned_to_agent_id,
        ticket_record.resolved_at,
        ticket_record.closed_at,
        ticket_record.created_at,
        ticket_record.updated_at
      )
      RETURNING id INTO new_ticket_id;
      
      -- Create participants
      IF ticket_record.customer_id IS NOT NULL THEN
        INSERT INTO ticket_participants (ticket_id, participant_role, entity_type, customer_id)
        VALUES (new_ticket_id, 'creator', 'customer', ticket_record.customer_id)
        ON CONFLICT DO NOTHING;
      END IF;
      
      IF ticket_record.rider_id IS NOT NULL THEN
        INSERT INTO ticket_participants (ticket_id, participant_role, entity_type, rider_id)
        VALUES (new_ticket_id, 'creator', 'rider', ticket_record.rider_id)
        ON CONFLICT DO NOTHING;
      END IF;
      
      IF ticket_record.merchant_store_id IS NOT NULL THEN
        INSERT INTO ticket_participants (ticket_id, participant_role, entity_type, merchant_id)
        VALUES (new_ticket_id, 'creator', 'merchant', ticket_record.merchant_store_id)
        ON CONFLICT DO NOTHING;
      END IF;
      
      -- Create initial assignment if exists
      IF ticket_record.assigned_to_agent_id IS NOT NULL THEN
        INSERT INTO ticket_assignments (
          ticket_id,
          assigned_to_user_id,
          assigned_by_user_id,
          assigned_at
        ) VALUES (
          new_ticket_id,
          ticket_record.assigned_to_agent_id,
          COALESCE(ticket_record.assigned_to_agent_id, 1),
          COALESCE(ticket_record.assigned_at, ticket_record.created_at)
        )
        ON CONFLICT DO NOTHING;
      END IF;
      
      -- Migrate messages from unified_ticket_messages
      IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'unified_ticket_messages') THEN
        INSERT INTO ticket_messages (
          ticket_id,
          sender_type,
          sender_id,
          message_type,
          message,
          attachments,
          created_at,
          updated_at
        )
        SELECT 
          new_ticket_id,
          CASE sender_type::text
            WHEN 'CUSTOMER' THEN 'customer'::ticket_sender_type
            WHEN 'RIDER' THEN 'rider'::ticket_sender_type
            WHEN 'MERCHANT' THEN 'merchant'::ticket_sender_type
            WHEN 'AGENT' THEN 'agent'::ticket_sender_type
            WHEN 'SYSTEM' THEN 'system'::ticket_sender_type
            ELSE 'system'::ticket_sender_type
          END,
          sender_id,
          CASE 
            WHEN is_internal_note THEN 'internal_note'::ticket_message_type
            ELSE 'reply'::ticket_message_type
          END,
          message_text,
          COALESCE(attachments::jsonb, '[]'::jsonb),
          created_at,
          updated_at
        FROM unified_ticket_messages
        WHERE ticket_id = ticket_record.id;
      END IF;
      
      -- Migrate status history from unified_ticket_activities
      IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'unified_ticket_activities') THEN
        INSERT INTO ticket_status_history (
          ticket_id,
          old_status,
          new_status,
          changed_by_user_id,
          reason,
          created_at
        )
        SELECT 
          new_ticket_id,
          (old_value->>'status')::ticket_status,
          (new_value->>'status')::ticket_status,
          COALESCE(actor_id, 1),
          activity_description,
          created_at
        FROM unified_ticket_activities
        WHERE ticket_id = ticket_record.id
          AND activity_type = 'STATUS_CHANGED'
          AND old_value->>'status' IS NOT NULL
          AND new_value->>'status' IS NOT NULL;
      END IF;
      
      -- Migrate ratings
      IF ticket_record.satisfaction_rating IS NOT NULL THEN
        INSERT INTO ticket_ratings (
          ticket_id,
          rated_by_type,
          rated_by_id,
          rating_value,
          feedback_text,
          created_at
        ) VALUES (
          new_ticket_id,
          CASE ticket_record.raised_by_type::text
            WHEN 'CUSTOMER' THEN 'customer'::ticket_rated_by_type
            WHEN 'RIDER' THEN 'rider'::ticket_rated_by_type
            WHEN 'MERCHANT' THEN 'merchant'::ticket_rated_by_type
            ELSE 'customer'::ticket_rated_by_type
          END,
          COALESCE(ticket_record.raised_by_id, 1),
          ticket_record.satisfaction_rating,
          ticket_record.satisfaction_feedback,
          COALESCE(ticket_record.satisfaction_collected_at, ticket_record.resolved_at)
        )
        ON CONFLICT DO NOTHING;
      END IF;
      
      -- Migrate tags if they exist
      IF ticket_record.tags IS NOT NULL AND array_length(ticket_record.tags, 1) > 0 THEN
        INSERT INTO ticket_tag_map (ticket_id, tag_id, added_by_user_id)
        SELECT 
          new_ticket_id,
          tt.id,
          COALESCE(ticket_record.assigned_to_agent_id, ticket_record.raised_by_id, 1)
        FROM ticket_tags tt
        WHERE tt.tag_code = ANY(ticket_record.tags)
        ON CONFLICT DO NOTHING;
      END IF;
      
    END LOOP;
    
    RAISE NOTICE 'Migration completed: Migrated % tickets from unified_tickets to tickets', 
      (SELECT COUNT(*) FROM tickets);
  ELSE
    RAISE NOTICE 'unified_tickets table does not exist - skipping migration';
  END IF;
END $$;

-- ============================================================================
-- CLEANUP: Drop helper functions
-- ============================================================================

DROP FUNCTION IF EXISTS map_unified_service_type_to_new(TEXT);
DROP FUNCTION IF EXISTS map_unified_category_to_new(TEXT);
DROP FUNCTION IF EXISTS map_unified_source_to_section(TEXT);
DROP FUNCTION IF EXISTS map_unified_source_to_role(TEXT, TEXT);
DROP FUNCTION IF EXISTS map_unified_status_to_new(TEXT);
DROP FUNCTION IF EXISTS map_unified_priority_to_new(TEXT);

-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================

COMMENT ON TABLE tickets IS 'Migrated from unified_tickets - enterprise ticket system';
COMMENT ON TABLE ticket_titles IS 'Migrated from unified_ticket_title enum - now dynamic catalog';
