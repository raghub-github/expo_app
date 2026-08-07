-- 0511: Extend customer_service_type enum for all customer app home page services

DO $$ BEGIN
  ALTER TYPE customer_service_type ADD VALUE 'ecommerce';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TYPE customer_service_type ADD VALUE 'vouchers';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TYPE customer_service_type ADD VALUE 'near_me';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

COMMENT ON TYPE customer_service_type IS
  'Blockable customer app services: food, parcel, person_ride, ecommerce, vouchers, near_me';
