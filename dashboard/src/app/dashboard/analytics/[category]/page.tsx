import { notFound } from "next/navigation";
import { requireDashboardAccess } from "@/lib/permissions/page-protection";
import { AnalyticsCategoryListClient } from "@/components/analytics/AnalyticsCategoryListClient";
import { parseAnalyticsCategory } from "@/lib/analytics/analytics-scope";

export default async function AnalyticsCategoryPage({
  params,
}: {
  params: Promise<{ category: string }>;
}) {
  await requireDashboardAccess("ANALYTICS");
  const { category: raw } = await params;
  const category = parseAnalyticsCategory(raw);
  if (!category) notFound();
  return <AnalyticsCategoryListClient category={category} />;
}
