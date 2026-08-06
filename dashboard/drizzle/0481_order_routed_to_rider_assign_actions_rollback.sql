-- Rollback 0481: restore prior comments only.

COMMENT ON COLUMN public.order_routed_to_history.action IS
  'remark | refund | cancel | status_update | rider_cancel | rider_recon | cx_notification';

COMMENT ON TABLE public.order_routed_to_history IS
  'Append-only log of agents who performed CS actions (remark, refund, cancel, status, rider cancel, recon, cx notification).';
