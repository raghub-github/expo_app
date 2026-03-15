import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getR2SignedUrl, extractR2KeyFromUrl } from '@/lib/r2';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

function getSupabaseAdmin() {
  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/**
 * POST /api/agreements/renew-signed-url
 * Renews expired signed URLs for agreement PDFs stored in R2.
 * Can be called manually or via cron job.
 * 
 * Query params:
 * - store_id: Optional, renew for specific store
 * - expires: Optional, expiry in seconds (default: 7 days)
 */
export async function POST(req: NextRequest) {
  try {
    if (!supabaseUrl || !supabaseServiceKey) {
      return NextResponse.json(
        { error: 'Server misconfiguration: Supabase service role not set' },
        { status: 500 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const storeId = body.store_id || req.nextUrl.searchParams.get('store_id');
    const expiresIn = Number(body.expires || req.nextUrl.searchParams.get('expires') || 7 * 24 * 60 * 60); // Default 7 days

    const db = getSupabaseAdmin();

    // Build query
    let query = db
      .from('merchant_store_agreement_acceptances')
      .select('id, store_id, contract_pdf_url, template_snapshot')
      .not('contract_pdf_url', 'is', null);

    if (storeId) {
      query = query.eq('store_id', storeId);
    }

    const { data: agreements, error: fetchError } = await query;

    if (fetchError) {
      throw new Error(fetchError.message);
    }

    if (!agreements || agreements.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No agreements found to renew',
        renewed: 0,
      });
    }

    let renewed = 0;
    let failed = 0;
    const errors: string[] = [];

    for (const agreement of agreements) {
      try {
        // Try to get R2 key from template_snapshot first (more reliable)
        let r2Key: string | null = null;
        if (agreement.template_snapshot && typeof agreement.template_snapshot === 'object' && 'r2_key' in agreement.template_snapshot) {
          r2Key = (agreement.template_snapshot as any).r2_key;
        }
        
        // Fallback: extract from URL
        if (!r2Key && agreement.contract_pdf_url) {
          r2Key = extractR2KeyFromUrl(agreement.contract_pdf_url);
        }

        if (!r2Key) {
          errors.push(`Could not extract R2 key for store_id ${agreement.store_id}`);
          failed++;
          continue;
        }

        // Generate new signed URL
        const newSignedUrl = await getR2SignedUrl(r2Key, expiresIn);

        // Update database with new signed URL
        const { error: updateError } = await db
          .from('merchant_store_agreement_acceptances')
          .update({
            contract_pdf_url: newSignedUrl,
            updated_at: new Date().toISOString(),
          })
          .eq('id', agreement.id);

        if (updateError) {
          errors.push(`Failed to update store_id ${agreement.store_id}: ${updateError.message}`);
          failed++;
        } else {
          renewed++;
        }
      } catch (err: any) {
        errors.push(`Error processing store_id ${agreement.store_id}: ${err.message}`);
        failed++;
      }
    }

    return NextResponse.json({
      success: true,
      message: `Renewed ${renewed} agreement PDF URLs`,
      renewed,
      failed,
      total: agreements.length,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (e: any) {
    console.error('[agreements/renew-signed-url]', e);
    return NextResponse.json(
      { error: e.message || 'Failed to renew signed URLs' },
      { status: 500 }
    );
  }
}

/**
 * GET /api/agreements/renew-signed-url
 * Same as POST, but for cron job compatibility
 */
export async function GET(req: NextRequest) {
  return POST(req);
}
