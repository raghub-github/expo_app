-- Rollback 0640: restore post-pickup legs to company-funded (re-enables the additive
-- stacking of the distance legs ON TOP of the rider % pool — i.e. the double-pay).
UPDATE public.rider_leg_pricing
SET funding = 'company',
    updated_at = now()
WHERE leg = 'post'
  AND funding = 'customer';
