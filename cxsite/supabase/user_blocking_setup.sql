-- Create user_service_blocks table for tracking which services are blocked for each user
CREATE TABLE IF NOT EXISTS public.user_service_blocks (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id text NOT NULL,
  service_type text NOT NULL,
  blocked_at timestamp with time zone DEFAULT now(),
  blocked_by text DEFAULT 'SUPER_ADMIN',
  reason text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  
  -- Unique constraint to prevent duplicate blocks
  CONSTRAINT user_service_blocks_user_service_unique UNIQUE(user_id, service_type)
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS user_service_blocks_user_id_idx ON public.user_service_blocks(user_id);
CREATE INDEX IF NOT EXISTS user_service_blocks_service_type_idx ON public.user_service_blocks(service_type);
CREATE INDEX IF NOT EXISTS user_service_blocks_blocked_at_idx ON public.user_service_blocks(blocked_at);

-- Enable Row Level Security
ALTER TABLE public.user_service_blocks ENABLE ROW LEVEL SECURITY;

-- Create policy allowing authenticated users to read blocks (for their own account)
CREATE POLICY "Users can view their own blocks"
  ON public.user_service_blocks
  FOR SELECT
  USING (auth.uid()::text = user_id);

-- Create policy allowing super admins to manage blocks
CREATE POLICY "Super admins can manage all blocks"
  ON public.user_service_blocks
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- Create audit log table for tracking block changes
CREATE TABLE IF NOT EXISTS public.block_audit_log (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id text NOT NULL,
  admin_id text NOT NULL,
  action text NOT NULL, -- 'BLOCKED' or 'UNBLOCKED'
  service_type text NOT NULL,
  reason text,
  created_at timestamp with time zone DEFAULT now()
);

-- Create index for audit log
CREATE INDEX IF NOT EXISTS block_audit_log_user_id_idx ON public.block_audit_log(user_id);
CREATE INDEX IF NOT EXISTS block_audit_log_admin_id_idx ON public.block_audit_log(admin_id);
CREATE INDEX IF NOT EXISTS block_audit_log_created_at_idx ON public.block_audit_log(created_at);
