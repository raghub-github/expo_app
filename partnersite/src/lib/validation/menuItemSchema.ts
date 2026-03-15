import { z } from 'zod';

export const menuItemSchema = z.object({
  store_id: z.string().min(1),
  item_name: z.string().min(2),
  description: z.string().min(5),
  category_type: z.string().min(2),
  food_category_item: z.string().min(2),
  actual_price: z.number().positive(),
  offer_price: z.number().optional(),
  in_stock: z.boolean(),
  has_customization: z.boolean(),
  has_addons: z.boolean(),
  image_url: z.string().url().optional(),
});

export type MenuItemInput = z.infer<typeof menuItemSchema>;
