import { NextRequest, NextResponse } from "next/server";
import { getSql } from "@/lib/db/client";
import { uploadWithKey } from "@/lib/services/r2";

function sanitizeFileName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 60) || "file";
}

function buildProxyUrl(r2Key: string): string {
  return `/api/attachments/proxy?key=${encodeURIComponent(r2Key)}`;
}

export async function POST(req: NextRequest) {
  try {
    const storeInternalId = Number(
      req.nextUrl.searchParams.get("storeInternalId")
    );
    if (!Number.isFinite(storeInternalId)) {
      return NextResponse.json(
        { success: false, error: "Valid storeInternalId is required" },
        { status: 400 }
      );
    }

    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const kindRaw = formData.get("kind") as string | null;
    const kind = (kindRaw || "bank").toLowerCase();

    if (!file || !(file instanceof File)) {
      return NextResponse.json(
        { success: false, error: "No file provided" },
        { status: 400 }
      );
    }
    if (kind !== "bank" && kind !== "upi") {
      return NextResponse.json(
        { success: false, error: "kind must be bank or upi" },
        { status: 400 }
      );
    }

    const sql = getSql() as {
      unsafe: (q: string, v?: unknown[]) => Promise<unknown[]>;
    };

    // Fetch store to derive parent + store code for R2 path
    const storeRows = (await sql.unsafe(
      "SELECT id, store_id, parent_id, parent_merchant_id FROM merchant_stores WHERE id = $1 LIMIT 1",
      [storeInternalId]
    )) as {
      id: number;
      store_id: string | null;
      parent_id: number | null;
      parent_merchant_id: string | null;
    }[];

    const store = Array.isArray(storeRows) ? storeRows[0] : storeRows;
    if (!store) {
      return NextResponse.json(
        { success: false, error: "Store not found" },
        { status: 404 }
      );
    }

    const parentCode =
      store.parent_merchant_id ||
      (store.parent_id != null ? String(store.parent_id) : String(store.id));
    const storeCode = store.store_id || String(store.id);

    const timestamp = Date.now();
    const safeName = sanitizeFileName(file.name);
    const ext = file.name.split(".").pop()?.toLowerCase() || "png";

    const baseName = kind === "upi" ? "upi_qr" : "bank_proof";

    const r2Key = `docs/merchants/${parentCode}/stores/${storeCode}/onboarding/bank/${baseName}_${timestamp}_${safeName}.${ext}`;

    await uploadWithKey(file, r2Key);
    const proxyUrl = buildProxyUrl(r2Key);

    // Update existing primary account row with appropriate URL column
    const col =
      kind === "upi" ? "upi_qr_screenshot_url" : "bank_proof_file_url";

    await sql.unsafe(
      `
      UPDATE merchant_store_bank_accounts
      SET ${col} = $2, updated_at = now()
      WHERE id = (
        SELECT id
        FROM merchant_store_bank_accounts
        WHERE store_id = $1
        ORDER BY is_primary DESC, created_at ASC
        LIMIT 1
      )
    `,
      [storeInternalId, proxyUrl]
    );

    return NextResponse.json({
      success: true,
      url: proxyUrl,
      kind,
      message: "File uploaded and bank proof URL saved.",
    });
  } catch (e) {
    console.error("[AM store-bank-accounts upload]", e);
    return NextResponse.json(
      { success: false, error: "Failed to upload bank proof / QR" },
      { status: 500 }
    );
  }
}

