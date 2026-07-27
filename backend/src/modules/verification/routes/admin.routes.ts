/**
 * Admin routes for the verification module.
 *
 * Mount prefix: /v1/verification
 *
 * Endpoints:
 *   GET  /health                       — config sanity check, no secrets
 *   POST /submit/pan                   — trigger PAN verify from admin dashboard
 *   POST /submit/bank                  — trigger BAV sync
 *   POST /submit/upi                   — trigger UPI VPA verify
 *   POST /submit/ifsc                  — trigger IFSC lookup
 *   POST /submit/driving-licence       — trigger DL verify
 *   POST /submit/vehicle-rc            — trigger RC verify
 *   POST /project-rider-ev             — project deferred EV payload → rider_vehicles (RC)
 *   POST /submit/passport              — trigger passport verify
 *   POST /submit/gstin                 — trigger GSTIN verify
 *   POST /submit/cin                   — trigger CIN verify
 *   POST /submit/reverse-penny-drop    — create RPD link (returns UPI links + QR)
 *   POST /submit/digilocker            — create DigiLocker consent URL
 *
 *   GET  /events/:verificationId       — full attempt history for one submission
 *   GET  /requests/subject/:type/:id   — recent attempts for a subject
 *
 * Auth: either a Supabase JWT with an admin-like role, or the shared
 * X-Internal-Secret used elsewhere for dashboard proxies.
 */
import type { FastifyPluginAsync, FastifyRequest, FastifyReply } from "fastify";
import { auth } from "../../../plugins/auth.js";
import { getEnv } from "../../../config/env.js";
import { getSql } from "../../../db/client.js";
import {
  submitPan, submitBankAccount, submitUpiPennyDrop, submitIfsc, submitDrivingLicence,
  submitVehicleRc, submitPassport, submitGstin, submitCin,
  submitReversePennyDrop, submitDigilocker, pollDigilockerForSubject,
  type SubmitOutcome,
} from "../service.js";
import { loadCashfreeConfig, CashfreeNotConfiguredError } from "../cashfree/config.js";
import type { VerificationSubjectKind } from "../types.js";

function internalSecretGrantsAdmin(req: FastifyRequest): boolean {
  const secret = getEnv().BACKEND_SCHEDULE_TICK_SECRET;
  if (!secret) return false;
  const h = req.headers["x-internal-secret"];
  return typeof h === "string" && h === secret;
}

function isAdminRole(r: string): boolean {
  return r === "admin" || r === "super_admin" || r === "manager" || r === "support";
}

const VALID_SUBJECT_TYPES: VerificationSubjectKind[] = [
  "rider", "merchant_store", "rider_document", "merchant_document",
];

function validSubject(t: unknown, id: unknown): { ok: true; type: VerificationSubjectKind; id: number } | { ok: false } {
  if (typeof t !== "string" || !VALID_SUBJECT_TYPES.includes(t as VerificationSubjectKind)) return { ok: false };
  const n = Number(id);
  if (!Number.isFinite(n) || n < 1) return { ok: false };
  return { ok: true, type: t as VerificationSubjectKind, id: n };
}

function sendOutcome(reply: FastifyReply, o: SubmitOutcome) {
  if (o.kind === "auto") {
    return reply.send({
      kind: "auto",
      policy: { mode: o.policy.mode, provider: o.policy.provider },
      request_id: o.requestId,
      verification_id: o.result.verificationId,
      provider_reference: o.result.providerReference,
      status: o.result.status,
      status_reason: o.result.statusReason,
      confidence: o.result.confidence,
      business_identifier: o.result.businessIdentifier,
      verified_data: o.result.verifiedData,
    });
  }
  return reply.send({
    kind: "manual",
    reason: o.reason,
    detail: o.detail ?? null,
    policy: { mode: o.policy.mode, provider: o.policy.provider },
  });
}

function catchSubmit(reply: FastifyReply, e: unknown): FastifyReply {
  if (e instanceof CashfreeNotConfiguredError) {
    return reply.code(503).send({ error: "cashfree_not_configured", reason: e.reason });
  }
  console.error(
    "[verification.submit] internal_error:",
    e instanceof Error ? e.message : e,
    e instanceof Error ? e.stack : "",
  );
  return reply.code(500).send({
    error: "internal_error",
    message: e instanceof Error ? e.message : "internal_error",
  });
}

export const verificationAdminRoutes: FastifyPluginAsync = async (app) => {
  await app.register(async (admin) => {
    await admin.register(auth, { required: false });
    admin.addHook("preHandler", async (req: FastifyRequest, reply: FastifyReply) => {
      if (internalSecretGrantsAdmin(req)) return;
      const role = req.auth?.role ?? "";
      if (!req.auth?.sub || !isAdminRole(role)) {
        return reply.code(403).send({ error: "forbidden", reason: "admin role required" });
      }
    });

    // ── Health ──
    admin.get("/health", async () => {
      try {
        const cfg = await loadCashfreeConfig();
        return {
          ok: true,
          cashfree: {
            env: cfg.env, base_url: cfg.baseUrl,
            client_id_prefix: cfg.clientId.slice(0, 6) + "…",
            rate_limit_tpm: cfg.rateLimitTpm, timeout_ms: cfg.timeoutMs,
            enabled_products: cfg.enabledProducts,
          },
        };
      } catch (e) {
        return { ok: false, cashfree: null, reason: (e as Error).message };
      }
    });

    // ── Submits ──
    admin.post<{ Body: { subject_type: string; subject_id: number; pan: string; name?: string; subject_facts?: Record<string, unknown> } }>(
      "/submit/pan", async (req, reply) => {
        const b = req.body ?? ({} as never);
        const s = validSubject(b.subject_type, b.subject_id);
        if (!s.ok) return reply.code(400).send({ error: "invalid_subject" });
        if (!b.pan || !/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(b.pan.trim().toUpperCase())) {
          return reply.code(400).send({ error: "invalid_pan" });
        }
        // Name is optional — Cashfree PAN verify works with number alone (name used only for match score).
        try {
          const o = await submitPan({
            subjectType: s.type, subjectId: s.id, subjectFacts: b.subject_facts,
            // created_by is integer; JWT `sub` is often a UUID — never NaN.
            createdBy: (() => {
              const n = Number(req.auth?.sub);
              return Number.isFinite(n) && n > 0 ? Math.trunc(n) : null;
            })(),
            pan: b.pan.trim().toUpperCase(),
            name: typeof b.name === "string" ? b.name.trim() : "",
            deferProjection: !!(b as { defer_projection?: boolean }).defer_projection,
          });
          return sendOutcome(reply, o);
        } catch (e) { return catchSubmit(reply, e); }
      });

    admin.post<{ Body: { subject_type: string; subject_id: number; bank_account: string; ifsc: string; name?: string; phone?: string; subject_facts?: Record<string, unknown> } }>(
      "/submit/bank", async (req, reply) => {
        const b = req.body ?? ({} as never);
        const s = validSubject(b.subject_type, b.subject_id);
        if (!s.ok) return reply.code(400).send({ error: "invalid_subject" });
        if (!b.bank_account || !/^\d{6,20}$/.test(b.bank_account)) return reply.code(400).send({ error: "invalid_bank_account" });
        if (!b.ifsc || !/^[A-Z]{4}0[A-Z0-9]{6}$/.test(b.ifsc.toUpperCase())) return reply.code(400).send({ error: "invalid_ifsc" });
        try {
          const o = await submitBankAccount({
            subjectType: s.type, subjectId: s.id, subjectFacts: b.subject_facts,
            createdBy: Number(req.auth?.sub) || null,
            bankAccount: b.bank_account, ifsc: b.ifsc.toUpperCase(), name: b.name, phone: b.phone,
            deferProjection: !!(b as { defer_projection?: boolean }).defer_projection,
          });
          return sendOutcome(reply, o);
        } catch (e) { return catchSubmit(reply, e); }
      });

    admin.post<{ Body: { subject_type: string; subject_id: number; vpa: string; name?: string; subject_facts?: Record<string, unknown> } }>(
      "/submit/upi", async (req, reply) => {
        const b = req.body ?? ({} as never);
        const s = validSubject(b.subject_type, b.subject_id);
        if (!s.ok) return reply.code(400).send({ error: "invalid_subject" });
        const vpa = String(b.vpa ?? "").trim().toLowerCase();
        if (!vpa || !/^[a-z0-9.\-_]{2,256}@[a-z0-9]{2,64}$/i.test(vpa)) {
          return reply.code(400).send({ error: "invalid_vpa" });
        }
        try {
          const o = await submitUpiPennyDrop({
            subjectType: s.type, subjectId: s.id, subjectFacts: b.subject_facts,
            createdBy: Number(req.auth?.sub) || null,
            vpa, name: b.name,
          });
          return sendOutcome(reply, o);
        } catch (e) { return catchSubmit(reply, e); }
      });

    admin.post<{ Body: { subject_type: string; subject_id: number; ifsc: string; subject_facts?: Record<string, unknown> } }>(
      "/submit/ifsc", async (req, reply) => {
        const b = req.body ?? ({} as never);
        const s = validSubject(b.subject_type, b.subject_id);
        if (!s.ok) return reply.code(400).send({ error: "invalid_subject" });
        if (!b.ifsc || !/^[A-Z]{4}0[A-Z0-9]{6}$/.test(b.ifsc.toUpperCase())) return reply.code(400).send({ error: "invalid_ifsc" });
        try {
          const o = await submitIfsc({
            subjectType: s.type, subjectId: s.id, subjectFacts: b.subject_facts,
            createdBy: Number(req.auth?.sub) || null,
            ifsc: b.ifsc.toUpperCase(),
          });
          return sendOutcome(reply, o);
        } catch (e) { return catchSubmit(reply, e); }
      });

    admin.post<{ Body: { subject_type: string; subject_id: number; dl_number: string; dob: string; subject_facts?: Record<string, unknown> } }>(
      "/submit/driving-licence", async (req, reply) => {
        const b = req.body ?? ({} as never);
        const s = validSubject(b.subject_type, b.subject_id);
        if (!s.ok) return reply.code(400).send({ error: "invalid_subject" });
        if (!b.dl_number || b.dl_number.length < 6) return reply.code(400).send({ error: "invalid_dl_number" });
        if (!b.dob || !/^\d{4}-\d{2}-\d{2}$/.test(b.dob)) return reply.code(400).send({ error: "invalid_dob", hint: "YYYY-MM-DD" });
        try {
          const o = await submitDrivingLicence({
            subjectType: s.type, subjectId: s.id, subjectFacts: b.subject_facts,
            createdBy: Number(req.auth?.sub) || null,
            dlNumber: b.dl_number.trim().toUpperCase(), dob: b.dob,
            deferProjection: !!(b as { defer_projection?: boolean }).defer_projection,
          });
          return sendOutcome(reply, o);
        } catch (e) { return catchSubmit(reply, e); }
      });

    admin.post<{ Body: { subject_type: string; subject_id: number; vehicle_number: string; subject_facts?: Record<string, unknown> } }>(
      "/submit/vehicle-rc", async (req, reply) => {
        const b = req.body ?? ({} as never);
        const s = validSubject(b.subject_type, b.subject_id);
        if (!s.ok) return reply.code(400).send({ error: "invalid_subject" });
        if (!b.vehicle_number || b.vehicle_number.length < 4) return reply.code(400).send({ error: "invalid_vehicle_number" });
        try {
          const o = await submitVehicleRc({
            subjectType: s.type, subjectId: s.id, subjectFacts: b.subject_facts,
            createdBy: Number(req.auth?.sub) || null,
            vehicleNumber: b.vehicle_number.trim().toUpperCase(),
            deferProjection: !!(b as { defer_projection?: boolean }).defer_projection,
          });
          return sendOutcome(reply, o);
        } catch (e) { return catchSubmit(reply, e); }
      });

    admin.post<{ Body: { subject_type: string; subject_id: number; file_number: string; dob: string; name?: string; subject_facts?: Record<string, unknown> } }>(
      "/submit/passport", async (req, reply) => {
        const b = req.body ?? ({} as never);
        const s = validSubject(b.subject_type, b.subject_id);
        if (!s.ok) return reply.code(400).send({ error: "invalid_subject" });
        if (!b.file_number || b.file_number.length < 5) return reply.code(400).send({ error: "invalid_file_number" });
        if (!b.dob || !/^\d{4}-\d{2}-\d{2}$/.test(b.dob)) return reply.code(400).send({ error: "invalid_dob" });
        try {
          const o = await submitPassport({
            subjectType: s.type, subjectId: s.id, subjectFacts: b.subject_facts,
            createdBy: Number(req.auth?.sub) || null,
            fileNumber: b.file_number.trim(), dob: b.dob, name: b.name,
          });
          return sendOutcome(reply, o);
        } catch (e) { return catchSubmit(reply, e); }
      });

    admin.post<{ Body: { subject_type: string; subject_id: number; gstin: string; business_name?: string; subject_facts?: Record<string, unknown> } }>(
      "/submit/gstin", async (req, reply) => {
        const b = req.body ?? ({} as never);
        const s = validSubject(b.subject_type, b.subject_id);
        if (!s.ok) return reply.code(400).send({ error: "invalid_subject" });
        if (!b.gstin || !/^\d{2}[A-Z]{5}\d{4}[A-Z]{1}[A-Z\d]{1}[Z]{1}[A-Z\d]{1}$/i.test(b.gstin)) {
          return reply.code(400).send({ error: "invalid_gstin" });
        }
        try {
          const o = await submitGstin({
            subjectType: s.type, subjectId: s.id, subjectFacts: b.subject_facts,
            createdBy: Number(req.auth?.sub) || null,
            gstin: b.gstin.trim().toUpperCase(), businessName: b.business_name,
            deferProjection: !!(b as { defer_projection?: boolean }).defer_projection,
          });
          return sendOutcome(reply, o);
        } catch (e) { return catchSubmit(reply, e); }
      });

    admin.post<{ Body: { subject_type: string; subject_id: number; cin: string; subject_facts?: Record<string, unknown> } }>(
      "/submit/cin", async (req, reply) => {
        const b = req.body ?? ({} as never);
        const s = validSubject(b.subject_type, b.subject_id);
        if (!s.ok) return reply.code(400).send({ error: "invalid_subject" });
        if (!b.cin || b.cin.length < 15) return reply.code(400).send({ error: "invalid_cin" });
        try {
          const o = await submitCin({
            subjectType: s.type, subjectId: s.id, subjectFacts: b.subject_facts,
            createdBy: Number(req.auth?.sub) || null,
            cin: b.cin.trim().toUpperCase(),
          });
          return sendOutcome(reply, o);
        } catch (e) { return catchSubmit(reply, e); }
      });

    admin.post<{ Body: { subject_type: string; subject_id: number; redirect_url?: string; name?: string; subject_facts?: Record<string, unknown> } }>(
      "/submit/reverse-penny-drop", async (req, reply) => {
        const b = req.body ?? ({} as never);
        const s = validSubject(b.subject_type, b.subject_id);
        if (!s.ok) return reply.code(400).send({ error: "invalid_subject" });
        try {
          const o = await submitReversePennyDrop({
            subjectType: s.type, subjectId: s.id, subjectFacts: b.subject_facts,
            createdBy: Number(req.auth?.sub) || null,
            redirectUrl: b.redirect_url, name: b.name,
          });
          return sendOutcome(reply, o);
        } catch (e) { return catchSubmit(reply, e); }
      });

    admin.post<{ Body: { subject_type: string; subject_id: number; documents: string[]; redirect_url?: string; user_flow?: "signin" | "signup"; subject_facts?: Record<string, unknown> } }>(
      "/submit/digilocker", async (req, reply) => {
        const b = req.body ?? ({} as never);
        const s = validSubject(b.subject_type, b.subject_id);
        if (!s.ok) return reply.code(400).send({ error: "invalid_subject" });
        const docs = (b.documents ?? []).filter((d): d is "AADHAAR" | "PAN" | "DRIVING_LICENSE" =>
          d === "AADHAAR" || d === "PAN" || d === "DRIVING_LICENSE");
        if (docs.length === 0) return reply.code(400).send({ error: "documents_required" });
        try {
          const o = await submitDigilocker({
            subjectType: s.type, subjectId: s.id, subjectFacts: b.subject_facts,
            createdBy: Number(req.auth?.sub) || null,
            documents: docs, redirectUrl: b.redirect_url, userFlow: b.user_flow,
          });
          return sendOutcome(reply, o);
        } catch (e) { return catchSubmit(reply, e); }
      });

    /**
     * Poll Cashfree DigiLocker status (+ fetch Aadhaar doc when AUTHENTICATED).
     * Used by partnersite / AM status endpoints while the UI shows the spinner.
     */
    admin.post<{
      Body: { subject_type: string; subject_id: number };
    }>("/poll/digilocker", async (req, reply) => {
      const b = req.body ?? ({} as never);
      const s = validSubject(b.subject_type, b.subject_id);
      if (!s.ok) return reply.code(400).send({ error: "invalid_subject" });
      try {
        const result = await pollDigilockerForSubject({
          subjectType: s.type,
          subjectId: s.id,
        });
        return reply.send({ success: true, ...result });
      } catch (e) {
        return catchSubmit(reply, e);
      }
    });

    // After dashboard agent Approves Cashfree RC (defer_projection), project
    // verifiedData into rider_vehicles — same helper as rider-app onboarding.
    admin.post<{
      Body: {
        rider_id: number;
        doc_kind: "vehicle_rc" | "driving_licence";
        verified_data: Record<string, unknown>;
        rc_document_url?: string | null;
        previous_registration_number?: string | null;
      };
    }>("/project-rider-ev", async (req, reply) => {
      const b = req.body ?? ({} as never);
      const riderId = Number(b.rider_id);
      if (!Number.isFinite(riderId) || riderId < 1) {
        return reply.code(400).send({ error: "invalid_rider_id" });
      }
      const verifiedData =
        b.verified_data && typeof b.verified_data === "object"
          ? b.verified_data
          : null;
      if (!verifiedData) {
        return reply.code(400).send({ error: "verified_data_required" });
      }
      if (b.doc_kind === "vehicle_rc") {
        try {
          const newPlate = String(
            verifiedData.reg_no ||
              verifiedData.registration_number ||
              verifiedData.vehicle_number ||
              "",
          )
            .trim()
            .toUpperCase()
            .replace(/[^A-Z0-9]/g, "");

          // Wrong RC → new RC from dashboard: purge old photos from R2 + DB
          // before projecting vehicle profile (same as app Cashfree path).
          let plateCleared = false;
          if (newPlate.length >= 4) {
            try {
              const { clearRiderRcMediaIfPlateChanged } = await import(
                "../../../lib/clear-rider-rc-media-on-plate-replace.js"
              );
              const cleared = await clearRiderRcMediaIfPlateChanged({
                riderId,
                newRegistrationNumber: newPlate,
                previousRegistrationNumber: b.previous_registration_number ?? null,
              });
              plateCleared = cleared.cleared;
            } catch (clearErr) {
              req.log?.warn?.(
                { err: clearErr },
                "project_rider_ev_rc_media_clear_failed",
              );
            }
          }

          const { upsertRiderVehicleFromRcVerifiedData } = await import(
            "../../../lib/rider-vehicle-from-rc.js"
          );
          const result = await upsertRiderVehicleFromRcVerifiedData({
            riderId,
            verifiedData,
            // Never reuse old plate's photo after a plate replace.
            rcDocumentUrl: plateCleared ? null : b.rc_document_url ?? null,
          });
          if (!result.ok) {
            return reply.code(422).send({ success: false, error: result.error });
          }
          return reply.send({
            success: true,
            doc_kind: "vehicle_rc",
            vehicle_id: result.vehicleId,
            rc_media_cleared: plateCleared,
          });
        } catch (e) {
          req.log?.error?.({ err: e }, "project_rider_ev_rc_failed");
          return reply.code(500).send({
            success: false,
            error: e instanceof Error ? e.message : "project_failed",
          });
        }
      }
      return reply.send({ success: true, doc_kind: "driving_licence", projected: "document_only" });
    });

    // ── History ──
    admin.get<{ Params: { verificationId: string } }>(
      "/events/:verificationId",
      async (req, reply) => {
        const sql = getSql();
        const rows = (await sql`
          SELECT r.id AS request_id, r.verification_id, r.status, r.status_reason,
                 r.provider_reference, r.business_identifier, r.confidence,
                 r.document_kind, r.subject_type, r.subject_id, r.attempt_number,
                 r.created_at,
                 (SELECT jsonb_agg(jsonb_build_object(
                    'id', e.id, 'event_kind', e.event_kind,
                    'from_status', e.from_status, 'to_status', e.to_status,
                    'actor_type', e.actor_type, 'actor_id', e.actor_id,
                    'details', e.details, 'created_at', e.created_at
                  ) ORDER BY e.created_at) FROM verification_events e WHERE e.request_id = r.id) AS events
          FROM verification_requests r
          WHERE r.verification_id = ${req.params.verificationId}
          LIMIT 1
        `) as unknown as Array<Record<string, unknown>>;
        if (rows.length === 0) return reply.code(404).send({ error: "not_found" });
        return reply.send(rows[0]);
      });

    admin.get<{ Params: { type: string; id: string }; Querystring: { limit?: string } }>(
      "/requests/subject/:type/:id",
      async (req, reply) => {
        const s = validSubject(req.params.type, Number(req.params.id));
        if (!s.ok) return reply.code(400).send({ error: "invalid_subject" });
        const limit = Math.min(200, Math.max(1, Number(req.query?.limit ?? 50)));
        const sql = getSql();
        const rows = (await sql`
          SELECT id, verification_id, provider, document_kind, status, status_reason,
                 confidence, business_identifier, attempt_number, created_at
          FROM verification_requests
          WHERE subject_type = ${s.type} AND subject_id = ${s.id}
          ORDER BY created_at DESC
          LIMIT ${limit}
        `) as unknown as Array<Record<string, unknown>>;
        return reply.send({ items: rows });
      });
  }, { prefix: "/v1/verification" });
};
