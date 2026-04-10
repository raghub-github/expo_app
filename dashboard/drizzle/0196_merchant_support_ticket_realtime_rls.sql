-- Allow authenticated merchants to SELECT their support tickets + messages via Supabase client.
-- Required for postgres_changes (Realtime) to deliver rows to the merchant app JWT.
-- Dashboard / APIs that use the Postgres service role are unaffected.

DROP POLICY IF EXISTS "merchant_support_select_unified_tickets" ON public.unified_tickets;
CREATE POLICY "merchant_support_select_unified_tickets"
  ON public.unified_tickets
  FOR SELECT
  TO authenticated
  USING (
    merchant_parent_id IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.merchant_users mu
      WHERE mu.parent_id = unified_tickets.merchant_parent_id
        AND mu.user_id = (SELECT auth.uid()::text)
        AND (mu.is_active IS DISTINCT FROM false)
    )
  );

DROP POLICY IF EXISTS "merchant_support_select_unified_ticket_messages" ON public.unified_ticket_messages;
CREATE POLICY "merchant_support_select_unified_ticket_messages"
  ON public.unified_ticket_messages
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.unified_tickets ut
      WHERE ut.id = unified_ticket_messages.ticket_id
        AND ut.merchant_parent_id IS NOT NULL
        AND EXISTS (
          SELECT 1
          FROM public.merchant_users mu
          WHERE mu.parent_id = ut.merchant_parent_id
            AND mu.user_id = (SELECT auth.uid()::text)
            AND (mu.is_active IS DISTINCT FROM false)
        )
    )
  );

-- If Realtime still shows no events: Supabase Dashboard → Database → Replication → enable
-- public.unified_tickets and public.unified_ticket_messages for the supabase_realtime publication.
