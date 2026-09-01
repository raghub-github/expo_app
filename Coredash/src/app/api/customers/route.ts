import { NextRequest } from "next/server";
import { withAuth } from "@/lib/api";
import { fetchCustomers } from "@/lib/db/metrics";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  return withAuth(() => fetchCustomers(request.nextUrl.searchParams.get("period")));
}
