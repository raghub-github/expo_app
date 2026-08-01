import { notFound } from "next/navigation";
import { requireDashboardAccess } from "@/lib/permissions/page-protection";
import { AnalyticsAgentDetailClient } from "@/components/analytics/AnalyticsAgentDetailClient";
import { parseAnalyticsCategory } from "@/lib/analytics/analytics-scope";

export default async function AnalyticsAgentDetailPage({
  params,
}: {
  params: Promise<{ category: string; agentId: string }>;
}) {
  await requireDashboardAccess("ANALYTICS");
  const { category: raw, agentId: rawId } = await params;
  const category = parseAnalyticsCategory(raw);
  const agentId = Number(rawId);
  if (!category || !Number.isFinite(agentId) || agentId <= 0) notFound();
  return <AnalyticsAgentDetailClient category={category} agentId={agentId} />;
}
