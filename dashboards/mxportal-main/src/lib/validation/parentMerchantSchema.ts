import { z } from 'zod';


export const parentMerchantSchema = z.object({
  parent_name: z.string().min(2, 'Parent name is required'),
  merchant_type: z.enum(['LOCAL', 'BRAND']),
  owner_name: z.string().min(2, 'Owner name is required'),
  owner_email: z.string().email('Invalid email').optional().or(z.literal('').transform(() => undefined)),
  registered_phone: z.string().regex(/^\+?[0-9]{10,15}$/, 'Phone number must be 10-15 digits'),
  registered_phone_normalized: z.string().optional(),
  alternate_phone: z.string().optional(),
  brand_name: z.string().optional(),
  business_category: z.string().optional(),
  is_active: z.boolean().optional(),
  registration_status: z.enum(['VERIFIED', 'SUSPENDED']).optional(),
  address_line1: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  pincode: z.string().optional(),
  updated_by: z.string().optional(),
  deleted_at: z.string().optional(),
  deleted_by: z.number().optional(),
  created_at: z.string().optional(),
  updated_at: z.string().optional(),
  created_by: z.number().optional(),
});

export type ParentMerchantInput = z.infer<typeof parentMerchantSchema>;
