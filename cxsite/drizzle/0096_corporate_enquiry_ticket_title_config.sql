-- Run after 0095 commits: PostgreSQL does not allow referencing a newly added enum value
-- in the same transaction as ALTER TYPE ... ADD VALUE.

UPDATE ticket_title_config
SET applicable_to_source =
  COALESCE(applicable_to_source, ARRAY[]::unified_ticket_source[])
  || ARRAY['OTHER_CORPORATE']::unified_ticket_source[]
WHERE ticket_title = 'OTHER'
  AND NOT (
    COALESCE(applicable_to_source, ARRAY[]::unified_ticket_source[])
    @> ARRAY['OTHER_CORPORATE']::unified_ticket_source[]
  );
