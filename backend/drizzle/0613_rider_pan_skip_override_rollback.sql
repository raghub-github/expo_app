ALTER TABLE riders
  DROP COLUMN IF EXISTS pan_skip_enabled_at,
  DROP COLUMN IF EXISTS pan_skip_enabled_by_name,
  DROP COLUMN IF EXISTS pan_skip_enabled_by_email,
  DROP COLUMN IF EXISTS pan_skip_enabled_by,
  DROP COLUMN IF EXISTS pan_skip_reason,
  DROP COLUMN IF EXISTS pan_skip_override;

DROP INDEX IF EXISTS riders_pan_skip_override_idx;
