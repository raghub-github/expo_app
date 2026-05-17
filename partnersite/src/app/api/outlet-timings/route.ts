import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { normalizeWallTimeToHHMM } from '@/lib/wallTimeHHMM';
import { syncStoreStatusAfterOperatingHoursChange } from '@/lib/storeScheduleSync';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

const DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'] as const;

const OPERATING_HOURS_SELECT = [
  'store_id',
  'same_for_all_days',
  'is_24_hours',
  'closed_days',
  'updated_by_email',
  'updated_by_at',
  ...DAYS.flatMap((day) => [
    `${day}_open`,
    `${day}_slot1_start`,
    `${day}_slot1_end`,
    `${day}_slot2_start`,
    `${day}_slot2_end`,
    `${day}_total_duration_minutes`,
  ]),
].join(', ');

async function resolveInternalStoreId(storeIdParam: string): Promise<number | null> {
  const trimmed = storeIdParam.trim();
  if (/^\d+$/.test(trimmed)) {
    const n = parseInt(trimmed, 10);
    const { data } = await supabase.from('merchant_stores').select('id').eq('id', n).maybeSingle();
    return data?.id != null ? (data.id as number) : null;
  }
  const { data } = await supabase
    .from('merchant_stores')
    .select('id')
    .eq('store_id', trimmed)
    .maybeSingle();
  return data?.id != null ? (data.id as number) : null;
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
        timings[field] = normalizeWallTimeToHHMM(timings[field]);
      }
    }
  }

  // Build merged data: start from existing, override with incoming
  const mergedData: Record<string, any> = {};
  if (existingRecord) {
    for (const day of DAYS) {
      mergedData[`${day}_open`] = existingRecord[`${day}_open`] ?? false;
      mergedData[`${day}_slot1_start`] = normalizeWallTimeToHHMM(existingRecord[`${day}_slot1_start`]);
      mergedData[`${day}_slot1_end`] = normalizeWallTimeToHHMM(existingRecord[`${day}_slot1_end`]);
      mergedData[`${day}_slot2_start`] = normalizeWallTimeToHHMM(existingRecord[`${day}_slot2_start`]);
      mergedData[`${day}_slot2_end`] = normalizeWallTimeToHHMM(existingRecord[`${day}_slot2_end`]);
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

    let s1s = normalizeWallTimeToHHMM(mergedData[`${day}_slot1_start`]);
    let s1e = normalizeWallTimeToHHMM(mergedData[`${day}_slot1_end`]);
    let s2s = normalizeWallTimeToHHMM(mergedData[`${day}_slot2_start`]);
    let s2e = normalizeWallTimeToHHMM(mergedData[`${day}_slot2_end`]);

    if (!dayOpen) {
      mergedData[`${day}_slot1_start`] = s1s;
      mergedData[`${day}_slot1_end`] = s1e;
      mergedData[`${day}_slot2_start`] = s2s;
      mergedData[`${day}_slot2_end`] = s2e;
      continue;
    }

    // Fix 24-hour: 00:00-00:00 → 00:00-23:59
    if (s1s === '00:00' && s1e === '00:00' && mergedData.is_24_hours) {
      s1e = '23:59';
    }

    // Slot1 must have both start and end, or neither
    if ((s1s == null) !== (s1e == null)) {
      return NextResponse.json({
        error: `${day}: Slot 1 start and end time must both be set`,
      }, { status: 400 });
    }

    // Validate slot1 order
    if (s1s && s1e && toMinutes(s1e) <= toMinutes(s1s)) {
      return NextResponse.json({
        error: `${day}: Slot 1 end time (${s1e}) must be after start time (${s1s})`,
      }, { status: 400 });
    }

    // Slot2 pair check: both must be set or both null
    if ((s2s == null) !== (s2e == null)) {
      return NextResponse.json({
        error: `${day}: Slot 2 start and end time must both be set`,
      }, { status: 400 });
    }

    if ((s2s || s2e) && (!s1s || !s1e)) {
      return NextResponse.json({
        error: `${day}: Fill Slot 1 before saving Slot 2`,
      }, { status: 400 });
    }

    if (s2s && s2e && toMinutes(s2e) <= toMinutes(s2s)) {
      return NextResponse.json({
        error: `${day}: Slot 2 end time (${s2e}) must be after start time (${s2s})`,
      }, { status: 400 });
    }

    if (s1e && s2s && toMinutes(s2s) <= toMinutes(s1e)) {
      return NextResponse.json({
        error: `${day}: Slot 2 must start after Slot 1 ends (${s1e})`,
      }, { status: 400 });
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

  const { data: storeTzRow } = await supabase
    .from('merchant_stores')
    .select('timezone')
    .eq('id', storeData.id)
    .single();
  const storeTz = (storeTzRow as { timezone?: string } | null)?.timezone || 'Asia/Kolkata';

  // Re-evaluate store status in background so save response stays fast
  void syncStoreStatusAfterOperatingHoursChange(supabase, storeData.id as number, storeTz).catch(
    (syncErr) => console.error('[outlet-timings] schedule sync after save failed:', syncErr)
  );

  return NextResponse.json({
    success: true,
    warnings: warnings.length > 0 ? warnings : undefined,
  });
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const store_id_param = searchParams.get('store_id');
  if (!store_id_param) {
    return NextResponse.json({ error: 'store_id is required' }, { status: 400 });
  }

  const internalStoreId = await resolveInternalStoreId(store_id_param);
  if (internalStoreId == null) {
    return NextResponse.json({ error: 'Store not found' }, { status: 404 });
  }

  const { data, error } = await supabase
    .from('merchant_store_operating_hours')
    .select(OPERATING_HOURS_SELECT)
    .eq('store_id', internalStoreId)
    .maybeSingle();
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json(null, { status: 200 });
  }
  const row = data as unknown as Record<string, unknown>;
  for (const day of DAYS) {
    for (const suffix of ['_slot1_start', '_slot1_end', '_slot2_start', '_slot2_end']) {
      const field = `${day}${suffix}`;
      if (row[field] == null || row[field] === '') continue;
      const n = normalizeWallTimeToHHMM(row[field]);
      if (n != null) row[field] = n;
    }
  }
  return NextResponse.json(row);
}
