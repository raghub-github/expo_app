-- Link orders_food to merchant self-delivery rider when store uses own rider
ALTER TABLE public.orders_food
  ADD COLUMN IF NOT EXISTS merchant_self_delivery_rider_id BIGINT NULL
  REFERENCES public.merchant_store_self_delivery_riders(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS orders_food_merchant_self_delivery_rider_id_idx
  ON public.orders_food(merchant_self_delivery_rider_id)
  WHERE merchant_self_delivery_rider_id IS NOT NULL;

COMMENT ON COLUMN public.orders_food.merchant_self_delivery_rider_id IS 'Set when store uses self-delivery and this order is assigned to a merchant rider.';
