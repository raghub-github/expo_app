-- Extra indexes for merchant_audit_logs (store audit list + recent-first)
CREATE INDEX IF NOT EXISTS merchant_audit_logs_entity_action_idx ON public.merchant_audit_logs (entity_type, entity_id, action)
  WHERE entity_type = 'STORE';

CREATE INDEX IF NOT EXISTS merchant_audit_logs_created_at_desc_idx ON public.merchant_audit_logs (created_at DESC);
