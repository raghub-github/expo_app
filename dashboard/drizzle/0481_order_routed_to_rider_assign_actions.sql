-- Extend Routed To history action vocabulary for rider assignment CS actions.
-- No schema change required: action/action_label are already free-text columns.
-- Documents supported values used by stampOrderRoutedTo for manual + force assign.

COMMENT ON COLUMN public.order_routed_to_history.action IS
  'remark | refund | cancel | status_update | rider_cancel | rider_recon | cx_notification | clear_rider_hold | rider_manual_assign | rider_force_assign';

COMMENT ON TABLE public.order_routed_to_history IS
  'Append-only log of agents who performed CS actions (remark, refund, cancel, status, rider cancel/recon, notifications, manual rider assign, force assignment).';
