import { z } from 'zod';

export const customizationSchema = z.object({
  item_id: z.string().min(1),
  title: z.string().min(2),
  required: z.boolean(),
  max_selection: z.number().int().positive().optional(),
});

export type CustomizationInput = z.infer<typeof customizationSchema>;

export const addonSchema = z.object({
  customization_id: z.string().min(1),
  addon_name: z.string().min(2),
  addon_price: z.number().positive(),
});

export type AddonInput = z.infer<typeof addonSchema>;
