import { client as sql } from '@/lib/drizzle';
import type { Sql } from 'postgres';

/** Map partnersite env names so backend modules can boot when imported in-process. */
function ensureBackendEnvShim(): void {
  const pairs: Array<[string, string | undefined]> = [
    ['SUPABASE_URL', process.env.NEXT_PUBLIC_SUPABASE_URL],
    ['SUPABASE_ANON_KEY', process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY],
    ['SUPABASE_SERVICE_ROLE_KEY', process.env.SUPABASE_SERVICE_ROLE_KEY],
    ['SUPABASE_JWT_SECRET', process.env.SUPABASE_JWT_SECRET],
  ];
  for (const [key, value] of pairs) {
    if (!String(process.env[key] ?? '').trim() && value?.trim()) {
      process.env[key] = value.trim();
    }
  }
}

export type PartnerInProcessAutoRefundOutcome =
  | { ok: true; outcome: unknown }
  | { ok: false; error: string };

/**
 * Run auto-refund inside the partnersite Node process when Fastify is unreachable.
 * Uses the same shared trigger as Merchant App cancel + backend internal route.
 */
export async function partnerOrderAutoRefundInProcess(args: {
  orderCorePk: number;
  reason: string;
  actorRole: string;
  actorEmail?: string | null;
  amount?: number | null;
}): Promise<PartnerInProcessAutoRefundOutcome> {
  ensureBackendEnvShim();
  try {
    const mod = await import(
      /* webpackIgnore: true */
      '../../../backend/src/lib/trigger-order-auto-refund'
    );
    const outcome = await mod.triggerOrderAutoRefundAfterCancel(
      {
        orderCoreId: args.orderCorePk,
        reason: args.reason,
        actorEmail: args.actorEmail ?? null,
        actorRole: args.actorRole,
        amount:
          args.amount != null && Number.isFinite(Number(args.amount)) && Number(args.amount) > 0
            ? Number(args.amount)
            : null,
      },
      sql as unknown as Sql
    );
    return { ok: true, outcome };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
