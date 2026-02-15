import { z } from 'zod';

export const offerSchema = z.object({
  store_id: z.string().min(1),
  offer_type: z.enum(['ALL_ORDERS', 'SPECIFIC_ITEM']),
  item_id: z.string().optional(),
  discount_type: z.enum(['PERCENTAGE', 'FLAT']),
  discount_value: z.number().positive(),
  min_order_amount: z.number().optional(),
  valid_from: z.string().min(1),
  valid_till: z.string().min(1),
});

export type OfferInput = z.infer<typeof offerSchema>;
