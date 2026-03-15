import { z } from 'zod';

export const storeApprovalSchema = z.object({
  store_id: z.string().min(1),
  approval_status: z.enum(['UNDER_VERIFICATION', 'APPROVED', 'REJECTED']),
  approval_reason: z.string().optional(),
  approved_by: z.string().min(1),
  approved_by_email: z.string().email(),
});

export type StoreApprovalInput = z.infer<typeof storeApprovalSchema>;
