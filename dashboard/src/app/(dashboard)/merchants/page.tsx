import { redirect } from "next/navigation";

export default function MerchantsPage() {
  // This route-group page resolves to `/merchants`. The active dashboard route is `/dashboard/merchants`.
  redirect("/dashboard/merchants");
}
