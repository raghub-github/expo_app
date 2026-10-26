-- Removes only the untouched seed row. A version that has already moved
-- past 1 is left in place.

SET lock_timeout = '3s';
SET statement_timeout = '8s';

DELETE FROM public.billing_ruleset_version
WHERE id = 1 AND version = 1;
