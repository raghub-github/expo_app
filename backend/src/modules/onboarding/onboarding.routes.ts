import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { ulid } from "ulid";
import { getDb } from "../../db/client.js";
import { riders, riderDocuments, riderOnboardingVehicleTypes, riderOnboardingDocumentTypes, riderOnboardingVehicleCategories } from "../../db/schema.js";
import { eq, and, asc } from "drizzle-orm";
import { auth } from "../../plugins/auth.js";
import { deleteFromR2, extractKeyFromSignedUrl } from "../../services/r2/r2Service.js";

export async function onboardingRoutes(app: FastifyInstance) {
  await app.register(auth, { required: true });

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
        (req.query as { includeInactive?: string }).includeInactive !== "false";
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
        (req.query as { includeInactive?: string }).includeInactive !== "false";
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

      return {
        rows: rows.map((row) => ({
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
      const includeInactive = query.includeInactive !== "false";
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
            fileUrl: z.string().optional(),
            dlNumber: z.string().optional(),
            rcNumber: z.string().optional(),
            hasOwnVehicle: z.boolean().optional(),
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
        response: { 200: z.object({ success: z.boolean() }) },
      },
    },
    async (req) => {
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
        const aadhaarMasked = stepData.aadhaarNumber
          ? `${stepData.aadhaarNumber.toString().slice(0, 4).replace(/\d/g, "X")}-${stepData.aadhaarNumber.toString().slice(4, 8).replace(/\d/g, "X")}-${stepData.aadhaarNumber.toString().slice(-4)}`
          : undefined;

        const riderUpdate: {
          name?: string;
          aadhaarNumber?: string;
          updatedAt: Date;
        } = { updatedAt: new Date() };

        if (typeof stepData.fullName === "string" && stepData.fullName.trim()) {
          riderUpdate.name = stepData.fullName.trim();
        }
        if (stepData.aadhaarNumber) {
          const digits = stepData.aadhaarNumber.toString().replace(/\D/g, "");
          if (digits.length === 12) {
            riderUpdate.aadhaarNumber = digits;
          }
        }

        if (riderUpdate.name || riderUpdate.aadhaarNumber) {
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

        const metadata = {
          aadhaarMasked: aadhaarMasked,
          fullName: stepData.fullName as string | undefined,
        };

        if (existing.length > 0) {
          await db
            .update(riderDocuments)
            .set({
              extractedName: stepData.fullName as string | undefined,
              metadata: metadata,
            })
            .where(eq(riderDocuments.id, existing[0]!.id));
        } else {
          // For aadhaar, we need a fileUrl - this should come from the upload
          // For now, use a placeholder or require fileUrl in the request
          await db.insert(riderDocuments).values({
            riderId: riderIdInt,
            docType: "aadhaar",
            fileUrl: stepData.fileUrl as string || "pending", // Should be provided
            extractedName: stepData.fullName as string | undefined,
            metadata: metadata,
          });
        }
      } else if (step === "dl_rc") {
        const selectionMeta = {
          vehicleChoice:
            typeof stepData.vehicleChoice === "string" ? stepData.vehicleChoice : undefined,
          vehicleCategoryCode:
            typeof stepData.vehicleCategoryCode === "string"
              ? stepData.vehicleCategoryCode
              : undefined,
          onboardingFlow:
            stepData.onboardingFlow === "dl_rc" ||
            stepData.onboardingFlow === "rental_ev" ||
            stepData.onboardingFlow === "payment"
              ? stepData.onboardingFlow
              : undefined,
        };

        if (
          selectionMeta.vehicleChoice ||
          selectionMeta.onboardingFlow
        ) {
          const existingSelection = await db
            .select()
            .from(riderDocuments)
            .where(
              and(
                eq(riderDocuments.riderId, riderIdInt),
                eq(riderDocuments.docType, "onboarding_vehicle_selection" as never)
              )
            )
            .limit(1);

          if (existingSelection.length > 0) {
            await db
              .update(riderDocuments)
              .set({ metadata: selectionMeta })
              .where(eq(riderDocuments.id, existingSelection[0]!.id));
          } else {
            await db.insert(riderDocuments).values({
              riderId: riderIdInt,
              docType: "onboarding_vehicle_selection" as never,
              fileUrl: "n/a",
              metadata: selectionMeta,
            });
          }
        }

        // Upsert DL document
        if (stepData.dlNumber) {
          const existingDl = await db
            .select()
            .from(riderDocuments)
            .where(and(
              eq(riderDocuments.riderId, riderIdInt),
              eq(riderDocuments.docType, "dl")
            ))
            .limit(1);

          const metadata = {
            dlNumber: stepData.dlNumber as string,
          };

          if (existingDl.length > 0) {
            await db
              .update(riderDocuments)
              .set({
                metadata: metadata,
              })
              .where(eq(riderDocuments.id, existingDl[0]!.id));
          } else {
            await db.insert(riderDocuments).values({
              riderId: riderIdInt,
              docType: "dl",
              fileUrl: stepData.fileUrl as string || "pending",
              metadata: metadata,
            });
          }
        }

        // Upsert RC document
        if (stepData.rcNumber) {
          const existingRc = await db
            .select()
            .from(riderDocuments)
            .where(and(
              eq(riderDocuments.riderId, riderIdInt),
              eq(riderDocuments.docType, "rc")
            ))
            .limit(1);

          const metadata = {
            rcNumber: stepData.rcNumber as string,
          };

          if (existingRc.length > 0) {
            await db
              .update(riderDocuments)
              .set({
                metadata: metadata,
              })
              .where(eq(riderDocuments.id, existingRc[0]!.id));
          } else {
            await db.insert(riderDocuments).values({
              riderId: riderIdInt,
              docType: "rc",
              fileUrl: stepData.fileUrl as string || "pending",
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
          const existingPan = await db
            .select()
            .from(riderDocuments)
            .where(and(
              eq(riderDocuments.riderId, riderIdInt),
              eq(riderDocuments.docType, "pan")
            ))
            .limit(1);

          const metadata = {
            panPartial: panPartial,
          };

          if (existingPan.length > 0) {
            await db
              .update(riderDocuments)
              .set({
                metadata: metadata,
              })
              .where(eq(riderDocuments.id, existingPan[0]!.id));
          } else {
            await db.insert(riderDocuments).values({
              riderId: riderIdInt,
              docType: "pan",
              fileUrl: stepData.fileUrl as string || "pending",
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
}

