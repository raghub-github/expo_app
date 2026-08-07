import { getUserInitials } from "@/lib/user-avatar";

/** True when the customer uploaded a photo (R2 proxy), not a third-party email avatar. */
export function isCustomCustomerProfileImage(url: string | null | undefined): boolean {
  if (!url?.trim()) return false;
  const u = url.trim().toLowerCase();
  return u.includes("/attachments/proxy") || u.includes("customers/profile-images");
}

export function getCustomerNameInitials(
  fullName: string | null | undefined,
  email?: string | null
): string {
  return getUserInitials(fullName, email ?? null);
}
