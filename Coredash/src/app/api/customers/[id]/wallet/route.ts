import { NextRequest } from "next/server";
import { withAuth } from "@/lib/api";
import { creditCustomerWallet, getCustomerWalletLimits } from "@/lib/db/wallet";
import { consumeWalletCreditOtp } from "@/lib/db/wallet-otp";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  return withAuth(() => getCustomerWalletLimits(id));
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  return withAuth(async (user) => {
    const body = (await request.json()) as {
      amount?: number;
      comment?: string;
      challengeId?: string;
      otp?: string;
    };

    if (!body.challengeId || !body.otp) {
      throw new Error("OTP verification required before crediting wallet");
    }

    const challenge = await consumeWalletCreditOtp({
      challengeId: String(body.challengeId),
      otp: String(body.otp),
      customerKey: id,
      adminSystemUserId: user.systemUserId,
    });

    return creditCustomerWallet({
      customerIdRaw: challenge.customerKey,
      amount: challenge.amount,
      comment: challenge.comment,
      adminSystemUserId: user.systemUserId,
      adminEmail: user.email,
    });
  });
}
