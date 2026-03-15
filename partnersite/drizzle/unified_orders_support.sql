-- ============================================================================
-- UNIFIED ORDERS SUPPORT AND COMMUNICATION
-- Production-Grade Support System
-- Tickets, disputes, remarks, instructions, and notifications
-- Migration: unified_orders_support
-- Database: PostgreSQL
-- ORM: Drizzle
-- 
-- DESIGN PRINCIPLES:
-- - Order-Specific Support: All support items linked to orders
-- - Multi-Actor Support: Customers, riders, merchants, agents can raise tickets
-- - Complete Audit Trail: All support actions tracked
-- - Notification Tracking: All notifications logged
-- ============================================================================

-- ============================================================================
-- ENSURE ENUMS EXIST
-- ============================================================================

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ticket_source_type') THEN
    CREATE TYPE ticket_source_type AS ENUM (
      'customer',
      'rider',
      'merchant',
      'system',
      'agent'
    );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ticket_priority_type') THEN
    CREATE TYPE ticket_priority_type AS ENUM (
      'low',
      'medium',
      'high',
      'urgent',
      'critical'
    );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'notification_channel_type') THEN
    CREATE TYPE notification_channel_type AS ENUM (
      'push',
      'sms',
      'email',
      'in_app',
      'whatsapp',
      'call'
    );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ticket_status') THEN
    CREATE TYPE ticket_status AS ENUM (
      'open',
      'in_progress',
      'resolved',
      'closed'
    );
  END IF;
END $$;

-- ============================================================================
-- ORDER TICKETS (Support Tickets)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.order_tickets (
  id BIGSERIAL PRIMARY KEY,
  order_id BIGINT NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  
  -- ==========================================================================
  -- TICKET SOURCE
  -- ==========================================================================
  ticket_source ticket_source_type NOT NULL,
  raised_by_id BIGINT,
  raised_by_name TEXT,
  raised_by_type TEXT, -- 'customer', 'rider', 'merchant', 'agent'
  
  -- ==========================================================================
  -- ISSUE DETAILS
  -- ==========================================================================
  issue_category TEXT NOT NULL, -- 'delivery_delay', 'wrong_item', 'payment_issue', 'rider_issue', etc.
  issue_subcategory TEXT,
  description TEXT NOT NULL,
  attachments TEXT[], -- URLs to attached files/images
  
  -- ==========================================================================
  -- PRIORITY & STATUS
  -- ==========================================================================
  priority ticket_priority_type NOT NULL DEFAULT 'medium',
  status ticket_status NOT NULL DEFAULT 'open',
  
  -- ==========================================================================
  -- ASSIGNMENT
  -- ==========================================================================
  assigned_to_agent_id INTEGER REFERENCES public.system_users(id) ON DELETE SET NULL,
  assigned_to_agent_name TEXT,
  assigned_at TIMESTAMP WITH TIME ZONE,
  
  -- ==========================================================================
  -- RESOLUTION
  -- ==========================================================================
  resolution TEXT,
  resolved_at TIMESTAMP WITH TIME ZONE,
  resolved_by INTEGER REFERENCES public.system_users(id) ON DELETE SET NULL,
  resolved_by_name TEXT,
  
  -- ==========================================================================
  -- FOLLOW-UP
  -- ==========================================================================
  follow_up_required BOOLEAN DEFAULT FALSE,
  follow_up_date TIMESTAMP WITH TIME ZONE,
  
  -- ==========================================================================
  -- METADATA
  -- ==========================================================================
  ticket_metadata JSONB DEFAULT '{}',
  
  -- ==========================================================================
  -- TIMESTAMPS
  -- ==========================================================================
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Indexes for order_tickets
CREATE INDEX IF NOT EXISTS order_tickets_order_id_idx ON public.order_tickets(order_id);
CREATE INDEX IF NOT EXISTS order_tickets_ticket_source_idx ON public.order_tickets(ticket_source);
CREATE INDEX IF NOT EXISTS order_tickets_raised_by_id_idx ON public.order_tickets(raised_by_id) WHERE raised_by_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS order_tickets_issue_category_idx ON public.order_tickets(issue_category);
CREATE INDEX IF NOT EXISTS order_tickets_priority_idx ON public.order_tickets(priority);
CREATE INDEX IF NOT EXISTS order_tickets_status_idx ON public.order_tickets(status);
CREATE INDEX IF NOT EXISTS order_tickets_assigned_to_agent_id_idx ON public.order_tickets(assigned_to_agent_id) WHERE assigned_to_agent_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS order_tickets_created_at_idx ON public.order_tickets(created_at);
CREATE INDEX IF NOT EXISTS order_tickets_follow_up_required_idx ON public.order_tickets(follow_up_required) WHERE follow_up_required = TRUE;

-- Comments
COMMENT ON TABLE public.order_tickets IS 'Support tickets related to orders. Raised by customers, riders, merchants, or agents. Tracks priority, status, assignment, and resolution.';
COMMENT ON COLUMN public.order_tickets.order_id IS 'Foreign key to orders table.';
COMMENT ON COLUMN public.order_tickets.ticket_source IS 'Source of ticket: customer, rider, merchant, system, agent.';
COMMENT ON COLUMN public.order_tickets.raised_by_id IS 'ID of who raised the ticket.';
COMMENT ON COLUMN public.order_tickets.raised_by_name IS 'Name of who raised the ticket (snapshot at creation).';
COMMENT ON COLUMN public.order_tickets.issue_category IS 'Category of issue: delivery_delay, wrong_item, payment_issue, rider_issue, etc.';
COMMENT ON COLUMN public.order_tickets.issue_subcategory IS 'More specific category (if applicable).';
COMMENT ON COLUMN public.order_tickets.description IS 'Detailed description of the issue.';
COMMENT ON COLUMN public.order_tickets.attachments IS 'Array of URLs to attached files/images.';
COMMENT ON COLUMN public.order_tickets.priority IS 'Priority level: low, medium, high, urgent, critical.';
COMMENT ON COLUMN public.order_tickets.status IS 'Ticket status: open, in_progress, resolved, closed.';
COMMENT ON COLUMN public.order_tickets.assigned_to_agent_id IS 'ID of agent assigned to handle this ticket.';
COMMENT ON COLUMN public.order_tickets.resolution IS 'Resolution details (when ticket is resolved).';
COMMENT ON COLUMN public.order_tickets.follow_up_required IS 'Whether follow-up is required after resolution.';

-- ============================================================================
-- ORDER DISPUTES (Legal Disputes)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.order_disputes (
  id BIGSERIAL PRIMARY KEY,
  order_id BIGINT NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  order_ticket_id BIGINT REFERENCES public.order_tickets(id) ON DELETE SET NULL,
  
  -- ==========================================================================
  -- DISPUTE DETAILS
  -- ==========================================================================
  dispute_type TEXT NOT NULL, -- 'refund', 'damage', 'non_delivery', 'fraud', etc.
  dispute_reason TEXT NOT NULL,
  dispute_description TEXT,
  
  -- ==========================================================================
  -- PARTIES
  -- ==========================================================================
  raised_by TEXT NOT NULL, -- 'customer', 'merchant', 'rider'
  raised_by_id BIGINT,
  disputed_against TEXT, -- 'customer', 'merchant', 'rider', 'platform'
  disputed_against_id BIGINT,
  
  -- ==========================================================================
  -- EVIDENCE
  -- ==========================================================================
  evidence_urls TEXT[], -- URLs to evidence files/images
  evidence_description TEXT,
  
  -- ==========================================================================
  -- RESOLUTION
  -- ==========================================================================
  dispute_status TEXT DEFAULT 'open', -- 'open', 'investigating', 'resolved', 'closed', 'escalated'
  resolution TEXT,
  resolution_amount NUMERIC(12, 2),
  resolved_at TIMESTAMP WITH TIME ZONE,
  resolved_by INTEGER REFERENCES public.system_users(id) ON DELETE SET NULL,
  resolved_by_name TEXT,
  
  -- ==========================================================================
  -- LEGAL INFORMATION
  -- ==========================================================================
  legal_case_id TEXT,
  legal_notes TEXT,
  
  -- ==========================================================================
  -- METADATA
  -- ==========================================================================
  dispute_metadata JSONB DEFAULT '{}',
  
  -- ==========================================================================
  -- TIMESTAMPS
  -- ==========================================================================
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Indexes for order_disputes
CREATE INDEX IF NOT EXISTS order_disputes_order_id_idx ON public.order_disputes(order_id);
CREATE INDEX IF NOT EXISTS order_disputes_order_ticket_id_idx ON public.order_disputes(order_ticket_id) WHERE order_ticket_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS order_disputes_dispute_status_idx ON public.order_disputes(dispute_status);
CREATE INDEX IF NOT EXISTS order_disputes_dispute_type_idx ON public.order_disputes(dispute_type);
CREATE INDEX IF NOT EXISTS order_disputes_raised_by_idx ON public.order_disputes(raised_by, raised_by_id);
CREATE INDEX IF NOT EXISTS order_disputes_disputed_against_idx ON public.order_disputes(disputed_against) WHERE disputed_against IS NOT NULL;
CREATE INDEX IF NOT EXISTS order_disputes_created_at_idx ON public.order_disputes(created_at);

-- Comments
COMMENT ON TABLE public.order_disputes IS 'Legal disputes raised for orders. Tracks dispute type, parties, evidence, resolution, and legal case information.';
COMMENT ON COLUMN public.order_disputes.order_id IS 'Foreign key to orders table.';
COMMENT ON COLUMN public.order_disputes.order_ticket_id IS 'Foreign key to order_tickets table (if dispute originated from a ticket).';
COMMENT ON COLUMN public.order_disputes.dispute_type IS 'Type of dispute: refund, damage, non_delivery, fraud, etc.';
COMMENT ON COLUMN public.order_disputes.dispute_reason IS 'Reason for dispute (required).';
COMMENT ON COLUMN public.order_disputes.dispute_description IS 'Detailed description of dispute.';
COMMENT ON COLUMN public.order_disputes.raised_by IS 'Who raised the dispute: customer, merchant, rider.';
COMMENT ON COLUMN public.order_disputes.raised_by_id IS 'ID of who raised the dispute.';
COMMENT ON COLUMN public.order_disputes.disputed_against IS 'Who is disputed against: customer, merchant, rider, platform.';
COMMENT ON COLUMN public.order_disputes.disputed_against_id IS 'ID of who is disputed against.';
COMMENT ON COLUMN public.order_disputes.evidence_urls IS 'Array of URLs to evidence files/images.';
COMMENT ON COLUMN public.order_disputes.dispute_status IS 'Dispute status: open, investigating, resolved, closed, escalated.';
COMMENT ON COLUMN public.order_disputes.resolution IS 'Resolution details (when dispute is resolved).';
COMMENT ON COLUMN public.order_disputes.resolution_amount IS 'Amount resolved/refunded (if applicable).';
COMMENT ON COLUMN public.order_disputes.legal_case_id IS 'Legal case ID (if escalated to legal).';
COMMENT ON COLUMN public.order_disputes.legal_notes IS 'Legal team notes.';

-- ============================================================================
-- ORDER REMARKS (Remarks/Notes on Orders)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.order_remarks (
  id BIGSERIAL PRIMARY KEY,
  order_id BIGINT NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  
  -- ==========================================================================
  -- ACTOR INFORMATION
  -- ==========================================================================
  actor_type TEXT NOT NULL, -- 'customer', 'rider', 'merchant', 'agent', 'system'
  actor_id BIGINT,
  actor_name TEXT,
  
  -- ==========================================================================
  -- REMARK DETAILS
  -- ==========================================================================
  action_taken TEXT, -- 'status_changed', 'refund_issued', 'rider_reassigned', etc.
  remark TEXT NOT NULL,
  remark_category TEXT, -- 'complaint', 'feedback', 'instruction', 'note'
  remark_priority TEXT DEFAULT 'normal', -- 'low', 'normal', 'high', 'urgent'
  
  -- ==========================================================================
  -- VISIBILITY
  -- ==========================================================================
  visible_to TEXT[], -- Array of actor types who can see this remark
  is_internal BOOLEAN DEFAULT FALSE, -- Internal agent notes
  
  -- ==========================================================================
  -- METADATA
  -- ==========================================================================
  remark_metadata JSONB DEFAULT '{}',
  
  -- ==========================================================================
  -- TIMESTAMPS
  -- ==========================================================================
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Indexes for order_remarks
CREATE INDEX IF NOT EXISTS order_remarks_order_id_idx ON public.order_remarks(order_id);
CREATE INDEX IF NOT EXISTS order_remarks_actor_type_idx ON public.order_remarks(actor_type);
CREATE INDEX IF NOT EXISTS order_remarks_actor_id_idx ON public.order_remarks(actor_id) WHERE actor_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS order_remarks_remark_category_idx ON public.order_remarks(remark_category) WHERE remark_category IS NOT NULL;
CREATE INDEX IF NOT EXISTS order_remarks_is_internal_idx ON public.order_remarks(is_internal) WHERE is_internal = TRUE;
CREATE INDEX IF NOT EXISTS order_remarks_created_at_idx ON public.order_remarks(created_at);

-- Comments
COMMENT ON TABLE public.order_remarks IS 'Remarks/notes added to orders by customers, riders, merchants, or agents. Supports internal notes and public remarks with visibility control.';
COMMENT ON COLUMN public.order_remarks.order_id IS 'Foreign key to orders table.';
COMMENT ON COLUMN public.order_remarks.actor_type IS 'Type of actor who added remark: customer, rider, merchant, agent, system.';
COMMENT ON COLUMN public.order_remarks.actor_id IS 'ID of actor who added remark.';
COMMENT ON COLUMN public.order_remarks.actor_name IS 'Name of actor who added remark (snapshot at creation).';
COMMENT ON COLUMN public.order_remarks.action_taken IS 'Action taken when remark was added: status_changed, refund_issued, rider_reassigned, etc.';
COMMENT ON COLUMN public.order_remarks.remark IS 'Remark text (required).';
COMMENT ON COLUMN public.order_remarks.remark_category IS 'Category of remark: complaint, feedback, instruction, note.';
COMMENT ON COLUMN public.order_remarks.remark_priority IS 'Priority of remark: low, normal, high, urgent.';
COMMENT ON COLUMN public.order_remarks.visible_to IS 'Array of actor types who can see this remark (e.g., ["customer", "agent"]).';
COMMENT ON COLUMN public.order_remarks.is_internal IS 'Whether this is an internal agent note (not visible to customers/riders/merchants).';

-- ============================================================================
-- ORDER INSTRUCTIONS (Special Instructions)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.order_instructions (
  id BIGSERIAL PRIMARY KEY,
  order_id BIGINT NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  
  -- ==========================================================================
  -- INSTRUCTION DETAILS
  -- ==========================================================================
  instruction_for TEXT NOT NULL, -- 'merchant', 'rider', 'customer'
  instruction_text TEXT NOT NULL,
  instruction_priority TEXT DEFAULT 'normal', -- 'low', 'normal', 'high', 'urgent'
  
  -- ==========================================================================
  -- CREATION DETAILS
  -- ==========================================================================
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  created_by TEXT, -- 'customer', 'merchant', 'rider', 'agent', 'system'
  created_by_id BIGINT
);

-- Indexes for order_instructions
CREATE INDEX IF NOT EXISTS order_instructions_order_id_idx ON public.order_instructions(order_id);
CREATE INDEX IF NOT EXISTS order_instructions_instruction_for_idx ON public.order_instructions(instruction_for);
CREATE INDEX IF NOT EXISTS order_instructions_instruction_priority_idx ON public.order_instructions(instruction_priority) WHERE instruction_priority IS NOT NULL;
CREATE INDEX IF NOT EXISTS order_instructions_created_at_idx ON public.order_instructions(created_at);

-- Comments
COMMENT ON TABLE public.order_instructions IS 'Special instructions for merchant, rider, or customer. Used for delivery instructions, preparation notes, etc.';
COMMENT ON COLUMN public.order_instructions.order_id IS 'Foreign key to orders table.';
COMMENT ON COLUMN public.order_instructions.instruction_for IS 'Who the instruction is for: merchant, rider, customer.';
COMMENT ON COLUMN public.order_instructions.instruction_text IS 'Instruction text (required).';
COMMENT ON COLUMN public.order_instructions.instruction_priority IS 'Priority of instruction: low, normal, high, urgent.';
COMMENT ON COLUMN public.order_instructions.created_by IS 'Who created the instruction: customer, merchant, rider, agent, system.';
COMMENT ON COLUMN public.order_instructions.created_by_id IS 'ID of who created the instruction.';

-- ============================================================================
-- ORDER NOTIFICATIONS (Notification Tracking)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.order_notifications (
  id BIGSERIAL PRIMARY KEY,
  order_id BIGINT NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  
  -- ==========================================================================
  -- NOTIFICATION DETAILS
  -- ==========================================================================
  notification_type TEXT NOT NULL, -- 'order_placed', 'order_accepted', 'order_delivered', etc.
  notification_channel notification_channel_type NOT NULL,
  message TEXT NOT NULL,
  message_template_id TEXT,
  
  -- ==========================================================================
  -- RECIPIENT
  -- ==========================================================================
  sent_to TEXT NOT NULL, -- Phone, email, or user ID
  recipient_type TEXT, -- 'customer', 'rider', 'merchant'
  recipient_id BIGINT,
  
  -- ==========================================================================
  -- DELIVERY STATUS
  -- ==========================================================================
  sent_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  delivered_at TIMESTAMP WITH TIME ZONE,
  read_at TIMESTAMP WITH TIME ZONE,
  failed_at TIMESTAMP WITH TIME ZONE,
  
  -- ==========================================================================
  -- PROVIDER DETAILS
  -- ==========================================================================
  provider_message_id TEXT, -- Provider's message ID (for SMS/email providers)
  provider_response JSONB DEFAULT '{}',
  
  -- ==========================================================================
  -- METADATA
  -- ==========================================================================
  notification_metadata JSONB DEFAULT '{}'
);

-- Indexes for order_notifications
CREATE INDEX IF NOT EXISTS order_notifications_order_id_idx ON public.order_notifications(order_id);
CREATE INDEX IF NOT EXISTS order_notifications_notification_type_idx ON public.order_notifications(notification_type);
CREATE INDEX IF NOT EXISTS order_notifications_notification_channel_idx ON public.order_notifications(notification_channel);
CREATE INDEX IF NOT EXISTS order_notifications_sent_to_idx ON public.order_notifications(sent_to);
CREATE INDEX IF NOT EXISTS order_notifications_recipient_type_idx ON public.order_notifications(recipient_type) WHERE recipient_type IS NOT NULL;
CREATE INDEX IF NOT EXISTS order_notifications_recipient_id_idx ON public.order_notifications(recipient_id) WHERE recipient_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS order_notifications_sent_at_idx ON public.order_notifications(sent_at);
CREATE INDEX IF NOT EXISTS order_notifications_delivered_at_idx ON public.order_notifications(delivered_at) WHERE delivered_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS order_notifications_read_at_idx ON public.order_notifications(read_at) WHERE read_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS order_notifications_failed_at_idx ON public.order_notifications(failed_at) WHERE failed_at IS NOT NULL;

-- Comments
COMMENT ON TABLE public.order_notifications IS 'All notifications sent for orders. Tracks notification type, channel, recipient, delivery status, and provider details.';
COMMENT ON COLUMN public.order_notifications.order_id IS 'Foreign key to orders table.';
COMMENT ON COLUMN public.order_notifications.notification_type IS 'Type of notification: order_placed, order_accepted, order_delivered, etc.';
COMMENT ON COLUMN public.order_notifications.notification_channel IS 'Channel used: push, sms, email, in_app, whatsapp, call.';
COMMENT ON COLUMN public.order_notifications.message IS 'Notification message text.';
COMMENT ON COLUMN public.order_notifications.message_template_id IS 'Template ID used (if templated notification).';
COMMENT ON COLUMN public.order_notifications.sent_to IS 'Recipient identifier: phone number, email, or user ID.';
COMMENT ON COLUMN public.order_notifications.recipient_type IS 'Type of recipient: customer, rider, merchant.';
COMMENT ON COLUMN public.order_notifications.recipient_id IS 'ID of recipient.';
COMMENT ON COLUMN public.order_notifications.sent_at IS 'When notification was sent.';
COMMENT ON COLUMN public.order_notifications.delivered_at IS 'When notification was delivered (if applicable).';
COMMENT ON COLUMN public.order_notifications.read_at IS 'When notification was read (if applicable).';
COMMENT ON COLUMN public.order_notifications.failed_at IS 'When notification failed (if applicable).';
COMMENT ON COLUMN public.order_notifications.provider_message_id IS 'Provider''s message ID (for SMS/email providers).';
COMMENT ON COLUMN public.order_notifications.provider_response IS 'Provider''s response (stored as JSONB).';

-- ============================================================================
-- TRIGGERS
-- ============================================================================

-- Trigger: Update order_tickets updated_at
DROP TRIGGER IF EXISTS order_tickets_updated_at_trigger ON public.order_tickets;
CREATE TRIGGER order_tickets_updated_at_trigger
  BEFORE UPDATE ON public.order_tickets
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Trigger: Update order_disputes updated_at
DROP TRIGGER IF EXISTS order_disputes_updated_at_trigger ON public.order_disputes;
CREATE TRIGGER order_disputes_updated_at_trigger
  BEFORE UPDATE ON public.order_disputes
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- ENABLE ROW LEVEL SECURITY
-- ============================================================================

ALTER TABLE public.order_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_disputes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_remarks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_instructions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_notifications ENABLE ROW LEVEL SECURITY;
