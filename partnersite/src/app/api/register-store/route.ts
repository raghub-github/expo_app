import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';
import {
  getOnboardingAgreementPath,
  getOnboardingDocumentPath,
  menuSpreadsheetMimeFromFileName,
  type R2OnboardingDocType,
} from '@/lib/r2-paths';
import { upsertStoreCuisines } from '@/lib/cuisines';
import { parseMenuReferenceImageUrls, stableEntryIdForUrl } from '@/lib/menu-reference-image-bundle';
import { markMerchantResubmittedForRejectedSteps } from '@/lib/onboarding/verification-resubmission';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://placeholder.supabase.co";
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "placeholder-service-role-key";

function getSupabaseAdmin() {
  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/** First non-empty trimmed string, or null. */
function pickFirstString(...candidates: Array<string | null | undefined>): string | null {
  for (const c of candidates) {
    if (typeof c !== 'string') continue;
    const t = c.trim();
    if (t) return t;
  }
  return null;
}

/** First value that looks like an email (basic check). */
function pickRecipientEmail(...candidates: Array<string | null | undefined>): string | null {
  const s = pickFirstString(...candidates);
  if (!s) return null;
  if (!s.includes('@') || s.length < 5) return null;
  return s;
}

async function sendWelcomeEmailToOwner(args: { ownerName: string | null; ownerEmail: string | null; storePublicId: string | null }) {
  const { ownerName, ownerEmail, storePublicId } = args;
  if (!ownerEmail) return;

  const smtpUser = process.env.EMAIL_ID || process.env.SMTP_USER || process.env.SMTP_FROM_EMAIL;
  const smtpPass = process.env.EMAIL_APP_PASSWORD || process.env.SMTP_PASS;
  const smtpHost = process.env.SMTP_HOST || 'smtp.zoho.in';
  const smtpPort = Number(process.env.SMTP_PORT || 465);
  // Zoho: 465 = SSL (secure: true), 587 = STARTTLS (secure: false). Mis-matched defaults often prevent send.
  const smtpSecureEnv = process.env.SMTP_SECURE;
  const smtpSecure =
    smtpSecureEnv != null && String(smtpSecureEnv).trim() !== ''
      ? String(smtpSecureEnv).toLowerCase() !== 'false'
      : smtpPort === 465;
  const fromEmail = process.env.SMTP_FROM_EMAIL || smtpUser;
  const fromName = process.env.SMTP_FROM_NAME || 'GatiMitra Team';

  if (!smtpUser || !smtpPass || !fromEmail) {
    console.warn('[register-store] Email env not configured; skipping welcome email');
    return;
  }

  console.log('[register-store] Welcome email queued for', ownerEmail);

  const { default: nodemailer } = await import('nodemailer');
  const transporter = nodemailer.createTransport({
    host: smtpHost,
    port: smtpPort,
    secure: smtpSecure,
    requireTLS: !smtpSecure && smtpPort === 587,
    auth: {
      user: smtpUser,
      pass: smtpPass,
    },
    connectionTimeout: 25_000,
    greetingTimeout: 25_000,
  });

  const safeName = (ownerName || '').toString().trim() || 'Partner';
  const safeStoreId = (storePublicId || '').toString().trim();
  const dashboardUrl = 'https://partner.gatimitra.com/partners/all-stores';
  const textBody = [
    `Hi ${safeName},`,
    '',
    'Your store registration has been received on GatiMitra and is under verification.',
    'Verification usually takes 24-48 hours.',
    safeStoreId ? `Store ID: ${safeStoreId}` : null,
    '',
    `Dashboard: ${dashboardUrl}`,
    '',
    'Need help? support@gatimitra.com',
    '',
    'Regards,',
    'Team GatiMitra',
  ]
    .filter(Boolean)
    .join('\n');

  const htmlBody = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>Welcome to GatiMitra</title>
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <style>
    body, table, td, p, a { margin:0; padding:0; }
    img { border:0; line-height:100%; outline:none; text-decoration:none; }
    table { border-collapse:collapse; }
    a { text-decoration:none; }
    @media only screen and (max-width: 620px) {
      .wrapper { width:100% !important; padding:16px !important; }
      .card { border-radius:16px !important; }
      .content { padding:20px !important; }
      .h1 { font-size:22px !important; }
      .body { font-size:14px !important; }
      .cta { width:100% !important; }
    }
  </style>
</head>
<body style="margin:0; padding:0; background-color:#f3f4f6; font-family:-apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif;">

  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6; padding:24px 12px;">
    <tr>
      <td align="center">

        <table class="wrapper" width="600" cellpadding="0" cellspacing="0" style="max-width:600px; width:100%;">

          <tr>
            <td>
              <table width="100%" cellpadding="0" cellspacing="0" style="background:linear-gradient(135deg,#f97316 0%, #22c55e 52%, #0ea5e9 100%); border-radius:20px 20px 0 0; padding:0;">
                <tr>
                  <td style="padding:22px 24px 18px 24px;">
                    <table width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td align="left">
                          <!-- Brand pill -->
                          <div style="display:inline-block; background:rgba(255,255,255,0.92); border:1px solid rgba(255,255,255,0.55); border-radius:999px; padding:7px 14px; box-shadow:0 10px 22px rgba(15,23,42,0.18);">
                            <span style="font-size:14px; font-weight:800; letter-spacing:0.2px; color:#0f172a;">
                              Gati<span style="color:#16a34a;">Mitra</span>
                            </span>
                            <span style="display:inline-block; margin-left:10px; font-size:11px; font-weight:700; color:#0f172a; opacity:0.75;">
                              Partner
                            </span>
                          </div>
                          ${safeStoreId ? `
                          <div style="margin-top:8px; display:inline-block; background:rgba(15,23,42,0.10); border-radius:999px; padding:4px 10px; font-size:11px; font-weight:600; color:#0f172a; border:1px solid rgba(15,23,42,0.08);">
                            Store ID&nbsp;<span style="color:#022c22;">#${safeStoreId}</span>
                          </div>` : ``}
                        </td>
                        <td align="right" style="vertical-align:top;">
                          <!-- Floating status badge -->
                          <div style="display:inline-block; background:rgba(255,255,255,0.20); border:1px solid rgba(255,255,255,0.35); border-radius:999px; padding:7px 10px; color:#ffffff; font-size:11px; font-weight:700;">
                            ✅ Registered
                          </div>
                        </td>
                      </tr>
                    </table>

                    <h1 class="h1" style="margin:16px 0 6px 0; color:#ffffff; font-size:26px; font-weight:800; letter-spacing:-0.2px;">
                      Welcome to GatiMitra! 🎉
                    </h1>
                    <p style="margin:0; color:rgba(255,255,255,0.92); font-size:14px; line-height:1.65;">
                      Your store has been successfully registered and is now under quick verification.
                    </p>

                    <!-- Subtle highlight strip -->
                    <div style="margin-top:14px; background:rgba(255,255,255,0.20); border:1px solid rgba(255,255,255,0.25); border-radius:14px; padding:12px 14px;">
                      <table width="100%" cellpadding="0" cellspacing="0">
                        <tr>
                          <td style="color:#ffffff; font-size:12px; line-height:1.6;">
                            <strong style="font-weight:800;">What’s next:</strong> verification usually takes <strong style="font-weight:800;">24–48 hours</strong>.
                          </td>
                          <td align="right" style="white-space:nowrap;">
                            <div style="display:inline-block; padding:6px 10px; border-radius:999px; background:rgba(255,255,255,0.92); color:#0f172a; font-size:11px; font-weight:800;">
                              🚀 Live soon
                            </div>
                          </td>
                        </tr>
                      </table>
                    </div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <tr>
            <td>
              <table class="card" width="100%" cellpadding="0" cellspacing="0" style="background:#ffffff; border-radius:0 0 20px 20px; box-shadow:0 12px 30px rgba(15,23,42,0.12); overflow:hidden;">
                <tr>
                  <td class="content" style="padding:24px 28px 22px 28px;">

                    <p class="body" style="margin:0 0 12px 0; font-size:14px; color:#111827; line-height:1.7;">
                      Hi <strong>${safeName}</strong>,
                    </p>
                    <p class="body" style="margin:0 0 18px 0; font-size:14px; color:#4b5563; line-height:1.7;">
                      We’re excited to inform you that your store has been <strong>successfully registered</strong> on the GatiMitra platform.
                    </p>

                    <table width="100%" cellpadding="0" cellspacing="0" style="background:#ecfdf3; border-radius:12px; border:1px solid #bbf7d0; margin-bottom:18px;">
                      <tr>
                        <td style="padding:14px 16px;">
                          <table cellpadding="0" cellspacing="0" width="100%">
                            <tr>
                              <td valign="top" style="width:24px; padding-right:8px;">
                                <div style="width:20px; height:20px; border-radius:999px; background:#22c55e; color:#ffffff; font-size:13px; text-align:center; line-height:20px;">✓</div>
                              </td>
                              <td>
                                <p style="margin:0 0 4px 0; font-size:14px; font-weight:600; color:#166534;">Your store is now registered & under review</p>
                                <p style="margin:0; font-size:13px; color:#166534; line-height:1.6;">Our team is reviewing your details for activation. This process typically takes <strong>24–48 hours</strong>.</p>
                              </td>
                            </tr>
                          </table>
                        </td>
                      </tr>
                    </table>

                    <table width="100%" cellpadding="0" cellspacing="0" style="background:#fffbeb; border-radius:12px; border:1px solid #fef3c7; margin-bottom:18px;">
                      <tr>
                        <td style="padding:14px 16px;">
                          <p style="margin:0 0 6px 0; font-size:14px; font-weight:600; color:#92400e;">🟡 What happens next?</p>
                          <ul style="margin:0; padding-left:18px; font-size:13px; color:#78350f; line-height:1.7;">
                            <li>Your store will be <strong>activated</strong> on the platform</li>
                            <li>You’ll be able to <strong>start receiving orders</strong></li>
                            <li>Your store will be <strong>fully visible to customers</strong></li>
                          </ul>
                        </td>
                      </tr>
                    </table>

                    <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb; border-radius:12px; border:1px solid #e5e7eb; margin-bottom:22px;">
                      <tr>
                        <td style="padding:14px 16px;">
                          <p style="margin:0 0 6px 0; font-size:14px; font-weight:600; color:#111827;">💡 While you wait…</p>
                          <ul style="margin:0; padding-left:18px; font-size:13px; color:#4b5563; line-height:1.7;">
                            <li>Double-check your <strong>menu and pricing</strong></li>
                            <li>Ensure your store is <strong>stocked and ready</strong></li>
                            <li>Verify your <strong>operating hours & contact details</strong></li>
                          </ul>
                        </td>
                      </tr>
                    </table>

                    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:20px;">
                      <tr>
                        <td align="center">
                          <a href="${dashboardUrl}" target="_blank" class="cta" style="display:inline-block; padding:12px 28px; border-radius:999px; background:linear-gradient(135deg,#10b981,#22c55e); color:#ffffff !important; font-size:14px; font-weight:600; box-shadow:0 10px 24px rgba(16,185,129,0.35);">View Dashboard</a>
                        </td>
                      </tr>
                    </table>

                    <table width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid #e5e7eb; padding-top:16px;">
                      <tr>
                        <td>
                          <p style="margin:0 0 4px 0; font-size:13px; color:#4b5563; line-height:1.7;">🤝 <strong>Need help? We’re here for you.</strong></p>
                          <p style="margin:0; font-size:13px; color:#4b5563; line-height:1.7;">
                            Email us at <a href="mailto:support@gatimitra.com" style="color:#2563eb;">support@gatimitra.com</a> for any onboarding or account-related queries.
                          </p>
                        </td>
                      </tr>
                    </table>

                    <table width="100%" cellpadding="0" cellspacing="0" style="margin-top:18px;">
                      <tr>
                        <td>
                          <p style="margin:0 0 10px 0; font-size:13px; color:#4b5563; line-height:1.7;">We’re excited to partner with you and help grow your business with <strong>GatiMitra</strong> 💙</p>
                          <p style="margin:0; font-size:13px; color:#111827; line-height:1.7;">Best regards,<br /><strong>Team GatiMitra</strong></p>
                        </td>
                      </tr>
                    </table>

                  </td>
                </tr>

                <tr>
                  <td style="background:#f9fafb; padding:14px 18px; text-align:center; border-top:1px solid #e5e7eb;">
                    <p style="margin:0; font-size:11px; color:#6b7280; line-height:1.6;">
                      GatiMitra On-Demand Services Private Limited<br />
                      India’s Leading Low-Cost Delivery Platform<br />
                      <a href="https://partner.gatimitra.com" style="color:#2563eb;">partner.gatimitra.com</a>
                    </p>
                  </td>
                </tr>

              </table>
            </td>
          </tr>

        </table>

      </td>
    </tr>
  </table>

</body>
</html>`;

  await transporter.sendMail({
    from: fromName ? `${fromName} <${fromEmail}>` : fromEmail,
    to: ownerEmail,
    replyTo: fromEmail,
    subject: `Store registration received - GatiMitra (${safeName})`,
    text: textBody,
    html: htmlBody,
  });

  console.log('[register-store] Sent welcome email to', ownerEmail);
}

export async function POST(req: NextRequest) {
        // Validate required document fields before DB insert
        function validateDocuments(documentUrls: any[]): { valid: boolean, errors: Record<string, string> } {
          const errors: Record<string, string> = {};
          for (const doc of documentUrls) {
            const docType = doc.type;
            if (docType === 'PAN' || docType === 'PAN_IMAGE') {
              if (!doc.number) errors.pan_number = 'PAN number is required.';
              if (!doc.file && !doc.url) errors.pan_image = 'PAN image is required.';
            } else if (docType === 'AADHAAR' || docType === 'AADHAR_FRONT' || docType === 'AADHAR_BACK') {
              // Aadhaar optional for child registration; if provided, images optional
            } else if (docType === 'GST' || docType === 'GST_IMAGE') {
              if (!doc.number) errors.gst_number = 'GST number is required.';
              if (!doc.file && !doc.url) errors.gst_image = 'GST image is required.';
            } else if (docType === 'FSSAI' || docType === 'FSSAI_IMAGE') {
              if (!doc.number) errors.fssai_number = 'FSSAI number is required.';
              if (!doc.file && !doc.url) errors.fssai_image = 'FSSAI image is required.';
            } else if (docType === 'DRUG_LICENSE' || docType === 'PHARMACIST_CERTIFICATE' || docType === 'PHARMACY_COUNCIL_REGISTRATION') {
              if (!doc.number) errors.pharma_number = 'Pharma document number is required.';
              if (!doc.file && !doc.url) errors.pharma_image = 'Pharma document image is required.';
            } else if (docType === 'OTHER' || docType === 'OTHER_IMAGE') {
              if (doc.otherType || doc.number || doc.file) {
                if (!doc.otherType) errors.other_document_type = 'Other document type is required.';
                if (!doc.number) errors.other_document_number = 'Other document number is required.';
                if (!doc.file && !doc.url) errors.other_document_file = 'Other document file is required.';
              }
            }
          }
          return { valid: Object.keys(errors).length === 0, errors };
        }
  // Import R2 helpers
  const {
    uploadToR2,
    deleteFromR2,
    extractR2KeyFromUrl,
    toStoredDocumentUrl,
    toStoredDocumentUrlSigned,
    r2KeyFromMenuMediaRow,
  } = await import('@/lib/r2');
  // Store proxy URLs (not signed URLs) for banner/gallery so they load in profile regardless of when uploaded
  const toStoredMediaUrl = (value: string | null | undefined): string | null => {
    if (!value || typeof value !== 'string') return null;
    return toStoredDocumentUrl(value) ?? value;
  };
  // Map API document type to R2 onboarding document folder (pan, aadhaar, fssai, gst, bank, pharma, other)
  const toR2DocType = (docType: string): R2OnboardingDocType => {
    if (docType === 'PAN') return 'PAN';
    if (docType === 'GST') return 'GST';
    if (docType === 'AADHAAR') return 'AADHAAR';
    if (docType === 'FSSAI') return 'FSSAI';
    if (docType === 'BANK_PROOF' || docType === 'BANK') return 'BANK';
    if (['PHARMACIST_CERTIFICATE', 'PHARMACY_COUNCIL_REGISTRATION', 'DRUG_LICENSE', 'SHOP_ESTABLISHMENT', 'TRADE_LICENSE', 'UDYAM'].includes(docType)) return 'PHARMA';
    return 'OTHER';
  };
  try {
    if (!supabaseUrl || !supabaseServiceKey) {
      return NextResponse.json(
        { error: 'Server misconfiguration: Supabase service role not set' },
        { status: 500 }
      );
    }
    const body = await req.json();
    const { step1, step2, storeSetup, documents, logoUrl, bannerUrl, galleryUrls, menuAssets, documentUrls, parentInfo, agreementAcceptance } = body;
    // Full address = Flat/Unit No + Floor/Tower + Building/Complex Name + Full Address
    // e.g. "266/16c1b, Ground floor, Building, Old Mahabalipuram Road 11، 603110 Tiruporur، India"
    const composedFullAddress = [
      step2?.unit_number,
      step2?.floor_number,
      step2?.building_name,
      step2?.full_address,
    ]
      .filter((part: unknown) => typeof part === 'string' && part.trim().length > 0)
      .join(', ');
  // If store_type is OTHERS, save 'OTHERS' in store_type and custom type in store_description
  const storeTypeValue = step1.store_type === 'OTHERS' ? 'OTHERS' : step1.store_type;
  const storeDescriptionValue = step1.store_type === 'OTHERS' && step1.custom_store_type
    ? `${step1.store_description || ''} (Custom type: ${step1.custom_store_type})`
    : step1.store_description;

    // Always use parentInfo.id (numeric) for parent_id
    const parentId = parentInfo?.id;
    const parentMerchantId = parentInfo?.parent_merchant_id || step1.parent_merchant_id;
    if (!parentId || !parentMerchantId) throw new Error('Parent info missing');

    const db = getSupabaseAdmin();

    // 1. Get storeId from progress table or generate new one
    let storeId = step1?.__storePublicId || null;
    
    // If no Store ID is provided, check if it exists in the progress table
    if (!storeId) {
      const { data: progressData } = await db
        .from('merchant_store_registration_progress')
        .select('form_data')
        .eq('parent_id', parentId)
        .neq('registration_status', 'COMPLETED')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      
      storeId = progressData?.form_data?.step_store?.storePublicId || null;
    }
    
    // If still no Store ID, generate a new one (fallback)
    if (!storeId) {
      // Use the database function for consistent Store ID generation
      const { data: generatedId, error: genError } = await db.rpc('generate_unique_store_id');
      if (genError) {
        // Fallback to original logic
        const { data: existingStores, error: idError } = await db
          .from('merchant_stores')
          .select('store_id');
        let maxNum = 1000;
        if (existingStores && Array.isArray(existingStores)) {
          for (const s of existingStores) {
            const match = typeof s.store_id === 'string' && s.store_id.match(/^GMMC(\d+)$/);
            if (match) {
              const num = parseInt(match[1], 10);
              if (num > maxNum) maxNum = num;
            }
          }
        }
        storeId = `GMMC${maxNum + 1}`;
      } else {
        storeId = generatedId;
      }
    }
    // Map all possible frontend keys to valid enum values for document_type_merchant
    // Valid enum values: PAN, GST, AADHAR, FSSAI, PHARMACIST_CERTIFICATE, PHARMACY_COUNCIL_REGISTRATION, DRUG_LICENSE, SHOP_ESTABLISHMENT, TRADE_LICENSE, UDYAM, OTHER
    const typeMap: Record<string, string> = {
      PAN_IMAGE: 'PAN',
      PAN: 'PAN',
      GST_IMAGE: 'GST',
      GST: 'GST',
      AADHAR_FRONT: 'AADHAAR',
      AADHAR_BACK: 'AADHAAR',
      AADHAR: 'AADHAAR',
      AADHAAR_FRONT: 'AADHAAR',
      AADHAAR_BACK: 'AADHAAR',
      AADHAAR: 'AADHAAR',
      FSSAI_IMAGE: 'FSSAI',
      FSSAI: 'FSSAI',
      PHARMACIST_CERTIFICATE: 'PHARMACIST_CERTIFICATE',
      PHARMACY_COUNCIL_REGISTRATION: 'PHARMACY_COUNCIL_REGISTRATION',
      DRUG_LICENSE_IMAGE: 'DRUG_LICENSE',
      DRUG_LICENSE: 'DRUG_LICENSE',
      SHOP_ESTABLISHMENT_IMAGE: 'SHOP_ESTABLISHMENT',
      SHOP_ESTABLISHMENT: 'SHOP_ESTABLISHMENT',
      TRADE_LICENSE_IMAGE: 'TRADE_LICENSE',
      TRADE_LICENSE: 'TRADE_LICENSE',
      UDYAM_IMAGE: 'UDYAM',
      UDYAM: 'UDYAM',
      OTHER_IMAGE: 'OTHER',
      OTHER: 'OTHER',
      // Add more mappings as needed
    };
    // --- R2 Document Upload Logic: each file under onboarding/{pan|aadhaar|fssai|gst|bank|pharma|other}/ ---
    if (documentUrls && documentUrls.length > 0) {
      for (const doc of documentUrls) {
        const docType: string = typeMap[doc.type] || doc.type;
        const r2DocType = toR2DocType(docType);
        const documentPath = getOnboardingDocumentPath(parentId, storeId ?? undefined, r2DocType);
        const fileName = `${Date.now()}_${doc.name}`;
        const r2Key = `${documentPath}/${fileName}`;
        if (doc.file) {
          await uploadToR2(doc.file, r2Key);
          doc.url = r2Key;
        }
      }
    }

    // 2. Insert or update draft store (one row per child store)
    const draftStoreDbId = step1?.__draftStoreDbId ? Number(step1.__draftStoreDbId) : null;
    // Store proxy URLs (stable, no expiry) so banner/gallery load in merchant profile from onboarding or dashboard
    const bannerUrlStored = toStoredMediaUrl(bannerUrl) || bannerUrl || null;
    const galleryUrlsStored = Array.isArray(galleryUrls)
      ? galleryUrls.map((u: string) => toStoredMediaUrl(u)).filter((u): u is string => !!u)
      : galleryUrls;
    const storePayload = {
      parent_id: parentId,
      store_name: step1.store_name,
      store_display_name: step1.store_display_name,
      store_description: storeDescriptionValue,
      store_email: step1.store_email,
      store_phones: step1.store_phones,
      full_address: composedFullAddress || step2.full_address,
      landmark: step2.landmark,
      city: step2.city,
      state: step2.state,
      postal_code: step2.postal_code,
      country: step2.country,
      latitude: step2.latitude,
      longitude: step2.longitude,
      banner_url: bannerUrlStored,
      gallery_images: galleryUrlsStored,
      cuisine_types: storeSetup.cuisine_types,
      avg_preparation_time_minutes: storeSetup.avg_preparation_time_minutes,
      min_order_amount: storeSetup.min_order_amount,
      delivery_radius_km:
        typeof storeSetup.delivery_radius_km === "number" && Number.isFinite(storeSetup.delivery_radius_km)
          ? storeSetup.delivery_radius_km
          : null,
      is_pure_veg: storeSetup.is_pure_veg,
      accepts_online_payment: storeSetup.accepts_online_payment,
      accepts_cash: storeSetup.accepts_cash,
      status: 'INACTIVE',
      approval_status: 'SUBMITTED',
      store_type: storeTypeValue,
      is_active: false,
      is_accepting_orders: false,
      is_available: false,
      operational_status: 'CLOSED',
      onboarding_completed: true,
      onboarding_completed_at: new Date().toISOString(),
      current_onboarding_step: 9,
    };

    let storeData: any = null;
    if (draftStoreDbId) {
      const { data, error } = await db
        .from('merchant_stores')
        .update(storePayload)
        .eq('id', draftStoreDbId)
        .select()
        .single();
      if (error) throw new Error(error.message);
      storeData = data;
    } else {
      const { data, error } = await db
        .from('merchant_stores')
        .insert([{ store_id: storeId, ...storePayload }])
        .select()
        .single();
      if (error) throw new Error(error.message);
      storeData = data;
    }

    if (storeData?.id) {
      await markMerchantResubmittedForRejectedSteps(db, storeData.id as number, [1, 2, 3, 4, 5, 6, 7]);
    }

    // 2.a Ensure cuisines are stored in cuisine_master + merchant_store_cuisines
    if (storeData?.id && Array.isArray(storeSetup.cuisine_types)) {
      try {
        await upsertStoreCuisines(storeData.id as number, storeSetup.cuisine_types as string[]);
      } catch (e) {
        console.error('[register-store] upsertStoreCuisines failed', e);
      }
    }

    // 2.a Persist menu upload references for frequent updates (if media table exists)
    const menuImageUrls: string[] = Array.isArray(menuAssets?.imageUrls) ? menuAssets.imageUrls.filter(Boolean) : [];
    const menuImageNames: string[] = Array.isArray(menuAssets?.imageNames) ? menuAssets.imageNames.filter(Boolean) : [];
    const menuSpreadsheetUrl: string | null = menuAssets?.spreadsheetUrl || null;
    const menuPdfUrl: string | null = menuAssets?.pdfUrl || null;
    const sheetDisplayName =
      typeof menuAssets?.spreadsheetFileName === 'string' && menuAssets.spreadsheetFileName.trim()
        ? menuAssets.spreadsheetFileName.trim()
        : 'menu_spreadsheet';
    if (menuImageUrls.length > 0 || menuSpreadsheetUrl || menuPdfUrl) {
      const mediaRows: any[] = [];

      if (menuImageUrls.length > 0) {
        const bundle = menuImageUrls.map((url, idx) => {
          const key =
            typeof url === 'string'
              ? extractR2KeyFromUrl(url) || (url.includes('://') ? null : url.replace(/^\/+/, '')) || url
              : null;
          const proxyUrl = (key ? toStoredDocumentUrl(key) : null) || (typeof url === 'string' ? url : '');
          const imgName =
            typeof menuImageNames[idx] === 'string' && menuImageNames[idx].trim()
              ? menuImageNames[idx].trim()
              : `menu_image_${idx + 1}`;
          return {
            id: stableEntryIdForUrl(proxyUrl),
            url: proxyUrl,
            file_name: imgName,
          };
        });
        const firstUrl = bundle[0]?.url ?? '';
        mediaRows.push({
          store_id: storeData.id,
          media_scope: 'MENU_REFERENCE',
          source_entity: 'ONBOARDING_MENU_IMAGE',
          source_entity_id: null,
          original_file_name: bundle.map((b) => b.file_name).filter(Boolean).join(', ') || 'menu_images',
          r2_key: firstUrl,
          public_url: firstUrl,
          menu_url: firstUrl,
          menu_reference_image_urls: bundle,
          mime_type: 'image/*',
          is_active: true,
          verification_status: 'PENDING',
        });
      }
      if (menuSpreadsheetUrl) {
        const sheetKey =
          typeof menuSpreadsheetUrl === 'string'
            ? extractR2KeyFromUrl(menuSpreadsheetUrl) ||
              (menuSpreadsheetUrl.includes('://') ? null : menuSpreadsheetUrl.replace(/^\/+/, '')) ||
              menuSpreadsheetUrl
            : null;
        const sheetProxy = (sheetKey ? toStoredDocumentUrl(sheetKey) : null) || menuSpreadsheetUrl || '';
        mediaRows.push({
          store_id: storeData.id,
          media_scope: 'MENU_REFERENCE',
          source_entity: 'ONBOARDING_MENU_SHEET',
          source_entity_id: null,
          original_file_name: sheetDisplayName,
          r2_key: sheetProxy,
          public_url: sheetProxy,
          menu_url: sheetProxy,
          mime_type: menuSpreadsheetMimeFromFileName(sheetDisplayName),
          is_active: true,
          verification_status: 'PENDING',
        });
      }
      if (menuPdfUrl) {
        const pdfKey =
          typeof menuPdfUrl === 'string'
            ? extractR2KeyFromUrl(menuPdfUrl) ||
              (menuPdfUrl.includes('://') ? null : menuPdfUrl.replace(/^\/+/, '')) ||
              menuPdfUrl
            : null;
        const pdfProxy = (pdfKey ? toStoredDocumentUrl(pdfKey) : null) || menuPdfUrl || '';
        const pdfName =
          typeof menuAssets?.pdfFileName === 'string' && menuAssets.pdfFileName.trim()
            ? menuAssets.pdfFileName.trim()
            : 'menu.pdf';
        mediaRows.push({
          store_id: storeData.id,
          media_scope: 'MENU_REFERENCE',
          source_entity: 'ONBOARDING_MENU_PDF',
          source_entity_id: null,
          original_file_name: pdfName,
          r2_key: pdfProxy,
          public_url: pdfProxy,
          menu_url: pdfProxy,
          mime_type: 'application/pdf',
          is_active: true,
          verification_status: 'PENDING',
        });
      }
      if (mediaRows.length > 0) {
        try {
          // R2 keys we are about to keep referencing — do NOT delete these objects (final submit does not re-upload menu).
          const retainMenuR2Keys = new Set<string>();
          for (const u of menuImageUrls) {
            if (typeof u !== 'string' || !u.trim()) continue;
            const k = r2KeyFromMenuMediaRow({ menu_url: u, public_url: u, r2_key: u });
            if (k) retainMenuR2Keys.add(k);
          }
          if (menuSpreadsheetUrl && typeof menuSpreadsheetUrl === 'string') {
            const k = r2KeyFromMenuMediaRow({
              menu_url: menuSpreadsheetUrl,
              public_url: menuSpreadsheetUrl,
              r2_key: menuSpreadsheetUrl,
            });
            if (k) retainMenuR2Keys.add(k);
          }
          if (menuPdfUrl && typeof menuPdfUrl === 'string') {
            const k = r2KeyFromMenuMediaRow({
              menu_url: menuPdfUrl,
              public_url: menuPdfUrl,
              r2_key: menuPdfUrl,
            });
            if (k) retainMenuR2Keys.add(k);
          }

          const { data: existingRows } = await db
            .from('merchant_store_media_files')
            .select('id, r2_key, public_url, menu_url, menu_reference_image_urls')
            .eq('store_id', storeData.id)
            .eq('media_scope', 'MENU_REFERENCE');
          for (const row of existingRows || []) {
            const r = row as {
              r2_key?: string | null;
              public_url?: string | null;
              menu_url?: string | null;
              menu_reference_image_urls?: unknown;
            };
            const bundleUrls = parseMenuReferenceImageUrls(r.menu_reference_image_urls).map((e) => e.url);
            const urlsToPurge =
              bundleUrls.length > 0
                ? bundleUrls
                : [r.menu_url, r.public_url, r.r2_key].filter((u): u is string => typeof u === 'string' && !!u.trim());
            for (const u of urlsToPurge) {
              const key = r2KeyFromMenuMediaRow({ menu_url: u, public_url: u, r2_key: u });
              if (key && typeof key === 'string') {
                if (retainMenuR2Keys.has(key)) continue;
                try {
                  await deleteFromR2(key);
                } catch (e) {
                  console.warn('merchant_store_media_files R2 delete failed for key:', key, e);
                }
              }
            }
          }
          await db
            .from('merchant_store_media_files')
            .delete()
            .eq('store_id', storeData.id)
            .eq('media_scope', 'MENU_REFERENCE');
          const { error: mediaInsertError } = await db
            .from('merchant_store_media_files')
            .insert(mediaRows);
          if (mediaInsertError) {
            console.warn('merchant_store_media_files insert skipped:', mediaInsertError.message);
          }
        } catch (mediaError: any) {
          console.warn('merchant_store_media_files insert skipped:', mediaError.message);
        }
      }
    }

    // 3. Insert operating hours (one row per store)
    const hours = storeSetup.store_hours || {};
    const parseMinutes = (v: string | null | undefined) => {
      if (!v) return null;
      const [h, m] = String(v).split(':').map(Number);
      if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
      return h * 60 + m;
    };
    const dayDuration = (d: any) => {
      const closed = !!d?.closed;
      if (closed) return 0;
      const s1 = parseMinutes(d?.slot1_open ?? d?.open);
      const e1 = parseMinutes(d?.slot1_close ?? d?.close);
      const s2 = parseMinutes(d?.slot2_open);
      const e2 = parseMinutes(d?.slot2_close);
      const first = s1 != null && e1 != null && e1 > s1 ? e1 - s1 : 0;
      const second = s2 != null && e2 != null && e2 > s2 ? e2 - s2 : 0;
      return first + second;
    };
    const toTimeOrNull = (v: string | null | undefined): string | null => {
      if (v == null) return null;
      const s = String(v).trim();
      return s === "" ? null : s;
    };
    const dayRow = (d: any) => {
      const closed = !!d?.closed;
      const slot1Start = closed ? null : toTimeOrNull(d?.slot1_open ?? d?.open);
      const slot1End = closed ? null : toTimeOrNull(d?.slot1_close ?? d?.close);
      const slot2Start = closed ? null : toTimeOrNull(d?.slot2_open);
      const slot2End = closed ? null : toTimeOrNull(d?.slot2_close);
      return {
        open: !!(slot1Start && slot1End),
        slot1Start,
        slot1End,
        slot2Start,
        slot2End,
        duration: dayDuration(d),
        closed,
      };
    };
    const monday = dayRow(hours.monday);
    const tuesday = dayRow(hours.tuesday);
    const wednesday = dayRow(hours.wednesday);
    const thursday = dayRow(hours.thursday);
    const friday = dayRow(hours.friday);
    const saturday = dayRow(hours.saturday);
    const sunday = dayRow(hours.sunday);
    const closedDays = ([
      ['monday', monday.closed],
      ['tuesday', tuesday.closed],
      ['wednesday', wednesday.closed],
      ['thursday', thursday.closed],
      ['friday', friday.closed],
      ['saturday', saturday.closed],
      ['sunday', sunday.closed],
    ] as const)
      .filter(([, isClosed]) => isClosed)
      .map(([day]) => day);
    const sameForAllDays =
      JSON.stringify(monday) === JSON.stringify(tuesday) &&
      JSON.stringify(monday) === JSON.stringify(wednesday) &&
      JSON.stringify(monday) === JSON.stringify(thursday) &&
      JSON.stringify(monday) === JSON.stringify(friday) &&
      JSON.stringify(monday) === JSON.stringify(saturday) &&
      JSON.stringify(monday) === JSON.stringify(sunday);
    const is24Hours = [monday, tuesday, wednesday, thursday, friday, saturday, sunday].every(
      (d) => !d.closed && d.slot1Start === '00:00' && d.slot1End === '23:59' && !d.slot2Start && !d.slot2End
    );
    const opRow = {
      store_id: storeData.id,
      monday_open: monday.open,
      monday_slot1_start: monday.slot1Start,
      monday_slot1_end: monday.slot1End,
      monday_slot2_start: monday.slot2Start,
      monday_slot2_end: monday.slot2End,
      monday_total_duration_minutes: monday.duration,
      tuesday_open: tuesday.open,
      tuesday_slot1_start: tuesday.slot1Start,
      tuesday_slot1_end: tuesday.slot1End,
      tuesday_slot2_start: tuesday.slot2Start,
      tuesday_slot2_end: tuesday.slot2End,
      tuesday_total_duration_minutes: tuesday.duration,
      wednesday_open: wednesday.open,
      wednesday_slot1_start: wednesday.slot1Start,
      wednesday_slot1_end: wednesday.slot1End,
      wednesday_slot2_start: wednesday.slot2Start,
      wednesday_slot2_end: wednesday.slot2End,
      wednesday_total_duration_minutes: wednesday.duration,
      thursday_open: thursday.open,
      thursday_slot1_start: thursday.slot1Start,
      thursday_slot1_end: thursday.slot1End,
      thursday_slot2_start: thursday.slot2Start,
      thursday_slot2_end: thursday.slot2End,
      thursday_total_duration_minutes: thursday.duration,
      friday_open: friday.open,
      friday_slot1_start: friday.slot1Start,
      friday_slot1_end: friday.slot1End,
      friday_slot2_start: friday.slot2Start,
      friday_slot2_end: friday.slot2End,
      friday_total_duration_minutes: friday.duration,
      saturday_open: saturday.open,
      saturday_slot1_start: saturday.slot1Start,
      saturday_slot1_end: saturday.slot1End,
      saturday_slot2_start: saturday.slot2Start,
      saturday_slot2_end: saturday.slot2End,
      saturday_total_duration_minutes: saturday.duration,
      sunday_open: sunday.open,
      sunday_slot1_start: sunday.slot1Start,
      sunday_slot1_end: sunday.slot1End,
      sunday_slot2_start: sunday.slot2Start,
      sunday_slot2_end: sunday.slot2End,
      sunday_total_duration_minutes: sunday.duration,
      is_24_hours: is24Hours,
      same_for_all_days: sameForAllDays,
      closed_days: closedDays,
    };
    // Use upsert to avoid duplicate key errors
    try {
      const { error: opError } = await db
        .from('merchant_store_operating_hours')
        .upsert([opRow], { onConflict: 'store_id' });
      if (opError) {
        // If upsert fails, try update/insert approach
        const { data: existingHours } = await db
          .from('merchant_store_operating_hours')
          .select('id')
          .eq('store_id', storeData.id)
          .maybeSingle();
        
        if (existingHours) {
          // Update existing record
          const { error: updateError } = await db
            .from('merchant_store_operating_hours')
            .update(opRow)
            .eq('store_id', storeData.id);
          if (updateError) throw new Error(updateError.message);
        } else {
          // Insert new record
          const { error: insertError } = await db
            .from('merchant_store_operating_hours')
            .insert([opRow]);
          if (insertError) throw new Error(insertError.message);
        }
      }
    } catch (opError: any) {
      console.error('[register-store] Operating hours error:', opError);
      throw new Error(opError.message || 'Failed to save operating hours');
    }

    // 4. Insert documents (one row per store)
    if (documentUrls && documentUrls.length > 0) {
      // For each document, if a document number is provided, save all related data for that document type
      const typeMap: Record<string, string> = {
        PAN_IMAGE: 'PAN', PAN: 'PAN',
        GST_IMAGE: 'GST', GST: 'GST',
        AADHAR_FRONT: 'AADHAAR', AADHAR_BACK: 'AADHAAR', AADHAR: 'AADHAAR',
        AADHAAR_FRONT: 'AADHAAR', AADHAAR_BACK: 'AADHAAR', AADHAAR: 'AADHAAR',
        FSSAI_IMAGE: 'FSSAI', FSSAI: 'FSSAI',
        PHARMACIST_CERTIFICATE: 'PHARMACIST_CERTIFICATE',
        PHARMACY_COUNCIL_REGISTRATION: 'PHARMACY_COUNCIL_REGISTRATION',
        DRUG_LICENSE_IMAGE: 'DRUG_LICENSE', DRUG_LICENSE: 'DRUG_LICENSE',
        SHOP_ESTABLISHMENT_IMAGE: 'SHOP_ESTABLISHMENT', SHOP_ESTABLISHMENT: 'SHOP_ESTABLISHMENT',
        TRADE_LICENSE_IMAGE: 'TRADE_LICENSE', TRADE_LICENSE: 'TRADE_LICENSE',
        UDYAM_IMAGE: 'UDYAM', UDYAM: 'UDYAM',
        OTHER_IMAGE: 'OTHER', OTHER: 'OTHER',
        BANK_PROOF: 'BANK_PROOF',
      };
      // Resolve all document URLs to signed URLs (same format as upload response)
      const resolvedDocUrls = await Promise.all(
        (documentUrls || []).map((d: any) => toStoredDocumentUrlSigned(d.url))
      );
      const docRow: any = { store_id: storeData.id };
      (documentUrls || []).forEach((doc: any, i: number) => {
        const docType = typeMap[doc.type] || doc.type;
        const storedUrl = resolvedDocUrls[i] || doc.url || null;
        if (docType === 'PAN' && (doc.number || doc.pan_number || doc.url)) {
          docRow.pan_document_number = doc.number || doc.pan_number || null;
          docRow.pan_document_url = storedUrl || null;
          docRow.pan_document_name = doc.name || null;
        }
        if (docType === 'GST' && (doc.number || doc.gst_number || doc.url)) {
          docRow.gst_document_number = doc.number || doc.gst_number || null;
          docRow.gst_document_url = storedUrl || null;
          docRow.gst_document_name = doc.name || null;
        }
        if (docType === 'AADHAAR' && (doc.number || doc.aadhar_number || doc.aadhaar_number || doc.url)) {
          docRow.aadhaar_document_number = doc.number || doc.aadhar_number || doc.aadhaar_number || null;
          docRow.aadhaar_document_url = storedUrl || null;
          docRow.aadhaar_document_name = doc.name || null;
        }
        if (docType === 'FSSAI' && (doc.number || doc.url)) {
          docRow.fssai_document_number = doc.number || null;
          docRow.fssai_document_url = storedUrl || null;
          docRow.fssai_document_name = doc.name || null;
          docRow.fssai_issued_date = doc.issued_date || null;
          docRow.fssai_expiry_date = doc.expiry_date || null;
        }
        if (docType === 'TRADE_LICENSE' && (doc.number || doc.url)) {
          docRow.trade_license_document_number = doc.number || null;
          docRow.trade_license_document_url = storedUrl || null;
          docRow.trade_license_document_name = doc.name || null;
          docRow.trade_license_issued_date = doc.issued_date || null;
          docRow.trade_license_expiry_date = doc.expiry_date || null;
        }
        if (docType === 'DRUG_LICENSE' && (doc.number || doc.url)) {
          docRow.drug_license_document_number = doc.number || null;
          docRow.drug_license_document_url = storedUrl || null;
          docRow.drug_license_document_name = doc.name || null;
          docRow.drug_license_type = doc.drug_license_type || null;
          docRow.drug_license_issued_date = doc.issued_date || null;
          docRow.drug_license_expiry_date = doc.expiry_date || null;
        }
        if (docType === 'SHOP_ESTABLISHMENT' && (doc.number || doc.url)) {
          docRow.shop_establishment_document_number = doc.number || null;
          docRow.shop_establishment_document_url = storedUrl || null;
          docRow.shop_establishment_document_name = doc.name || null;
          docRow.shop_establishment_issued_date = doc.issued_date || null;
          docRow.shop_establishment_expiry_date = doc.expiry_date || null;
        }
        if (docType === 'UDYAM' && (doc.number || doc.url)) {
          docRow.udyam_document_number = doc.number || null;
          docRow.udyam_document_url = storedUrl || null;
          docRow.udyam_document_name = doc.name || null;
          docRow.udyam_issued_date = doc.issued_date || null;
          docRow.udyam_expiry_date = doc.expiry_date || null;
        }
        if (docType === 'PHARMACIST_CERTIFICATE' && (doc.number || doc.url)) {
          docRow.pharmacist_certificate_document_number = doc.number || null;
          docRow.pharmacist_certificate_document_url = storedUrl || null;
          docRow.pharmacist_certificate_document_name = doc.name || null;
          docRow.pharmacist_certificate_issued_date = doc.issued_date || null;
          docRow.pharmacist_certificate_expiry_date = doc.expiry_date || null;
        }
        if (docType === 'PHARMACY_COUNCIL_REGISTRATION' && (doc.number || doc.url)) {
          docRow.pharmacy_council_registration_document_number = doc.number || null;
          docRow.pharmacy_council_registration_document_url = storedUrl || null;
          docRow.pharmacy_council_registration_document_name = doc.name || null;
          docRow.pharmacy_council_registration_type = doc.pharmacy_council_registration_type || null;
          docRow.pharmacy_council_registration_issued_date = doc.issued_date || null;
          docRow.pharmacy_council_registration_expiry_date = doc.expiry_date || null;
        }
        if (docType === 'BANK_PROOF' && (doc.number || doc.url)) {
          docRow.bank_proof_document_number = doc.number || null;
          docRow.bank_proof_document_url = storedUrl || null;
          docRow.bank_proof_document_name = doc.name || null;
          docRow.bank_proof_issued_date = doc.issued_date || null;
          docRow.bank_proof_expiry_date = doc.expiry_date || null;
        }
        if (docType === 'OTHER' && (doc.number || doc.url)) {
          docRow.other_document_number = doc.number || null;
          docRow.other_document_url = storedUrl || null;
          docRow.other_document_name = doc.name || null;
          docRow.other_document_type = doc.otherType || doc.type || 'OTHER';
          docRow.other_issued_date = doc.issued_date || null;
          docRow.other_expiry_date = doc.expiry_date || null;
        }
      });
      // Upsert (insert or update) one row per store_id
      if (Object.keys(docRow).length > 1) {
        const { error: docError } = await db
          .from('merchant_store_documents')
          .upsert([docRow], { onConflict: 'store_id' });
        if (docError) throw new Error(docError.message);
      }
    }

    // 5. Persist agreement acceptance with digital signature
    if (agreementAcceptance && agreementAcceptance.signatureDataUrl) {
      const signatureHash = crypto
        .createHash('sha256')
        .update(String(agreementAcceptance.signatureDataUrl))
        .digest('hex');
      const templateSnapshot = {
        title: agreementAcceptance.templateTitle || 'Merchant Partner Agreement',
        version: agreementAcceptance.templateVersion || 'v1',
        content: agreementAcceptance.templateContentSnapshot || null,
        pdf_url: agreementAcceptance.templatePdfUrl || null,
      };
      const ipAddress =
        req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
        req.headers.get('x-real-ip') ||
        null;
      const userAgent = req.headers.get('user-agent') || null;

      // Resolve the contract PDF to its R2 key, copy it to the correct store path if needed,
      // and always store a proxy URL (never a signed URL) so the contract is permanently accessible.
      let contractPdfUrlStored: string | null = null;
      let contractPdfR2Key: string | null = null;
      if (agreementAcceptance.signedPdfUrl) {
        const rawValue = agreementAcceptance.signedPdfUrl.trim();
        let originalKey = extractR2KeyFromUrl(rawValue) || (rawValue.includes('://') ? null : rawValue.replace(/^\/+/, ''));

        if (originalKey) {
          const correctAgreementsPath = getOnboardingAgreementPath(parentId, storeId);
          const fileName = originalKey.split('/').pop() || `contract_${Date.now()}.pdf`;
          const correctKey = `${correctAgreementsPath}/${fileName}`;

          if (originalKey !== correctKey) {
            try {
              const { S3Client: S3, GetObjectCommand: GetObj, PutObjectCommand: PutObj } = await import('@aws-sdk/client-s3');
              const s3 = new S3({
                region: process.env.R2_REGION || 'auto',
                endpoint: process.env.R2_ENDPOINT,
                credentials: { accessKeyId: process.env.R2_ACCESS_KEY!, secretAccessKey: process.env.R2_SECRET_KEY! },
              });
              const bucket = process.env.R2_BUCKET_NAME!;
              const getResp = await s3.send(new GetObj({ Bucket: bucket, Key: originalKey }));
              if (getResp.Body) {
                const bodyBytes = await getResp.Body.transformToByteArray();
                await s3.send(new PutObj({
                  Bucket: bucket,
                  Key: correctKey,
                  Body: bodyBytes,
                  ContentType: getResp.ContentType || 'application/pdf',
                }));
                originalKey = correctKey;
                console.log(`[register-store] Copied contract PDF to correct path: ${correctKey}`);
              }
            } catch (copyErr) {
              console.warn('[register-store] Could not copy contract PDF to store path, using original key:', copyErr);
            }
          }

          contractPdfR2Key = originalKey;
          contractPdfUrlStored = `/api/attachments/proxy?key=${encodeURIComponent(originalKey)}`;
        } else {
          // Fallback: if we couldn't derive an R2 key but still have a URL/value,
          // persist it directly so the contract is at least reachable.
          contractPdfUrlStored = rawValue;
        }
      }

      const commissionFirst = agreementAcceptance.commissionFirstMonthPct != null ? Number(agreementAcceptance.commissionFirstMonthPct) : 0;
      const commissionSecond = agreementAcceptance.commissionFromSecondMonthPct != null ? Number(agreementAcceptance.commissionFromSecondMonthPct) : 15;
      const effectiveFrom = agreementAcceptance.agreementEffectiveFrom ? new Date(agreementAcceptance.agreementEffectiveFrom).toISOString() : new Date().toISOString();
      const effectiveTo = agreementAcceptance.agreementEffectiveTo ? new Date(agreementAcceptance.agreementEffectiveTo).toISOString() : null;

      const resolvedSignerName =
        (storeData as any)?.owner_full_name &&
        String((storeData as any).owner_full_name).trim()
          ? String((storeData as any).owner_full_name).trim()
          : (agreementAcceptance.signerName && String(agreementAcceptance.signerName).trim()) ||
            null;

      const basePayload = {
        store_id: storeData.id,
        template_id: agreementAcceptance.templateId || null,
        template_key: agreementAcceptance.templateKey || 'DEFAULT_CHILD_ONBOARDING_AGREEMENT',
        template_version: agreementAcceptance.templateVersion || 'v1',
        template_snapshot: {
          ...templateSnapshot,
          r2_key: contractPdfR2Key,
          commission_first_month_pct: commissionFirst,
          commission_from_second_month_pct: commissionSecond,
          agreement_effective_from: effectiveFrom,
          agreement_effective_to: effectiveTo,
        },
        contract_pdf_url: contractPdfUrlStored ?? agreementAcceptance.templatePdfUrl ?? null,
        signer_name: resolvedSignerName,
        signer_email: agreementAcceptance.signerEmail || null,
        signer_phone: agreementAcceptance.signerPhone || null,
        signature_data_url: agreementAcceptance.signatureDataUrl,
        signature_hash: signatureHash,
        terms_accepted: !!agreementAcceptance.agreedToTerms,
        contract_read_confirmed: agreementAcceptance.agreedToRead != null
          ? !!agreementAcceptance.agreedToRead
          : !!agreementAcceptance.agreedToContract,
        digital_signature_confirmed: !!agreementAcceptance.agreedToContract,
        accepted_at: new Date().toISOString(),
        accepted_ip: ipAddress,
        user_agent: userAgent,
        acceptance_source: 'CHILD_ONBOARDING',
      };
      const payloadWithCommission = {
        ...basePayload,
        commission_first_month_pct: commissionFirst,
        commission_from_second_month_pct: commissionSecond,
        agreement_effective_from: effectiveFrom,
        agreement_effective_to: effectiveTo,
      };
      let agreementError = (await db.from('merchant_store_agreement_acceptances').upsert([payloadWithCommission], { onConflict: 'store_id' })).error;
      if (agreementError && (agreementError.message?.includes('commission_first_month_pct') || agreementError.message?.includes('does not exist'))) {
        agreementError = (await db.from('merchant_store_agreement_acceptances').upsert([basePayload], { onConflict: 'store_id' })).error;
      }
      if (agreementError) throw new Error(agreementError.message);
    }

    // 6. Mark the registration progress as COMPLETED
    // This prevents the "Incomplete onboarding draft" banner from showing after submission
    try {
      // Update progress record to mark as completed and link to the actual store
      await db
        .from('merchant_store_registration_progress')
        .update({ 
          registration_status: 'COMPLETED',
          store_id: storeData.id, // Link to the actual merchant_stores.id
          completed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          current_step: 9,
          step_6_completed: true, // Mark final step as completed
          step_9_completed: true,
          completed_steps: 9
        })
        .eq('parent_id', parentId)
        .or(`store_id.is.null,store_id.eq.${storeData.id}`) // Update either null store_id or matching store_id
        .neq('registration_status', 'COMPLETED');
        
      console.log(`[register-store] Marked progress as completed for parent_id: ${parentId}, store_id: ${storeData.id}, public_id: ${storeId}`);
    } catch (progressError) {
      console.warn('[register-store] Failed to mark progress as completed:', progressError);
      // Don't fail the entire registration if this update fails
    }

    // 7. Send welcome email in-request so it reliably executes on serverless runtimes
    try {
      // Prefer agreement signer email — that is what the partner entered on the signature step and may differ from step1.
      const ownerEmail = pickRecipientEmail(
        agreementAcceptance?.signerEmail,
        (storeData as any)?.store_email,
        step1?.store_email
      );
      const ownerName =
        pickFirstString(
          agreementAcceptance?.signerName,
          (storeData as any)?.owner_full_name,
          step1?.owner_full_name,
          (storeData as any)?.store_name,
          step1?.store_name
        ) || null;

      if (!ownerEmail) {
        console.warn(
          '[register-store] No recipient email (signerEmail / store_email empty); skipping welcome email'
        );
      } else {
        await sendWelcomeEmailToOwner({
          ownerName,
          ownerEmail,
          storePublicId: storeId || null,
        });
      }
    } catch (emailErr) {
      console.warn('[register-store] Failed to send welcome email:', emailErr);
    }

    return NextResponse.json({ success: true, storeId });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Registration failed' }, { status: 500 });
  }
}
