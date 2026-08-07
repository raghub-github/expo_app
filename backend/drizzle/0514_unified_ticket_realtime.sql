-- Enable Supabase Realtime for unified ticket chat (dashboard + customer + merchant + rider).
-- Without SELECT RLS for each actor and supabase_realtime publication, postgres_changes never fire.

ALTER TABLE public.unified_tickets REPLICA IDENTITY FULL;
ALTER TABLE public.unified_ticket_messages REPLICA IDENTITY FULL;

CREATE OR REPLACE FUNCTION public.jwt_sub()
RETURNS text
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE(auth.jwt() ->> 'sub', '');
$$;

-- Customer (JWT sub = customers.customer_id, e.g. GM100001)
DROP POLICY IF EXISTS "customer_support_select_unified_tickets" ON public.unified_tickets;
CREATE POLICY "customer_support_select_unified_tickets"
  ON public.unified_tickets
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.customers c
      WHERE c.customer_id = public.jwt_sub()
        AND (
          unified_tickets.customer_id = c.id
          OR unified_tickets.raised_by_id = c.id
        )
    )
  );

DROP POLICY IF EXISTS "customer_support_select_unified_ticket_messages" ON public.unified_ticket_messages;
CREATE POLICY "customer_support_select_unified_ticket_messages"
  ON public.unified_ticket_messages
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.unified_tickets ut
      JOIN public.customers c ON c.customer_id = public.jwt_sub()
      WHERE ut.id = unified_ticket_messages.ticket_id
        AND (ut.customer_id = c.id OR ut.raised_by_id = c.id)
    )
  );

-- Rider (JWT sub = usr_{riders.id})
DROP POLICY IF EXISTS "rider_support_select_unified_tickets" ON public.unified_tickets;
CREATE POLICY "rider_support_select_unified_tickets"
  ON public.unified_tickets
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.riders r
      WHERE ('usr_' || r.id::text) = public.jwt_sub()
        AND (unified_tickets.rider_id = r.id OR unified_tickets.raised_by_id = r.id)
    )
  );

DROP POLICY IF EXISTS "rider_support_select_unified_ticket_messages" ON public.unified_ticket_messages;
CREATE POLICY "rider_support_select_unified_ticket_messages"
  ON public.unified_ticket_messages
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.unified_tickets ut
      JOIN public.riders r ON ('usr_' || r.id::text) = public.jwt_sub()
      WHERE ut.id = unified_ticket_messages.ticket_id
        AND (ut.rider_id = r.id OR ut.raised_by_id = r.id)
    )
  );

-- Merchant — use jwt_sub() (parent_merchant_id is not always a UUID; auth.uid() fails)
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
        AND mu.user_id = public.jwt_sub()
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
            AND mu.user_id = public.jwt_sub()
            AND (mu.is_active IS DISTINCT FROM false)
        )
    )
  );

-- Helpdesk agents — jwt_sub() matches system_users.system_user_id
DROP POLICY IF EXISTS "agent_helpdesk_select_unified_tickets" ON public.unified_tickets;
CREATE POLICY "agent_helpdesk_select_unified_tickets"
  ON public.unified_tickets
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.system_users su
      WHERE su.system_user_id = public.jwt_sub()
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
      WHERE su.system_user_id = public.jwt_sub()
        AND su.deleted_at IS NULL
    )
  );

GRANT USAGE ON SCHEMA public TO authenticated;
GRANT SELECT ON TABLE public.unified_tickets TO authenticated;
GRANT SELECT ON TABLE public.unified_ticket_messages TO authenticated;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'unified_tickets'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.unified_tickets;
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'unified_ticket_messages'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.unified_ticket_messages;
    END IF;
  END IF;
END $$;
