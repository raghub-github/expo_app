import { NextResponse } from "next/server";

/**
 * DEPRECATED — this route used Razorpay Fund Account Validation, which is no
 * longer permitted for verification (Cashfree or manual review only; see
 * backend/drizzle/0396_verification_remove_razorpay.sql).
 *
 * Use POST /api/merchant/bank-account/verify instead — it verifies bank
 * accounts via Cashfree pennyless BAV with the same request body.
 */
export async function POST() {
  return NextResponse.json(
    {
      success: false,
      error: "This endpoint has been removed. Use POST /api/merchant/bank-account/verify.",
    },
    { status: 410 }
  );
}
