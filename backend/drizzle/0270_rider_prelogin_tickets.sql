-- Allow rider-app tickets before OTP login (contact name + mobile/email on unified_tickets).
ALTER TABLE public.unified_tickets DROP CONSTRAINT IF EXISTS unified_tickets_raised_by_check;

ALTER TABLE public.unified_tickets ADD CONSTRAINT unified_tickets_raised_by_check CHECK (
  (
    raised_by_type = 'CUSTOMER'::public.unified_ticket_source
    AND raised_by_id IS NOT NULL
    AND customer_id IS NOT NULL
  )
  OR (
    raised_by_type = 'RIDER'::public.unified_ticket_source
    AND raised_by_id IS NOT NULL
    AND rider_id IS NOT NULL
  )
  OR (
    raised_by_type = 'RIDER'::public.unified_ticket_source
    AND rider_id IS NULL
    AND raised_by_id IS NULL
    AND raised_by_name IS NOT NULL
    AND BTRIM(raised_by_name) <> ''
    AND (
      (raised_by_mobile IS NOT NULL AND BTRIM(raised_by_mobile) <> '')
      OR (raised_by_email IS NOT NULL AND BTRIM(raised_by_email) <> '')
    )
  )
  OR (
    raised_by_type = 'MERCHANT'::public.unified_ticket_source
    AND raised_by_id IS NOT NULL
    AND (merchant_store_id IS NOT NULL OR merchant_parent_id IS NOT NULL)
  )
  OR (
    raised_by_type = ANY (
      ARRAY[
        'SYSTEM'::public.unified_ticket_source,
        'EMAIL'::public.unified_ticket_source,
        'AGENT'::public.unified_ticket_source,
        'WHATSAPP'::public.unified_ticket_source,
        'CALL'::public.unified_ticket_source
      ]
    )
  )
);
