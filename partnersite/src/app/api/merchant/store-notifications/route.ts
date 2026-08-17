import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { assertStoreAccess } from '@/lib/auth/assert-store-access';
import { WAITING_FOR_ORDER_TITLE } from '@/lib/partner-notification-constants';
import {
  isPartnerNotificationsPanelClearedForStore,
  markPartnerNotificationsPanelCleared,
  getPartnerNotificationsClearedAt,
} from '@/lib/partner-notifications-panel';
import { purgeStaleNewOrderNotifications } from '@/lib/purge-stale-new-order-notifications';
import {
  clearPartnerCampaignNotifications,
  deletePartnerCampaignNotification,
  deletePartnerCampaignNotificationsByTitle,
  isCampaignNotificationId,
  listPartnerCampaignNotifications,
  markAllPartnerCampaignsRead,
  markPartnerCampaignRead,
  parentMerchantPublicIdForStore,
} from '@/lib/partner-campaign-inbox';
import { mapMerchantAppDeepLinkToPartnersite } from '@/lib/mapMerchantAppDeepLink';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://placeholder.supabase.co";
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "placeholder-service-role-key";

function getDb() {
  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

function notificationFingerprint(title: unknown, body: unknown): string {
  return `${String(title ?? '').trim().toLowerCase()}|${String(body ?? '').trim().toLowerCase().slice(0, 120)}`;
}

function dedupeNotifications<T extends { title?: unknown; body?: unknown; created_at?: string }>(rows: T[]): T[] {
  const best = new Map<string, T>();
  for (const n of rows) {
    const fp = notificationFingerprint(n.title, n.body);
    const prev = best.get(fp);
    if (!prev) {
      best.set(fp, n);
      continue;
    }
    const ta = n.created_at ? new Date(n.created_at).getTime() : 0;
    const tb = prev.created_at ? new Date(prev.created_at).getTime() : 0;
    if (ta >= tb) best.set(fp, n);
  }
  return [...best.values()];
}

/** GET ?store_id= — store ops alerts + super-admin campaign announcements */
export async function GET(req: NextRequest) {
  try {
    const storeId = new URL(req.url).searchParams.get('store_id');
    const gate = await assertStoreAccess(storeId);
    if (!gate.ok) {
      return NextResponse.json({ error: gate.error }, { status: gate.status });
    }
    const db = getDb();
    const clearedAt = await getPartnerNotificationsClearedAt(db, gate.storeIdNum);
    let query = db
      .from('merchant_store_notifications')
      .select('id, store_id, type, title, body, read, order_id, action_url, created_at')
      .eq('store_id', gate.storeIdNum);
    if (clearedAt) {
      query = query.gt('created_at', clearedAt);
    }
    const { data, error } = await query.order('created_at', { ascending: false }).limit(50);
    if (error) {
      console.error('[store-notifications GET]', error);
      return NextResponse.json({ error: 'Failed to load notifications' }, { status: 500 });
    }
    const raw = data ?? [];
    const purged = await purgeStaleNewOrderNotifications(db, gate.storeIdNum, raw);
    const remaining = purged.size > 0 ? raw.filter((r) => !purged.has(String(r.id))) : raw;
    const storeNotifications = remaining.map((r) => ({
      id: String(r.id),
      type: r.type,
      title: r.title,
      body: r.body,
      read: r.read === true,
      order_id: r.order_id != null ? String(r.order_id) : undefined,
      action_url: r.action_url
        ? mapMerchantAppDeepLinkToPartnersite(String(r.action_url), {
            preferMx: false,
          })
        : undefined,
      created_at: r.created_at as string | undefined,
      source: 'store' as const,
    }));

    const campaignNotifications = await listPartnerCampaignNotifications(gate.storeIdNum, 40, clearedAt);

    const notifications = dedupeNotifications([...storeNotifications, ...campaignNotifications]).sort((a, b) => {
      const ta = a.created_at ? new Date(a.created_at).getTime() : 0;
      const tb = b.created_at ? new Date(b.created_at).getTime() : 0;
      return tb - ta;
    });

    return NextResponse.json({ notifications });
  } catch (e) {
    console.error('[store-notifications GET]', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/** POST { store_id, action: "ensure_waiting" | "delete_waiting" | "mark_read" | "mark_all_read" | "clear_all", notification_id? } */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const storeIdParam = typeof body.store_id === 'string' ? body.store_id.trim() : '';
    const action = typeof body.action === 'string' ? body.action.trim() : '';
    const gate = await assertStoreAccess(storeIdParam || null);
    if (!gate.ok) {
      return NextResponse.json({ error: gate.error }, { status: gate.status });
    }
    const db = getDb();

    if (action === 'delete_waiting') {
      const { error } = await db
        .from('merchant_store_notifications')
        .delete()
        .eq('store_id', gate.storeIdNum)
        .eq('title', WAITING_FOR_ORDER_TITLE);
      if (error) {
        console.error('[store-notifications POST] delete_waiting', error);
        return NextResponse.json({ error: 'delete_failed' }, { status: 500 });
      }
      return NextResponse.json({ ok: true });
    }

    if (action === 'mark_all_read') {
      const { error } = await db
        .from('merchant_store_notifications')
        .update({ read: true })
        .eq('store_id', gate.storeIdNum);
      if (error) {
        console.error('[store-notifications POST] mark_all_read', error);
        return NextResponse.json({ error: 'update_failed' }, { status: 500 });
      }
      await markAllPartnerCampaignsRead(gate.storeIdNum);
      return NextResponse.json({ ok: true });
    }

    if (action === 'clear_all') {
      const { error } = await db
        .from('merchant_store_notifications')
        .delete()
        .eq('store_id', gate.storeIdNum);
      if (error) {
        console.error('[store-notifications POST] clear_all', error);
        return NextResponse.json({ error: 'delete_failed' }, { status: 500 });
      }
      await clearPartnerCampaignNotifications(gate.storeIdNum);
      await markPartnerNotificationsPanelCleared(db, gate.storeIdNum);
      return NextResponse.json({ ok: true });
    }

    if (action === 'mark_read') {
      const nid = typeof body.notification_id === 'string' ? body.notification_id.trim() : '';
      if (!nid) {
        return NextResponse.json({ error: 'notification_id required' }, { status: 400 });
      }
      if (isCampaignNotificationId(nid)) {
        const ok = await markPartnerCampaignRead(gate.storeIdNum, nid);
        if (!ok) return NextResponse.json({ error: 'update_failed' }, { status: 500 });
        return NextResponse.json({ ok: true });
      }
      if (!/^\d+$/.test(nid)) {
        return NextResponse.json({ error: 'notification_id required' }, { status: 400 });
      }
      const { error } = await db
        .from('merchant_store_notifications')
        .update({ read: true })
        .eq('store_id', gate.storeIdNum)
        .eq('id', Number(nid));
      if (error) {
        console.error('[store-notifications POST] mark_read', error);
        return NextResponse.json({ error: 'update_failed' }, { status: 500 });
      }
      return NextResponse.json({ ok: true });
    }

    if (action !== 'ensure_waiting') {
      return NextResponse.json({ error: 'invalid_action' }, { status: 400 });
    }
    if (await isPartnerNotificationsPanelClearedForStore(db, gate.storeIdNum)) {
      return NextResponse.json({ created: false, suppressed: true });
    }
    // Never create a waiting row while the store is closed / not accepting orders.
    const { data: storeRow } = await db
      .from('merchant_stores')
      .select('operational_status, is_accepting_orders, is_available, is_active')
      .eq('id', gate.storeIdNum)
      .is('deleted_at', null)
      .maybeSingle();
    const isOpen =
      storeRow != null &&
      String(storeRow.operational_status ?? '').toUpperCase() === 'OPEN' &&
      storeRow.is_accepting_orders === true &&
      storeRow.is_available === true &&
      storeRow.is_active === true;
    if (!isOpen) {
      await db
        .from('merchant_store_notifications')
        .delete()
        .eq('store_id', gate.storeIdNum)
        .eq('title', WAITING_FOR_ORDER_TITLE);
      return NextResponse.json({ created: false, suppressed: true });
    }
    const { data: existing, error: exErr } = await db
      .from('merchant_store_notifications')
      .select('id')
      .eq('store_id', gate.storeIdNum)
      .eq('title', WAITING_FOR_ORDER_TITLE)
      .limit(1)
      .maybeSingle();
    if (exErr) {
      console.error('[store-notifications POST] existing', exErr);
      return NextResponse.json({ error: 'lookup_failed' }, { status: 500 });
    }
    if (existing?.id != null) {
      return NextResponse.json({ id: String(existing.id), created: false });
    }
    const { data: ins, error: insErr } = await db
      .from('merchant_store_notifications')
      .insert({
        store_id: gate.storeIdNum,
        type: 'system',
        title: WAITING_FOR_ORDER_TITLE,
        body: 'Waiting for orders',
        read: false,
      })
      .select('id')
      .single();
    if (insErr || !ins?.id) {
      console.error('[store-notifications POST] insert', insErr);
      return NextResponse.json({ error: 'insert_failed' }, { status: 500 });
    }
    return NextResponse.json({ id: String(ins.id), created: true });
  } catch (e) {
    console.error('[store-notifications POST]', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/** DELETE ?store_id=&notification_id= | ?store_id=&kind=waiting */
export async function DELETE(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const storeId = url.searchParams.get('store_id');
    const gate = await assertStoreAccess(storeId);
    if (!gate.ok) {
      return NextResponse.json({ error: gate.error }, { status: gate.status });
    }
    const kind = url.searchParams.get('kind');
    const notificationId = url.searchParams.get('notification_id');
    const db = getDb();
    if (kind === 'waiting') {
      const { error } = await db
        .from('merchant_store_notifications')
        .delete()
        .eq('store_id', gate.storeIdNum)
        .eq('title', WAITING_FOR_ORDER_TITLE);
      if (error) {
        console.error('[store-notifications DELETE] waiting', error);
        return NextResponse.json({ error: 'delete_failed' }, { status: 500 });
      }
      return NextResponse.json({ ok: true });
    }
    if (!notificationId) {
      return NextResponse.json({ error: 'notification_id required' }, { status: 400 });
    }
    if (isCampaignNotificationId(notificationId)) {
      const parentId = await parentMerchantPublicIdForStore(gate.storeIdNum);
      let title = '';
      let bodyText = '';
      if (parentId) {
        try {
          const { client: pg } = await import('@/lib/drizzle');
          const rows = await pg`
            SELECT title, body
            FROM public.notification_dispatch_logs
            WHERE notification_id = ${notificationId}::uuid
              AND recipient_user_id = ${parentId}
            LIMIT 1
          `;
          const row = rows[0] as { title?: string | null; body?: string | null } | undefined;
          title = String(row?.title ?? '').trim();
          bodyText = String(row?.body ?? '');
        } catch {
          /* lookup is best-effort */
        }
      }
      const ok = await deletePartnerCampaignNotification(gate.storeIdNum, notificationId);
      if (!ok) return NextResponse.json({ error: 'delete_failed' }, { status: 500 });
      if (title) {
        await db
          .from('merchant_store_notifications')
          .delete()
          .eq('store_id', gate.storeIdNum)
          .eq('title', title)
          .eq('body', bodyText);
        await deletePartnerCampaignNotificationsByTitle(gate.storeIdNum, title, bodyText);
      }
      return NextResponse.json({ ok: true });
    }
    if (!/^\d+$/.test(notificationId)) {
      return NextResponse.json({ error: 'notification_id required' }, { status: 400 });
    }
    const { data: existing } = await db
      .from('merchant_store_notifications')
      .select('id, title, body')
      .eq('store_id', gate.storeIdNum)
      .eq('id', Number(notificationId))
      .maybeSingle();
    const { error } = await db
      .from('merchant_store_notifications')
      .delete()
      .eq('store_id', gate.storeIdNum)
      .eq('id', Number(notificationId));
    if (error) {
      console.error('[store-notifications DELETE]', error);
      return NextResponse.json({ error: 'delete_failed' }, { status: 500 });
    }
    const title = typeof existing?.title === 'string' ? existing.title.trim() : '';
    const bodyText = typeof existing?.body === 'string' ? existing.body : '';
    if (title) {
      await db
        .from('merchant_store_notifications')
        .delete()
        .eq('store_id', gate.storeIdNum)
        .eq('title', title)
        .eq('body', bodyText);
      await deletePartnerCampaignNotificationsByTitle(gate.storeIdNum, title, bodyText);
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('[store-notifications DELETE]', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
