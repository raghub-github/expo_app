import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || "",
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ""
);

// Verify payment signature
function verifyPaymentSignature(
  orderId: string,
  paymentId: string,
  signature: string
): boolean {
  const body = `${orderId}|${paymentId}`;
  const expectedSignature = crypto
    .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET || "")
    .update(body)
    .digest("hex");

  return expectedSignature === signature;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
      order_id,
      service_type,
    } = body;

    console.log("Verify payment request:", {
      razorpay_order_id,
      razorpay_payment_id,
      order_id,
      service_type,
    });

    // Verify signature
    if (
      !verifyPaymentSignature(
        razorpay_order_id,
        razorpay_payment_id,
        razorpay_signature
      )
    ) {
      console.error("Signature verification failed");
      return NextResponse.json(
        { error: "Invalid payment signature" },
        { status: 400 }
      );
    }

    // Update order payment status in database
    const tableName =
      service_type === "food"
        ? "food_orders"
        : service_type === "person"
          ? "person_orders"
          : "parcel_orders";

    console.log("Updating payment status in table:", tableName);

    // Determine the correct column name for finding the order based on service type
    let searchColumn = "order_number"; // default for food_orders
    if (service_type === "person") {
      searchColumn = "booking_number"; // person_orders uses booking_number
    } else if (service_type === "parcel") {
      searchColumn = "tracking_number"; // parcel_orders uses tracking_number
    }

    console.log(`Searching for order by ${searchColumn}:`, order_id);

    // Find order by the appropriate column, then update it
    const query = supabase
      .from(tableName)
      .select("id");
    
    const { data: orderData, error: fetchError } = await query
      .eq(searchColumn, order_id)
      .single();

    if (fetchError || !orderData) {
      console.error(`Error finding ${tableName} by ${searchColumn}:`, fetchError);
      
      // Try finding by id if order_id looks like a UUID
      if (!fetchError || fetchError.code === '42703') {
        console.log("Trying to find by id instead");
        const { data: idData, error: idError } = await supabase
          .from(tableName)
          .select("id")
          .eq("id", order_id)
          .single();
        
        if (idError || !idData) {
          console.error("Also failed to find by id:", idError);
          return NextResponse.json(
            { error: "Order not found", details: `Could not find ${service_type} order: ${order_id}` },
            { status: 404 }
          );
        }
        
        // Found by id, use it
        const { error: updateError } = await supabase
          .from(tableName)
          .update({
            payment_status: "paid",
            payment_method: "razorpay",
            razorpay_payment_id: razorpay_payment_id,
            razorpay_order_id: razorpay_order_id,
            paid_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq("id", idData.id);

        if (updateError) {
          console.error("Error updating payment status:", updateError);
          return NextResponse.json(
            { error: "Failed to update payment status", details: updateError.message },
            { status: 500 }
          );
        }
      } else {
        return NextResponse.json(
          { error: "Order not found", details: fetchError?.message },
          { status: 404 }
        );
      }
    } else {
      // Found by search column, update it
      const { error: updateError } = await supabase
        .from(tableName)
        .update({
          payment_status: "paid",
          payment_method: "razorpay",
          razorpay_payment_id: razorpay_payment_id,
          razorpay_order_id: razorpay_order_id,
          paid_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", orderData.id);

      if (updateError) {
        console.error("Error updating payment status:", updateError);
        return NextResponse.json(
          { error: "Failed to update payment status", details: updateError.message },
          { status: 500 }
        );
      }
    }

    console.log("Payment verified successfully for order:", order_id);

    return NextResponse.json(
      {
        success: true,
        message: "Payment verified and order updated",
        payment_id: razorpay_payment_id,
        order_id: order_id,
      },
      { status: 200 }
    );
  } catch (error: any) {
    console.error("Payment verification error:", error);
    return NextResponse.json(
      { error: error.message || "Payment verification failed" },
      { status: 500 }
    );
  }
}
