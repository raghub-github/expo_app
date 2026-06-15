-- Rider personal emergency contacts (max 2) for in-app SOS sheet.
-- Default police (100) and ambulance (108) are app constants — not stored here.

ALTER TABLE riders
  ADD COLUMN IF NOT EXISTS emergency_contacts JSONB NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN riders.emergency_contacts IS
  'JSON array of up to 2 objects: { "label": string, "phone": string (10-digit Indian mobile) }.';
