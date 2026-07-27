import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { ulid } from "ulid";
import { getDb } from "../../db/client.js";
import { riders, riderDocuments, riderOnboardingVehicleTypes, riderOnboardingDocumentTypes, riderOnboardingVehicleCategories } from "../../db/schema.js";
import { eq, and, asc } from "drizzle-orm";
import { auth } from "../../plugins/auth.js";
import { deleteFromR2, extractKeyFromSignedUrl } from "../../services/r2/r2Service.js";
import { buildRiderDigilockerReturnHtml } from "../../lib/rider-digilocker-return-html.js";
import type { RiderDigilockerReturnPageKind } from "../../lib/rider-digilocker-return-html.js";
import {
  isAadhaarAlreadyRegistered,
  normalizeAadhaarDigits,
} from "../../lib/rider-aadhaar-registration-check.js";
import { isPanAlreadyRegistered, normalizePan } from "../../lib/rider-pan-registration-check.js";
import { isDlAlreadyRegistered, normalizeDlNumber } from "../../lib/rider-dl-registration-check.js";
import { isRcAlreadyRegistered, normalizeRcNumber } from "../../lib/rider-rc-registration-check.js";

export async function onboardingRoutes(app: FastifyInstance) {
  await app.register(auth, { required: true });

  /**
   * GET /digilocker-return — public Cashfree DigiLocker browser callback.
   * Full path: GET /v1/onboarding/digilocker-return
   * Must use skipAuth (Cashfree has no rider JWT). Returns HTML, never JSON 404.
   */
  app.get(
    "/digilocker-return",
    {
      config: { skipAuth: true },
    },
    async (req, reply) => {
      const q = req.query as Record<string, string | string[] | undefined>;
      const rawVid = q.verification_id ?? q.verificationId;
      const verificationId = String(Array.isArray(rawVid) ? rawVid[0] : rawVid || "").trim();

      let kind: RiderDigilockerReturnPageKind = "pending";
      let status: string | null = null;

      try {
        if (verificationId) {
          const { lookupDigilockerReturnByVerificationId } = await import(
            "../verification/service.js"
          );
          const hit = await lookupDigilockerReturnByVerificationId(verificationId);
          if (!hit.known) {
            kind = "unknown";
            req.log.warn(
              { verificationId, path: req.url },
              "digilocker_return_unknown_verification_id",
            );
          } else {
            status = hit.status ?? null;
            if (status === "verified") kind = "success";
            else if (
              status === "failed" ||
              status === "rejected" ||
              status === "expired" ||
              status === "consent_denied"
            ) {
              kind = "failed";
            } else {
              kind = "pending";
            }
            req.log.info(
              {
                verificationId,
                status,
                kind,
                subjectType: hit.subjectType,
                documentKind: hit.documentKind,
                path: req.url,
              },
              "digilocker_return_callback",
            );
          }
        } else {
          req.log.info({ path: req.url }, "digilocker_return_callback_no_verification_id");
        }
      } catch (err) {
        req.log.error({ err, verificationId, path: req.url }, "digilocker_return_handler_error");
        kind = verificationId ? "unknown" : "pending";
      }

      return reply
        .code(200)
        .type("text/html; charset=utf-8")
        .header("Cache-Control", "no-store")
        .send(
          buildRiderDigilockerReturnHtml({
            kind,
            verificationId: verificationId || null,
            status,
          }),
        );
    },
  );

  app.get(
    "/vehicle-types",
    {
      schema: {
        querystring: z.object({
          includeInactive: z.enum(["true", "false"]).optional(),
        }),
        response: {
          200: z.object({
            rows: z.array(
              z.object({
                id: z.number(),
                code: z.string(),
                categoryCode: z.string().nullable(),
                label: z.string(),
                hint: z.string().nullable(),
                icon: z.string().nullable(),
                sortOrder: z.number(),
                isActive: z.boolean(),
                onboardingFlow: z.enum(["dl_rc", "rental_ev", "payment"]),
                documentRequirements: z.record(z.string(), z.unknown()),
                infoMessage: z.string().nullable(),
                mapsToVehicleType: z.string().nullable(),
              })
            ),
          }),
        },
      },
    },
    async (req) => {
      const includeInactive =
        (req.query as { includeInactive?: string }).includeInactive === "true";
      const db = getDb();
      const rows = await db
        .select()
        .from(riderOnboardingVehicleTypes)
        .where(includeInactive ? undefined : eq(riderOnboardingVehicleTypes.isActive, true))
        .orderBy(
          asc(riderOnboardingVehicleTypes.sortOrder),
          asc(riderOnboardingVehicleTypes.id)
        );

      return {
        rows: rows.map((row) => ({
          id: row.id,
          code: row.code,
          categoryCode: row.categoryCode,
          label: row.label,
          hint: row.hint,
          icon: row.icon,
          sortOrder: row.sortOrder,
          isActive: row.isActive,
          onboardingFlow: row.onboardingFlow as "dl_rc" | "rental_ev" | "payment",
          documentRequirements:
            row.documentRequirements && typeof row.documentRequirements === "object"
              ? (row.documentRequirements as Record<string, unknown>)
              : {},
          infoMessage: row.infoMessage,
          mapsToVehicleType: row.mapsToVehicleType,
        })),
      };
    }
  );

  app.get(
    "/vehicle-categories",
    {
      schema: {
        querystring: z.object({
          includeInactive: z.enum(["true", "false"]).optional(),
        }),
        response: {
          200: z.object({
            rows: z.array(
              z.object({
                id: z.number(),
                code: z.string(),
                label: z.string(),
                hint: z.string().nullable(),
                icon: z.string().nullable(),
                wheelCount: z.number(),
                sortOrder: z.number(),
                isActive: z.boolean(),
              })
            ),
          }),
        },
      },
    },
    async (req) => {
      const includeInactive =
        (req.query as { includeInactive?: string }).includeInactive === "true";
      const db = getDb();
      const rows = await db
        .select()
        .from(riderOnboardingVehicleCategories)
        .where(
          includeInactive ? undefined : eq(riderOnboardingVehicleCategories.isActive, true)
        )
        .orderBy(
          asc(riderOnboardingVehicleCategories.sortOrder),
          asc(riderOnboardingVehicleCategories.id)
        );

      let categoryRows = rows;
      if (!includeInactive) {
        const activeVehicleRows = await db
          .select({ categoryCode: riderOnboardingVehicleTypes.categoryCode })
          .from(riderOnboardingVehicleTypes)
          .where(eq(riderOnboardingVehicleTypes.isActive, true));
        const codesWithActiveVehicles = new Set(
          activeVehicleRows
            .map((r) => r.categoryCode)
            .filter((code): code is string => Boolean(code))
        );
        categoryRows = rows.filter((row) => codesWithActiveVehicles.has(row.code));
      }

      return {
        rows: categoryRows.map((row) => ({
          id: row.id,
          code: row.code,
          label: row.label,
          hint: row.hint,
          icon: row.icon,
          wheelCount: row.wheelCount,
          sortOrder: row.sortOrder,
          isActive: row.isActive,
        })),
      };
    }
  );

  app.get(
    "/category-service-assignments",
    {
      // Platform config matrix — not rider-specific. Skip JWT/device-session DB
      // so a busy pool cannot hang this boot-critical call for 30s+.
      config: { skipAuth: true },
      schema: {
        response: {
          200: z.object({
            rows: z.array(
              z.object({
                categoryCode: z.string(),
                serviceType: z.enum(["food", "parcel", "person_ride"]),
                isAssigned: z.boolean(),
              })
            ),
            byCategory: z.record(z.string(), z.array(z.enum(["food", "parcel", "person_ride"]))),
            vehicleRows: z.array(
              z.object({
                vehicleTypeCode: z.string(),
                serviceType: z.enum(["food", "parcel", "person_ride"]),
                isAssigned: z.boolean(),
                mapsToVehicleType: z.string().nullable(),
                categoryCode: z.string().nullable(),
                vehicleLabel: z.string(),
              })
            ),
            byMapsToVehicleType: z.record(
              z.string(),
              z.array(z.enum(["food", "parcel", "person_ride"]))
            ),
          }),
        },
      },
    },
    async () => {
      const { listCategoryServiceAssignmentsForApp } = await import(
        "../../lib/rider-vehicle-category-service-assignments.js"
      );
      const { listVehicleTypeServiceAssignmentsForApp } = await import(
        "../../lib/rider-vehicle-type-service-assignments.js"
      );

      const FALLBACK_BY_CATEGORY: Record<string, Array<"food" | "parcel" | "person_ride">> = {
        "2_wheeler": ["food", "parcel", "person_ride"],
        "3_wheeler": ["parcel", "person_ride"],
        "4_wheeler_non_ac": ["person_ride"],
        "4_wheeler_ac": ["person_ride"],
        "4_wheeler": ["person_ride"],
      };

      const withTimeout = <T,>(p: Promise<T>, ms: number): Promise<T> =>
        new Promise<T>((resolve, reject) => {
          const timer = setTimeout(() => reject(new Error(`db_timeout_${ms}ms`)), ms);
          p.then(
            (v) => {
              clearTimeout(timer);
              resolve(v);
            },
            (e) => {
              clearTimeout(timer);
              reject(e);
            }
          );
        });

      let rows: Awaited<ReturnType<typeof listCategoryServiceAssignmentsForApp>> = [];
      let vehicleRows: Awaited<ReturnType<typeof listVehicleTypeServiceAssignmentsForApp>> = [];
      try {
        const settled = await Promise.allSettled([
          withTimeout(listCategoryServiceAssignmentsForApp(), 5_000),
          withTimeout(listVehicleTypeServiceAssignmentsForApp(), 5_000),
        ]);
        if (settled[0].status === "fulfilled") rows = settled[0].value;
        else console.warn("[category-service-assignments] category query failed", settled[0].reason);
        if (settled[1].status === "fulfilled") vehicleRows = settled[1].value;
        else console.warn("[category-service-assignments] vehicle query failed", settled[1].reason);
      } catch (err) {
        console.warn("[category-service-assignments] unexpected failure", err);
      }

      const byCategory: Record<string, Array<"food" | "parcel" | "person_ride">> = {};
      for (const row of rows) {
        if (!row.isAssigned) continue;
        if (!byCategory[row.categoryCode]) byCategory[row.categoryCode] = [];
        byCategory[row.categoryCode]!.push(row.serviceType);
      }
      const categoryAssigned = new Set(
        rows.filter((r) => r.isAssigned).map((r) => `${r.categoryCode}::${r.serviceType}`)
      );
      const byMapsToVehicleType: Record<string, Array<"food" | "parcel" | "person_ride">> = {};
      for (const row of vehicleRows) {
        if (!row.isAssigned || !row.mapsToVehicleType?.trim()) continue;
        const catKey = `${row.categoryCode}::${row.serviceType}`;
        if (!categoryAssigned.has(catKey)) continue;
        const mapsKey = row.mapsToVehicleType.trim().toLowerCase();
        const codeKey = row.vehicleTypeCode.trim().toLowerCase();
        for (const key of [mapsKey, codeKey]) {
          if (!key) continue;
          if (!byMapsToVehicleType[key]) byMapsToVehicleType[key] = [];
          if (!byMapsToVehicleType[key]!.includes(row.serviceType)) {
            byMapsToVehicleType[key]!.push(row.serviceType);
          }
        }
      }

      if (Object.keys(byCategory).length === 0) {
        return {
          rows: [],
          byCategory: FALLBACK_BY_CATEGORY,
          vehicleRows: [],
          byMapsToVehicleType: {},
        };
      }

      return { rows, byCategory, vehicleRows, byMapsToVehicleType };
    }
  );

  app.get(
    "/document-types",
    {
      schema: {
        querystring: z.object({
          includeInactive: z.enum(["true", "false"]).optional(),
          captureGroup: z.enum(["dl_rc", "rental_ev"]).optional(),
        }),
        response: {
          200: z.object({
            rows: z.array(
              z.object({
                id: z.number(),
                code: z.string(),
                label: z.string(),
                hint: z.string().nullable(),
                icon: z.string().nullable(),
                captureGroup: z.enum(["dl_rc", "rental_ev"]),
                requiresTextField: z.boolean(),
                textFieldLabel: z.string().nullable(),
                textFieldPlaceholder: z.string().nullable(),
                minTextLength: z.number(),
                sortOrder: z.number(),
                isActive: z.boolean(),
              })
            ),
          }),
        },
      },
    },
    async (req) => {
      const query = req.query as {
        includeInactive?: string;
        captureGroup?: "dl_rc" | "rental_ev";
      };
      const includeInactive = query.includeInactive === "true";
      const db = getDb();

      const conditions = [];
      if (!includeInactive) {
        conditions.push(eq(riderOnboardingDocumentTypes.isActive, true));
      }
      if (query.captureGroup) {
        conditions.push(eq(riderOnboardingDocumentTypes.captureGroup, query.captureGroup));
      }

      const rows = await db
        .select()
        .from(riderOnboardingDocumentTypes)
        .where(conditions.length ? and(...conditions) : undefined)
        .orderBy(
          asc(riderOnboardingDocumentTypes.captureGroup),
          asc(riderOnboardingDocumentTypes.sortOrder),
          asc(riderOnboardingDocumentTypes.id)
        );

      return {
        rows: rows.map((row) => ({
          id: row.id,
          code: row.code,
          label: row.label,
          hint: row.hint,
          icon: row.icon,
          captureGroup: row.captureGroup as "dl_rc" | "rental_ev",
          requiresTextField: row.requiresTextField,
          textFieldLabel: row.textFieldLabel,
          textFieldPlaceholder: row.textFieldPlaceholder,
          minTextLength: row.minTextLength,
          sortOrder: row.sortOrder,
          isActive: row.isActive,
        })),
      };
    }
  );

  app.post(
    "/check-aadhaar",
    {
      schema: {
        body: z.object({
          aadhaarNumber: z.string().min(1).max(20),
          riderId: z.string().optional(),
        }),
        response: {
          200: z.object({
            registered: z.boolean(),
          }),
        },
      },
    },
    async (req) => {
      const { aadhaarNumber, riderId } = req.body as {
        aadhaarNumber: string;
        riderId?: string;
      };
      const digits = normalizeAadhaarDigits(aadhaarNumber);
      if (!digits) {
        return { registered: false };
      }
      const excludeId = riderId ? parseInt(riderId, 10) : undefined;
      const registered = await isAadhaarAlreadyRegistered(
        digits,
        excludeId != null && !Number.isNaN(excludeId) ? excludeId : undefined
      );
      return { registered };
    }
  );

  app.post(
    "/check-pan",
    {
      schema: {
        body: z.object({
          panNumber: z.string().min(1).max(15),
          riderId: z.string().optional(),
        }),
        response: {
          200: z.object({
            registered: z.boolean(),
          }),
        },
      },
    },
    async (req) => {
      const { panNumber, riderId } = req.body as {
        panNumber: string;
        riderId?: string;
      };
      const pan = normalizePan(panNumber);
      if (!pan) {
        return { registered: false };
      }
      const excludeId = riderId ? parseInt(riderId, 10) : undefined;
      const registered = await isPanAlreadyRegistered(
        pan,
        excludeId != null && !Number.isNaN(excludeId) ? excludeId : undefined
      );
      return { registered };
    }
  );

  app.post(
    "/check-dl",
    {
      schema: {
        body: z.object({
          dlNumber: z.string().min(1).max(32),
          riderId: z.string().optional(),
        }),
        response: {
          200: z.object({
            registered: z.boolean(),
          }),
        },
      },
    },
    async (req) => {
      const { dlNumber, riderId } = req.body as {
        dlNumber: string;
        riderId?: string;
      };
      const dl = normalizeDlNumber(dlNumber);
      if (!dl) {
        return { registered: false };
      }
      const excludeId = riderId ? parseInt(riderId, 10) : undefined;
      const registered = await isDlAlreadyRegistered(
        dl,
        excludeId != null && !Number.isNaN(excludeId) ? excludeId : undefined
      );
      return { registered };
    }
  );

  app.post(
    "/check-rc",
    {
      schema: {
        body: z.object({
          rcNumber: z.string().min(1).max(32),
          riderId: z.string().optional(),
        }),
        response: {
          200: z.object({
            registered: z.boolean(),
          }),
        },
      },
    },
    async (req) => {
      const { rcNumber, riderId } = req.body as {
        rcNumber: string;
        riderId?: string;
      };
      const rc = normalizeRcNumber(rcNumber);
      if (!rc) {
        return { registered: false };
      }
      const excludeId = riderId ? parseInt(riderId, 10) : undefined;
      const registered = await isRcAlreadyRegistered(
        rc,
        excludeId != null && !Number.isNaN(excludeId) ? excludeId : undefined
      );
      return { registered };
    }
  );

  // Save onboarding step progress
  app.post(
    "/save-step",
    {
      schema: {
        body: z.object({
          riderId: z.string(),
          step: z.enum(["aadhaar_name", "dl_rc", "rental_ev", "pan_selfie", "location"]),
          data: z.object({
            aadhaarNumber: z.string().optional(),
            fullName: z.string().optional(),
            dob: z.string().optional(),
            fileUrl: z.string().optional(),
            verificationMethod: z.string().optional(),
            dlNumber: z.string().optional(),
            rcNumber: z.string().optional(),
            hasOwnVehicle: z.boolean().optional(),
            vehicleChoice: z.string().optional(),
            vehicleCategoryCode: z.string().optional(),
            /** Specific model name when catalog label lists multiple models (e.g. "Hyundai i10"). */
            vehicleModelLabel: z.string().optional(),
            onboardingFlow: z.enum(["dl_rc", "rental_ev", "payment"]).optional(),
            submitVehicleDocs: z.boolean().optional(),
            rentalProofSignedUrl: z.string().optional(),
            evProofSignedUrl: z.string().optional(),
            maxSpeedDeclaration: z.number().optional(),
            panNumber: z.string().optional(),
            selfieSignedUrl: z.string().optional(),
            lat: z.number().optional(),
            lon: z.number().optional(),
            city: z.string().optional(),
            state: z.string().optional(),
            pincode: z.string().optional(),
            address: z.string().optional(),
          }),
        }),
        response: {
          200: z.object({ success: z.boolean() }),
          409: z.object({
            error: z.string(),
            message: z.string(),
          }),
        },
      },
    },
    async (req, reply) => {
      const { riderId, step, data: stepData } = req.body as {
        riderId: string;
        step: string;
        data: Record<string, unknown>;
      };

      const db = getDb();

      // Convert riderId string to integer
      const riderIdInt = parseInt(riderId);
      if (isNaN(riderIdInt)) {
        throw new Error("Invalid rider ID");
      }

      // Verify rider exists
      const riderRows = await db.select().from(riders).where(eq(riders.id, riderIdInt)).limit(1);
      if (riderRows.length === 0) {
        throw new Error("Rider not found");
      }

      if (step === "aadhaar_name" && stepData.aadhaarNumber) {
        const digits = normalizeAadhaarDigits(String(stepData.aadhaarNumber));
        if (digits && (await isAadhaarAlreadyRegistered(digits, riderIdInt))) {
          return reply.code(409).send({
            error: "aadhaar_already_registered",
            message: "Aadhar Already Registered , Please try with Diff one .",
          });
        }
      }

      if (step === "pan_selfie" && stepData.panNumber) {
        const pan = normalizePan(String(stepData.panNumber));
        if (pan && (await isPanAlreadyRegistered(pan, riderIdInt))) {
          return reply.code(409).send({
            error: "pan_already_registered",
            message: "PAN Already Registered , Please try with Diff one .",
          });
        }
      }

      if (step === "dl_rc") {
        if (stepData.dlNumber) {
          const dl = normalizeDlNumber(String(stepData.dlNumber));
          if (dl && (await isDlAlreadyRegistered(dl, riderIdInt))) {
            return reply.code(409).send({
              error: "dl_already_registered",
              message: "Driving License Already Registered , Please try with Diff one .",
            });
          }
        }
        if (stepData.rcNumber) {
          const rc = normalizeRcNumber(String(stepData.rcNumber));
          if (rc && (await isRcAlreadyRegistered(rc, riderIdInt))) {
            return reply.code(409).send({
              error: "rc_already_registered",
              message: "RC Already Registered , Please try with Diff one .",
            });
          }
        }
      }

      // Advance onboarding only for document steps (not post-approval home location)
      if (step !== "location") {
        await db
          .update(riders)
          .set({
            onboardingStage: "KYC",
            updatedAt: new Date(),
          })
          .where(eq(riders.id, riderIdInt));
      }

      // Upsert rider documents based on step
      // Store document-specific data in metadata JSONB field
      if (step === "aadhaar_name") {
        const aadhaarDigits = stepData.aadhaarNumber
          ? normalizeAadhaarDigits(String(stepData.aadhaarNumber))
          : null;
        const aadhaarMasked = aadhaarDigits
          ? `${aadhaarDigits.slice(0, 4).replace(/\d/g, "X")}-${aadhaarDigits.slice(4, 8).replace(/\d/g, "X")}-${aadhaarDigits.slice(-4)}`
          : undefined;

        const digilockerVerified =
          stepData.verificationMethod === "cashfree_digilocker" ||
          stepData.verificationMethod === "cashfree_aadhaar_masking" ||
          String(stepData.fileUrl || "").includes("digilocker_verified") ||
          String(stepData.fileUrl || "").includes("aadhaar_masking_verified");

        let dobIso: string | undefined;
        if (typeof stepData.dob === "string" && stepData.dob.trim()) {
          const raw = stepData.dob.trim();
          const ymd = raw.match(/^(\d{4}-\d{2}-\d{2})/);
          if (ymd?.[1]) dobIso = ymd[1];
          else {
            const dmy = raw.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
            if (dmy) {
              dobIso = `${dmy[3]}-${dmy[2]!.padStart(2, "0")}-${dmy[1]!.padStart(2, "0")}`;
            }
          }
        }

        const riderUpdate: {
          name?: string;
          aadhaarNumber?: string;
          dob?: string;
          updatedAt: Date;
        } = { updatedAt: new Date() };

        if (typeof stepData.fullName === "string" && stepData.fullName.trim()) {
          riderUpdate.name = stepData.fullName.trim();
        }
        if (aadhaarDigits) {
          riderUpdate.aadhaarNumber = aadhaarDigits;
        }
        if (dobIso) {
          riderUpdate.dob = dobIso;
        }

        if (riderUpdate.name || riderUpdate.aadhaarNumber || riderUpdate.dob) {
          await db.update(riders).set(riderUpdate).where(eq(riders.id, riderIdInt));
        }

        // Check if document exists
        const existing = await db
          .select()
          .from(riderDocuments)
          .where(and(
            eq(riderDocuments.riderId, riderIdInt),
            eq(riderDocuments.docType, "aadhaar")
          ))
          .limit(1);

        const sideVerification = digilockerVerified
          ? {
              front: {
                verified: true,
                verificationStatus: "approved",
                verifiedAt: new Date().toISOString(),
              },
              back: {
                verified: true,
                verificationStatus: "approved",
                verifiedAt: new Date().toISOString(),
              },
            }
          : undefined;

        const metadata = {
          aadhaarMasked: aadhaarMasked,
          aadhaarNumber: aadhaarDigits || undefined,
          fullName: stepData.fullName as string | undefined,
          dob: dobIso,
          digilockerVerified: digilockerVerified || undefined,
          verificationMethod: stepData.verificationMethod as string | undefined,
          ...(sideVerification ? { sideVerification } : {}),
        };

        const docFields = {
          extractedName: stepData.fullName as string | undefined,
          extractedDob: dobIso || undefined,
          docNumber: aadhaarDigits || undefined,
          metadata,
          ...(digilockerVerified
            ? {
                verified: true,
                verificationStatus: "auto_verified" as const,
                verificationMethod: "APP_VERIFIED" as const,
                verifiedAt: new Date(),
                rejectedReason: null,
                requiresManualReview: false,
                fileUrl: (stepData.fileUrl as string) || "digilocker_verified",
              }
            : {}),
        };

        if (existing.length > 0) {
          await db
            .update(riderDocuments)
            .set({
              ...docFields,
              docNumber: aadhaarDigits || existing[0]!.docNumber,
            })
            .where(eq(riderDocuments.id, existing[0]!.id));
        } else {
          await db.insert(riderDocuments).values({
            riderId: riderIdInt,
            docType: "aadhaar",
            fileUrl: (stepData.fileUrl as string) || (digilockerVerified ? "digilocker_verified" : "pending"),
            docNumber: aadhaarDigits || null,
            extractedName: stepData.fullName as string | undefined,
            extractedDob: dobIso || null,
            metadata,
            ...(digilockerVerified
              ? {
                  verified: true,
                  verificationStatus: "auto_verified" as const,
                  verificationMethod: "APP_VERIFIED" as const,
                  verifiedAt: new Date(),
                  requiresManualReview: false,
                }
              : {}),
          });
        }
      } else if (step === "dl_rc") {
        const selectionMeta: Record<string, unknown> = {
          vehicleChoice:
            typeof stepData.vehicleChoice === "string" ? stepData.vehicleChoice : undefined,
          vehicleCategoryCode:
            typeof stepData.vehicleCategoryCode === "string"
              ? stepData.vehicleCategoryCode
              : undefined,
          // Store only the single chosen model name — never slash/comma-joined catalog labels.
          vehicleModelLabel: (() => {
            if (typeof stepData.vehicleModelLabel !== "string") return undefined;
            const raw = stepData.vehicleModelLabel.trim();
            if (!raw) return undefined;
            if (raw.includes(" / ")) return raw.split(" / ")[0]!.trim() || undefined;
            if (raw.includes(",")) {
              return raw.split(",")[0]!.trim().replace(/\.\.+$/, "").trim() || undefined;
            }
            return raw;
          })(),
          onboardingFlow:
            stepData.onboardingFlow === "dl_rc" ||
            stepData.onboardingFlow === "rental_ev" ||
            stepData.onboardingFlow === "payment"
              ? stepData.onboardingFlow
              : undefined,
        };

        const submitVehicleDocs = stepData.submitVehicleDocs === true;

        if (
          selectionMeta.vehicleChoice ||
          selectionMeta.vehicleCategoryCode ||
          selectionMeta.vehicleModelLabel ||
          selectionMeta.onboardingFlow ||
          submitVehicleDocs
        ) {
          const existingSelection = await db
            .select()
            .from(riderDocuments)
            .where(
              and(
                eq(riderDocuments.riderId, riderIdInt),
                eq(riderDocuments.docType, "onboarding_vehicle_selection")
              )
            )
            .limit(1);

          const prevMeta =
            existingSelection[0]?.metadata &&
            typeof existingSelection[0].metadata === "object"
              ? (existingSelection[0].metadata as Record<string, unknown>)
              : {};
          const prevChoice =
            typeof prevMeta.vehicleChoice === "string" ? prevMeta.vehicleChoice.trim() : "";
          const nextChoice =
            typeof selectionMeta.vehicleChoice === "string"
              ? selectionMeta.vehicleChoice.trim()
              : prevChoice;
          const choiceChanged = Boolean(nextChoice && prevChoice && nextChoice !== prevChoice);

          const mergedMeta: Record<string, unknown> = {
            ...prevMeta,
            ...Object.fromEntries(
              Object.entries(selectionMeta).filter(([, value]) => value !== undefined)
            ),
          };

          if (submitVehicleDocs && nextChoice) {
            mergedMeta.vehicleDocsSubmittedFor = nextChoice;
            mergedMeta.vehicleDocsSubmittedAt = new Date().toISOString();
          } else if (choiceChanged) {
            delete mergedMeta.vehicleDocsSubmittedFor;
            delete mergedMeta.vehicleDocsSubmittedAt;
          }

          if (existingSelection.length > 0) {
            await db
              .update(riderDocuments)
              .set({ metadata: mergedMeta })
              .where(eq(riderDocuments.id, existingSelection[0]!.id));
          } else {
            await db.insert(riderDocuments).values({
              riderId: riderIdInt,
              docType: "onboarding_vehicle_selection",
              fileUrl: "n/a",
              metadata: mergedMeta,
            });
          }
        }

        // Upsert DL document
        if (stepData.dlNumber) {
          const dlNormalized = normalizeDlNumber(String(stepData.dlNumber));
          const existingDl = await db
            .select()
            .from(riderDocuments)
            .where(and(
              eq(riderDocuments.riderId, riderIdInt),
              eq(riderDocuments.docType, "dl")
            ))
            .limit(1);

          const metadata = {
            dlNumber: dlNormalized || String(stepData.dlNumber),
          };

          if (existingDl.length > 0) {
            await db
              .update(riderDocuments)
              .set({
                docNumber: dlNormalized || existingDl[0]!.docNumber,
                metadata: metadata,
              })
              .where(eq(riderDocuments.id, existingDl[0]!.id));
          } else {
            await db.insert(riderDocuments).values({
              riderId: riderIdInt,
              docType: "dl",
              fileUrl: stepData.fileUrl as string || "pending",
              docNumber: dlNormalized || null,
              metadata: metadata,
            });
          }
        }

        // Upsert RC document
        if (stepData.rcNumber) {
          const rcNormalized = normalizeRcNumber(String(stepData.rcNumber));
          const existingRc = await db
            .select()
            .from(riderDocuments)
            .where(and(
              eq(riderDocuments.riderId, riderIdInt),
              eq(riderDocuments.docType, "rc")
            ))
            .limit(1);

          const prevMeta =
            existingRc[0]?.metadata &&
            typeof existingRc[0].metadata === "object" &&
            !Array.isArray(existingRc[0].metadata)
              ? (existingRc[0].metadata as Record<string, unknown>)
              : {};
          const nextRc = rcNormalized || String(stepData.rcNumber);
          const prevRcNorm = normalizeRcNumber(
            String(existingRc[0]?.docNumber || prevMeta.rcNumber || ""),
          );
          const plateChangedOnSave =
            Boolean(prevRcNorm) &&
            Boolean(rcNormalized) &&
            prevRcNorm !== rcNormalized;

          // Merge — never wipe cashfreeVerifiedData from a prior Verify Instantly.
          const metadata: Record<string, unknown> = {
            ...prevMeta,
            rcNumber: nextRc,
          };
          if (plateChangedOnSave) {
            // Continue with a different plate without re-verify must not keep
            // old Cashfree payload / owner as if it belonged to the new RC.
            delete metadata.cashfreeVerifiedData;
            delete metadata.rcOwnerName;
            delete metadata.cashfreeProvider;
          }

          if (existingRc.length > 0) {
            await db
              .update(riderDocuments)
              .set({
                docNumber: rcNormalized || existingRc[0]!.docNumber,
                metadata: metadata,
              })
              .where(eq(riderDocuments.id, existingRc[0]!.id));
          } else {
            await db.insert(riderDocuments).values({
              riderId: riderIdInt,
              docType: "rc",
              fileUrl: stepData.fileUrl as string || "pending",
              docNumber: rcNormalized || null,
              metadata: metadata,
            });
          }
        }
      } else if (step === "rental_ev") {
        const docCode =
          (typeof stepData.uploadedDocCode === "string" && stepData.uploadedDocCode.trim()) ||
          (stepData.rentalProofSignedUrl ? "rental_proof" : stepData.evProofSignedUrl ? "ev_proof" : null);
        const signedUrl =
          (typeof stepData.uploadedDocSignedUrl === "string" && stepData.uploadedDocSignedUrl.trim()) ||
          (stepData.rentalProofSignedUrl as string | undefined) ||
          (stepData.evProofSignedUrl as string | undefined);
        const oldKey = signedUrl ? extractKeyFromSignedUrl(signedUrl) : null;

        if (!docCode || !signedUrl) {
          throw new Error("Rental/EV document upload is required");
        }

        let oldSignedUrl: string | null = null;
        const existing = await db
          .select()
          .from(riderDocuments)
          .where(and(
            eq(riderDocuments.riderId, riderIdInt),
            eq(riderDocuments.docType, docCode as never)
          ))
          .limit(1);

        if (existing.length > 0) {
          oldSignedUrl = existing[0]!.fileUrl || null;
        }

        const metadata = {
          uploadedDocCode: docCode,
          uploadedDocSignedUrl: signedUrl,
          rentalProofSignedUrl: stepData.rentalProofSignedUrl as string | undefined,
          evProofSignedUrl: stepData.evProofSignedUrl as string | undefined,
          maxSpeedDeclaration: stepData.maxSpeedDeclaration as number | undefined,
        };

        try {
          if (existing.length > 0) {
            await db
              .update(riderDocuments)
              .set({
                fileUrl: signedUrl,
                metadata: metadata,
              })
              .where(eq(riderDocuments.id, existing[0]!.id));
          } else {
            await db.insert(riderDocuments).values({
              riderId: riderIdInt,
              docType: docCode as never,
              fileUrl: signedUrl,
              metadata: metadata,
            });
          }

          // If new file uploaded and old file exists, delete old file from R2
          if (oldSignedUrl && oldKey && oldKey !== extractKeyFromSignedUrl(signedUrl)) {
            try {
              await deleteFromR2(oldKey);
            } catch (deleteError) {
              console.error("Failed to delete old R2 file (non-critical):", deleteError);
            }
          }
        } catch (dbError) {
          // Rollback: Delete new file from R2 if DB save failed
          if (signedUrl && oldKey) {
            try {
              await deleteFromR2(oldKey);
            } catch (rollbackError) {
              console.error("Failed to rollback R2 upload:", rollbackError);
            }
          }
          throw dbError;
        }
      } else if (step === "pan_selfie") {
        const panPartial = stepData.panNumber
          ? `${stepData.panNumber.toString().slice(0, 5).replace(/./g, "X")}${stepData.panNumber.toString().slice(-5)}`
          : undefined;

        const riderPanUpdate: {
          panNumber?: string;
          selfieUrl?: string;
          updatedAt: Date;
        } = { updatedAt: new Date() };

        if (typeof stepData.panNumber === "string" && stepData.panNumber.trim()) {
          riderPanUpdate.panNumber = stepData.panNumber.trim().toUpperCase();
        }
        if (typeof stepData.selfieSignedUrl === "string" && stepData.selfieSignedUrl.trim()) {
          riderPanUpdate.selfieUrl = stepData.selfieSignedUrl.trim();
        }

        if (riderPanUpdate.panNumber || riderPanUpdate.selfieUrl) {
          await db.update(riders).set(riderPanUpdate).where(eq(riders.id, riderIdInt));
        }

        // Upsert PAN (no R2 involved)
        if (panPartial) {
          const panNormalized =
            typeof stepData.panNumber === "string"
              ? normalizePan(stepData.panNumber)
              : null;
          const existingPan = await db
            .select()
            .from(riderDocuments)
            .where(and(
              eq(riderDocuments.riderId, riderIdInt),
              eq(riderDocuments.docType, "pan")
            ))
            .limit(1);

          const metadata = {
            ...(existingPan[0]?.metadata &&
            typeof existingPan[0].metadata === "object" &&
            !Array.isArray(existingPan[0].metadata)
              ? (existingPan[0].metadata as Record<string, unknown>)
              : {}),
            panPartial: panPartial,
            panNumber: panNormalized || undefined,
          };

          if (existingPan.length > 0) {
            await db
              .update(riderDocuments)
              .set({
                docNumber: panNormalized || existingPan[0]!.docNumber,
                metadata: metadata,
              })
              .where(eq(riderDocuments.id, existingPan[0]!.id));
          } else {
            await db.insert(riderDocuments).values({
              riderId: riderIdInt,
              docType: "pan",
              fileUrl: stepData.fileUrl as string || "pending",
              docNumber: panNormalized || null,
              metadata: metadata,
            });
          }
        }

        // Upsert Selfie (with R2 rollback)
        if (stepData.selfieSignedUrl) {
          const selfieSignedUrl = stepData.selfieSignedUrl as string;
          const selfieKey = extractKeyFromSignedUrl(selfieSignedUrl);

          let oldSelfieUrl: string | null = null;
          const existingSelfie = await db
            .select()
            .from(riderDocuments)
            .where(and(
              eq(riderDocuments.riderId, riderIdInt),
              eq(riderDocuments.docType, "selfie")
            ))
            .limit(1);

          if (existingSelfie.length > 0) {
            oldSelfieUrl = (existingSelfie[0]!.metadata as any)?.selfieSignedUrl || null;
          }

          const metadata = {
            selfieSignedUrl: selfieSignedUrl,
          };

          try {
            if (existingSelfie.length > 0) {
              await db
                .update(riderDocuments)
                .set({
                  fileUrl: selfieSignedUrl,
                  metadata: metadata,
                })
                .where(eq(riderDocuments.id, existingSelfie[0]!.id));
            } else {
              await db.insert(riderDocuments).values({
                riderId: riderIdInt,
                docType: "selfie",
                fileUrl: selfieSignedUrl,
                metadata: metadata,
              });
            }

            // Delete old selfie from R2 if different
            if (oldSelfieUrl) {
              const oldKey = extractKeyFromSignedUrl(oldSelfieUrl);
              if (oldKey && oldKey !== selfieKey) {
                try {
                  await deleteFromR2(oldKey);
                } catch (deleteError) {
                  console.error("Failed to delete old selfie from R2 (non-critical):", deleteError);
                }
              }
            }
          } catch (dbError) {
            // Rollback: Delete new selfie from R2 if DB save failed
            if (selfieKey) {
              try {
                await deleteFromR2(selfieKey);
              } catch (rollbackError) {
                console.error("Failed to rollback R2 selfie upload:", rollbackError);
              }
            }
            throw dbError;
          }
        }

        try {
          const { maybeAutoVerifyRiderSelfie } = await import(
            "../../lib/rider-selfie-auto-verify.js"
          );
          await maybeAutoVerifyRiderSelfie(riderIdInt);
        } catch (selfieErr) {
          console.warn(
            "[save-step pan_selfie] selfie auto-verify failed:",
            (selfieErr as Error).message,
          );
        }
      } else if (step === "location") {
        // Update rider location data
        const updateData: {
          lat?: number;
          lon?: number;
          city?: string;
          state?: string;
          pincode?: string;
          address?: string;
          updatedAt: Date;
        } = {
          updatedAt: new Date(),
        };

        if (stepData.lat !== undefined && stepData.lat !== null) {
          updateData.lat = parseFloat(Number(stepData.lat).toFixed(8));
        }
        if (stepData.lon !== undefined && stepData.lon !== null) {
          updateData.lon = parseFloat(Number(stepData.lon).toFixed(8));
        }
        if (stepData.city !== undefined) {
          updateData.city = stepData.city as string;
        }
        if (stepData.state !== undefined) {
          updateData.state = stepData.state as string;
        }
        if (stepData.pincode !== undefined) {
          updateData.pincode = stepData.pincode as string;
        }
        if (stepData.address !== undefined) {
          updateData.address = stepData.address as string;
        }

        await db
          .update(riders)
          .set(updateData)
          .where(eq(riders.id, riderIdInt));
      }

      // Fire-and-forget: kick off any auto verifications that this step
      // unlocked. Every policy starts on mode='manual' so this is a no-op
      // until admin flips a slot to auto/hybrid via the policy center.
      // Errors are logged, never thrown — /save-step still returns 200.
      void (async () => {
        try {
          const { triggerRiderOnboardingVerifications } = await import(
            "../verification/onboarding-hooks.js"
          );
          let dob =
            typeof stepData.dob === "string" ? stepData.dob.slice(0, 10) : undefined;
          if (
            (!dob || !/^\d{4}-\d{2}-\d{2}$/.test(dob)) &&
            step === "dl_rc" &&
            typeof stepData.dlNumber === "string" &&
            stepData.dlNumber.trim()
          ) {
            const riderDob = String(riderRows[0]?.dob || "").slice(0, 10);
            if (/^\d{4}-\d{2}-\d{2}$/.test(riderDob)) {
              dob = riderDob;
            } else {
              const { loadRiderAadhaarIdentity } = await import(
                "../../lib/rider-aadhaar-cross-check.js"
              );
              const identity = await loadRiderAadhaarIdentity(riderIdInt);
              const idDob = String(identity.dob || "").slice(0, 10);
              if (/^\d{4}-\d{2}-\d{2}$/.test(idDob)) dob = idDob;
            }
          }
          await triggerRiderOnboardingVerifications(
            {
              logger: req.log,
              riderId: riderIdInt,
              step: step as
                | "aadhaar_name" | "dl_rc" | "rental_ev" | "pan_selfie" | "location",
              // DL/RC step implies own-vehicle flow; avoid subject_filter misses.
              hasOwnVehicle:
                step === "dl_rc" ? true : stepData.hasOwnVehicle === true,
            },
            {
              aadhaarNumber: stepData.aadhaarNumber as string | undefined,
              fullName: stepData.fullName as string | undefined,
              panNumber: stepData.panNumber as string | undefined,
              dlNumber: stepData.dlNumber as string | undefined,
              rcNumber: stepData.rcNumber as string | undefined,
              dob,
            },
          );
        } catch (e) {
          req.log.warn({ err: (e as Error).message }, "rider_auto_verify_hook_failed");
        }
      })();

      return { success: true };
    },
  );

  // Submit complete onboarding
  app.post(
    "/submit",
    {
      schema: {
        body: z.object({
          riderId: z.string(),
          data: z.object({
            aadhaarNumber: z.string(),
            fullName: z.string(),
            dlNumber: z.string().optional(),
            rcNumber: z.string().optional(),
            hasOwnVehicle: z.boolean(),
            rentalProofSignedUrl: z.string().optional(),
            evProofSignedUrl: z.string().optional(),
            maxSpeedDeclaration: z.number().optional(),
            panNumber: z.string(),
            selfieSignedUrl: z.string(),
            lat: z.number().optional(),
            lon: z.number().optional(),
            city: z.string().optional(),
            state: z.string().optional(),
            pincode: z.string().optional(),
            address: z.string().optional(),
          }),
        }),
        response: {
          200: z.object({
            riderId: z.string(),
            onboardingStatus: z.literal("in_progress"),
          }),
        },
      },
    },
    async (req) => {
      const { riderId, data } = req.body as {
        riderId: string;
        data: Record<string, unknown>;
      };

      const db = getDb();

      // Convert riderId string to integer
      const riderIdInt = parseInt(riderId);
      if (isNaN(riderIdInt)) {
        throw new Error("Invalid rider ID");
      }

      // Verify rider exists
      const riderRows = await db.select().from(riders).where(eq(riders.id, riderIdInt)).limit(1);
      if (riderRows.length === 0) {
        throw new Error("Rider not found");
      }

      // Update rider with name and set status to in_progress (awaiting payment)
      // After payment, it will move to pending_approval
      const updateData: {
        name: string;
        onboardingStage: "KYC";
        lat?: number;
        lon?: number;
        city?: string;
        state?: string;
        pincode?: string;
        address?: string;
        updatedAt: Date;
      } = {
        name: data.fullName as string,
        onboardingStage: "KYC",
        updatedAt: new Date(),
      };

      // Include location data if provided
      if (data.lat !== undefined && data.lat !== null) {
        updateData.lat = parseFloat(Number(data.lat).toFixed(8));
      }
      if (data.lon !== undefined && data.lon !== null) {
        updateData.lon = parseFloat(Number(data.lon).toFixed(8));
      }
      if (data.city !== undefined) {
        updateData.city = data.city as string;
      }
      if (data.state !== undefined) {
        updateData.state = data.state as string;
      }
      if (data.pincode !== undefined) {
        updateData.pincode = data.pincode as string;
      }
      if (data.address !== undefined) {
        updateData.address = data.address as string;
      }

      await db
        .update(riders)
        .set(updateData)
        .where(eq(riders.id, riderIdInt));

      // All documents should already be saved via save-step endpoints
      // This endpoint finalizes document submission
      // Next step: rider needs to complete payment

      return {
        riderId: riderIdInt.toString(),
        onboardingStatus: "in_progress" as const,
      };
    },
  );

  // Get rider onboarding fee config (amount, GST, copy)
  app.get(
    "/fee-config",
    {
      schema: {
        response: {
          200: z.object({
            standardOnboardingFee: z.string(),
            discountedOnboardingFee: z.string(),
            discountPercent: z.string(),
            gstPercent: z.string(),
            discountPeriodLabel: z.string(),
            headline: z.string(),
            subtitle: z.string(),
            feeLabel: z.string(),
            infoMessage: z.string(),
            alertNotice: z.string(),
            footerNote: z.string(),
            payButtonText: z.string().nullable(),
            subtotalPaise: z.number(),
            gstAmountPaise: z.number(),
            totalPaise: z.number(),
          }),
        },
      },
    },
    async () => {
      const { getRiderOnboardingCommissionConfig, computeRiderOnboardingCheckoutPaise } =
        await import("../../lib/rider-onboarding-commission-config.js");
      const config = await getRiderOnboardingCommissionConfig();
      const checkout = computeRiderOnboardingCheckoutPaise(config);
      return {
        standardOnboardingFee: config.standardOnboardingFee,
        discountedOnboardingFee: config.discountedOnboardingFee,
        discountPercent: config.discountPercent,
        gstPercent: config.gstPercent,
        discountPeriodLabel: config.discountPeriodLabel,
        headline: config.headline,
        subtitle: config.subtitle,
        feeLabel: config.feeLabel,
        infoMessage: config.infoMessage,
        alertNotice: config.alertNotice,
        footerNote: config.footerNote,
        payButtonText: config.payButtonText,
        subtotalPaise: checkout.subtotalPaise,
        gstAmountPaise: checkout.gstAmountPaise,
        totalPaise: checkout.totalPaise,
      };
    }
  );

  // Get rider status
  app.get(
    "/:riderId/status",
    {
      schema: {
        params: z.object({
          riderId: z.string(),
        }),
        response: {
          200: z.object({
            riderId: z.string(),
            onboardingStatus: z.string(),
            approvalStatus: z.string(),
          }),
        },
      },
    },
    async (req) => {
      const { riderId } = req.params as { riderId: string };

      // Convert riderId string to integer
      const riderIdInt = parseInt(riderId);
      if (isNaN(riderIdInt)) {
        throw new Error("Invalid rider ID");
      }

      const { resolveRiderOnboardingStatusForApp } = await import(
        "../../lib/rider-onboarding-status.js"
      );
      const resolved = await resolveRiderOnboardingStatusForApp(riderIdInt);
      if (!resolved) {
        throw new Error("Rider not found");
      }

      return {
        riderId: resolved.rider.id.toString(),
        onboardingStatus: resolved.onboardingStatus,
        approvalStatus: resolved.approvalStatus,
      };
    },
  );

  /**
   * GET /verification-modes — per-document verification mode for RIDER
   * onboarding, straight from the super-admin Policy Center (incl. kill switches).
   *   manual  → classic photo-upload step
   *   auto    → Cashfree first; failure blocks (no upload)
   *   hybrid  → Cashfree first; failure falls back to photo upload
   *
   * Aliases: `aadhaar` mirrors `aadhaar_digilocker` for app convenience.
   */
  app.get("/verification-modes", async () => {
    try {
      const { resolveEffectivePolicy } = await import("../verification/policy/engine.js");
      const kinds = [
        "pan",
        "driving_licence",
        "vehicle_rc",
        "aadhaar_digilocker",
        "bank_account",
      ] as const;
      const modes: Record<string, string> = {};
      for (const documentKind of kinds) {
        const policy = await resolveEffectivePolicy({
          subjectType: "rider",
          documentKind,
        });
        modes[documentKind] = policy.mode;
      }
      // App-friendly alias used by Step 1 Aadhaar UI.
      modes.aadhaar = modes.aadhaar_digilocker ?? "manual";
      return { success: true, modes };
    } catch {
      // Degrade to manual — the app then shows the classic upload flow.
      return { success: true, modes: {} };
    }
  });

  /**
   * POST /verify-document — interactive electronic verification for the rider
   * app's onboarding steps (PAN / DL / RC / Aadhaar DigiLocker).
   */
  app.post(
    "/verify-document",
    {
      schema: {
        body: z.object({
          riderId: z.string(),
          docKind: z.enum(["pan", "driving_licence", "vehicle_rc", "aadhaar", "bank_account"]),
          aadhaarNumber: z.string().optional(),
          pan: z.string().optional(),
          name: z.string().optional(),
          dlNumber: z.string().optional(),
          dob: z.string().optional(),
          vehicleNumber: z.string().optional(),
          bankAccount: z.string().optional(),
          ifsc: z.string().optional(),
          redirectUrl: z.string().url().optional(),
        }),
      },
    },
    async (req, reply) => {
      const b = req.body as {
        riderId: string;
        docKind: "pan" | "driving_licence" | "vehicle_rc" | "aadhaar" | "bank_account";
        aadhaarNumber?: string;
        pan?: string;
        name?: string;
        dlNumber?: string;
        dob?: string;
        vehicleNumber?: string;
        bankAccount?: string;
        ifsc?: string;
        redirectUrl?: string;
      };
      const riderIdInt = parseInt(b.riderId, 10);
      if (!Number.isFinite(riderIdInt) || riderIdInt < 1) {
        return reply.code(400).send({ success: false, error: "invalid_rider_id" });
      }

      const db = getDb();
      const riderRows = await db
        .select({ id: riders.id, name: riders.name, dob: riders.dob })
        .from(riders)
        .where(eq(riders.id, riderIdInt))
        .limit(1);
      if (riderRows.length === 0) {
        return reply.code(404).send({ success: false, error: "rider_not_found" });
      }
      const rider = riderRows[0]!;

      if (b.docKind === "aadhaar") {
        const digits = normalizeAadhaarDigits(b.aadhaarNumber);
        if (digits && (await isAadhaarAlreadyRegistered(digits, riderIdInt))) {
          return reply.code(409).send({
            success: false,
            error: "aadhaar_already_registered",
            message: "Aadhar Already Registered , Please try with Diff one .",
          });
        }
      } else if (b.docKind === "pan") {
        const pan = normalizePan(b.pan);
        if (pan && (await isPanAlreadyRegistered(pan, riderIdInt))) {
          return reply.code(409).send({
            success: false,
            error: "pan_already_registered",
            message: "PAN Already Registered , Please try with Diff one .",
          });
        }
      } else if (b.docKind === "driving_licence") {
        const dl = normalizeDlNumber(b.dlNumber);
        if (dl && (await isDlAlreadyRegistered(dl, riderIdInt))) {
          return reply.code(409).send({
            success: false,
            error: "dl_already_registered",
            message: "Driving License Already Registered , Please try with Diff one .",
          });
        }
      } else if (b.docKind === "vehicle_rc") {
        const rc = normalizeRcNumber(b.vehicleNumber);
        if (rc && (await isRcAlreadyRegistered(rc, riderIdInt))) {
          return reply.code(409).send({
            success: false,
            error: "rc_already_registered",
            message: "RC Already Registered , Please try with Diff one .",
          });
        }
      }

      const {
        submitPan,
        submitDrivingLicence,
        submitVehicleRc,
        submitBankAccount,
        submitDigilocker,
        resolveRiderDigilockerRedirectUrl,
      } = await import("../verification/service.js");
      const subject = {
        subjectType: "rider" as const,
        subjectId: riderIdInt,
        // DL/RC policies may historically use has_own_vehicle filter; this step
        // only runs for own-vehicle bike onboarding, so always pass true.
        subjectFacts:
          b.docKind === "driving_licence" || b.docKind === "vehicle_rc"
            ? { has_own_vehicle: true }
            : undefined,
      };

      try {
        let outcome;
        if (b.docKind === "aadhaar") {
          // Cashfree DigiLocker (browser consent) — replaces Aadhaar Masking.
          const redirectUrl = resolveRiderDigilockerRedirectUrl(b.redirectUrl);
          outcome = await submitDigilocker({
            ...subject,
            documents: ["AADHAAR"],
            redirectUrl,
            userFlow: "signin",
          });
        } else if (b.docKind === "pan") {
          const pan = (b.pan ?? "").trim().toUpperCase();
          if (!/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(pan)) {
            return reply.code(400).send({ success: false, error: "invalid_pan" });
          }
          const name = (b.name ?? rider.name ?? "").trim();
          if (name.length < 2) {
            return reply.code(400).send({ success: false, error: "name_required" });
          }
          outcome = await submitPan({ ...subject, pan, name });
        } else if (b.docKind === "driving_licence") {
          const dlNumber = (b.dlNumber ?? "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
          let dob = (b.dob ?? rider.dob ?? "").toString().slice(0, 10);
          if (!/^\d{4}-\d{2}-\d{2}$/.test(dob)) {
            // Fallback: DOB captured on verified Aadhaar document during Step 1.
            const { loadRiderAadhaarIdentity } = await import(
              "../../lib/rider-aadhaar-cross-check.js"
            );
            const identity = await loadRiderAadhaarIdentity(riderIdInt);
            dob = String(identity.dob || "").slice(0, 10);
          }
          if (!/^[A-Z]{2}[0-9]{2}(19|20)[0-9]{2}[0-9]{7,8}$/.test(dlNumber)) {
            return reply.code(400).send({ success: false, error: "invalid_dl" });
          }
          if (!/^\d{4}-\d{2}-\d{2}$/.test(dob)) {
            return reply.code(400).send({
              success: false,
              error: "dob_required",
              hint: "YYYY-MM-DD",
              message:
                "Date of birth from Aadhaar is required to verify driving licence with Cashfree.",
            });
          }
          outcome = await submitDrivingLicence({ ...subject, dlNumber, dob });
        } else if (b.docKind === "bank_account") {
          const bankAccount = String(b.bankAccount ?? "").replace(/\D/g, "");
          const ifsc = String(b.ifsc ?? "")
            .trim()
            .toUpperCase()
            .replace(/[^A-Z0-9]/g, "");
          if (!/^\d{9,18}$/.test(bankAccount)) {
            return reply.code(400).send({ success: false, error: "invalid_bank_account" });
          }
          if (!/^[A-Z]{4}0[A-Z0-9]{6}$/.test(ifsc)) {
            return reply.code(400).send({ success: false, error: "invalid_ifsc" });
          }
          const name = (b.name ?? rider.name ?? "").trim() || undefined;
          outcome = await submitBankAccount({
            ...subject,
            bankAccount,
            ifsc,
            name,
          });
        } else {
          const vehicleNumber = (b.vehicleNumber ?? "")
            .trim()
            .toUpperCase()
            .replace(/[^A-Z0-9]/g, "");
          if (vehicleNumber.length < 7) {
            return reply.code(400).send({ success: false, error: "invalid_vehicle_number" });
          }
          outcome = await submitVehicleRc({ ...subject, vehicleNumber });
        }

        if (outcome.kind === "auto") {
          const status = outcome.result.status;
          // DigiLocker create → hand consent URL to the app (openAuthSessionAsync).
          if (
            b.docKind === "aadhaar" &&
            status === "provider_processing"
          ) {
            const url = String(
              (outcome.result.verifiedData as { url?: string } | undefined)?.url ?? ""
            ).trim();
            if (url) {
              return reply.send({
                success: true,
                outcome: "digilocker",
                mode: outcome.policy.mode,
                url,
                redirectUrl: resolveRiderDigilockerRedirectUrl(b.redirectUrl),
                verificationId: outcome.result.verificationId,
              });
            }
            return reply.send({
              success: true,
              outcome: "manual",
              mode: outcome.policy.mode,
              reason: "digilocker_no_url",
            });
          }
          if (status === "verified") {
            const verifiedData = (outcome.result.verifiedData ?? {}) as Record<
              string,
              unknown
            >;

            // Identity docs only: cross-check PAN / DL against verified Aadhaar.
            // RC is vehicle ownership — owner may differ from the rider; do not match.
            // Bank: Cashfree name_match vs Aadhaar — mismatch → hybrid fallback form.
            if (b.docKind === "pan" || b.docKind === "driving_licence") {
              const {
                crossCheckRiderDocument,
                markRiderDocumentAadhaarMismatch,
              } = await import("../../lib/rider-aadhaar-cross-check.js");
              const cross = await crossCheckRiderDocument({
                riderId: riderIdInt,
                docKind: b.docKind,
                verifiedData,
              });
              if (!cross.ok) {
                try {
                  await markRiderDocumentAadhaarMismatch({
                    riderId: riderIdInt,
                    docKind: b.docKind,
                    cross,
                    verifiedData,
                  });
                } catch (markErr) {
                  req.log?.error?.(
                    { err: markErr, docKind: b.docKind },
                    "rider_cross_check_mark_failed",
                  );
                }
                return reply.send({
                  success: true,
                  outcome: "mismatch",
                  mode: outcome.policy.mode,
                  error:
                    cross.messages.join(". ") ||
                    "Auto Verification Failed – Data Mismatch",
                  mismatchReasons: cross.reasons,
                  mismatchMessages: cross.messages,
                  verifiedData: {
                    ...verifiedData,
                    crossCheck: {
                      ok: false,
                      reasons: cross.reasons,
                      messages: cross.messages,
                      aadhaar: cross.aadhaar,
                      extracted: cross.extracted,
                    },
                  },
                });
              }
            }

            if (b.docKind === "bank_account") {
              const nameMatch = String(verifiedData.name_match_result ?? "")
                .trim()
                .toUpperCase();
              const scoreRaw = verifiedData.name_match_score;
              const score =
                typeof scoreRaw === "number"
                  ? scoreRaw
                  : typeof scoreRaw === "string"
                    ? Number(scoreRaw)
                    : null;
              const scorePct =
                score != null && Number.isFinite(score)
                  ? score > 1
                    ? score
                    : score * 100
                  : null;
              const softFail =
                nameMatch === "NO" ||
                nameMatch === "FALSE" ||
                nameMatch === "MISMATCH" ||
                (scorePct != null && scorePct < 70);
              const enriched = {
                ...verifiedData,
                bank_account: String(b.bankAccount ?? "").replace(/\D/g, ""),
                ifsc: String(b.ifsc ?? "")
                  .trim()
                  .toUpperCase()
                  .replace(/[^A-Z0-9]/g, ""),
              };
              if (softFail) {
                return reply.send({
                  success: true,
                  outcome: "mismatch",
                  mode: outcome.policy.mode,
                  error:
                    "Account holder name at bank does not match your Aadhaar name. You can still save for manual review.",
                  mismatchMessages: [
                    "Name at bank does not match Aadhaar",
                    verifiedData.name_at_bank
                      ? `Bank name: ${String(verifiedData.name_at_bank)}`
                      : "",
                  ].filter(Boolean),
                  verifiedData: enriched,
                  providerReference: outcome.result.providerReference ?? null,
                  verificationId: outcome.result.verificationId,
                });
              }
              return reply.send({
                success: true,
                outcome: "verified",
                mode: outcome.policy.mode,
                verifiedData: enriched,
                providerReference: outcome.result.providerReference ?? null,
                verificationId: outcome.result.verificationId,
              });
            }

            return reply.send({
              success: true,
              outcome: "verified",
              mode: outcome.policy.mode,
              verifiedData,
            });
          }
          if (status === "manual_review" || status === "provider_processing") {
            return reply.send({ success: true, outcome: "manual", mode: outcome.policy.mode });
          }
          const raw =
            outcome.result.rawResponse && typeof outcome.result.rawResponse === "object"
              ? (outcome.result.rawResponse as Record<string, unknown>)
              : {};
          const cashfreeStatus = String(raw.status ?? raw.rc_status ?? "").trim();
          const cashfreeMessage =
            typeof raw.message === "string"
              ? raw.message.trim()
              : typeof raw.error === "string"
                ? raw.error.trim()
                : "";
          const failError =
            outcome.result.statusReason?.trim() ||
            cashfreeMessage ||
            (cashfreeStatus
              ? `Cashfree status: ${cashfreeStatus}`
              : null) ||
            "Document could not be verified.";
          return reply.send({
            success: true,
            outcome: "failed",
            mode: outcome.policy.mode,
            error: failError,
            reason: outcome.result.status,
            providerStatus: cashfreeStatus || null,
            providerMessage: cashfreeMessage || null,
            verificationId: outcome.result.verificationId ?? null,
            providerReference: outcome.result.providerReference ?? null,
            httpStatus: outcome.result.httpStatus ?? null,
            cashfreeHint:
              "Cashfree API records appear under Secure ID → Driving License / Vehicle RC → All tab (not Batch). Batch is only CSV uploads.",
          });
        }

        const reason = outcome.reason;
        if (reason.startsWith("provider_error") || reason === "provider_not_configured") {
          req.log?.error?.({ reason, detail: outcome.detail }, "rider_verify_document_provider_failure");
          const uiMode =
            outcome.policy.mode === "auto" || outcome.policy.mode === "hybrid"
              ? outcome.policy.mode
              : "hybrid";
          const detail =
            typeof outcome.detail === "string" && outcome.detail.trim()
              ? outcome.detail.trim()
              : null;
          return reply.send({
            success: true,
            outcome: "failed",
            mode: uiMode,
            reason,
            error: detail
              ? `Electronic verification failed: ${detail}`
              : reason === "provider_not_configured"
                ? "Electronic verification is not configured for this document."
                : "Electronic verification is temporarily unavailable. Please try again or upload a photo for manual review.",
            cashfreeHint:
              "If Cashfree was reached, check Secure ID → All tab (not Batch). Batch only lists CSV file uploads.",
          });
        }
        // Genuine policy manual — classic upload flow.
        return reply.send({ success: true, outcome: "manual", mode: outcome.policy.mode });
      } catch (e) {
        req.log?.error?.({ err: e }, "rider_verify_document_failed");
        return reply.code(500).send({ success: false, error: "internal_error" });
      }
    },
  );

  /**
   * POST /poll-aadhaar-digilocker — after DigiLocker browser consent, poll Cashfree
   * until verified / failed so the rider app can complete Step 1.
   */
  app.post(
    "/poll-aadhaar-digilocker",
    {
      schema: {
        body: z.object({
          riderId: z.string(),
        }),
      },
    },
    async (req, reply) => {
      const b = req.body as { riderId: string };
      const riderIdInt = parseInt(b.riderId, 10);
      if (!Number.isFinite(riderIdInt) || riderIdInt < 1) {
        return reply.code(400).send({ success: false, error: "invalid_rider_id" });
      }
      try {
        const { pollDigilockerForSubject } = await import("../verification/service.js");
        const result = await pollDigilockerForSubject({
          subjectType: "rider",
          subjectId: riderIdInt,
        });
        if (result.verified) {
          return reply.send({
            success: true,
            outcome: "verified",
            verifiedData: result.verifiedData ?? {},
            status: result.status,
          });
        }
        if (
          result.status === "failed" ||
          result.status === "rejected" ||
          result.status === "expired" ||
          result.status === "consent_denied"
        ) {
          return reply.send({
            success: true,
            outcome: "failed",
            status: result.status,
            error: result.statusReason ?? "DigiLocker verification did not complete.",
          });
        }
        return reply.send({
          success: true,
          outcome: "pending",
          status: result.status,
        });
      } catch (e) {
        req.log?.error?.({ err: e }, "rider_poll_aadhaar_digilocker_failed");
        return reply.code(500).send({ success: false, error: "internal_error" });
      }
    },
  );
}
