import { redirect } from "next/navigation";

/**
 * Top-level merchant "Settings" was a stub with no controls. Store settings live
 * under `/dashboard/merchants/stores/[id]/store-settings` after a store is opened.
 */
export default function MerchantSettingsPage() {
  redirect("/dashboard/merchants");
}
