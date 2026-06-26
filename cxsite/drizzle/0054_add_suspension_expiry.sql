-- Migration: Add suspension_expires_at column to system_users table
-- This allows temporary suspensions with automatic reactivation

-- Add suspension_expires_at column if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'system_users' 
        AND column_name = 'suspension_expires_at'
    ) THEN
        ALTER TABLE system_users
        ADD COLUMN suspension_expires_at TIMESTAMP WITH TIME ZONE;
        
        -- Add index for efficient queries on expired suspensions
        CREATE INDEX IF NOT EXISTS system_users_suspension_expires_at_idx 
        ON system_users(suspension_expires_at) 
        WHERE suspension_expires_at IS NOT NULL AND status = 'SUSPENDED';
        
        -- Add comment
        COMMENT ON COLUMN system_users.suspension_expires_at IS 
        'Timestamp when temporary suspension expires. User will be automatically reactivated after this time. NULL for permanent suspensions.';
    END IF;
END $$;
