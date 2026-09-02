const razorpayKeyId = process.env.RAZORPAY_KEY_ID;
const razorpayKeySecret = process.env.RAZORPAY_KEY_SECRET;

export type CreateRazorpayQrParams = {
  amountPaise: number;
  description: string;
  closeBySec: number;
  notes: Record<string, string>;
};

export type CreateRazorpayQrResult = {
  id: string;
  imageUrl: string;
  paymentAmount: number;
  closeBy: number;
};

export async function createRazorpayUpiQr(
  params: CreateRazorpayQrParams
): Promise<CreateRazorpayQrResult> {
  if (!razorpayKeyId || !razorpayKeySecret) {
    throw new Error("Razorpay credentials not configured");
  }
  const auth = Buffer.from(`${razorpayKeyId}:${razorpayKeySecret}`).toString("base64");
  const closeBy = Math.max(Math.floor(Date.now() / 1000) + 60, Math.round(params.closeBySec));

  const res = await fetch("https://api.razorpay.com/v1/payments/qr_codes", {
    method: "POST",
    headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      type: "upi_qr",
      usage: "single_use",
      fixed_amount: true,
      payment_amount: Math.round(params.amountPaise),
      description: params.description.slice(0, 200),
      close_by: closeBy,
      notes: params.notes,
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Razorpay QR ${res.status}: ${text.slice(0, 240)}`);
  }

  const body = (await res.json()) as {
    id?: string;
    image_url?: string;
    payment_amount?: number;
    close_by?: number;
  };

  if (!body.id || !body.image_url) {
    throw new Error("Razorpay QR response missing image");
  }

  return {
    id: body.id,
    imageUrl: body.image_url,
    paymentAmount: Number(body.payment_amount ?? params.amountPaise),
    closeBy: Number(body.close_by ?? closeBy),
  };
}

export function getRazorpayPublicKeyId(): string | null {
  return razorpayKeyId?.trim() || null;
}
