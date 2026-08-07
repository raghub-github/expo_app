import { NextResponse } from "next/server";
import { requireSuperAdminApi } from "@/lib/super-admin-api";
import { listActiveStates } from "@/lib/geo/list-active-states";

export const runtime = "nodejs";

export async function GET() {
  const gate = await requireSuperAdminApi();
  if (!gate.ok) return gate.response;

  try {
    const rows = await listActiveStates();
    return NextResponse.json(
      { states: rows },
      {
        headers: {
          // States rarely change — keep list navigations snappy.
          "Cache-Control": "private, max-age=120, stale-while-revalidate=300",
        },
      }
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to list states";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
