// Ambient types for react-native-razorpay (ships no declarations).
declare module "react-native-razorpay" {
  export interface RazorpaySuccessResponse {
    razorpay_payment_id: string;
    razorpay_order_id: string;
    razorpay_signature: string;
  }

  export interface RazorpayErrorResponse {
    code: number | string;
    description: string;
    [key: string]: unknown;
  }

  export interface RazorpayOptions {
    key: string;
    amount?: number;
    currency?: string;
    order_id?: string;
    name?: string;
    description?: string;
    image?: string;
    theme?: { color?: string };
    prefill?: { name?: string; email?: string; contact?: string };
    notes?: Record<string, string>;
    [key: string]: unknown;
  }

  const RazorpayCheckout: {
    open(options: RazorpayOptions): Promise<RazorpaySuccessResponse>;
  };

  export default RazorpayCheckout;
}
