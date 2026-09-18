import { NextRequest } from "next/server";
import { withAuth } from "@/lib/api";
import { requestWalletCreditOtp } from "@/lib/db/wallet-otp";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  return withAuth(async (user) => {
    const body = (await request.json()) as {
      amount?: number;
      comment?: string;
      customerName?: string;
    };
    return requestWalletCreditOtp({
      customerKey: id,
      amount: Number(body.amount),
      comment: String(body.comment ?? ""),
      adminSystemUserId: user.systemUserId,
      adminEmail: user.email,
      customerName: body.customerName,
    });
  });
}
