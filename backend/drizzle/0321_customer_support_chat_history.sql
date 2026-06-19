-- Persist customer-app order support chat sessions and message history.
-- Used by delivered-order support chat before ticket intake.

BEGIN;

CREATE TABLE IF NOT EXISTS public.customer_support_chat_sessions (
  id BIGSERIAL PRIMARY KEY,
  customer_id BIGINT NOT NULL REFERENCES public.customers (id) ON DELETE CASCADE,
  order_id BIGINT REFERENCES public.orders_core (id) ON DELETE SET NULL,
  ticket_id BIGINT REFERENCES public.unified_tickets (id) ON DELETE SET NULL,
  ticket_title_id BIGINT REFERENCES public.ticket_titles (id) ON DELETE SET NULL,
  selected_issue_label TEXT,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'submitted', 'ended')),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.customer_support_chat_messages (
  id BIGSERIAL PRIMARY KEY,
  session_id BIGINT NOT NULL REFERENCES public.customer_support_chat_sessions (id) ON DELETE CASCADE,
  client_message_id TEXT,
  role TEXT NOT NULL CHECK (role IN ('bot', 'user')),
  message_text TEXT NOT NULL DEFAULT '',
  menu_level TEXT,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  display_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cs_chat_sessions_customer_order_status
  ON public.customer_support_chat_sessions (customer_id, order_id, status, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_cs_chat_messages_session_order
  ON public.customer_support_chat_messages (session_id, display_order ASC, id ASC);

CREATE UNIQUE INDEX IF NOT EXISTS uq_cs_chat_messages_session_client_id
  ON public.customer_support_chat_messages (session_id, client_message_id)
  WHERE client_message_id IS NOT NULL;

COMMENT ON TABLE public.customer_support_chat_sessions IS
  'Customer-app order support chat thread; links to unified_tickets after intake submit.';
COMMENT ON TABLE public.customer_support_chat_messages IS
  'Bot/user bubbles for customer_support_chat_sessions (options + order picker in payload JSON).';

COMMIT;
