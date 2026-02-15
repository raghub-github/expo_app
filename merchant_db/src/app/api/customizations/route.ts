import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/drizzle';
import { customizationSchema, addonSchema } from '@/lib/validation/customizationSchema';
import { logAudit } from '@/lib/auditLogger';
import { menu_items, item_customizations, item_addons } from '@/lib/schema';
import { eq, and } from 'drizzle-orm';

export async function POST(req: NextRequest) {
  const body = await req.json();
  // Customization creation
  if (body.type === 'customization') {
    const parse = customizationSchema.safeParse(body.data);
    if (!parse.success) {
      return NextResponse.json({ error: parse.error.issues[0].message }, { status: 400 });
    }
    const data = parse.data;
    // Check menu item exists and is active using Drizzle ORM
    const item = await db.select().from(menu_items)
      .where(and(eq(menu_items.item_id, data.item_id), eq(menu_items.is_active, true)))
      .limit(1)
      .then(rows => rows[0]);
    if (!item) {
      return NextResponse.json({ error: 'Menu item not found or inactive' }, { status: 404 });
    }
    try {
      const [inserted] = await db.insert(item_customizations).values({
        menu_item_id: data.item_id,
        title: data.title,
        required: data.required,
        max_selection: data.max_selection !== undefined ? String(data.max_selection) : undefined,
      }).returning();
      await logAudit({
        entity_type: 'item_customizations',
        entity_id: inserted.id,
        action: 'create',
        old_data: null,
        new_data: inserted,
        performed_by: '',
        performed_by_email: '',
      });
      return NextResponse.json({ customization: inserted }, { status: 201 });
    } catch (err) {
      await logAudit({
        entity_type: 'item_customizations',
        entity_id: '',
        action: 'create_failed',
        old_data: null,
        new_data: data,
        performed_by: '',
        performed_by_email: '',
      });
      return NextResponse.json({ error: 'Failed to add customization.' }, { status: 500 });
    }
  }
  // Add-on creation
  if (body.type === 'addon') {
    const parse = addonSchema.safeParse(body.data);
    if (!parse.success) {
      return NextResponse.json({ error: parse.error.issues[0].message }, { status: 400 });
    }
    const data = parse.data;
    // Check customization exists
    const customization = await db.select().from(item_customizations)
      .where(eq(item_customizations.id, Number(data.customization_id)))
      .limit(1)
      .then(rows => rows[0]);
    if (!customization) {
      return NextResponse.json({ error: 'Customization not found' }, { status: 404 });
    }
    try {
      // Drizzle ORM insert for item_addons
      const [inserted] = await db.insert(item_addons).values({
        customization_id: String(data.customization_id),
        addon_name: data.addon_name,
        addon_price: String(data.addon_price),
      }).returning();
      await logAudit({
        entity_type: 'item_addons',
        entity_id: inserted.id,
        action: 'create',
        old_data: null,
        new_data: inserted,
        performed_by: '',
        performed_by_email: '',
      });
      return NextResponse.json({ addon: inserted }, { status: 201 });
    } catch (err) {
      await logAudit({
        entity_type: 'item_addons',
        entity_id: '',
        action: 'create_failed',
        old_data: null,
        new_data: data,
        performed_by: '',
        performed_by_email: '',
      });
      return NextResponse.json({ error: 'Failed to add addon.' }, { status: 500 });
    }
  }
  return NextResponse.json({ error: 'Invalid type' }, { status: 400 });
}
