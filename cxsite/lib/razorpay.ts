
// lib/razorpay.ts
// Razorpay initialization and utility functions

declare global {
  interface Window {
    Razorpay: any;
  }
}

export const initializeRazorpay = (): Promise<boolean> => {
  return new Promise((resolve) => {
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.async = true;
    script.onload = () => {
      resolve(true);
    };
    script.onerror = () => {
      resolve(false);
    };
    document.body.appendChild(script);
  });
};

export const createPaymentOrder = async (
  amount: number,
  serviceType: "food" | "person" | "parcel",
  orderId: string,
  userEmail: string,
  userName: string
) => {
  try {
    const response = await fetch("/api/payment/create-order", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        amount,
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

    if (!response.ok) {
      throw new Error("Failed to create payment order");
    }

    return await response.json();
  } catch (error) {
    console.error("Error creating payment order:", error);
    throw error;
  }
};

export const verifyPayment = async (
  razorpayOrderId: string,
  razorpayPaymentId: string,
  razorpaySignature: string,
  orderId: string,
  serviceType: "food" | "person" | "parcel"
) => {
  try {
    const response = await fetch("/api/payment/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        razorpay_order_id: razorpayOrderId,
        razorpay_payment_id: razorpayPaymentId,
        razorpay_signature: razorpaySignature,
        order_id: orderId,
        service_type: serviceType,
      }),
    });

    if (!response.ok) {
      throw new Error("Payment verification failed");
    }

    return await response.json();
  } catch (error) {
    console.error("Error verifying payment:", error);
    throw error;
  }
};

export const openRazorpayCheckout = (
  order: any,
  options: any
): Promise<any> => {
  return new Promise((resolve, reject) => {
    if (!window.Razorpay) {
      reject(new Error("Razorpay script not loaded"));
      return;
    }

    const checkoutOptions = {
      key: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID,
      amount: order.amount,
      currency: order.currency,
      name: options.name || "Order Payment",
      description: options.description || "Service Order",
      order_id: order.id,
      prefill: {
        email: options.email,
        name: options.name,
        contact: options.contact,
      },
      theme: {
        color: "#3B82F6",
      },
      handler: (response: any) => {
        resolve(response);
      },
      modal: {
        ondismiss: () => {
          reject(new Error("Payment cancelled by user"));
        },
      },
    };

    const rzp = new window.Razorpay(checkoutOptions);

    rzp.on("payment.failed", (response: any) => {
      reject(new Error(response.error.description));
    });

    rzp.open();
  });
};

export const formatCurrency = (amount: number): string => {
  return `₹${amount.toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
};
