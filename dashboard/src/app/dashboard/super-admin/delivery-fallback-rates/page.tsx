import { redirect } from "next/navigation";

export default function DeliveryFallbackRatesRedirectPage() {
  redirect("/dashboard/super-admin/geo?view=fallback");
}
