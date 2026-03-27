import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { normalizePhone } from '@/lib/utils';
import { fetchVerificationRejectionsByStoreIds } from '@/lib/onboarding/partner-verification-rejections';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

function getSupabaseAdmin() {
  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export async function POST(req: NextRequest) {
  try {
    const { phone } = await req.json();
    if (!phone) return NextResponse.json({ error: 'Phone required' }, { status: 400 });

    // Always use only the 10-digit phone number for DB query
    const digits = phone.replace(/\D/g, "");
    const normalized = digits.length > 10 ? digits.slice(-10) : digits;
    console.log("Normalized phone for query:", normalized);

    // Query merchant_parents by registered_phone_normalized
    const { data: parent, error: parentError } = await supabase
      .from('merchant_parents')
      .select('*')
      .eq('registered_phone_normalized', normalized)
      .single();

    console.log("Parent query result:", parent, parentError);

    if (parentError || !parent) {
      // Case B: Parent does not exist, redirect to registration
      return NextResponse.json({ parentExists: false });
    }

    // Fetch child stores for this parent
    const { data: stores, error: storesError } = await supabase
      .from('merchant_stores')
      .select('id, store_id, store_name, full_address, store_phones, approval_status, is_active, current_onboarding_step, onboarding_completed')
      .eq('parent_id', parent.id);

    if (storesError) {
      return NextResponse.json({ error: 'Failed to fetch stores' }, { status: 500 });
    }

    // Check for pending onboarding progress for this parent
    const { data: progress, error: progressError } = await supabase
      .from('merchant_store_registration_progress')
      .select('*')
      .eq('parent_id', parent.id)
      .is('store_id', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    const storeListRaw = stores || [];
    const internalIds = storeListRaw
      .map((s) => (typeof s.id === 'number' ? s.id : parseInt(String(s.id), 10)))
      .filter((id) => Number.isFinite(id) && id > 0);
    const admin = getSupabaseAdmin();
    const rejectionByStore =
      internalIds.length > 0
        ? await fetchVerificationRejectionsByStoreIds(admin, internalIds)
        : {};
    const storeList = storeListRaw.map((s) => {
      const sid = typeof s.id === 'number' ? s.id : parseInt(String(s.id), 10);
      return {
        ...s,
        verification_step_rejections:
          Number.isFinite(sid) && sid > 0 ? (rejectionByStore[sid] ?? []) : [],
      };
    });
    // Only treat as "incomplete draft" when there is an actual DRAFT store (avoids stale progress banner)
    const hasDraftStore = storeList.some((s) => (s.approval_status || '').toUpperCase() === 'DRAFT');
    const onboardingProgress = progress && hasDraftStore ? progress : null;

    // Return parentExists, store list, and onboarding progress (if any)
    return NextResponse.json({
      parentExists: true,
      parentId: parent.id,
      parentMerchantId: parent.parent_merchant_id ?? null,
      parentName: parent.parent_name ?? null,
      stores: storeList,
      onboardingProgress
    });
  } catch (e) {
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
