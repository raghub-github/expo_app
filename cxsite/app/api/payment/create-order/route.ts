import { NextRequest, NextResponse } from "next/server";
import Razorpay from "razorpay";

// Force-dynamic so Next does not try to collect page data at build
// time. The route reads request body + env-keyed secrets that aren't
// always present in the build container.
export const dynamic = "force-dynamic";

// Lazy-init: constructing Razorpay at module load throws when
// RAZORPAY_KEY_ID is empty, which breaks `next build` in environments
// that haven't been given the keys yet (CI image bake, preview).
let razorpayClient: Razorpay | null = null;
function getRazorpay(): Razorpay {
  if (razorpayClient) return razorpayClient;
  const key_id = process.env.RAZORPAY_KEY_ID;
  const key_secret = process.env.RAZORPAY_KEY_SECRET;
  if (!key_id || !key_secret) {
    throw new Error("Razorpay keys not configured (RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET)");
  }
  razorpayClient = new Razorpay({ key_id, key_secret });
  return razorpayClient;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { amount, currency = "INR", receipt, notes = {} } = body;

    // Validate amount
    if (!amount || amount <= 0) {
      return NextResponse.json(
        { error: "Invalid amount" },
        { status: 400 }
      );
    }

    // Amount should be in smallest currency unit (paise for INR)
    const amountInPaise = Math.round(amount * 100);

    const options = {
      amount: amountInPaise,
      currency: currency,
      receipt: receipt || `receipt_${Date.now()}`,
      notes: {
        ...notes,
        created_at: new Date().toISOString(),
      },
    };

    const order = await getRazorpay().orders.create(options);

    return NextResponse.json(
      {
        success: true,
        order: {
          id: order.id,
          amount: order.amount,
          currency: order.currency,
          receipt: order.receipt,
          notes: order.notes,
        },
      },
      { status: 201 }
    );
  } catch (error: any) {
    console.error("Razorpay order creation error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to create payment order" },
      { status: 500 }
    );
  }
}
