import { redirect } from "next/navigation";

/** Legacy AM right-sidebar URL → /dashboard/rx */
export default function AreaManagerAvailabilityRedirectPage() {
  redirect("/dashboard/rx");
}
