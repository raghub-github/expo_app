import { NextRequest, NextResponse } from 'next/server';
import { db, client } from '@/lib/drizzle';
import { parentMerchantSchema } from '@/lib/validation/parentMerchantSchema';
import { logAudit } from '@/lib/auditLogger';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parse = parentMerchantSchema.safeParse(body);
    if (!parse.success) {
      return NextResponse.json({ error: parse.error.issues[0].message }, { status: 400 });
    }
    const data = parse.data;

    // Check for duplicate phone
    const phoneExists = await client`SELECT parent_merchant_id FROM merchant_parents WHERE registered_phone = ${data.registered_phone}`;
    if (phoneExists.length > 0) {
      await logAudit({
        entity_type: 'merchant_parents',
        entity_id: '',
        action: 'create_failed_duplicate_phone',
        old_data: null,
        new_data: data,
        performed_by: '',
        performed_by_email: '',
      });
      return NextResponse.json({
        error: 'Merchant already registered with this mobile number.',
        info: 'This mobile number is already registered.',
        parent_merchant_id: phoneExists[0]?.parent_merchant_id
      }, { status: 409 });
    }

    // Check for duplicate email
    if (data.owner_email) {
      const emailExists = await client`SELECT parent_merchant_id FROM merchant_parents WHERE owner_email = ${data.owner_email}`;
      if (emailExists.length > 0) {
        return NextResponse.json({
          error: 'Email already registered.',
          info: 'This email address is already registered.'
        }, { status: 409 });
      }
    }

    // Insert new parent merchant
    try {
      // Generate a unique parent_merchant_id if not provided, format: GMMP1001, GMMP1002, ...
      let parent_merchant_id = data.parent_merchant_id;
      if (!parent_merchant_id) {
        // Get the max existing numeric part
        const last = await client`SELECT parent_merchant_id FROM merchant_parents WHERE parent_merchant_id ~ '^GMMP\\d+$' ORDER BY parent_merchant_id DESC LIMIT 1`;
        let nextNum = 1001;
        if (last.length > 0) {
          const lastId = last[0].parent_merchant_id;
          const match = lastId.match(/^GMMP(\d+)$/);
          if (match) {
            nextNum = parseInt(match[1], 10) + 1;
          }
        }
        parent_merchant_id = `GMMP${nextNum}`;
      }

      const inserted = await client`
        INSERT INTO merchant_parents (
          parent_merchant_id, parent_name, merchant_type, owner_name, owner_email, registered_phone, registered_phone_normalized, alternate_phone, brand_name, business_category, is_active, registration_status, address_line1, city, state, pincode
        ) VALUES (
          ${parent_merchant_id},
          ${data.parent_name},
          ${data.merchant_type || 'LOCAL'},
          ${data.owner_name},
          ${data.owner_email || null},
          ${data.registered_phone},
          ${data.registered_phone_normalized || null},
          ${data.alternate_phone || null},
          ${data.brand_name || null},
          ${data.business_category || null},
          ${typeof data.is_active === 'boolean' ? data.is_active : true},
          ${data.registration_status || 'VERIFIED'},
          ${data.address_line1 || null},
          ${data.city || null},
          ${data.state || null},
          ${data.pincode || null}
        )
        RETURNING id, parent_merchant_id
      `;
      await logAudit({
        entity_type: 'merchant_parents',
        entity_id: inserted[0]?.parent_merchant_id || '',
        action: 'create',
        old_data: null,
        new_data: { ...data, parent_merchant_id },
        performed_by: '',
        performed_by_email: '',
      });
      return NextResponse.json({
        success: true,
        parent_merchant_id: inserted[0]?.parent_merchant_id,
        info: 'Parent merchant registered successfully.'
      });
    } catch (err) {
      // Check for unique constraint violation (phone/email)
      if (err && err.code === '23505') {
        return NextResponse.json({ error: 'Duplicate entry for phone or email.' }, { status: 409 });
      }
      return NextResponse.json({ error: 'Failed to register merchant' }, { status: 500 });
    }
  } catch (err) {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }
}
