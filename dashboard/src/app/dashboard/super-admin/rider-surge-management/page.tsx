import { redirect } from "next/navigation";

/** Global surge admin replaced by per-state surge in Geo → Delivery Slabs. */
export default function RiderSurgeManagementPage() {
  redirect("/dashboard/super-admin/geo");
}
