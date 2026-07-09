import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireSuperAdminApi } from "@/lib/super-admin-api";
import { backendFetch } from "@/lib/notif-backend";

export const runtime = "nodejs";

/**
 * POST /api/super-admin/verification/submit
 *
 * Agent-triggered electronic verification. When a doc lands in the manual
 * queue (rider or merchant), the agent can enter/correct the document number
 * and run the SAME Cashfree verification the automatic path uses, instead of
 * eyeballing the uploaded image.
 *
 * Proxies to backend /v1/verification/submit/<kind> with the shared internal
 * secret — Cashfree credentials live ONLY on the backend; the dashboard needs
 * BACKEND_URL + BACKEND_SCHEDULE_TICK_SECRET (already configured).
 *
 * The submit is recorded as a fresh verification_request attempt with full
 * audit trail, exactly like an automatic submission.
 */

const base = {
  subjectType: z.enum(["rider", "merchant_store", "rider_document", "merchant_document"]),
  subjectId: z.number().int().positive(),
};

const schema = z.discriminatedUnion("docKind", [
  z.object({ ...base, docKind: z.literal("pan"), pan: z.string().regex(/^[A-Z]{5}[0-9]{4}[A-Z]$/i), name: z.string().min(2).max(100) }),
  z.object({ ...base, docKind: z.literal("gstin"), gstin: z.string().min(15).max(15), businessName: z.string().max(120).optional() }),
  z.object({ ...base, docKind: z.literal("bank_account"), bankAccount: z.string().regex(/^\d{6,20}$/), ifsc: z.string().regex(/^[A-Za-z]{4}0[A-Za-z0-9]{6}$/), name: z.string().max(100).optional() }),
  z.object({ ...base, docKind: z.literal("driving_licence"), dlNumber: z.string().min(6).max(24), dob: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }),
  z.object({ ...base, docKind: z.literal("vehicle_rc"), vehicleNumber: z.string().min(4).max(16) }),
  z.object({ ...base, docKind: z.literal("ifsc"), ifsc: z.string().regex(/^[A-Za-z]{4}0[A-Za-z0-9]{6}$/) }),
]);

/** docKind → backend submit path + payload builder. */
function toBackendCall(d: z.infer<typeof schema>): { path: string; payload: Record<string, unknown> } {
  const subject = { subject_type: d.subjectType, subject_id: d.subjectId };
  switch (d.docKind) {
    case "pan":
      return { path: "/v1/verification/submit/pan", payload: { ...subject, pan: d.pan.toUpperCase(), name: d.name.trim() } };
    case "gstin":
      return { path: "/v1/verification/submit/gstin", payload: { ...subject, gstin: d.gstin.toUpperCase(), business_name: d.businessName?.trim() || undefined } };
    case "bank_account":
      return { path: "/v1/verification/submit/bank", payload: { ...subject, bank_account: d.bankAccount, ifsc: d.ifsc.toUpperCase(), name: d.name?.trim() || undefined } };
    case "driving_licence":
      return { path: "/v1/verification/submit/driving-licence", payload: { ...subject, dl_number: d.dlNumber.toUpperCase(), dob: d.dob } };
    case "vehicle_rc":
      return { path: "/v1/verification/submit/vehicle-rc", payload: { ...subject, vehicle_number: d.vehicleNumber.toUpperCase() } };
    case "ifsc":
      return { path: "/v1/verification/submit/ifsc", payload: { ...subject, ifsc: d.ifsc.toUpperCase() } };
  }
}

export async function POST(req: NextRequest) {
  const gate = await requireSuperAdminApi();
  if (!gate.ok) return gate.response;

  let body: unknown;
  try { body = await req.json(); } catch {
    return NextResponse.json({ success: false, error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { path, payload } = toBackendCall(parsed.data);
  const res = await backendFetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  const b = (res.body ?? {}) as Record<string, unknown>;
  if (res.status === 503 && b.error === "backend_not_configured") {
    return NextResponse.json(
      { success: false, error: "Backend not configured (BACKEND_URL / BACKEND_SCHEDULE_TICK_SECRET)." },
      { status: 503 },
    );
  }
  if (res.status < 200 || res.status >= 300) {
    return NextResponse.json(
      { success: false, error: String(b.error ?? `Backend HTTP ${res.status}`), detail: b.reason ?? null },
      { status: 502 },
    );
  }

  // Pass the backend outcome through: kind auto (status/verified_data/…) or
  // kind manual (reason/detail — e.g. Cashfree IP-whitelist message).
  return NextResponse.json({ success: true, outcome: b });
}
