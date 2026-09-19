import { NextRequest } from "next/server";
import { withAuth } from "@/lib/api";
import { fetchMerchantWalletLedger } from "@/lib/db/wallet-ledger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  const limit = Number(request.nextUrl.searchParams.get("limit") || 50);
  return withAuth(async () => {
    if (typeof fetchMerchantWalletLedger !== "function") {
      throw new Error("Merchant wallet ledger service unavailable");
    }
    return fetchMerchantWalletLedger(id, limit);
  });
}
