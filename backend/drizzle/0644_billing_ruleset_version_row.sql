-- Super Admin fee toggles bump billing_ruleset_version so checkout drops its
-- cached rules. The table was empty, so every UPDATE matched 0 rows and the
-- version stayed at the code default (1) for the full cache window.
--
-- I/O-safe: one singleton insert. No scan or rewrite of pricing rules, orders,
-- or indexes. ON CONFLICT does nothing if the row already exists.
-- lock_timeout 3s: give up instead of waiting on a lock.
-- statement_timeout 8s: this is a single-row write.

SET lock_timeout = '3s';
SET statement_timeout = '8s';

INSERT INTO public.billing_ruleset_version (id, version)
VALUES (1, 1)
ON CONFLICT (id) DO NOTHING;
