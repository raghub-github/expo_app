import { redirect } from "next/navigation";

/** Single source of truth for dashboard Home is /dashboard — redirect so latest UI always shows. */
export const dynamic = "force-dynamic";

export default function DashboardRootPage() {
  redirect("/dashboard");
}
