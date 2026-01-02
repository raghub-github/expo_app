import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { ulid } from "ulid";
import { getDb } from "../../db/client.js";
import { riders, onboardingPayments } from "../../db/schema.js";
import { eq, desc } from "drizzle-orm";
import { auth } from "../../plugins/auth.js";
import { createRazorpayOrder, verifyRazorpaySignature, getPaymentDetails } from "../../services/payment/razorpayService.js";
import { getEnv } from "../../config/env.js";

export async function paymentRoutes(app: FastifyInstance) {
  await app.register(auth, { required: true });

  // Create payment order for onboarding fee
  app.post(
    "/onboarding/create-order",
    {
      schema: {
        body: z.object({
          riderId: z.string(),
        }),
        response: {
          200: z.object({
            orderId: z.string(),
            amount: z.number(),
            currency: z.string(),
            key: z.string(), // Razorpay key ID for frontend
            paymentId: z.string(), // Internal payment record ID
          }),
        },
      },
    },
    async (req) => {
      const { riderId } = req.body as { riderId: string };
      const db = getDb();
      const env = getEnv();

      // Convert riderId string to integer
      const riderIdInt = parseInt(riderId);
      if (isNaN(riderIdInt)) {
        throw new Error("Invalid rider ID");
      }

      // Verify rider exists and documents are submitted
      const riderRows = await db.select().from(riders).where(eq(riders.id, riderIdInt)).limit(1);
      if (riderRows.length === 0) {
        throw new Error("Rider not found");
      }

      const rider = riderRows[0]!;
      // Allow payment for riders who have submitted documents (pending_approval or in_progress)
      if (rider.onboardingStage === "MOBILE_VERIFIED") {
        throw new Error("Please complete document submission first");
      }
      
      if (rider.onboardingStage === "ACTIVE") {
        throw new Error("Rider already approved");
      }

      // Check if payment already exists
      const existingPayment = await db
        .select()
        .from(onboardingPayments)
        .where(eq(onboardingPayments.riderId, riderIdInt))
        .where(eq(onboardingPayments.status, "completed"))
        .limit(1);

      if (existingPayment.length > 0) {
        throw new Error("Payment already completed");
      }

      // Create Razorpay order
      const amount = 4900; // ₹49 in paise
      const order = await createRazorpayOrder({
        amount,
        currency: "INR",
        receipt: `onboarding_${riderId}_${Date.now()}`,
        notes: {
          rider_id: riderId,
          type: "onboarding_fee",
        },
      });

      // Save payment record
      const refId = `rpay_${ulid()}`;
      await db.insert(onboardingPayments).values({
        riderId: riderIdInt,
        amount: (amount / 100).toString(), // Convert paise to rupees
        provider: "razorpay",
        refId: refId,
        paymentId: order.id,
        status: "pending",
        metadata: {
          currency: order.currency,
          razorpayOrderId: order.id,
        },
      });

      return {
        orderId: order.id,
        amount: order.amount,
        currency: order.currency,
        key: env.RAZORPAY_KEY_ID || "",
        paymentId: refId,
      };
    },
  );

  // Verify payment and update status
  app.post(
    "/onboarding/verify",
    {
      schema: {
        body: z.object({
          riderId: z.string(),
          razorpayOrderId: z.string(),
          razorpayPaymentId: z.string(),
          razorpaySignature: z.string(),
        }),
        response: {
          200: z.object({
            success: z.boolean(),
            paymentId: z.string(),
          }),
        },
      },
    },
    async (req) => {
      const { riderId, razorpayOrderId, razorpayPaymentId, razorpaySignature } = req.body as {
        riderId: string;
        razorpayOrderId: string;
        razorpayPaymentId: string;
        razorpaySignature: string;
      };

      const db = getDb();

      // Verify signature
      const isValid = verifyRazorpaySignature(razorpayOrderId, razorpayPaymentId, razorpaySignature);
      if (!isValid) {
        throw new Error("Invalid payment signature");
      }

      // Convert riderId string to integer
      const riderIdInt = parseInt(riderId);
      if (isNaN(riderIdInt)) {
        throw new Error("Invalid rider ID");
      }

      // Find payment record
      const paymentRows = await db
        .select()
        .from(onboardingPayments)
        .where(eq(onboardingPayments.riderId, riderIdInt))
        .limit(1);

      if (paymentRows.length === 0) {
        throw new Error("Payment record not found");
      }

      const payment = paymentRows[0]!;
      
      // Verify the order ID matches
      const metadata = payment.metadata as any;
      if (metadata?.razorpayOrderId !== razorpayOrderId) {
        throw new Error("Payment order ID mismatch");
      }

      // For simulated payments in development, skip Razorpay API call
      const env = await import("../../config/env.js").then((m) => m.getEnv());
      let paymentStatus = "captured";
      let paymentMethod = "simulated";

      if (env.NODE_ENV !== "development" || razorpaySignature !== "simulated_signature") {
        // Get payment details from Razorpay
        try {
          const paymentDetails = await getPaymentDetails(razorpayPaymentId);
          paymentStatus = paymentDetails.status;
          paymentMethod = paymentDetails.method || "unknown";
        } catch (error) {
          // If payment fetch fails, mark as failed
          paymentStatus = "failed";
        }
      }

      // Update payment status
      await db
        .update(onboardingPayments)
        .set({
          paymentId: razorpayPaymentId,
          status: paymentStatus === "captured" ? "completed" : "failed",
          updatedAt: new Date(),
          metadata: {
            ...metadata,
            razorpayPaymentId: razorpayPaymentId,
            paymentMethod: paymentMethod,
            verifiedAt: new Date().toISOString(),
          },
        })
        .where(eq(onboardingPayments.id, payment.id));

      // If payment successful, update rider status to APPROVAL stage (awaiting admin verification)
      if (paymentStatus === "captured") {
        await db
          .update(riders)
          .set({
            onboardingStage: "APPROVAL",
            updatedAt: new Date(),
          })
          .where(eq(riders.id, riderIdInt));
      }

      return {
        success: paymentStatus === "captured",
        paymentId: payment.id,
      };
    },
  );

  // Get payment status
  app.get(
    "/onboarding/:riderId/status",
    {
      schema: {
        params: z.object({
          riderId: z.string(),
        }),
        response: {
          200: z.object({
            hasPayment: z.boolean(),
            status: z.string().optional(),
            amount: z.number().optional(),
          }),
        },
      },
    },
    async (req) => {
      const { riderId } = req.params as { riderId: string };
      const db = getDb();

      // Convert riderId string to integer
      const riderIdInt = parseInt(riderId);
      if (isNaN(riderIdInt)) {
        throw new Error("Invalid rider ID");
      }

      const paymentRows = await db
        .select()
        .from(onboardingPayments)
        .where(eq(onboardingPayments.riderId, riderIdInt))
        .orderBy(desc(onboardingPayments.createdAt))
        .limit(1);

      if (paymentRows.length === 0) {
        return { hasPayment: false };
      }

      const payment = paymentRows[0]!;
      return {
        hasPayment: true,
        status: payment.status,
        amount: parseFloat(payment.amount) * 100, // Convert rupees to paise
      };
    },
  );
}

