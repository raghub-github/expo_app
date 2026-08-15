-- Rollback 0538. Does not delete published merchant codes (leave them in place).
-- No-op body: referral_codes rows for merchants are left intact.
SELECT 1;
