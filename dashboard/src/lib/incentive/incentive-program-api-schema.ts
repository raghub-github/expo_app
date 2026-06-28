import { z } from "zod";

export const incentiveProgramRulesSchema = z.object({
  min_completed_orders: z.number().int().nullable().optional(),
  min_accepted_orders: z.number().int().nullable().optional(),
  min_active_minutes: z.number().int().nullable().optional(),
  min_acceptance_rate: z.number().nullable().optional(),
  max_cancellation_rate: z.number().nullable().optional(),
  min_customer_rating: z.number().nullable().optional(),
  min_login_days: z.number().int().nullable().optional(),
  min_peak_slot_orders: z.number().int().nullable().optional(),
  max_fraud_score: z.number().int().nullable().optional(),
  exclude_suspended_riders: z.boolean().optional(),
  exclude_low_rating_riders: z.boolean().optional(),
  exclude_if_any_fraud_flag: z.boolean().optional(),
});

export const incentiveProgramTierSchema = z.object({
  tier_no: z.number().int(),
  tier_type: z.enum(["flat", "trip_threshold", "rank_range"]),
  min_orders: z.number().int().nullable().optional(),
  max_orders: z.number().int().nullable().optional(),
  rank_from: z.number().int().nullable().optional(),
  rank_to: z.number().int().nullable().optional(),
  reward_amount: z.number(),
});

export const incentiveProgramTimeWindowSchema = z.object({
  day_of_week: z.number().int().min(0).max(6).nullable().optional(),
  start_time: z.string(),
  end_time: z.string(),
  label: z.string().nullable().optional(),
});

export const incentiveProgramCalendarBadgeSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  label: z.string().min(1).max(24),
});

export const incentiveProgramBodySchema = z.object({
  code: z.string().min(1),
  name: z.string().min(1),
  description: z.string().nullable().optional(),
  service: z.string().min(1),
  vehicle_type: z.string().nullable().optional(),
  status: z.enum(["draft", "active", "paused", "archived"]).optional(),
  start_at: z.string().datetime(),
  end_at: z.string().datetime(),
  timezone: z.string().optional(),
  recurrence_type: z.enum(["one_time", "daily", "weekly", "monthly"]).optional(),
  slot_mode: z.enum(["all_day", "custom_slots"]).optional(),
  slot_day_mode: z.enum(["full_week", "weekdays", "weekends", "specific_days"]).optional(),
  active_days: z.array(z.number().int().min(0).max(6)).optional(),
  geo_scope_mode: z.enum(["selected_states", "all_india", "selected_cities", "selected_zones"]).optional(),
  visibility_mode: z.enum(["scoped_visible", "eligible_only"]).optional(),
  requires_gmitra_max: z.boolean().optional(),
  show_to_non_subscribers: z.boolean().optional(),
  show_before_eligible: z.boolean().optional(),
  reward_type: z.enum(["flat", "tier", "rank", "pool", "streak"]),
  payout_mode: z.enum(["instant", "next_settlement", "manual_approve"]).optional(),
  payout_cap_mode: z.enum(["all_eligible", "top_n", "top_percent", "first_n", "pool_limit"]).optional(),
  max_winners: z.number().int().nullable().optional(),
  max_total_payout: z.number().nullable().optional(),
  max_payout_per_rider: z.number().nullable().optional(),
  stop_on_budget_exhaust: z.boolean().optional(),
  sort_basis: z.string().nullable().optional(),
  tie_breaker: z.string().nullable().optional(),
  is_active: z.boolean().optional(),
  is_paused: z.boolean().optional(),
  state_ids: z.array(z.string().uuid()).optional(),
  rules: incentiveProgramRulesSchema.optional(),
  reward_tiers: z.array(incentiveProgramTierSchema).optional(),
  time_windows: z.array(incentiveProgramTimeWindowSchema).optional(),
  calendar_badges: z.array(incentiveProgramCalendarBadgeSchema).optional(),
});

export type IncentiveProgramBody = z.infer<typeof incentiveProgramBodySchema>;
