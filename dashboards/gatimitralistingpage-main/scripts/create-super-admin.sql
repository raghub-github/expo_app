-- Super Admin Account बनाने के लिए SQL Script
-- Supabase SQL Editor में चलाएं

-- Step 1: अपना email और password यहाँ change करें
-- Replace करें: 'admin@gatimitra.in' और 'your_password_here'

INSERT INTO users (email, password, name, role, "isApproved")
VALUES (
  'admin@gatimitra.in',  -- 👈 अपना email यहाँ डालें
  'admin123',            -- 👈 अपना password यहाँ डालें
  'Super Admin',
  'super_admin',
  true
)
ON CONFLICT (email) DO UPDATE 
SET 
  role = 'super_admin',
  "isApproved" = true,
  password = EXCLUDED.password;

-- Step 2: Permissions add करें
-- पहले user ID find करें
DO $$
DECLARE
  user_id_val UUID;
BEGIN
  -- User ID find करें
  SELECT id INTO user_id_val 
  FROM users 
  WHERE email = 'admin@gatimitra.in';  -- 👈 अपना email यहाँ डालें

  -- Permissions add करें
  INSERT INTO permissions (
    "userId", 
    "canAccessOrders", 
    "canCreateRefund", 
    "canAccessCancellation", 
    "canManageAgents", 
    "canManageDepartments"
  )
  VALUES (
    user_id_val,
    true,
    true,
    true,
    true,
    true
  )
  ON CONFLICT ("userId") DO UPDATE 
  SET 
    "canAccessOrders" = true,
    "canCreateRefund" = true,
    "canAccessCancellation" = true,
    "canManageAgents" = true,
    "canManageDepartments" = true;
END $$;

-- Success message
SELECT 'Super Admin account created successfully! You can now login with your email and password.' as message;



