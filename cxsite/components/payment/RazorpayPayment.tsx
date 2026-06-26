import React, { useState } from "react";
import { CreditCard, Loader, CheckCircle, XCircle } from "lucide-react";

declare global {
  interface Window {
    Razorpay: any;
  }
}

interface RazorpayPaymentProps {
  amount: number;
  orderId: string;
  serviceType: "food" | "person" | "parcel";
  userEmail: string;
  userName: string;
  onPaymentSuccess: (paymentData: any) => void;
  onPaymentFailure: (error: string) => void;
  isLoading?: boolean;
}

export const RazorpayPayment: React.FC<RazorpayPaymentProps> = ({
  amount,
  orderId,
  serviceType,
  userEmail,
  userName,
  onPaymentSuccess,
  onPaymentFailure,
  isLoading = false,
}) => {
  const [isProcessing, setIsProcessing] = useState(false);
  const [paymentStatus, setPaymentStatus] = useState<
    "idle" | "processing" | "success" | "failed"
  >("idle");
  const [errorMessage, setErrorMessage] = useState("");

  const handlePayment = async () => {
    setIsProcessing(true);
    setPaymentStatus("processing");

    try {
      // Check if Razorpay is loaded
      if (!window.Razorpay) {
        throw new Error("Razorpay script not loaded. Please refresh the page.");
      }

      // Step 1: Create order on backend
      console.log("Creating order for amount:", amount);
      const orderResponse = await fetch("/api/payment/create-order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount: amount,
          currency: "INR",
          receipt: `${serviceType}_${orderId}_${Date.now()}`,
          notes: {
            order_id: orderId,
            service_type: serviceType,
            user_email: userEmail,
            user_name: userName,
          },
        }),
      });

      if (!orderResponse.ok) {
        const errorData = await orderResponse.json();
        throw new Error(errorData.error || "Failed to create payment order");
      }

      const orderData = await orderResponse.json();
      console.log("Order created:", orderData);

      if (!orderData.order || !orderData.order.id) {
        throw new Error("Invalid order response: " + JSON.stringify(orderData));
      }

      const order = orderData.order;

      // Step 2: Open Razorpay checkout
      const options = {
        key: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID,
        amount: order.amount,
        currency: order.currency,
        name: "GatiMitra Payment",
        description: `${serviceType.toUpperCase()} Order #${orderId}`,
        order_id: order.id,
        prefill: {
          email: userEmail,
          name: userName,
          contact: "",
        },
        theme: {
          color: "#FF6B35",
        },
        handler: async (response: any) => {
          try {
            console.log("Payment response received:", {
              razorpay_order_id: response.razorpay_order_id,
              razorpay_payment_id: response.razorpay_payment_id,
            });

            // Step 3: Verify payment on backend
            const verifyResponse = await fetch("/api/payment/verify", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                razorpay_order_id: response.razorpay_order_id,
                razorpay_payment_id: response.razorpay_payment_id,
                razorpay_signature: response.razorpay_signature,
                order_id: orderId,
                service_type: serviceType,
              }),
            });

            const verifyData = await verifyResponse.json();
            console.log("Verify response:", verifyData);

            if (verifyResponse.ok && verifyData.success) {
              console.log("Payment verified successfully");
              setPaymentStatus("success");
              setIsProcessing(false);
              onPaymentSuccess(verifyData);
            } else {
              const errorMsg = verifyData.error || "Payment verification failed";
              console.error("Verification failed:", errorMsg);
              setErrorMessage(errorMsg);
              setPaymentStatus("failed");
              setIsProcessing(false);
              onPaymentFailure(errorMsg);
            }
          } catch (error: any) {
            console.error("Error in payment handler:", error);
            setErrorMessage(error.message || "Payment verification failed");
            setPaymentStatus("failed");
            setIsProcessing(false);
            onPaymentFailure(error.message || "Payment verification failed");
          }
        },
        modal: {
          ondismiss: () => {
            console.log("Payment modal dismissed");
            setPaymentStatus("idle");
            setIsProcessing(false);
          },
        },
      };

      console.log("Opening Razorpay with options:", options);
      const rzp = new window.Razorpay(options);
      
      rzp.on("payment.failed", (response: any) => {
        console.error("Payment failed event:", response);
        setPaymentStatus("failed");
        setErrorMessage(response.error.description || "Payment failed");
        setIsProcessing(false);
        onPaymentFailure(response.error.description);
      });

      rzp.open();
      console.log("Razorpay modal opened");
    } catch (error: any) {
      console.error("Error in handlePayment:", error);
      setPaymentStatus("failed");
      setErrorMessage(error.message || "Payment processing failed");
      setIsProcessing(false);
      onPaymentFailure(error.message);
    }
  };

  return (
    <div className="w-full">
      {/* Payment Button */}
      <button
        onClick={handlePayment}
        disabled={isProcessing || isLoading}
        className={`w-full flex items-center justify-center gap-2 px-6 py-3 rounded-lg font-semibold transition-all ${
          paymentStatus === "success"
            ? "bg-green-600 text-white hover:bg-green-700"
            : paymentStatus === "failed"
              ? "bg-red-600 text-white hover:bg-red-700"
              : "bg-blue-600 text-white hover:bg-blue-700 disabled:bg-gray-400"
        }`}
      >
        {isProcessing ? (
          <>
            <Loader className="animate-spin" size={20} />
            Processing Payment...
          </>
        ) : paymentStatus === "success" ? (
          <>
            <CheckCircle size={20} />
            Payment Successful
          </>
        ) : paymentStatus === "failed" ? (
          <>
            <XCircle size={20} />
            Payment Failed
          </>
        ) : (
          <>
            <CreditCard size={20} />
            Pay ₹{amount.toLocaleString("en-IN")}
          </>
        )}
      </button>

      {/* Error Message */}
      {errorMessage && (
        <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-sm text-red-700">{errorMessage}</p>
        </div>
      )}

      {/* Payment Details */}
      <div className="mt-4 p-3 bg-gray-50 rounded-lg">
        <p className="text-xs text-gray-600">
          Amount: ₹{amount.toLocaleString("en-IN")}
        </p>
        <p className="text-xs text-gray-600">
          Order ID: {orderId}
        </p>
        <p className="text-xs text-gray-600">
          Service: {serviceType.toUpperCase()}
        </p>
      </div>
    </div>
  );
};
