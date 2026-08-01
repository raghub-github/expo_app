DROP INDEX IF EXISTS public.idx_customer_addresses_last_used_at;
-- Do not DROP last_used_at / is_last_used — they are owned by earlier migrations.
