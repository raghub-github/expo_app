-- Global reply-composer defaults: one row for all ticket dashboard users.
-- Migrates from per-system_user_id PK (0156) to singleton row + updated_by_system_user_id.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'ticket_compose_automation'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'ticket_compose_automation' AND column_name = 'singleton'
  ) THEN
    CREATE TABLE public.ticket_compose_automation_next (
      singleton SMALLINT PRIMARY KEY DEFAULT 1 CHECK (singleton = 1),
      default_to TEXT NOT NULL DEFAULT '',
      default_cc TEXT NOT NULL DEFAULT '',
      default_bcc TEXT NOT NULL DEFAULT '',
      updated_by_system_user_id INTEGER REFERENCES public.system_users(id) ON DELETE SET NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    INSERT INTO public.ticket_compose_automation_next (
      singleton, default_to, default_cc, default_bcc, updated_by_system_user_id, updated_at
    )
    SELECT 1,
           COALESCE(t.default_to, ''),
           COALESCE(t.default_cc, ''),
           COALESCE(t.default_bcc, ''),
           t.system_user_id,
           COALESCE(t.updated_at, NOW())
    FROM public.ticket_compose_automation t
    ORDER BY t.updated_at DESC NULLS LAST
    LIMIT 1;

    INSERT INTO public.ticket_compose_automation_next (singleton)
    SELECT 1
    WHERE NOT EXISTS (SELECT 1 FROM public.ticket_compose_automation_next WHERE singleton = 1);

    DROP TABLE public.ticket_compose_automation;
    ALTER TABLE public.ticket_compose_automation_next RENAME TO ticket_compose_automation;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.ticket_compose_automation (
  singleton SMALLINT PRIMARY KEY DEFAULT 1 CHECK (singleton = 1),
  default_to TEXT NOT NULL DEFAULT '',
  default_cc TEXT NOT NULL DEFAULT '',
  default_bcc TEXT NOT NULL DEFAULT '',
  updated_by_system_user_id INTEGER REFERENCES public.system_users(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ticket_compose_automation_updated_at_idx
  ON public.ticket_compose_automation (updated_at DESC);

INSERT INTO public.ticket_compose_automation (singleton)
VALUES (1)
ON CONFLICT (singleton) DO NOTHING;

COMMENT ON TABLE public.ticket_compose_automation IS
  'Global ticket reply-composer To/Cc/Bcc defaults (single row). All ticket-dashboard users read these; only super admins may update. updated_by_system_user_id = last editor.';

COMMENT ON COLUMN public.ticket_compose_automation.singleton IS 'Always 1; enforces a single configuration row.';
COMMENT ON COLUMN public.ticket_compose_automation.updated_by_system_user_id IS 'system_users.id of the super admin who last saved these defaults.';
