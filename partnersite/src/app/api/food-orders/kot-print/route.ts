import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

/**
 * Best-effort KOT print audit — Partner Site.
 * Updates order_pickup_tokens print counters and inserts order_kot_print_events.
 */

function getServiceClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error('Missing Supabase env');
  }
  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      order_id?: number;
      store_id?: number | null;
      kot_number?: string | null;
      printed_by?: string;
      print_channel?: string;
    };
    const orderId = Number(body.order_id);
    if (!Number.isFinite(orderId) || orderId < 1) {
      return NextResponse.json({ error: 'invalid_order_id' }, { status: 400 });
    }

    const db = getServiceClient();
    const printedBy = (body.printed_by ?? 'partner_site').slice(0, 64);
    const printChannel = (body.print_channel ?? 'browser').slice(0, 64);

    const { data: tok } = await db
      .from('order_pickup_tokens')
      .select('id, kot_number, kot_print_count, kot_version')
      .eq('order_id', orderId)
      .maybeSingle();

    if (tok?.id) {
      await db
        .from('order_pickup_tokens')
        .update({
          last_kot_printed_at: new Date().toISOString(),
          kot_print_count: Number(tok.kot_print_count ?? 0) + 1,
          updated_at: new Date().toISOString(),
        })
        .eq('id', tok.id);

      await db.from('order_kot_print_events').insert({
        order_id: orderId,
        store_id: body.store_id ?? null,
        token_id: tok.id,
        kot_number: body.kot_number ?? tok.kot_number ?? null,
        printed_by: printedBy,
        print_channel: printChannel,
        kot_version: Number(tok.kot_version ?? 1) || 1,
      });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.warn('[kot-print] audit failed:', err);
    return NextResponse.json({ ok: false }, { status: 200 });
  }
}
