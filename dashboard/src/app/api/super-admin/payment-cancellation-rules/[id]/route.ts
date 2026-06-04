import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(_req: NextRequest) {
  return NextResponse.json(
    {
      success: false,
      error: "Deprecated. Edit rules in Financial Rule Engine (/dashboard/super-admin/rule-engine).",
      deprecated: true,
    },
    { status: 410 }
  );
}

export async function DELETE(_req: NextRequest) {
  return NextResponse.json(
    {
      success: false,
      error: "Deprecated. Archive rules in Financial Rule Engine instead.",
      deprecated: true,
    },
    { status: 410 }
  );
}
