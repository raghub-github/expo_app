ALTER TABLE "system_users"
ADD COLUMN IF NOT EXISTS "can_toggle_portal" boolean NOT NULL DEFAULT false;
