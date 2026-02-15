import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/drizzle';
import { menuItemSchema } from '@/lib/validation/menuItemSchema';
import { logAudit } from '@/lib/auditLogger';
import { eq } from 'drizzle-orm';
import { merchant_store, menu_items } from '@/lib/schema';

export async function POST(req: NextRequest) {
  const body = await req.json();
  const parse = menuItemSchema.safeParse(body);
  if (!parse.success) {
    return NextResponse.json({ error: parse.error.issues[0].message }, { status: 400 });
  }
  const data = parse.data;
  // Check store approval and active status using Drizzle ORM
  const storeResult = await db.select({ approval_status: merchant_store.approval_status, is_active: merchant_store.is_active })
    .from(merchant_store)
    .where(eq(merchant_store.store_id, data.store_id));
  const store = storeResult[0];
  if (!store || store.approval_status !== 'APPROVED' || !store.is_active) {
    return NextResponse.json({ error: 'Store not approved or inactive' }, { status: 403 });
  }
  try {
    const [inserted] = await db.insert(menu_items).values({
      store_id: data.store_id,
      item_name: data.item_name,
      description: data.description,
      category_type: data.category_type,
      food_category_item: data.food_category_item,
      actual_price: data.actual_price,
      offer_price: data.offer_price || null,
      in_stock: data.in_stock,
      has_customization: data.has_customization,
      has_addons: data.has_addons,
      image_url: data.image_url || null,
      is_active: true,
    }).returning({ id: menu_items.id, item_id: menu_items.item_id });
    await logAudit({
      entity_type: 'menu_items',
      entity_id: inserted.item_id,
      action: 'create',
      old_data: null,
      new_data: inserted,
      performed_by: '',
      performed_by_email: '',
    });
    return NextResponse.json({ id: inserted.id, item_id: inserted.item_id }, { status: 201 });
  } catch (err) {
    await logAudit({
      entity_type: 'menu_items',
      entity_id: '',
      action: 'create_failed',
      old_data: null,
      new_data: data,
      performed_by: '',
      performed_by_email: '',
    });
    return NextResponse.json({ error: 'Failed to add menu item.' }, { status: 500 });
  }
}
