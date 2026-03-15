import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

const DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'] as const;

function normalizeTime(value: unknown): string | null {
  if (value == null || value === '' || value === false) return null;
  const s = String(value).trim();
  if (!s || s === 'null' || s === 'undefined') return null;
  const match = s.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (!match) return null;
  const h = parseInt(match[1], 10);
  const m = parseInt(match[2], 10);
  if (h < 0 || h > 23 || m < 0 || m > 59) return null;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function toMinutes(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

export async function POST(req: NextRequest) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { store_id, same_for_all, force_24_hours, closed_day, closed_days, updated_by_email, updated_by_at, ...timings } = body;
  if (!store_id) {
    return NextResponse.json({ error: 'store_id is required' }, { status: 400 });
  }

  let userEmail = updated_by_email;
  if (!userEmail) {
    try {
      const cookieStore = await cookies();
      const supabaseAccessToken = cookieStore.get('sb-access-token')?.value;
      if (supabaseAccessToken) {
        const { data: { user } } = await supabase.auth.getUser(supabaseAccessToken);
        userEmail = user?.email || '';
      }
    } catch {
      userEmail = '';
    }
  }

  const { data: storeData, error: storeError } = await supabase
    .from('merchant_stores')
    .select('id')
    .eq('store_id', store_id)
    .single();
  if (storeError || !storeData) {
    return NextResponse.json({ error: 'Store not found' }, { status: 404 });
  }
  const storeBigIntId = storeData.id;

  const { data: existingRecord } = await supabase
    .from('merchant_store_operating_hours')
    .select('*')
    .eq('store_id', storeBigIntId)
    .single();

  // Normalize incoming time fields
  for (const day of DAYS) {
    for (const field of [`${day}_slot1_start`, `${day}_slot1_end`, `${day}_slot2_start`, `${day}_slot2_end`]) {
      if (field in timings) {
        timings[field] = normalizeTime(timings[field]);
      }
    }
  }

  // Build merged data: start from existing, override with incoming
  const mergedData: Record<string, any> = {};
  if (existingRecord) {
    for (const day of DAYS) {
      mergedData[`${day}_open`] = existingRecord[`${day}_open`] ?? false;
      mergedData[`${day}_slot1_start`] = normalizeTime(existingRecord[`${day}_slot1_start`]);
      mergedData[`${day}_slot1_end`] = normalizeTime(existingRecord[`${day}_slot1_end`]);
      mergedData[`${day}_slot2_start`] = normalizeTime(existingRecord[`${day}_slot2_start`]);
      mergedData[`${day}_slot2_end`] = normalizeTime(existingRecord[`${day}_slot2_end`]);
      mergedData[`${day}_total_duration_minutes`] = existingRecord[`${day}_total_duration_minutes`] ?? 0;
    }
    mergedData.is_24_hours = existingRecord.is_24_hours ?? false;
    mergedData.same_for_all_days = existingRecord.same_for_all_days ?? false;
    mergedData.closed_days = existingRecord.closed_days ?? null;
  }

  for (const [key, value] of Object.entries(timings)) {
    mergedData[key] = value;
  }

  mergedData.store_id = storeBigIntId;
  mergedData.same_for_all_days = same_for_all !== undefined ? same_for_all : (mergedData.same_for_all_days ?? false);
  mergedData.is_24_hours = force_24_hours !== undefined ? force_24_hours : (mergedData.is_24_hours ?? false);
  mergedData.updated_by_email = userEmail;
  mergedData.updated_by_at = updated_by_at || new Date().toISOString();

  // Auto-fix and validate each day
  const warnings: string[] = [];
  for (const day of DAYS) {
    const dayOpen = mergedData[`${day}_open`];

    // Closed day: clear all slots
    if (!dayOpen) {
      mergedData[`${day}_slot1_start`] = null;
      mergedData[`${day}_slot1_end`] = null;
      mergedData[`${day}_slot2_start`] = null;
      mergedData[`${day}_slot2_end`] = null;
      mergedData[`${day}_total_duration_minutes`] = 0;
      continue;
    }

    let s1s = normalizeTime(mergedData[`${day}_slot1_start`]);
    let s1e = normalizeTime(mergedData[`${day}_slot1_end`]);
    let s2s = normalizeTime(mergedData[`${day}_slot2_start`]);
    let s2e = normalizeTime(mergedData[`${day}_slot2_end`]);

    // Fix 24-hour: 00:00-00:00 → 00:00-23:59
    if (s1s === '00:00' && s1e === '00:00' && mergedData.is_24_hours) {
      s1e = '23:59';
    }

    // Slot1 must have both start and end, or neither
    if ((s1s == null) !== (s1e == null)) {
      s1s = null;
      s1e = null;
    }

    // Validate slot1 order
    if (s1s && s1e && toMinutes(s1e) <= toMinutes(s1s)) {
      return NextResponse.json({
        error: `${day}: Slot 1 end time (${s1e}) must be after start time (${s1s})`,
      }, { status: 400 });
    }

    // Slot2 pair check: both must be set or both null
    if ((s2s == null) !== (s2e == null)) {
      s2s = null;
      s2e = null;
      warnings.push(`${day}: Incomplete Slot 2 cleared`);
    }

    // Validate slot2 order — if invalid, auto-clear slot2 instead of rejecting
    if (s2s && s2e && toMinutes(s2e) <= toMinutes(s2s)) {
      warnings.push(`${day}: Slot 2 had invalid times (${s2s}-${s2e}), cleared`);
      s2s = null;
      s2e = null;
    }

    // Validate overlap — if slot2 starts before slot1 ends, auto-clear slot2
    if (s1e && s2s && toMinutes(s2s) <= toMinutes(s1e)) {
      warnings.push(`${day}: Slot 2 overlapped with Slot 1, cleared`);
      s2s = null;
      s2e = null;
    }

    mergedData[`${day}_slot1_start`] = s1s;
    mergedData[`${day}_slot1_end`] = s1e;
    mergedData[`${day}_slot2_start`] = s2s;
    mergedData[`${day}_slot2_end`] = s2e;
  }

  // Calculate closed_days
  let finalClosedDays: string[] | null = null;
  if (closed_days !== undefined) {
    finalClosedDays = Array.isArray(closed_days) && closed_days.length > 0 ? closed_days : null;
  } else {
    const closedList: string[] = [];
    for (const day of DAYS) {
      if (mergedData[`${day}_open`] === false) {
        closedList.push(day);
      }
    }
    finalClosedDays = closedList.length > 0 ? closedList : null;
  }
  mergedData.closed_days = finalClosedDays;

  const { error } = await supabase
    .from('merchant_store_operating_hours')
    .upsert([mergedData], { onConflict: 'store_id' });

  if (error) {
    console.error('[outlet-timings] DB error:', error.message, '\nPayload:', JSON.stringify(mergedData, null, 2));
    return NextResponse.json({
      error: error.message,
      code: error.code,
      details: error.details,
      hint: error.hint,
    }, { status: 500 });
  }

  return NextResponse.json({ success: true, warnings: warnings.length > 0 ? warnings : undefined });
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const store_id = searchParams.get('store_id');
  if (!store_id) {
    return NextResponse.json({ error: 'store_id is required' }, { status: 400 });
  }
  const { data, error } = await supabase
    .from('merchant_store_operating_hours')
    .select('*')
    .eq('store_id', store_id)
    .single();
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (data) {
    for (const day of DAYS) {
      for (const suffix of ['_slot1_start', '_slot1_end', '_slot2_start', '_slot2_end']) {
        const field = `${day}${suffix}`;
        if (data[field]) {
          data[field] = normalizeTime(data[field]);
        }
      }
    }
  }
  return NextResponse.json(data);
}
