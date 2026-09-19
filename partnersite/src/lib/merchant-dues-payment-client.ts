import { fetchBackend } from '@/lib/fetch-backend';

function internalSecret(): string | null {
  const secret = process.env.BACKEND_SCHEDULE_TICK_SECRET?.trim();
  return secret || null;
}

export type DuesPaymentOrderResult = {
  success?: boolean;
  error?: string;
  orderId?: string;
  keyId?: string;
  amount?: number;
  currency?: string;
  duesAmount?: number;
  availableBalance?: number;
  description?: string;
  testMode?: boolean;
};

export type DuesPaymentVerifyResult = {
  success?: boolean;
  error?: string;
  paidAmount?: number;
  availableBalance?: number;
  duesRemaining?: number;
  ledgerId?: number | null;
  description?: string;
  idempotent?: boolean;
  alreadyCleared?: boolean;
  captured?: boolean;
  status?: string;
};

export async function createMerchantDuesPaymentOrderViaEngine(
  storeInternalId: number,
  source: 'partnersite' | 'merchant_app' = 'partnersite',
): Promise<{ ok: boolean; status: number; data: DuesPaymentOrderResult }> {
  const secret = internalSecret();
  if (!secret) {
    return {
      ok: false,
      status: 503,
      data: { success: false, error: 'Dues payment engine unavailable' },
    };
  }
  const res = await fetchBackend(
    `/v1/internal/merchant/stores/${storeInternalId}/wallet/dues/create-payment-order`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Internal-Secret': secret,
      },
      body: JSON.stringify({ source }),
      timeoutMs: 20_000,
    },
  );
  if (!res) {
    return {
      ok: false,
      status: 503,
      data: { success: false, error: 'Dues payment engine unreachable' },
    };
  }
  let data: DuesPaymentOrderResult = {};
  try {
    data = (await res.json()) as DuesPaymentOrderResult;
  } catch {
    data = { success: false, error: 'Invalid response from dues payment engine' };
  }
  return { ok: res.ok, status: res.status, data };
}

export async function verifyMerchantDuesPaymentViaEngine(
  storeInternalId: number,
  body: {
    razorpay_order_id: string;
    razorpay_payment_id: string;
    razorpay_signature: string;
  },
  source: 'partnersite' | 'merchant_app' = 'partnersite',
): Promise<{ ok: boolean; status: number; data: DuesPaymentVerifyResult }> {
  const secret = internalSecret();
  if (!secret) {
    return {
      ok: false,
      status: 503,
      data: { success: false, error: 'Dues payment engine unavailable' },
    };
  }
  const res = await fetchBackend(
    `/v1/internal/merchant/stores/${storeInternalId}/wallet/dues/verify-payment`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Internal-Secret': secret,
      },
      body: JSON.stringify({ ...body, source }),
      timeoutMs: 25_000,
    },
  );
  if (!res) {
    return {
      ok: false,
      status: 503,
      data: { success: false, error: 'Dues payment engine unreachable' },
    };
  }
  let data: DuesPaymentVerifyResult = {};
  try {
    data = (await res.json()) as DuesPaymentVerifyResult;
  } catch {
    data = { success: false, error: 'Invalid response from dues payment engine' };
  }
  return { ok: res.ok, status: res.status, data };
}

export async function settleMerchantDuesFromOrderViaEngine(
  storeInternalId: number,
  razorpayOrderId: string,
  source: 'partnersite' | 'merchant_app' = 'partnersite',
): Promise<{ ok: boolean; status: number; data: DuesPaymentVerifyResult }> {
  const secret = internalSecret();
  if (!secret) {
    return {
      ok: false,
      status: 503,
      data: { success: false, error: 'Dues payment engine unavailable' },
    };
  }
  const res = await fetchBackend(
    `/v1/internal/merchant/stores/${storeInternalId}/wallet/dues/settle-from-order`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Internal-Secret': secret,
      },
      body: JSON.stringify({ razorpay_order_id: razorpayOrderId, source }),
      timeoutMs: 25_000,
    },
  );
  if (!res) {
    return {
      ok: false,
      status: 503,
      data: { success: false, error: 'Dues payment engine unreachable' },
    };
  }
  let data: DuesPaymentVerifyResult = {};
  try {
    data = (await res.json()) as DuesPaymentVerifyResult;
  } catch {
    data = { success: false, error: 'Invalid response from dues payment engine' };
  }
  return { ok: res.ok, status: res.status, data };
}
