import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/drizzle';
import { offerSchema } from '@/lib/validation/offerSchema';
import { logAudit } from '@/lib/auditLogger';

export async function POST(req: NextRequest) {
  const body = await req.json();
  const parse = offerSchema.safeParse(body);
  if (!parse.success) {
    return NextResponse.json({ error: parse.error.errors[0].message }, { status: 400 });
  }
  const data = parse.data;
  // If SPECIFIC_ITEM, item_id is required
  if (data.offer_type === 'SPECIFIC_ITEM' && !data.item_id) {
    return NextResponse.json({ error: 'Menu item required for SPECIFIC_ITEM offer' }, { status: 400 });
  }
  // Validate date range
  if (new Date(data.valid_from) >= new Date(data.valid_till)) {
    return NextResponse.json({ error: 'Invalid date range' }, { status: 400 });
  }
  try {
    const [inserted] = await db.query(
      `INSERT INTO offers (store_id, offer_type, menu_item_id, discount_type, discount_value, min_order_amount, valid_from, valid_till, is_active)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,true) RETURNING id, offer_id`,
      [
        data.store_id,
        data.offer_type,
        data.item_id || null,
        data.discount_type,
        data.discount_value,
        data.min_order_amount || null,
        data.valid_from,
        data.valid_till,
      ]
    );
    await logAudit({
      entity_type: 'offers',
      entity_id: inserted.offer_id,
      action: 'create',
      old_data: null,
      new_data: inserted,
      performed_by: '',
      performed_by_email: '',
    });
    return NextResponse.json({ id: inserted.id, offer_id: inserted.offer_id }, { status: 201 });
  } catch (err) {
    await logAudit({
      entity_type: 'offers',
      entity_id: '',
      action: 'create_failed',
      old_data: null,
      new_data: data,
      performed_by: '',
      performed_by_email: '',
    });
    return NextResponse.json({ error: 'Failed to create offer.' }, { status: 500 });
  }
}

// Auto-disable expired offers (can be called by cron or scheduled job)
export async function PATCH() {
  const now = new Date().toISOString();
  const { rowCount } = await db.query(
    'UPDATE offers SET is_active = false WHERE valid_till < $1 AND is_active = true',
    [now]
  );
  return NextResponse.json({ disabled: rowCount });
}
