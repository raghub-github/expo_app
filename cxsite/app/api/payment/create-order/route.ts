import { NextRequest, NextResponse } from "next/server";
import Razorpay from "razorpay";

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID || "",
  key_secret: process.env.RAZORPAY_KEY_SECRET || "",
});

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

    const order = await razorpay.orders.create(options);

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
