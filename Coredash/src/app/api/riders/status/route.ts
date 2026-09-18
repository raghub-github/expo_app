import { withAuth } from "@/lib/api";
import { fetchRiderDutyStatuses } from "@/lib/db/metrics";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return withAuth(() => fetchRiderDutyStatuses());
}
