import { NextRequest, NextResponse } from "next/server";
import { withAuth, jsonError } from "@/lib/api";
import { fetchTax, recordTaxFiling } from "@/lib/db/metrics";
import { requireCoreUser } from "@/lib/auth/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  return withAuth(() => fetchTax(request.nextUrl.searchParams.get("period")));
}

export async function POST(request: NextRequest) {
  try {
    await requireCoreUser();
    const body = (await request.json()) as {
      taxType?: string;
      periodLabel?: string;
      periodStart?: string;
      periodEnd?: string;
      amountDue?: number;
      amountFiled?: number;
      reference?: string;
      notes?: string;
    };
    if (!body.periodLabel || !body.periodStart || !body.periodEnd) {
      return NextResponse.json({ success: false, error: "Period is required" }, { status: 400 });
    }
    const data = await recordTaxFiling({
      taxType: body.taxType || "GST",
      periodLabel: body.periodLabel,
      periodStart: body.periodStart,
      periodEnd: body.periodEnd,
      amountDue: Number(body.amountDue) || 0,
      amountFiled: Number(body.amountFiled) || 0,
      reference: body.reference,
      notes: body.notes,
    });
    return NextResponse.json({ success: true, data });
  } catch (error) {
    return jsonError(error);
  }
}
