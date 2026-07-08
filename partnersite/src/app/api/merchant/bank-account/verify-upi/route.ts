import { NextResponse } from "next/server";

/**
 * DEPRECATED — this route used Razorpay VPA validation, which is no longer
 * permitted for verification (Cashfree or manual review only; see
 * backend/drizzle/0396_verification_remove_razorpay.sql).
 *
 * Use POST /api/merchant/bank-account/verify with { upi: { upi_id } } —
 * it verifies UPI IDs via Cashfree.
 */
export async function POST() {
  return NextResponse.json(
    {
      success: false,
      error:
        "This endpoint has been removed. Use POST /api/merchant/bank-account/verify with { upi: { upi_id } }.",
    },
    { status: 410 }
  );
}
