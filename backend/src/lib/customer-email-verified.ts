import { eq } from "drizzle-orm";
import type { getDb } from "../db/client.js";
import { customers } from "../db/schema.js";

type CustomerEmailFlags = {
  isEmailVerified?: boolean | null;
  emailVerified?: boolean | null;
};

/** True when either legacy or canonical email verification flag is set. */
export function isCustomerEmailVerified(row: CustomerEmailFlags): boolean {
  return row.isEmailVerified === true || row.emailVerified === true;
}

/** Persist verified email on customers — sets both `is_email_verified` and `email_verified`. */
export async function markCustomerEmailVerified(
  db: ReturnType<typeof getDb>,
  customerId: string,
  extras?: { profileImageUrl?: string | null },
): Promise<void> {
  const now = new Date();
  await db
    .update(customers)
    .set({
      isEmailVerified: true,
      emailVerified: true,
      emailVerifiedAt: now,
      updatedAt: now,
      ...(extras?.profileImageUrl ? { profileImageUrl: extras.profileImageUrl } : {}),
    })
    .where(eq(customers.customerId, customerId));
}
