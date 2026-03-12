-- ============================================================================
-- 0132_unified_ticket_messages_ensure.sql
-- Ensure unified_ticket_messages table, indexes, and trigger per spec.
-- Merchant chat page fetches messages from this table; agent replies
-- (sender_type AGENT/SYSTEM) are returned; is_internal_note = true are excluded
-- in API so stores only see public conversation.
-- ============================================================================

-- Ensure updated_at trigger exists (idempotent)
DROP TRIGGER IF EXISTS unified_ticket_messages_updated_at_trigger ON unified_ticket_messages;
CREATE TRIGGER unified_ticket_messages_updated_at_trigger
  BEFORE UPDATE ON unified_ticket_messages
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Document table usage for merchant chat
COMMENT ON TABLE unified_ticket_messages IS
  'Conversation thread for unified tickets. Merchant app chat page fetches from here; GatiMitra team replies (sender_type AGENT) are visible to store. API must exclude rows where is_internal_note = true for merchant-facing endpoints.';
