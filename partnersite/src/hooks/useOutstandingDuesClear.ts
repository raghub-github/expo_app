'use client';

import { useCallback, useState } from 'react';
import toast from 'react-hot-toast';
import {
  useInvalidateMerchantLedger,
  useInvalidateMerchantWallet,
  useMerchantWallet,
} from '@/hooks/useMerchantApi';
import {
  isWalletBalanceNegative,
  resolveWalletDisplayBalance,
} from '@/lib/merchant-payout-utils';
import { formatInr } from '@/lib/format-inr';
import { useMerchantSession } from '@/context/MerchantSessionContext';

function normalizeStoreId(storeId?: string | number | null): string | null {
  if (storeId == null) return null;
  const s = String(storeId).trim();
  if (!s || s === '---') return null;
  return s;
}

function normalizeContact(raw: string | null | undefined): string {
  if (!raw) return '';
  const digits = String(raw).replace(/\D/g, '');
  return digits.length >= 10 ? digits.slice(-10) : digits;
}

export function useOutstandingDuesClear(storeId?: string | number | null) {
  const id = normalizeStoreId(storeId);
  const merchantSession = useMerchantSession();
  const { data: wallet, isPending } = useMerchantWallet(id, {
    enabled: !!id,
    lite: true,
    live: true,
  });
  const invalidateWallet = useInvalidateMerchantWallet();
  const invalidateLedger = useInvalidateMerchantLedger();
  const [clearing, setClearing] = useState(false);

  const displayBalance = resolveWalletDisplayBalance(wallet);
  const amount = isWalletBalanceNegative(displayBalance)
    ? Math.round(Math.abs(displayBalance) * 100) / 100
    : 0;

  const loadRazorpayScript = useCallback(() => {
    return new Promise<boolean>((resolve) => {
      if (typeof window !== 'undefined' && (window as unknown as { Razorpay?: unknown }).Razorpay) {
        resolve(true);
        return;
      }
      const script = document.createElement('script');
      script.src = 'https://checkout.razorpay.com/v1/checkout.js';
      script.onload = () => resolve(true);
      script.onerror = () => resolve(false);
      document.body.appendChild(script);
    });
  }, []);

  const trySettleFromOrder = useCallback(
    async (orderId: string): Promise<boolean> => {
      if (!id || !orderId) return false;
      try {
        const res = await fetch('/api/merchant/wallet/dues/settle-from-order', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ storeId: id, razorpay_order_id: orderId }),
        });
        const data = await res.json().catch(() => ({}));
        if (res.ok && data?.success && data?.captured) {
          toast.success('Outstanding dues cleared');
          invalidateWallet(id);
          invalidateLedger(id);
          return true;
        }
      } catch {
        /* ignore */
      }
      return false;
    },
    [id, invalidateWallet, invalidateLedger],
  );

  const clearDues = useCallback(async () => {
    if (!id || amount < 0.01 || clearing) return;
    setClearing(true);
    try {
      const loaded = await loadRazorpayScript();
      if (!loaded || !(window as unknown as { Razorpay?: unknown }).Razorpay) {
        toast.error('Could not load payment gateway');
        return;
      }
      const orderRes = await fetch('/api/merchant/wallet/dues/create-payment-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ storeId: id }),
      });
      const orderData = await orderRes.json();
      if (!orderRes.ok || !orderData.success || !orderData.orderId || !orderData.keyId) {
        toast.error(orderData.error ?? 'Could not start dues payment');
        return;
      }

      const amountPaise = Number(orderData.amount ?? 0);
      const keyId = String(orderData.keyId ?? '');
      const isTestMode =
        orderData.testMode === true || keyId.startsWith('rzp_test_');

      if (isTestMode) {
        toast(
          'Test Mode: Phone QR scan will not work. Use Cards, or UPI ID success@razorpay',
          { duration: 9000, icon: 'ℹ️' },
        );
      }

      const contact = normalizeContact(merchantSession?.user?.phone);
      const email = String(merchantSession?.user?.email ?? '').trim();

      await new Promise<void>((resolve) => {
        let settled = false;
        const finish = () => {
          if (settled) return;
          settled = true;
          resolve();
        };

        const rzpOptions: Record<string, unknown> = {
          key: keyId,
          amount: amountPaise,
          currency: orderData.currency ?? 'INR',
          name: 'GatiMitra Partner',
          description: orderData.description ?? 'Outstanding dues Cleared',
          order_id: orderData.orderId,
          theme: { color: '#DC2626' },
          prefill: {
            contact,
            email,
            name: merchantSession?.user?.name ?? '',
          },
          // Prefer cards in test mode — real UPI QR cannot complete against rzp_test_ keys.
          ...(isTestMode
            ? {
                config: {
                  display: {
                    sequence: ['card', 'upi', 'netbanking', 'wallet'],
                    preferences: { show_default_blocks: true },
                  },
                },
              }
            : {}),
          handler: async (response: {
            razorpay_order_id?: string;
            razorpay_payment_id?: string;
            razorpay_signature?: string;
          }) => {
            try {
              const verifyRes = await fetch('/api/merchant/wallet/dues/verify-payment', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  storeId: id,
                  razorpay_order_id: response.razorpay_order_id,
                  razorpay_payment_id: response.razorpay_payment_id,
                  razorpay_signature: response.razorpay_signature,
                }),
              });
              const verifyData = await verifyRes.json();
              if (!verifyRes.ok || !verifyData.success) {
                const recovered = await trySettleFromOrder(String(orderData.orderId));
                if (!recovered) {
                  toast.error(verifyData.error ?? 'Payment verification failed');
                }
                finish();
                return;
              }
              toast.success('Outstanding dues cleared');
              invalidateWallet(id);
              invalidateLedger(id);
              finish();
            } catch {
              const recovered = await trySettleFromOrder(String(orderData.orderId));
              if (!recovered) toast.error('Payment verification failed');
              finish();
            }
          },
          modal: {
            ondismiss: () => {
              void (async () => {
                // UPI QR often completes on phone after modal close — reconcile.
                await trySettleFromOrder(String(orderData.orderId));
                finish();
              })();
            },
          },
        };

        const rzp = new (window as unknown as {
          Razorpay: new (opts: Record<string, unknown>) => {
            open: () => void;
            on: (event: string, cb: (resp: unknown) => void) => void;
          };
        }).Razorpay(rzpOptions);
        rzp.on('payment.failed', () => {
          void (async () => {
            const recovered = await trySettleFromOrder(String(orderData.orderId));
            if (!recovered) toast.error('Payment failed. Please try again.');
            finish();
          })();
        });
        rzp.open();
      });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not clear dues');
    } finally {
      setClearing(false);
    }
  }, [
    id,
    amount,
    clearing,
    loadRazorpayScript,
    invalidateWallet,
    invalidateLedger,
    merchantSession?.user?.phone,
    merchantSession?.user?.email,
    merchantSession?.user?.name,
    trySettleFromOrder,
  ]);

  return {
    storeId: id,
    amount,
    amountLabel: amount > 0 ? formatInr(amount) : '',
    clearing,
    clearDues,
    loading: !!id && isPending && amount <= 0,
    hasDues: amount > 0,
  };
}
