import { notFound, redirect } from "next/navigation";
import { requireDashboardAccess } from "@/lib/permissions/page-protection";
import { parseAnalyticsCategory } from "@/lib/analytics/analytics-scope";

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

export default async function AnalyticsAgentDayAuditPage({
  params,
}: {
  params: Promise<{ category: string; agentId: string; day: string }>;
}) {
  await requireDashboardAccess("ANALYTICS");
  const { category: raw, agentId: rawId, day } = await params;
  const category = parseAnalyticsCategory(raw);
  const agentId = Number(rawId);
  if (!category || !Number.isFinite(agentId) || agentId <= 0 || !DAY_RE.test(day)) {
    notFound();
  }
  redirect(`/dashboard/analytics/${category}/${agentId}/${day}/sessions`);
}
