-- 0540: Merchant default referral reward rule + merchant notification template.
-- I/O-safe: INSERT … WHERE NOT EXISTS / ON CONFLICT DO NOTHING. No table rewrites.

-- Default merchant rule (store approved). Amounts are DB-driven Super Admin values.
INSERT INTO referral_reward_rules (
  user_type, rule_code, name, description, milestone_orders,
  reward_amount, reward_type, reward_party, also_credit_referred,
  referred_reward_amount, require_kyc, active, priority, event_type
)
SELECT
  'merchant'::referral_user_type,
  'MERCHANT_STORE_APPROVED',
  'Store approved',
  'Wallet credit when the invited merchant store is approved. Super Admin sets the exact ₹ amounts.',
  0,
  100.00,
  'WALLET_CREDIT'::referral_reward_type,
  'referrer'::referral_reward_party,
  true,
  100.00,
  true,
  true,
  10,
  'STORE_APPROVED'::referral_rule_event_type
WHERE NOT EXISTS (
  SELECT 1 FROM referral_reward_rules WHERE rule_code = 'MERCHANT_STORE_APPROVED'
);

INSERT INTO public.notification_templates
  (code, category, role, channel, title_template, body_template, deep_link, priority, variables_schema)
VALUES
  ('REFERRAL_REWARD_MERCHANT', 'wallet', 'merchant', 'all',
   '{{title}}', '{{body}}', '/profile', 'high',
   '{"title":"string","body":"string","amount":"number"}'::jsonb)
ON CONFLICT (code, locale) DO NOTHING;
