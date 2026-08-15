-- Rollback 0540
DELETE FROM public.notification_templates WHERE code = 'REFERRAL_REWARD_MERCHANT';
DELETE FROM referral_reward_rules WHERE rule_code = 'MERCHANT_STORE_APPROVED';
