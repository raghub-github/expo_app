-- =============================================================================
-- Wallet ledger: ensure trigger exists on parent wallet_ledger only.
-- Do NOT drop/create trigger on partitions — in PG, the trigger on the parent
-- is tied to partitions; dropping on a partition causes "trigger on parent requires it".
-- 2. blacklist_current_status = agent blacklist only. Negative-wallet blocks =
--    rider_negative_wallet_blocks (synced by trigger on rider_wallet).
-- =============================================================================

DROP TRIGGER IF EXISTS wallet_ledger_update_wallet_trigger ON public.wallet_ledger;
CREATE TRIGGER wallet_ledger_update_wallet_trigger
  AFTER INSERT ON public.wallet_ledger
  FOR EACH ROW
  EXECUTE FUNCTION trigger_update_wallet_from_ledger();
