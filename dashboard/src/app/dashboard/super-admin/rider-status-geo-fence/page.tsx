import { redirect } from "next/navigation";

/** Geo-fenced controls moved into Rider assignment controls. */
export default function RiderStatusGeoFenceRedirectPage() {
  redirect("/dashboard/super-admin/rider-assignment-controls");
}
