-- Performance indexes for heavy dashboard routes (customers/orders/tickets/rider summary)
--
-- Goals:
-- 1) Speed up join/filter patterns on customers<->orders_core (orderType + customerId).
-- 2) Speed up rider-summary aggregates on orders_core (riderId + orderType + status + createdAt).
-- 3) Improve customers list filtering/sorting by account_status + created_at.

-- Customers page: listCustomers() frequently filters by account_status and sorts by created_at.
CREATE INDEX IF NOT EXISTS customers_account_status_created_at_idx
  ON public.customers (account_status, created_at DESC)
  WHERE deleted_at IS NULL;

-- customers -> orders_core: listCustomers(orderType=...) does a DISTINCT customer_id join filtered by orders_core.order_type.
CREATE INDEX IF NOT EXISTS orders_core_order_type_customer_id_idx
  ON public.orders_core (order_type, customer_id)
  WHERE customer_id IS NOT NULL;

-- riders summary: aggregates filter orders_core by rider_id, order_type, status and then order by created_at.
CREATE INDEX IF NOT EXISTS orders_core_rider_type_status_created_idx
  ON public.orders_core (rider_id, order_type, status, created_at DESC)
  WHERE rider_id IS NOT NULL;

