-- Helpdesk agents: SELECT on tickets + messages for authenticated users linked to system_users.
-- Supabase Realtime postgres_changes only sends rows the JWT may SELECT (same gap as merchants in 0196).
-- If events still missing: Database → Replication → enable public.unified_tickets and public.unified_ticket_messages.

DROP POLICY IF EXISTS "agent_helpdesk_select_unified_tickets" ON public.unified_tickets;
CREATE POLICY "agent_helpdesk_select_unified_tickets"
  ON public.unified_tickets
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.system_users su
      WHERE su.system_user_id = (SELECT auth.uid()::text)
        AND su.deleted_at IS NULL
    )
  );

DROP POLICY IF EXISTS "agent_helpdesk_select_unified_ticket_messages" ON public.unified_ticket_messages;
CREATE POLICY "agent_helpdesk_select_unified_ticket_messages"
  ON public.unified_ticket_messages
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.system_users su
      WHERE su.system_user_id = (SELECT auth.uid()::text)
        AND su.deleted_at IS NULL
    )
  );
