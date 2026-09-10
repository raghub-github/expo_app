-- PAN mandatory + rider-specific admin skip override (audit fields).
ALTER TABLE riders
  ADD COLUMN IF NOT EXISTS pan_skip_override boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS pan_skip_reason text,
  ADD COLUMN IF NOT EXISTS pan_skip_enabled_by integer,
  ADD COLUMN IF NOT EXISTS pan_skip_enabled_by_email text,
  ADD COLUMN IF NOT EXISTS pan_skip_enabled_by_name text,
  ADD COLUMN IF NOT EXISTS pan_skip_enabled_at timestamptz;

CREATE INDEX IF NOT EXISTS riders_pan_skip_override_idx
  ON riders (pan_skip_override)
  WHERE pan_skip_override = true;
