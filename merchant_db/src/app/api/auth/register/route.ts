import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

/** Service-role client bypasses RLS — required for server-side insert into merchant_parents. */
function getSupabaseAdmin() {
  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

const MERCHANT_TYPE_VALUES = ["LOCAL", "BRAND", "CHAIN", "FRANCHISE"] as const;

function getR2Client(): S3Client | null {
  if (
    !process.env.R2_BUCKET_NAME ||
    !process.env.R2_PUBLIC_BASE_URL ||
    !process.env.R2_ENDPOINT ||
    !process.env.R2_ACCESS_KEY ||
    !process.env.R2_SECRET_KEY
  ) {
    return null;
  }
  return new S3Client({
    region: process.env.R2_REGION || "auto",
    endpoint: process.env.R2_ENDPOINT,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY,
      secretAccessKey: process.env.R2_SECRET_KEY,
    },
  });
}

/** Upload parent logo to R2: merchant-parents/{parent_merchant_id}/logo/{timestamp}_{safeName}.ext */
async function uploadParentLogoToR2(
  file: File,
  parentMerchantId: string
): Promise<string | null> {
  const s3 = getR2Client();
  if (!s3 || !process.env.R2_BUCKET_NAME || !process.env.R2_PUBLIC_BASE_URL) return null;
  const ext = (file.name.split(".").pop() || "png").replace(/[^a-z0-9]/gi, "").toLowerCase() || "png";
  const safeName = file.name.replace(/[^a-zA-Z0-9.-]/g, "_").slice(0, 80) || "logo";
  const key = `merchant-parents/${parentMerchantId}/logo/${Date.now()}_${safeName}.${ext}`;
  const buffer = Buffer.from(await file.arrayBuffer());
  await s3.send(
    new PutObjectCommand({
      Bucket: process.env.R2_BUCKET_NAME,
      Key: key,
      Body: buffer,
      ContentType: file.type || "image/png",
    })
  );
  const base = process.env.R2_PUBLIC_BASE_URL.replace(/\/+$/, "");
  return `${base}/${key}`;
}

/**
 * POST /api/auth/register
 * Accepts JSON or FormData (with optional store_logo file).
 * Saves all parent fields; area_manager_id is left null (assigned per child later).
 */
export async function POST(request: NextRequest) {
  try {
    const contentType = request.headers.get("content-type") || "";
    let email_user_id: string | undefined;
    let email: string | undefined;
    let mobile: string | undefined;
    let owner_name: string | undefined;
    let parent_name: string | undefined;
    let merchant_type: string | undefined;
    let brand_name: string | null | undefined;
    let business_category: string | null | undefined;
    let alternate_phone: string | null | undefined;
    let address_line1: string | null | undefined;
    let city: string | null | undefined;
    let state: string | null | undefined;
    let pincode: string | null | undefined;
    let store_logo_file: File | null = null;

    if (contentType.includes("multipart/form-data")) {
      const formData = await request.formData();
      email_user_id = formData.get("email_user_id") as string | undefined;
      email = formData.get("email") as string | undefined;
      mobile = formData.get("mobile") as string | undefined;
      owner_name = formData.get("owner_name") as string | undefined;
      parent_name = formData.get("parent_name") as string | undefined;
      merchant_type = formData.get("merchant_type") as string | undefined;
      brand_name = (formData.get("brand_name") as string) || null;
      business_category = (formData.get("business_category") as string) || null;
      alternate_phone = (formData.get("alternate_phone") as string) || null;
      address_line1 = (formData.get("address_line1") as string) || null;
      city = (formData.get("city") as string) || null;
      state = (formData.get("state") as string) || null;
      pincode = (formData.get("pincode") as string) || null;
      const file = formData.get("store_logo");
      if (file instanceof File && file.size > 0) store_logo_file = file;
    } else {
      const body = await request.json();
      email_user_id = body.email_user_id;
      email = body.email;
      mobile = body.mobile;
      owner_name = body.owner_name;
      parent_name = body.parent_name;
      merchant_type = body.merchant_type;
      brand_name = body.brand_name ?? null;
      business_category = body.business_category ?? null;
      alternate_phone = body.alternate_phone ?? null;
      address_line1 = body.address_line1 ?? null;
      city = body.city ?? null;
      state = body.state ?? null;
      pincode = body.pincode ?? null;
    }

    const normalizedEmail = (email || "").trim().toLowerCase();
    if (!normalizedEmail || !/^\S+@\S+\.\S+$/.test(normalizedEmail)) {
      return NextResponse.json(
        { success: false, error: "Valid email is required." },
        { status: 400 }
      );
    }
    if (!email_user_id || typeof email_user_id !== "string") {
      return NextResponse.json(
        { success: false, error: "Email verification is required. Please complete step 1." },
        { status: 400 }
      );
    }
    const phone = (mobile || "").replace(/\D/g, "");
    const tenDigitPhone = phone.length > 10 ? phone.slice(-10) : phone;
    if (!tenDigitPhone || tenDigitPhone.length !== 10) {
      return NextResponse.json(
        { success: false, error: "Valid 10-digit mobile number is required." },
        { status: 400 }
      );
    }
    if (!owner_name || !String(owner_name).trim()) {
      return NextResponse.json(
        { success: false, error: "Owner name is required." },
        { status: 400 }
      );
    }
    if (!parent_name || !String(parent_name).trim()) {
      return NextResponse.json(
        { success: false, error: "Business / Parent name is required." },
        { status: 400 }
      );
    }
    const merchantType = merchant_type && MERCHANT_TYPE_VALUES.includes(merchant_type as any)
      ? (merchant_type as (typeof MERCHANT_TYPE_VALUES)[number])
      : "LOCAL";
    const altPhoneRaw = alternate_phone ? String(alternate_phone).trim().replace(/\s/g, "") : null;
    const alternatePhoneNormalized = altPhoneRaw && /^\+?[0-9]{10,15}$/.test(altPhoneRaw) ? altPhoneRaw : null;

    const db = getSupabaseAdmin();

    // Check if email already registered in merchant_parents
    const { data: existingByEmail } = await db
      .from("merchant_parents")
      .select("id, parent_merchant_id")
      .eq("owner_email", normalizedEmail)
      .maybeSingle();
    if (existingByEmail) {
      return NextResponse.json(
        { success: false, error: "This email is already registered. Please login." },
        { status: 409 }
      );
    }

    const normalizedPhone = `+91${tenDigitPhone}`;
    const { data: existingByPhone } = await db
      .from("merchant_parents")
      .select("id")
      .or(`registered_phone.eq.${normalizedPhone},registered_phone_normalized.eq.${tenDigitPhone}`)
      .maybeSingle();
    if (existingByPhone) {
      return NextResponse.json(
        { success: false, error: "This mobile number is already registered." },
        { status: 409 }
      );
    }

    // Verify email_user_id exists in Supabase Auth (same email)
    const { data: authUser, error: authErr } = await db.auth.admin.getUserById(email_user_id);
    if (authErr || !authUser?.user) {
      return NextResponse.json(
        { success: false, error: "Email verification expired. Please start registration again." },
        { status: 400 }
      );
    }
    const authEmail = (authUser.user.email || "").toLowerCase();
    if (authEmail !== normalizedEmail) {
      return NextResponse.json(
        { success: false, error: "Email does not match verified account. Please start again." },
        { status: 400 }
      );
    }

    // Link phone to this Supabase user so they can login with phone OTP (same user)
    try {
      await db.auth.admin.updateUserById(email_user_id, {
        phone: normalizedPhone,
        phone_confirm: true,
      });
    } catch (linkErr) {
      console.warn("[auth/register] Could not link phone to Supabase user:", linkErr);
      // Continue — we still store phone in merchant_parents; login by phone validated by phone number
    }

    // Generate parent_merchant_id (GMMP1001, GMMP1002, ...)
    const { data: lastRow } = await db
      .from("merchant_parents")
      .select("parent_merchant_id")
      .like("parent_merchant_id", "GMMP%")
      .order("parent_merchant_id", { ascending: false })
      .limit(1)
      .maybeSingle();
    let nextNum = 1001;
    if (lastRow?.parent_merchant_id) {
      const match = String(lastRow.parent_merchant_id).match(/^GMMP(\d+)$/);
      if (match) nextNum = parseInt(match[1], 10) + 1;
    }
    const parent_merchant_id = `GMMP${nextNum}`;

    let store_logo_url: string | null = null;
    if (store_logo_file) {
      store_logo_url = await uploadParentLogoToR2(store_logo_file, parent_merchant_id) ?? null;
    }

    const { data: insertData, error: insertError } = await db
      .from("merchant_parents")
      .insert({
        parent_merchant_id,
        parent_name: parent_name!.trim(),
        merchant_type: merchantType,
        owner_name: String(owner_name).trim(),
        owner_email: normalizedEmail,
        registered_phone: normalizedPhone,
        registered_phone_normalized: tenDigitPhone,
        alternate_phone: alternatePhoneNormalized,
        brand_name: brand_name && String(brand_name).trim() ? String(brand_name).trim() : null,
        business_category: business_category && String(business_category).trim() ? String(business_category).trim() : null,
        is_active: true,
        registration_status: "VERIFIED",
        approval_status: "APPROVED",
        address_line1: address_line1 && String(address_line1).trim() ? String(address_line1).trim() : null,
        city: city && String(city).trim() ? String(city).trim() : null,
        state: state && String(state).trim() ? String(state).trim() : null,
        pincode: pincode && String(pincode).trim() ? String(pincode).trim() : null,
        store_logo: store_logo_url,
        created_by_name: String(owner_name).trim(),
        supabase_user_id: email_user_id,
      })
      .select("id, parent_merchant_id, owner_email")
      .single();

    if (insertError) {
      console.error("[auth/register] merchant_parents insert error:", insertError);
      return NextResponse.json(
        { success: false, error: "Registration failed. Please try again." },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        parent_merchant_id: insertData.parent_merchant_id,
        email: insertData.owner_email,
        message: "Registration successful. You can login with Email OTP or Mobile OTP.",
      },
    });
  } catch (e) {
    console.error("[auth/register] Error:", e);
    return NextResponse.json(
      { success: false, error: "An error occurred. Please try again." },
      { status: 500 }
    );
  }
}
