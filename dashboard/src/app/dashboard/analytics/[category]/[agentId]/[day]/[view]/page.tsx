import { notFound } from "next/navigation";
import { requireDashboardAccess } from "@/lib/permissions/page-protection";
import { AnalyticsAgentDayAuditClient } from "@/components/analytics/AnalyticsAgentDayAuditClient";
import { parseAnalyticsCategory } from "@/lib/analytics/analytics-scope";

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

export default async function AnalyticsAgentDayAuditViewPage({
  params,
}: {
  params: Promise<{ category: string; agentId: string; day: string; view: string }>;
}) {
  await requireDashboardAccess("ANALYTICS");
  const { category: raw, agentId: rawId, day, view } = await params;
  const category = parseAnalyticsCategory(raw);
  const agentId = Number(rawId);
  if (
    !category ||
    !Number.isFinite(agentId) ||
    agentId <= 0 ||
    !DAY_RE.test(day) ||
    (view !== "sessions" && view !== "tickets" && view !== "orders")
  ) {
    notFound();
  }

  return (
    <AnalyticsAgentDayAuditClient
      category={category}
      agentId={agentId}
      day={day}
      view={view}
    />
  );
}
