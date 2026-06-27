-- ============================================================================
-- Add Subrole Fields to system_users Table
-- Migration: 0043_add_subrole_to_users
-- ============================================================================

-- Add subrole fields to system_users table
ALTER TABLE system_users 
ADD COLUMN IF NOT EXISTS subrole TEXT,
ADD COLUMN IF NOT EXISTS subrole_other TEXT;

-- Add index for subrole queries
CREATE INDEX IF NOT EXISTS system_users_subrole_idx ON system_users(subrole);

-- Add comments
COMMENT ON COLUMN system_users.subrole IS 'Subrole within the primary role (e.g., Senior, TL, Manager for Developer role)';
COMMENT ON COLUMN system_users.subrole_other IS 'Manual subrole entry when "Other" is selected';
