-- Enforce at most one active Home and one active Work address per customer.
-- OTHER and HOTEL can be unlimited.
CREATE UNIQUE INDEX IF NOT EXISTS unique_customer_home_address
ON customer_addresses (customer_id)
WHERE label = 'HOME' AND is_active = true AND deleted_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS unique_customer_work_address
ON customer_addresses (customer_id)
WHERE label = 'WORK' AND is_active = true AND deleted_at IS NULL;
