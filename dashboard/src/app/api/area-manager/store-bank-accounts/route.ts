import { NextRequest, NextResponse } from "next/server";
import { getSql } from "@/lib/db/client";

// AM-dashboard-only endpoint to read + create/update bank / UPI accounts for a store using internal store id.
// Table: merchant_store_bank_accounts

export async function GET(req: NextRequest) {
  try {
    const storeInternalId = Number(
      req.nextUrl.searchParams.get("storeInternalId") ??
        req.nextUrl.searchParams.get("store_id")
    );
    if (!Number.isFinite(storeInternalId)) {
      return NextResponse.json(
        { success: false, error: "Valid storeInternalId is required" },
        { status: 400 }
      );
    }

    const sql = getSql() as {
      unsafe: (q: string, v?: unknown[]) => Promise<unknown[]>;
    };
    const rows = (await sql.unsafe(
      `
      SELECT
        id,
        store_id,
        account_holder_name,
        account_number,
        ifsc_code,
        bank_name,
        branch_name,
        account_type,
        payout_method,
        bank_proof_type,
        bank_proof_file_url,
        upi_qr_screenshot_url,
        upi_id,
        is_primary,
        is_active,
        is_disabled,
        is_verified,
        upi_verified,
        verified_at,
        verification_method,
        bank_metadata,
        verification_status,
        created_at,
        updated_at
      FROM merchant_store_bank_accounts
      WHERE store_id = $1
      ORDER BY is_primary DESC, created_at ASC
    `,
      [storeInternalId]
    )) as Record<string, unknown>[];

    return NextResponse.json({ success: true, accounts: rows });
  } catch (e) {
    console.error("[AM store-bank-accounts GET]", e);
    return NextResponse.json(
      { success: false, error: "Failed to load bank/UPI details" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const storeInternalId = Number(body.storeInternalId ?? body.store_id);
    if (!Number.isFinite(storeInternalId)) {
      return NextResponse.json(
        { success: false, error: "Valid storeInternalId is required" },
        { status: 400 }
      );
    }

    const payoutMethod = String(body.payout_method || "bank")
      .toLowerCase()
      .trim();
    if (payoutMethod !== "bank" && payoutMethod !== "upi") {
      return NextResponse.json(
        { success: false, error: "payout_method must be bank or upi" },
        { status: 400 }
      );
    }

    const isVerifiedProvided = typeof body.is_verified === "boolean";
    const isVerified = isVerifiedProvided ? Boolean(body.is_verified) : null;
    const upiVerifiedProvided = typeof body.upi_verified === "boolean";
    const upiVerified = upiVerifiedProvided
      ? Boolean(body.upi_verified)
      : payoutMethod === "upi" && isVerified
        ? true
        : payoutMethod === "upi"
          ? null
          : false;

    const rawHolder = String(body.account_holder_name ?? "").trim();
    const rawAccount = String(body.account_number ?? "").trim();
    // Normalize IFSC / bankName so that "not provided" is sent as NULL (not empty string)
    const ifscCode =
      payoutMethod === "bank" && body.ifsc_code
        ? String(body.ifsc_code).trim().toUpperCase()
        : null;
    const bankName =
      payoutMethod === "bank" && body.bank_name
        ? String(body.bank_name).trim()
        : null;

    if (payoutMethod === "bank") {
      if (!rawAccount) {
        return NextResponse.json(
          {
            success: false,
            error: "account_number is required for bank",
          },
          { status: 400 }
        );
      }
      if (!ifscCode) {
        return NextResponse.json(
          { success: false, error: "ifsc_code required for bank" },
          { status: 400 }
        );
      }
      // Auto-verified rows may omit holder/bank name in the client payload;
      // require them only for the manual path.
      if (!isVerified && (!rawHolder || !bankName)) {
        return NextResponse.json(
          {
            success: false,
            error:
              "account_holder_name and bank_name are required for bank",
          },
          { status: 400 }
        );
      }
    }

    const upiId =
      payoutMethod === "upi"
        ? String(body.upi_id ?? "").trim()
        : "";
    if (payoutMethod === "upi" && !upiId) {
      return NextResponse.json(
        { success: false, error: "upi_id required for upi" },
        { status: 400 }
      );
    }

    const accountHolderName =
      payoutMethod === "bank"
        ? rawHolder || (isVerified ? "Verified Account" : null)
        : rawHolder || null; // optional for upi

    const accountNumber =
      payoutMethod === "bank"
        ? rawAccount || null
        : rawAccount || null; // do NOT copy upi_id into account_number

    const resolvedBankName =
      payoutMethod === "bank"
        ? bankName || (isVerified ? "Bank" : null)
        : null;

    const verifiedAt =
      typeof body.verified_at === "string" && body.verified_at.trim()
        ? body.verified_at.trim()
        : isVerified
          ? new Date().toISOString()
          : null;
    const verificationMethod =
      typeof body.verification_method === "string" && body.verification_method.trim()
        ? body.verification_method.trim()
        : isVerified
          ? "CASHFREE_AUTO"
          : null;
    let bankMetadata: string | null = null;
    if (body.bank_metadata != null) {
      try {
        bankMetadata =
          typeof body.bank_metadata === "string"
            ? body.bank_metadata
            : JSON.stringify(body.bank_metadata);
      } catch {
        bankMetadata = null;
      }
    } else if (body.bank_verified_details != null) {
      try {
        bankMetadata = JSON.stringify({
          auto_verification: {
            verified_data: body.bank_verified_details,
            verified_at: verifiedAt,
            method: verificationMethod,
          },
        });
      } catch {
        bankMetadata = null;
      }
    }

    const sql = getSql() as {
      unsafe: (q: string, v?: unknown[]) => Promise<unknown[]>;
    };

    // Fetch existing primary/first account row for this store
    const existingRows = (await sql.unsafe(
      "SELECT id FROM merchant_store_bank_accounts WHERE store_id = $1 ORDER BY is_primary DESC, created_at ASC LIMIT 1",
      [storeInternalId]
    )) as { id: number }[]; 

    if (Array.isArray(existingRows) && existingRows.length > 0) {
      const existingId = existingRows[0].id;

      // Update existing row so bank + UPI live in the same record
      await sql.unsafe(
        `
        UPDATE merchant_store_bank_accounts
        SET
          account_holder_name = COALESCE($2::text, account_holder_name),
          account_number     = CASE WHEN $8::text = 'upi' THEN NULL ELSE COALESCE($3::text, account_number) END,
          ifsc_code          = CASE WHEN $8::text = 'upi' THEN NULL ELSE COALESCE($4::text, ifsc_code) END,
          bank_name          = CASE WHEN $8::text = 'upi' THEN NULL ELSE COALESCE($5::text, bank_name) END,
          branch_name        = COALESCE($6::text, branch_name),
          account_type       = COALESCE($7::text, account_type),
          payout_method      = $8::text,
          bank_proof_type    = COALESCE($9::text, bank_proof_type),
          bank_proof_file_url   = COALESCE($10::text, bank_proof_file_url),
          upi_qr_screenshot_url = COALESCE($11::text, upi_qr_screenshot_url),
          upi_id = CASE WHEN $8::text = 'upi' THEN $12::text ELSE NULL END,
          is_verified = COALESCE($13::boolean, is_verified),
          upi_verified = COALESCE($17::boolean, upi_verified),
          verified_at = COALESCE($14::timestamptz, verified_at),
          verification_method = COALESCE($15::text, verification_method),
          bank_metadata = CASE
            WHEN $16::jsonb IS NULL THEN bank_metadata
            ELSE COALESCE(bank_metadata, '{}'::jsonb) || $16::jsonb
          END,
          updated_at = now()
        WHERE id = $1
      `,
        [
          existingId,
          accountHolderName,
          accountNumber,
          ifscCode,
          resolvedBankName,
          typeof body.branch_name === "string"
            ? body.branch_name.trim() || null
            : null,
          typeof body.account_type === "string"
            ? body.account_type.trim() || null
            : null,
          payoutMethod,
          typeof body.bank_proof_type === "string"
            ? body.bank_proof_type.trim() || null
            : null,
          typeof body.bank_proof_file_url === "string"
            ? body.bank_proof_file_url.trim() || null
            : null,
          typeof body.upi_qr_screenshot_url === "string"
            ? body.upi_qr_screenshot_url.trim() || null
            : null,
          payoutMethod === "upi" ? upiId || null : null,
          isVerified,
          isVerifiedProvided ? verifiedAt : null,
          isVerifiedProvided ? verificationMethod : null,
          bankMetadata,
          upiVerified,
        ]
      );

      const updated = (await sql.unsafe(
        "SELECT id, account_holder_name, payout_method, is_primary, is_verified, created_at FROM merchant_store_bank_accounts WHERE id = $1",
        [existingId]
      )) as {
        id: number;
        account_holder_name: string | null;
        payout_method: string | null;
        is_primary: boolean | null;
        is_verified: boolean | null;
        created_at: string | Date | null;
      }[];

      const row = Array.isArray(updated) ? updated[0] : updated;
      return NextResponse.json({ success: true, account: row });
    }

    // No existing account – insert first row for this store
    const rows = (await sql.unsafe(
      `
      INSERT INTO merchant_store_bank_accounts
        (store_id,
         account_holder_name,
         account_number,
         ifsc_code,
         bank_name,
         branch_name,
         account_type,
         payout_method,
         bank_proof_type,
         bank_proof_file_url,
         upi_qr_screenshot_url,
         upi_id,
         is_primary,
         is_verified,
         upi_verified,
         verified_at,
         verification_method,
         bank_metadata)
      VALUES
        ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,true,$13,$14,$15,$16,$17::jsonb)
      RETURNING id, account_holder_name, payout_method, is_primary, is_verified, created_at
    `,
      [
        storeInternalId,
        accountHolderName,
        accountNumber,
        payoutMethod === "bank" ? ifscCode : null,
        payoutMethod === "bank" ? resolvedBankName : null,
        typeof body.branch_name === "string"
          ? body.branch_name.trim() || null
          : null,
        typeof body.account_type === "string"
          ? body.account_type.trim() || null
          : null,
        payoutMethod,
        typeof body.bank_proof_type === "string"
          ? body.bank_proof_type.trim() || null
          : null,
        typeof body.bank_proof_file_url === "string"
          ? body.bank_proof_file_url.trim() || null
          : null,
        typeof body.upi_qr_screenshot_url === "string"
          ? body.upi_qr_screenshot_url.trim() || null
          : null,
        payoutMethod === "upi" ? upiId || null : null,
        isVerified === true,
        upiVerified === true,
        isVerified === true ? verifiedAt : null,
        isVerified === true ? verificationMethod : null,
        bankMetadata,
      ]
    )) as {
      id: number;
      account_holder_name: string | null;
      payout_method: string | null;
      is_primary: boolean | null;
      is_verified: boolean | null;
      created_at: string | Date | null;
    }[];

    const row = Array.isArray(rows) ? rows[0] : rows;
    return NextResponse.json({ success: true, account: row });
  } catch (e) {
    console.error("[AM store-bank-accounts POST]", e);
    return NextResponse.json(
      { success: false, error: "Failed to save bank/UPI details" },
      { status: 500 }
    );
  }
}
