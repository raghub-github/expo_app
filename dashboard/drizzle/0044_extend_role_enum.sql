-- ============================================================================
-- Extend system_user_role_type Enum with Additional Roles
-- Migration: 0044_extend_role_enum
-- ============================================================================

-- Note: PostgreSQL enum alterations require adding values one at a time
-- If a value already exists, the statement will be ignored

DO $$ 
BEGIN
  -- Add new role values to the enum
  -- Using IF NOT EXISTS pattern by checking if value exists first
  
  -- Check and add MANAGER
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'MANAGER' AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'system_user_role_type')) THEN
    ALTER TYPE system_user_role_type ADD VALUE 'MANAGER';
  END IF;
  
  -- Check and add SUPERVISOR
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'SUPERVISOR' AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'system_user_role_type')) THEN
    ALTER TYPE system_user_role_type ADD VALUE 'SUPERVISOR';
  END IF;
  
  -- Check and add TEAM_LEAD
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'TEAM_LEAD' AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'system_user_role_type')) THEN
    ALTER TYPE system_user_role_type ADD VALUE 'TEAM_LEAD';
  END IF;
  
  -- Check and add COORDINATOR
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'COORDINATOR' AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'system_user_role_type')) THEN
    ALTER TYPE system_user_role_type ADD VALUE 'COORDINATOR';
  END IF;
  
  -- Check and add ANALYST
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'ANALYST' AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'system_user_role_type')) THEN
    ALTER TYPE system_user_role_type ADD VALUE 'ANALYST';
  END IF;
  
  -- Check and add SPECIALIST
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'SPECIALIST' AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'system_user_role_type')) THEN
    ALTER TYPE system_user_role_type ADD VALUE 'SPECIALIST';
  END IF;
  
  -- Check and add CONSULTANT
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'CONSULTANT' AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'system_user_role_type')) THEN
    ALTER TYPE system_user_role_type ADD VALUE 'CONSULTANT';
  END IF;
  
  -- Check and add INTERN
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'INTERN' AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'system_user_role_type')) THEN
    ALTER TYPE system_user_role_type ADD VALUE 'INTERN';
  END IF;
  
  -- Check and add TRAINEE
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'TRAINEE' AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'system_user_role_type')) THEN
    ALTER TYPE system_user_role_type ADD VALUE 'TRAINEE';
  END IF;
  
  -- Check and add QA_ENGINEER
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'QA_ENGINEER' AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'system_user_role_type')) THEN
    ALTER TYPE system_user_role_type ADD VALUE 'QA_ENGINEER';
  END IF;
  
  -- Check and add PRODUCT_MANAGER
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'PRODUCT_MANAGER' AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'system_user_role_type')) THEN
    ALTER TYPE system_user_role_type ADD VALUE 'PRODUCT_MANAGER';
  END IF;
  
  -- Check and add PROJECT_MANAGER
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'PROJECT_MANAGER' AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'system_user_role_type')) THEN
    ALTER TYPE system_user_role_type ADD VALUE 'PROJECT_MANAGER';
  END IF;
  
  -- Check and add HR_TEAM
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'HR_TEAM' AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'system_user_role_type')) THEN
    ALTER TYPE system_user_role_type ADD VALUE 'HR_TEAM';
  END IF;
  
  -- Check and add MARKETING_TEAM
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'MARKETING_TEAM' AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'system_user_role_type')) THEN
    ALTER TYPE system_user_role_type ADD VALUE 'MARKETING_TEAM';
  END IF;
  
  -- Check and add CUSTOMER_SUCCESS
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'CUSTOMER_SUCCESS' AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'system_user_role_type')) THEN
    ALTER TYPE system_user_role_type ADD VALUE 'CUSTOMER_SUCCESS';
  END IF;
  
  -- Check and add DATA_ANALYST
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'DATA_ANALYST' AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'system_user_role_type')) THEN
    ALTER TYPE system_user_role_type ADD VALUE 'DATA_ANALYST';
  END IF;
  
  -- Check and add BUSINESS_ANALYST
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'BUSINESS_ANALYST' AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'system_user_role_type')) THEN
    ALTER TYPE system_user_role_type ADD VALUE 'BUSINESS_ANALYST';
  END IF;
  
END $$;
