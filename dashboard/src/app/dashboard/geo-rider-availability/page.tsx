import { redirect } from "next/navigation";

/** Legacy path → /dashboard/rx */
export default function GeoRiderAvailabilityRedirectPage() {
  redirect("/dashboard/rx");
}
