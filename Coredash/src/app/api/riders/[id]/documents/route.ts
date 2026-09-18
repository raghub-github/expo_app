import { NextRequest } from "next/server";
import { withAuth } from "@/lib/api";
import { getSql, num, safeQuery, str } from "@/lib/db/client";
import { resolveMediaUrl } from "@/lib/rider-media";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type JsonObj = Record<string, unknown>;

function asObj(value: unknown): JsonObj {
  if (value && typeof value === "object" && !Array.isArray(value)) return value as JsonObj;
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed as JsonObj;
    } catch {
      /* ignore */
    }
  }
  return {};
}

function pickStr(...values: unknown[]): string {
  for (const v of values) {
    if (typeof v === "string" && v.trim()) return v.trim();
    if (typeof v === "number" && Number.isFinite(v)) return String(v);
  }
  return "";
}

function methodLabel(method: string, status: string) {
  const m = method.toUpperCase();
  const s = status.toLowerCase();
  if (m.includes("MANUAL") || m === "MANUAL_UPLOAD") return "Manual upload";
  if (m.includes("CASHFREE") || s.includes("cashfree")) return "Cashfree";
  if (m === "APP_VERIFIED" || s === "auto_verified") return "Cashfree";
  if (m.includes("DIGI") || s.includes("digilocker")) return "DigiLocker";
  if (!m) return "Manual upload";
  return method.replace(/_/g, " ");
}

function extractDetails(docType: string, summary: JsonObj, meta: JsonObj, docNumber: string, extractedName: string) {
  const verified = asObj(summary.verifiedData ?? summary.verified_data ?? summary.data ?? summary);
  const details: Array<{ label: string; value: string }> = [];
  const push = (label: string, value: string) => {
    if (value) details.push({ label, value });
  };

  push("Document no.", docNumber);
  push("Name", extractedName || pickStr(verified.name, verified.owner_name, verified.full_name, meta.name));

  const t = docType.toLowerCase();
  if (t.includes("aadhaar")) {
    push("Aadhaar", pickStr(verified.masked_aadhaar, verified.aadhaar_number, verified.uid, meta.aadhaarNumber));
    push("DOB", pickStr(verified.dob, verified.date_of_birth));
    push("Gender", pickStr(verified.gender));
  } else if (t.includes("pan")) {
    push("PAN", pickStr(verified.pan, meta.panNumber, docNumber));
  } else if (t.includes("dl") || t === "driving_license") {
    push("DL no.", pickStr(verified.dl_number, meta.dlNumber, docNumber));
    push("Valid till", pickStr(verified.expiry_date, verified.valid_to));
  } else if (t === "rc" || t.includes("registration")) {
    push("Reg. no.", pickStr(verified.reg_no, meta.rcNumber, docNumber));
    push("Make", pickStr(verified.maker_model, verified.make, verified.maker_description));
    push("Fuel", pickStr(verified.fuel_type, verified.fuel));
    push("Color", pickStr(verified.color, verified.colour));
    push("Year", pickStr(verified.manufacturing_date, verified.year));
  } else if (t.includes("selfie") || t.includes("profile")) {
    push("Type", "Rider selfie");
  }

  // Generic leftover fields from Cashfree / auto payloads
  for (const [k, v] of Object.entries(verified)) {
    if (details.length >= 10) break;
    if (typeof v !== "string" && typeof v !== "number") continue;
    const label = k.replace(/_/g, " ");
    if (details.some((d) => d.label.toLowerCase() === label.toLowerCase())) continue;
    if (["raw", "payload", "token", "id"].includes(k.toLowerCase())) continue;
    push(label, String(v));
  }

  return details;
}

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  const riderId = Number(id);
  if (!Number.isFinite(riderId) || riderId <= 0) {
    return withAuth(async () => {
      throw new Error("Invalid rider id");
    });
  }

  return withAuth(async () => {
    const sql = getSql();
    const [docs, vehicleRows] = await Promise.all([
      safeQuery(
        "rider-docs",
        () =>
          sql<
            {
              id: number;
              doc_type: string;
              file_url: string | null;
              r2_key: string | null;
              doc_number: string | null;
              extracted_name: string | null;
              verified: boolean;
              verification_status: string | null;
              verification_method: string | null;
              extracted_data_summary: unknown;
              metadata: unknown;
              created_at: Date | string;
              side: string | null;
              file_r2_key: string | null;
              file_file_url: string | null;
              selfie_url: string | null;
            }[]
          >`
            SELECT
              d.id,
              d.doc_type::text AS doc_type,
              d.file_url,
              d.r2_key,
              d.doc_number,
              d.extracted_name,
              d.verified,
              d.verification_status::text AS verification_status,
              d.verification_method::text AS verification_method,
              d.extracted_data_summary,
              d.metadata,
              d.created_at,
              f.side::text AS side,
              f.r2_key AS file_r2_key,
              f.file_url AS file_file_url,
              r.selfie_url
            FROM rider_documents d
            LEFT JOIN rider_document_files f ON f.document_id = d.id
            LEFT JOIN riders r ON r.id = d.rider_id
            WHERE d.rider_id = ${riderId}
            ORDER BY d.created_at DESC, f.sort_order ASC NULLS LAST, f.id ASC
          `,
        []
      ),
      safeQuery(
        "rider-docs-vehicle",
        () =>
          sql<{ rc_document_url: string | null; cashfree_rc_payload: unknown; registration_number: string | null }[]>`
            SELECT rc_document_url, cashfree_rc_payload, registration_number
            FROM rider_vehicles
            WHERE rider_id = ${riderId}
            ORDER BY is_active DESC, updated_at DESC NULLS LAST, id DESC
            LIMIT 1
          `,
        []
      ),
    ]);

    const vehicle = vehicleRows[0];
    const cashfreeRc = asObj(vehicle?.cashfree_rc_payload);
    const vehicleRcUrl = vehicle?.rc_document_url ? str(vehicle.rc_document_url) : "";

    const byId = new Map<
      number,
      {
        id: number;
        docType: string;
        docNumber: string;
        extractedName: string;
        verified: boolean;
        status: string;
        method: string;
        methodLabel: string;
        createdAt: string;
        details: Array<{ label: string; value: string }>;
        files: Array<{ side: string; url: string | null }>;
        source: string;
      }
    >();

    for (const row of docs) {
      const idNum = num(row.id);
      const summary = asObj(row.extracted_data_summary);
      const meta = asObj(row.metadata);
      const docType = str(row.doc_type);
      const method = str(row.verification_method);
      const status = str(row.verification_status) || (row.verified ? "approved" : "pending");
      let docNumber = str(row.doc_number);
      let extractedName = str(row.extracted_name);

      // Enrich RC from vehicle Cashfree payload when doc fields are thin
      const isRc = docType.toLowerCase() === "rc";
      if (isRc) {
        if (!docNumber) docNumber = pickStr(vehicle?.registration_number, cashfreeRc.reg_no, cashfreeRc.registration_number);
        if (!extractedName) extractedName = pickStr(cashfreeRc.owner_name, cashfreeRc.name);
        if (!Object.keys(summary).length && Object.keys(cashfreeRc).length) {
          summary.verifiedData = cashfreeRc;
        }
      }

      if (!byId.has(idNum)) {
        byId.set(idNum, {
          id: idNum,
          docType,
          docNumber,
          extractedName,
          verified: Boolean(row.verified),
          status,
          method,
          methodLabel: methodLabel(method, status),
          createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : str(row.created_at),
          details: extractDetails(docType, summary, meta, docNumber, extractedName),
          files: [],
          source: methodLabel(method, status),
        });
      }

      const entry = byId.get(idNum)!;
      const isSelfie = /selfie|profile/.test(docType.toLowerCase());
      const candidates = [
        row.file_r2_key,
        row.file_file_url,
        row.r2_key,
        row.file_url,
        isRc ? vehicleRcUrl : null,
        isSelfie ? row.selfie_url : null,
        pickStr(meta.fileUrl, meta.file_url, meta.imageUrl, meta.image_url, summary.fileUrl),
      ];
      for (const c of candidates) {
        const fileUrl = resolveMediaUrl(typeof c === "string" ? c : null);
        if (!fileUrl) continue;
        if (entry.files.some((f) => f.url === fileUrl)) continue;
        entry.files.push({ side: str(row.side) || "single", url: fileUrl });
      }
    }

    return { documents: Array.from(byId.values()) };
  });
}
