import { redirect } from "next/navigation";

export default function RiderDispatchPickupRadiusRedirectPage() {
  redirect("/dashboard/super-admin/rider-assignment-controls?panel=dispatch");
}
