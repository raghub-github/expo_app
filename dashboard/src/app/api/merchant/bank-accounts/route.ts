import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getSql } from "@/lib/db/client";

// Minimal reimplementation of partnersite bank-accounts API for the dashboard app.

function getSupabaseAdmin() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

async function resolveStoreInternalId(
  storeIdOrCode: string
): Promise<number | null> {
  const sql = getSql();

  // If it's a pure number, treat as internal id directly
  if (/^\d+$/.test(storeIdOrCode)) {
    const idNum = parseInt(storeIdOrCode, 10);
    if (!Number.isFinite(idNum)) return null;
    const rows = await sql.unsafe(
      "SELECT id FROM merchant_stores WHERE id = $1 LIMIT 1",
      [idNum]
    );
    const row = Array.isArray(rows) ? rows[0] : rows;
    if (!row || typeof (row as any).id !== "number") return null;
    return (row as any).id as number;
  }

  // Otherwise resolve by public code (store_id column)
  const rows = await sql.unsafe(
    "SELECT id FROM merchant_stores WHERE store_id = $1 LIMIT 1",
    [storeIdOrCode]
  );
  const row = Array.isArray(rows) ? rows[0] : rows;
  if (!row || typeof (row as any).id !== "number") return null;
  return (row as any).id as number;
}

export async function GET(req: NextRequest) {
  try {
    const storeId =
      req.nextUrl.searchParams.get("storeId") ??
      req.nextUrl.searchParams.get("store_id");
    if (!storeId?.trim()) {
      return NextResponse.json(
        { error: "storeId is required" },
        { status: 400 }
      );
    }

    const internalId = await resolveStoreInternalId(storeId.trim());
    if (internalId == null) {
      return NextResponse.json({ error: "Store not found" }, { status: 404 });
    }

    const db = getSupabaseAdmin();
    const { data: rows, error } = await db
      .from("merchant_store_bank_accounts")
      .select(
        "id, store_id, account_holder_name, account_number, ifsc_code, bank_name, branch_name, account_type, is_verified, verification_status, upi_id, is_primary, is_active, is_disabled, payout_method, bank_proof_type, bank_proof_file_url, upi_qr_screenshot_url, created_at, updated_at"
      )
      .eq("store_id", internalId)
      .order("is_primary", { ascending: false })
      .order("created_at", { ascending: false });

    if (error) {
      console.error("[dashboard bank-accounts GET]", error);
      return NextResponse.json(
        { error: "Failed to load bank accounts" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      accounts: (rows || []).map((r) => ({
        ...r,
        account_number_masked: r.account_number
          ? `****${String(r.account_number).slice(-4)}`
          : null,
        is_verified: !!r.is_verified,
        is_primary: !!r.is_primary,
        is_active: r.is_active !== false,
        is_disabled: !!r.is_disabled,
      })),
    });
  } catch (e) {
    console.error("[dashboard bank-accounts GET]", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const storeId = (body.storeId ?? body.store_id)?.trim();
    if (!storeId) {
      return NextResponse.json(
        { error: "storeId is required" },
        { status: 400 }
      );
    }

    const payoutMethod = String(body.payout_method || "bank")
      .toLowerCase()
      .trim();
    if (payoutMethod !== "bank" && payoutMethod !== "upi") {
      return NextResponse.json(
        { error: "payout_method must be bank or upi" },
        { status: 400 }
      );
    }

    const rawHolder = String(body.account_holder_name ?? "").trim();
    const rawAccount = String(body.account_number ?? "").trim();
    const ifscCode = body.ifsc_code
      ? String(body.ifsc_code).trim().toUpperCase()
      : "";
    const bankName = body.bank_name ? String(body.bank_name).trim() : "";

    if (payoutMethod === "bank") {
      if (!rawHolder || !rawAccount) {
        return NextResponse.json(
          { error: "account_holder_name and account_number are required for bank" },
          { status: 400 }
        );
      }
      if (!ifscCode || !bankName) {
        return NextResponse.json(
          { error: "ifsc_code and bank_name required for bank" },
          { status: 400 }
        );
      }
    }
    if (payoutMethod === "bank" && (!ifscCode || !bankName)) {
      return NextResponse.json(
        { error: "ifsc_code and bank_name required for bank" },
        { status: 400 }
      );
    }
    if (payoutMethod === "upi" && !String(body.upi_id ?? "").trim()) {
      return NextResponse.json(
        { error: "upi_id required for upi" },
        { status: 400 }
      );
    }

    const accountHolderName =
      rawHolder || (payoutMethod === "upi" ? null : rawHolder);
    const accountNumber =
      rawAccount ||
      (payoutMethod === "upi"
        ? String(body.upi_id ?? "").trim() || null
        : rawAccount);

    const internalId = await resolveStoreInternalId(storeId);
    if (internalId == null) {
      return NextResponse.json({ error: "Store not found" }, { status: 404 });
    }

    const db = getSupabaseAdmin();
    const { count } = await db
      .from("merchant_store_bank_accounts")
      .select("id", { count: "exact", head: true })
      .eq("store_id", internalId);
    const isFirst = (count ?? 0) === 0;

    const insert: Record<string, unknown> = {
      store_id: internalId,
      payout_method: payoutMethod,
      account_holder_name: accountHolderName,
      account_number: accountNumber,
      ifsc_code: payoutMethod === "bank" ? ifscCode : "N/A",
      bank_name: payoutMethod === "bank" ? bankName : "UPI",
      branch_name:
        typeof body.branch_name === "string"
          ? body.branch_name.trim() || null
          : null,
      account_type:
        typeof body.account_type === "string"
          ? body.account_type.trim() || null
          : null,
      is_primary: isFirst,
      is_active: true,
      is_disabled: false,
      bank_proof_type:
        typeof body.bank_proof_type === "string"
          ? body.bank_proof_type.trim() || null
          : null,
      bank_proof_file_url:
        typeof body.bank_proof_file_url === "string"
          ? body.bank_proof_file_url.trim() || null
          : null,
      upi_qr_screenshot_url:
        typeof body.upi_qr_screenshot_url === "string"
          ? body.upi_qr_screenshot_url.trim() || null
          : null,
      upi_id:
        payoutMethod === "upi" && typeof body.upi_id === "string"
          ? body.upi_id.trim()
          : null,
      verification_status: "pending",
    };

    const { data, error } = await db
      .from("merchant_store_bank_accounts")
      .insert(insert)
      .select("id, account_holder_name, is_primary, payout_method, created_at")
      .single();

    if (error) {
      console.error("[dashboard bank-accounts POST]", error);
      return NextResponse.json(
        { error: error.message || "Failed to add bank account" },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, account: data });
  } catch (e) {
    console.error("[dashboard bank-accounts POST]", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

