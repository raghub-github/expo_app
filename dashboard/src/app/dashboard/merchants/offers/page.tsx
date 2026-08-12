import { redirect } from "next/navigation";

/**
 * Top-level Subscription Plans entry was removed from the merchant portal rail.
 * Store offers live under `/dashboard/merchants/stores/[id]/offers`.
 */
export default function MerchantOffersPage() {
  redirect("/dashboard/merchants");
}