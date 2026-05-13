import { z } from 'zod';

const OFFER_TYPES = [
  'PERCENTAGE', 'FLAT', 'CART_PERCENTAGE', 'CART_FLAT',
  'BUY_X_GET_Y', 'BUY_N_GET_M', 'BOGO',
  'FREE_ITEM', 'FREE_DELIVERY', 'BUNDLE', 'TIERED', 'COUPON',
] as const;

export const offerSchema = z.object({
  store_id: z.union([z.string().min(1), z.number()]),
  offer_title: z.string().min(1, 'Offer title is required'),
  offer_description: z.string().nullish(),
  offer_type: z.enum(OFFER_TYPES).default('PERCENTAGE'),
  offer_sub_type: z.enum(['ALL_ORDERS', 'SPECIFIC_ITEM']).default('ALL_ORDERS'),
  menu_item_ids: z.array(z.string()).nullish(),

  // Discount values
  discount_value: z.number().nullish(),
  discount_percentage: z.number().min(0).max(100).nullish(),
  max_discount_amount: z.number().nullish(),

  // Order constraints
  min_order_amount: z.number().nullish(),
  max_order_amount: z.number().nullish(),
  min_items: z.number().int().nullish(),

  // Buy-get fields
  buy_quantity: z.number().int().positive().nullish(),
  get_quantity: z.number().int().positive().nullish(),

  // Coupon
  coupon_code: z.string().nullish(),

  // Images
  offer_image_url: z.string().url().nullish(),
  image_url: z.string().url().nullish(),

  // Validity
  valid_from: z.string().min(1, 'valid_from is required'),
  valid_till: z.string().min(1, 'valid_till is required'),
  is_active: z.boolean().default(true),

  // Behavior flags
  auto_apply: z.boolean().default(true),
  is_stackable: z.boolean().default(false),
  priority: z.number().int().default(0),
  per_order_limit: z.number().int().nullish(),

  // Segment restrictions
  first_order_only: z.boolean().default(false),
  new_user_only: z.boolean().default(false),
  user_segment: z.string().nullish(),

  // Usage caps
  max_uses_total: z.number().int().nullish(),
  max_uses_per_user: z.number().int().nullish(),
  max_discount_per_order: z.number().nullish(),
  usage_reset_period: z.string().nullish(),

  // Time restrictions
  applicable_on_days: z.array(z.string()).nullish(),
  applicable_time_start: z.string().nullish(),
  applicable_time_end: z.string().nullish(),

  // Metadata (tiers, bundle_items, free_item_ids, etc.)
  offer_metadata: z.record(z.unknown()).nullish(),
});

export type OfferInput = z.infer<typeof offerSchema>;
