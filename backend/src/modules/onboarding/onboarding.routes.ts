import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { ulid } from "ulid";
import { getDb } from "../../db/client.js";
import { riders, riderDocuments } from "../../db/schema.js";
import { eq, and } from "drizzle-orm";
import { auth } from "../../plugins/auth.js";
import { deleteFromR2, extractKeyFromSignedUrl } from "../../services/r2/r2Service.js";

export async function onboardingRoutes(app: FastifyInstance) {
  await app.register(auth, { required: true });

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

      // Update onboarding status
      await db
        .update(riders)
        .set({
          onboardingStage: "KYC",
          updatedAt: new Date(),
        })
        .where(eq(riders.id, riderIdInt));

      // Upsert rider documents based on step
      // Store document-specific data in metadata JSONB field
      if (step === "aadhaar_name") {
        const aadhaarMasked = stepData.aadhaarNumber
          ? `${stepData.aadhaarNumber.toString().slice(0, 4).replace(/\d/g, "X")}-${stepData.aadhaarNumber.toString().slice(4, 8).replace(/\d/g, "X")}-${stepData.aadhaarNumber.toString().slice(-4)}`
          : undefined;

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
        const docType = stepData.rentalProofSignedUrl ? "rental_proof" : "ev_proof";
        const signedUrl = (stepData.rentalProofSignedUrl || stepData.evProofSignedUrl) as string;
        const oldKey = signedUrl ? extractKeyFromSignedUrl(signedUrl) : null;

        let oldSignedUrl: string | null = null;
        const existing = await db
          .select()
          .from(riderDocuments)
          .where(and(
            eq(riderDocuments.riderId, riderIdInt),
            eq(riderDocuments.docType, docType)
          ))
          .limit(1);

        if (existing.length > 0) {
          oldSignedUrl = (existing[0]!.metadata as any)?.rentalProofSignedUrl || 
                        (existing[0]!.metadata as any)?.evProofSignedUrl || null;
        }

        const metadata = {
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
              docType: docType,
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
      const db = getDb();

      // Convert riderId string to integer
      const riderIdInt = parseInt(riderId);
      if (isNaN(riderIdInt)) {
        throw new Error("Invalid rider ID");
      }

      const riderRows = await db.select().from(riders).where(eq(riders.id, riderIdInt)).limit(1);
      if (riderRows.length === 0) {
        throw new Error("Rider not found");
      }

      const rider = riderRows[0]!;
      
      // Map onboardingStage enum to response format
      const onboardingStatusMap: Record<string, string> = {
        "MOBILE_VERIFIED": "not_started",
        "KYC": "in_progress",
        "PAYMENT": "in_progress",
        "APPROVAL": "pending_approval",
        "ACTIVE": "approved",
      };

      // Map kycStatus enum to response format
      const approvalStatusMap: Record<string, string> = {
        "PENDING": "DRAFT",
        "REVIEW": "DRAFT",
        "APPROVED": "APPROVED",
        "REJECTED": "REJECTED",
      };

      return {
        riderId: rider.id.toString(),
        onboardingStatus: onboardingStatusMap[rider.onboardingStage] || "not_started",
        approvalStatus: approvalStatusMap[rider.kycStatus] || "DRAFT",
      };
    },
  );
}

