import { NextResponse } from "next/server";
import { requireSuperAdminApi } from "@/lib/super-admin-api";
import { getSql } from "@/lib/db/client";

export const runtime = "nodejs";

export async function GET() {
  const gate = await requireSuperAdminApi();
  if (!gate.ok) return gate.response;

  try {
    const sql = getSql();
    const rows = await sql<{ id: string; name: string }[]>`
      SELECT id, name FROM states WHERE is_active = true ORDER BY lower(name)
    `;
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
