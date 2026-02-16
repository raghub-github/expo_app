-- Update Permissions table to support granular access control
-- Run this SQL in your Supabase SQL Editor

-- Add new columns for granular access
ALTER TABLE permissions 
ADD COLUMN IF NOT EXISTS "canAccessFoodDepartment" BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS "canAccessParcelDepartment" BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS "canAccessPersonDepartment" BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS "canAccessOrderDetails" BOOLEAN DEFAULT false;

-- Update existing permissions to maintain backward compatibility
-- If canAccessOrders is true, grant access to all departments
UPDATE permissions 
SET 
  "canAccessFoodDepartment" = "canAccessOrders",
  "canAccessParcelDepartment" = "canAccessOrders",
  "canAccessPersonDepartment" = "canAccessOrders",
  "canAccessOrderDetails" = "canAccessOrders"
WHERE "canAccessOrders" = true;

-- Add comment for documentation
COMMENT ON COLUMN permissions."canAccessFoodDepartment" IS 'Access to Food Management Dashboard';
COMMENT ON COLUMN permissions."canAccessParcelDepartment" IS 'Access to Parcel Management Dashboard';
COMMENT ON COLUMN permissions."canAccessPersonDepartment" IS 'Access to Person Ride Management Dashboard';
COMMENT ON COLUMN permissions."canAccessOrderDetails" IS 'Access to Order Details Page';


