import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import multipart from "@fastify/multipart";
import { z } from "zod";
import { getDb, withSqlRetry } from "../../db/client.js";
import { userProfiles, customers, accountDeletionRequests } from "../../db/schema.js";
import { eq, and, ne } from "drizzle-orm";
import { auth } from "../../plugins/auth.js";
import {
  sendCustomerEmailVerificationOtp,
  verifyCustomerEmailVerificationOtp,
} from "../../services/email/emailVerificationOtp.js";
import { resolveEmailAvatarUrl, isGenericProfileImageUrl } from "../../lib/email-avatar.js";
import {
  isCustomerEmailVerified,
  markCustomerEmailVerified,
} from "../../lib/customer-email-verified.js";
import { getCustomerLifetimeSavingsInr } from "./customer-lifetime-savings.js";
import { getReferralSettings } from "../referral/referral.config.service.js";
import { referralTrackingEnabled } from "../referral/referral.participants.js";
import { getActiveCustomerSubscription } from "../subscription/customer-subscription.service.js";

/** Random words for referral code suffix (1 or 2 words) */
const REFERRAL_WORDS = [
  "Sun", "Moon", "Star", "Red", "Blue", "Fast", "Cool", "Wave", "Bold", "Safe",
  "Easy", "High", "Live", "Best", "True", "Peak", "Flow", "Rise", "Glow", "Zen",
  "Echo", "Luxe", "Nova", "Vibe", "Apex", "Swift", "Prime", "Clear", "Calm", "Pure",
];

/** First 3 letters of name (letters only, lowercase). Pads with first letter if needed. */
function namePart(fullName: string): string {
  const letters = (fullName || "").replace(/\s+/g, "").replace(/[^a-zA-Z]/g, "").toLowerCase();
  if (letters.length >= 3) return letters.slice(0, 3);
  if (letters.length === 2) return letters + letters[0];
  if (letters.length === 1) return letters + letters + letters;
  return "usr";
}

/** First 4 characters of customer_id (e.g. GM100001 -> GM10). */
function userIdPart(customerId: string): string {
  return (customerId || "").slice(0, 4);
}

/** Generate a unique referral code: name(3) + userId(4) + 1 or 2 random words. Ensures uniqueness in DB. */
async function generateUniqueReferralCode(
  db: ReturnType<typeof getDb>,
  fullName: string,
  customerId: string
): Promise<string> {
  const name = namePart(fullName);
  const uid = userIdPart(customerId);
  const wordList = [...REFERRAL_WORDS];
  const shuffle = <T>(arr: T[]): T[] => {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };
  for (let attempt = 0; attempt < 20; attempt++) {
    const numWords = Math.random() > 0.5 ? 1 : 2;
    const chosen = shuffle(wordList).slice(0, numWords);
    const words = chosen.join("");
    let code = name + uid + words;
    if (attempt > 0) code += String(attempt).padStart(2, "0");
    code = code.toUpperCase();
    const existing = await db
      .select({ referralCode: customers.referralCode })
      .from(customers)
      .where(eq(customers.referralCode, code))
      .limit(1);
    if (existing.length === 0) return code;
  }
  return (name + uid + "Ref" + Date.now().toString(36).slice(-6)).toUpperCase();
}

const genderSchema = z.enum(["male", "female", "prefer_not_to_say"]);
const hearingAccessibilitySchema = z.enum(["deaf", "hard_of_hearing", "none"]);
const visionAccessibilitySchema = z.enum(["blind", "visual_impairment", "none"]);
const mobilityAccessibilitySchema = z.enum([
  "wheelchair_or_mobility_aid",
  "physical_disability_mobility",
  "none",
]);

const profileResponseSchema = z.object({
  profile_completed: z.boolean(),
  customer_id: z.string().nullable().optional(),
  user_id: z.string().nullable().optional(),
  mobile_number: z.string().nullable().optional(),
  full_name: z.string().nullable(),
  email: z.string().nullable(),
  age_group: z.string().nullable(),
  gender: z.string().nullable(),
  sms_permission: z.boolean().optional(),
  location_permission: z.boolean().optional(),
  contacts_permission: z.boolean().optional(),
  referral_code: z.string().nullable().optional(),
  referred_by: z.string().nullable().optional(),
  is_email_verified: z.boolean().optional(),
  address_line1: z.string().nullable().optional(),
  address_line2: z.string().nullable().optional(),
  city: z.string().nullable().optional(),
  state: z.string().nullable().optional(),
  pincode: z.string().nullable().optional(),
  country: z.string().nullable().optional(),
  latitude: z.number().nullable().optional(),
  longitude: z.number().nullable().optional(),
  created_at: z.string().optional(),
  updated_at: z.string().optional(),
  gmitra_plus_active: z.boolean().optional(),
  profile_image_url: z.string().nullable().optional(),
  lifetime_savings_inr: z.number().optional(),
  hearing_accessibility: hearingAccessibilitySchema.optional(),
  vision_accessibility: visionAccessibilitySchema.optional(),
  mobility_accessibility: mobilityAccessibilitySchema.optional(),
  legal_consent_pack_version: z.string().nullable().optional(),
  legal_consent_at: z.string().nullable().optional(),
});

const patchBodySchema = z.object({
  full_name: z.string().optional(),
  email: z.string().optional(),
  age_group: z.string().optional(),
  gender: genderSchema.optional(),
  profile_completed: z.boolean().optional(),
  sms_permission: z.boolean().optional(),
  location_permission: z.boolean().optional(),
  contacts_permission: z.boolean().optional(),
  referred_by: z.string().optional(),
  address_line1: z.string().optional(),
  address_line2: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  pincode: z.string().optional(),
  country: z.string().optional(),
  latitude: z.number().optional(),
  longitude: z.number().optional(),
  hearing_accessibility: hearingAccessibilitySchema.optional(),
  vision_accessibility: visionAccessibilitySchema.optional(),
  mobility_accessibility: mobilityAccessibilitySchema.optional(),
});

function toResponseFromUserProfile(row: typeof userProfiles.$inferSelect) {
  return {
    profile_completed: row.profileCompleted,
    user_id: row.userId ?? null,
    mobile_number: row.mobileNumber ?? null,
    full_name: row.fullName ?? null,
    email: row.email ?? null,
    age_group: row.ageGroup ?? null,
    gender: row.gender ?? null,
    sms_permission: row.smsPermission ?? false,
    location_permission: row.locationPermission ?? false,
    contacts_permission: row.contactsPermission ?? false,
    created_at: row.createdAt?.toISOString(),
    updated_at: row.updatedAt?.toISOString(),
  };
}

function safeCoord(v: string | number | null | undefined): number | null {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function toResponseFromCustomer(row: typeof customers.$inferSelect) {
  const profileCompleted = row.profileCompleted ?? !!(row.fullName && row.email && row.fullName !== "Pending");
  return {
    profile_completed: profileCompleted,
    customer_id: row.customerId ?? null,
    user_id: row.customerId ?? null,
    mobile_number: row.primaryMobile ?? null,
    full_name: row.fullName ?? null,
    email: row.email ?? null,
    age_group: row.ageGroup ?? null,
    gender: row.gender?.toLowerCase() ?? null,
    sms_permission: row.smsPermission ?? false,
    location_permission: row.locationPermission ?? false,
    contacts_permission: row.contactsPermission ?? false,
    referral_code: row.referralCode ?? null,
    referred_by: row.referredBy ?? null,
    is_email_verified: isCustomerEmailVerified(row),
    address_line1: row.addressLine1 ?? null,
    address_line2: row.addressLine2 ?? null,
    city: row.city ?? null,
    state: row.state ?? null,
    pincode: row.pincode ?? null,
    country: row.country ?? null,
    latitude: safeCoord(row.latitude),
    longitude: safeCoord(row.longitude),
    created_at: row.createdAt?.toISOString(),
    updated_at: row.updatedAt?.toISOString(),
    gmitra_plus_active: row.gmitraPlusActive ?? false,
    profile_image_url: row.profileImageUrl ?? null,
    hearing_accessibility: row.hearingAccessibility ?? "none",
    vision_accessibility: row.visionAccessibility ?? "none",
    mobility_accessibility: row.mobilityAccessibility ?? "none",
    legal_consent_pack_version: row.legalConsentPackVersion ?? null,
    legal_consent_at: row.legalConsentAt?.toISOString() ?? null,
  };
}

async function customerProfileResponse(
  db: ReturnType<typeof getDb>,
  row: typeof customers.$inferSelect,
) {
  const [lifetimeSavingsInr, subscription] = await Promise.all([
    getCustomerLifetimeSavingsInr(db, row.id),
    getActiveCustomerSubscription(row.id),
  ]);
  // Avatar lookup can take several seconds — refresh in background, don't block profile load.
  void ensureEmailAvatarForCustomer(db, row).catch(() => {});
  return {
    ...toResponseFromCustomer(row),
    gmitra_plus_active: subscription.active,
    lifetime_savings_inr: lifetimeSavingsInr,
  };
}

/** PATCH responses skip the heavy lifetime-savings aggregate (GET /profile still returns it). */
async function customerPatchResponse(row: typeof customers.$inferSelect) {
  const subscription = await getActiveCustomerSubscription(row.id);
  return {
    ...toResponseFromCustomer(row),
    gmitra_plus_active: subscription.active,
    lifetime_savings_inr: 0,
  };
}

async function ensureEmailAvatarForCustomer(
  db: ReturnType<typeof getDb>,
  row: typeof customers.$inferSelect,
): Promise<typeof customers.$inferSelect> {
  if (!isCustomerEmailVerified(row)) return row;
  const email = row.email?.trim().toLowerCase();
  if (!email) return row;

  const stored = row.profileImageUrl?.trim() || null;
  if (stored?.includes("/attachments/proxy")) return row;
  if (stored && !isGenericProfileImageUrl(stored)) return row;

  try {
    const avatarUrl = await resolveEmailAvatarUrl(email);
    if (isGenericProfileImageUrl(avatarUrl)) return row;
    const [updated] = await db
      .update(customers)
      .set({ profileImageUrl: avatarUrl, updatedAt: new Date() })
      .where(eq(customers.customerId, row.customerId))
      .returning();
    return updated ?? { ...row, profileImageUrl: avatarUrl };
  } catch {
    return row;
  }
}

/** Resolve customer_id when we should use customers table (sub is GM* or we find customer by phone). */
async function resolveCustomerId(db: ReturnType<typeof getDb>, sub: string, role: string, phone: string | undefined): Promise<string | null> {
  if (sub.startsWith("GM")) return sub;
  if (role === "customer") return sub;
  if (phone) {
    const rows = await db.select({ customerId: customers.customerId }).from(customers).where(eq(customers.primaryMobile, phone)).limit(1);
    if (rows.length > 0) return rows[0]!.customerId;
  }
  return null;
}

export async function meRoutes(app: FastifyInstance) {
  await app.register(auth, { required: true });

  app.get(
    "/profile",
    {
      schema: {
        response: {
          200: profileResponseSchema,
          401: z.object({ error: z.string(), message: z.string() }),
        },
      },
    },
    async (req, reply) => {
      const sub = req.auth!.sub;
      const role = req.auth!.role;
      return withSqlRetry(async () => {
        const db = getDb();
        const customerId = await resolveCustomerId(db, sub, role, req.auth?.phone);

        if (customerId) {
          const rows = await db
            .select()
            .from(customers)
            .where(eq(customers.customerId, customerId))
            .limit(1);
          if (rows.length === 0) {
            return reply.code(401).send({
              error: "user_deleted",
              message: "Your account is no longer available. Please sign in again.",
            });
          }
          return customerProfileResponse(db, rows[0]!);
        }

        if (sub.startsWith("usr_")) {
          return reply.code(401).send({
            error: "session_revoked",
            message: "Please log in again with the customer app to continue.",
          });
        }

        const rows = await db
          .select()
          .from(userProfiles)
          .where(eq(userProfiles.userId, sub))
          .limit(1);
        if (rows.length === 0) {
          return reply.code(401).send({
            error: "user_deleted",
            message: "Your account is no longer available. Please sign in again.",
          });
        }
        return { ...toResponseFromUserProfile(rows[0]!), lifetime_savings_inr: 0 };
      });
    }
  );

  app.patch(
    "/profile",
    {
      schema: {
        body: patchBodySchema,
        response: {
          200: profileResponseSchema,
          400: z.object({ message: z.string() }),
          401: z.object({ error: z.string(), message: z.string() }),
          500: z.object({ message: z.string() }),
        },
      },
    },
    async (req, reply) => {
      try {
        const sub = req.auth!.sub;
        const role = req.auth!.role;
        const body = patchBodySchema.parse(req.body);
        if (process.env.NODE_ENV !== "production") {
          req.log?.info?.(
            {
              event: "qa_profile_permission_patch",
              userId: sub,
              timestamp: new Date().toISOString(),
              sms_permission: body.sms_permission,
              location_permission: body.location_permission,
              contacts_permission: body.contacts_permission,
            },
            "PATCH /v1/me/profile permission payload"
          );
        }
        return await withSqlRetry(async () => {
        const db = getDb();
        const emailNorm = body.email?.trim().toLowerCase();
        const customerId = await resolveCustomerId(db, sub, role, req.auth?.phone);

        if (customerId) {
          if (emailNorm) {
            const duplicateEmail = await db
              .select({ customerId: customers.customerId })
              .from(customers)
              .where(
                and(
                  eq(customers.email, emailNorm),
                  ne(customers.customerId, customerId)
                )
              )
              .limit(1);
            if (duplicateEmail.length > 0) {
              return reply.code(400).send({
                message: "This email is already registered. Use a different email or login.",
              } as any);
            }
          }

          const rows = await db
            .select()
            .from(customers)
            .where(eq(customers.customerId, customerId))
            .limit(1);
          if (rows.length === 0) {
            return reply.code(401).send({
              error: "user_deleted",
              message: "Your account is no longer available. Please sign in again.",
            } as any);
          }
          const existing = rows[0]!;
          if (
            isCustomerEmailVerified(existing) &&
            body.email !== undefined &&
            emailNorm &&
            emailNorm !== existing.email?.trim().toLowerCase()
          ) {
            return reply.code(400).send({
              message: "Verified email cannot be changed.",
            } as any);
          }
          const genderVal = body.gender != null ? (body.gender.toUpperCase() as "MALE" | "FEMALE" | "PREFER_NOT_TO_SAY" | "OTHER") : undefined;
          const newProfileCompleted = body.profile_completed !== undefined ? body.profile_completed : existing.profileCompleted;
          const effectiveFullName = body.full_name !== undefined ? body.full_name : existing.fullName ?? "";

          // Auto-generate unique referral code when user completes profile and doesn't have one yet.
          // The Customer Referral service toggle is the source of truth — do not mint new codes while OFF.
          let referralCodeToSet: string | null = existing.referralCode ?? null;
          const referralSettings = await getReferralSettings().catch(() => null);
          const customerReferralOn = referralSettings
            ? referralTrackingEnabled(referralSettings, "customer")
            : true;
          if (
            customerReferralOn &&
            newProfileCompleted &&
            !existing.referralCode &&
            effectiveFullName &&
            effectiveFullName.trim().toLowerCase() !== "pending"
          ) {
            try {
              referralCodeToSet = await generateUniqueReferralCode(db, effectiveFullName.trim(), customerId);
            } catch (refErr) {
              req.log?.warn?.({ err: refErr }, "referral code generation skipped");
            }
          }

          // referred_by on the profile row is a legacy hint only. When the service is OFF,
          // ignore newly submitted codes so old onboarding payloads cannot look "applied".
          const referredByToSet = customerReferralOn
            ? body.referred_by !== undefined
              ? body.referred_by.trim().toUpperCase() || null
              : existing.referredBy
            : existing.referredBy;

          const [updated] = await db
            .update(customers)
            .set({
              fullName: body.full_name !== undefined ? body.full_name : existing.fullName,
              email:
                body.email !== undefined && !isCustomerEmailVerified(existing)
                  ? (emailNorm ?? body.email)
                  : existing.email,
              ageGroup: body.age_group !== undefined ? body.age_group : existing.ageGroup,
              gender: genderVal !== undefined ? genderVal : existing.gender,
              profileCompleted: newProfileCompleted,
              referralCode: referralCodeToSet !== null ? referralCodeToSet.toUpperCase() : existing.referralCode,
              smsPermission: body.sms_permission !== undefined ? body.sms_permission : existing.smsPermission,
              locationPermission: body.location_permission !== undefined ? body.location_permission : existing.locationPermission,
              contactsPermission: body.contacts_permission !== undefined ? body.contacts_permission : existing.contactsPermission,
              referredBy: referredByToSet,
              addressLine1: body.address_line1 !== undefined ? body.address_line1 : existing.addressLine1,
              addressLine2: body.address_line2 !== undefined ? body.address_line2 : existing.addressLine2,
              city: body.city !== undefined ? body.city : existing.city,
              state: body.state !== undefined ? body.state : existing.state,
              pincode: body.pincode !== undefined ? body.pincode : existing.pincode,
              country: body.country !== undefined ? body.country : existing.country,
              latitude: body.latitude !== undefined ? String(body.latitude) : existing.latitude,
              longitude: body.longitude !== undefined ? String(body.longitude) : existing.longitude,
              hearingAccessibility:
                body.hearing_accessibility !== undefined
                  ? body.hearing_accessibility
                  : existing.hearingAccessibility,
              visionAccessibility:
                body.vision_accessibility !== undefined
                  ? body.vision_accessibility
                  : existing.visionAccessibility,
              mobilityAccessibility:
                body.mobility_accessibility !== undefined
                  ? body.mobility_accessibility
                  : existing.mobilityAccessibility,
              updatedAt: new Date(),
            })
            .where(eq(customers.customerId, customerId))
            .returning();
          if (!updated) {
            return reply.code(500).send({ message: "Could not save. Try again." } as any);
          }
          return await customerPatchResponse(updated);
        }

        if (sub.startsWith("usr_")) {
          return reply.code(401).send({
            error: "session_revoked",
            message: "Please log in again with the customer app to continue.",
          });
        }

        if (emailNorm) {
          const duplicateEmail = await db
            .select({ userId: userProfiles.userId })
            .from(userProfiles)
            .where(
              and(
                eq(userProfiles.email, emailNorm),
                ne(userProfiles.userId, sub)
              )
            )
            .limit(1);
          if (duplicateEmail.length > 0) {
            return reply.code(400).send({
              message: "This email is already registered. Use a different email or login.",
            } as any);
          }
        }

        const rows = await db
          .select()
          .from(userProfiles)
          .where(eq(userProfiles.userId, sub))
          .limit(1);
        if (rows.length === 0) {
          const mobile = req.auth?.phone ?? "";
          const [inserted] = await db
            .insert(userProfiles)
            .values({
              userId: sub,
              mobileNumber: mobile || `pending-${sub}`,
              fullName: body.full_name ?? null,
              email: emailNorm ?? null,
              ageGroup: body.age_group ?? null,
              gender: body.gender ?? null,
              profileCompleted: body.profile_completed ?? false,
              smsPermission: body.sms_permission ?? false,
              locationPermission: body.location_permission ?? false,
              contactsPermission: body.contacts_permission ?? false,
            })
            .returning();
          if (!inserted) {
            return reply.code(500).send({ message: "Could not create profile" } as any);
          }
          return { ...toResponseFromUserProfile(inserted), lifetime_savings_inr: 0 };
        }
        const existing = rows[0]!;
        const [updated] = await db
          .update(userProfiles)
          .set({
            fullName: body.full_name !== undefined ? body.full_name : existing.fullName,
            email: body.email !== undefined ? (emailNorm ?? body.email) : existing.email,
            ageGroup: body.age_group !== undefined ? body.age_group : existing.ageGroup,
            gender: body.gender !== undefined ? body.gender : existing.gender,
            profileCompleted: body.profile_completed !== undefined ? body.profile_completed : existing.profileCompleted,
            smsPermission: body.sms_permission !== undefined ? body.sms_permission : existing.smsPermission,
            locationPermission: body.location_permission !== undefined ? body.location_permission : existing.locationPermission,
            contactsPermission: body.contacts_permission !== undefined ? body.contacts_permission : existing.contactsPermission,
            updatedAt: new Date(),
          })
          .where(eq(userProfiles.userId, sub))
          .returning();
        if (!updated) {
          return reply.code(500).send({ message: "Could not save. Try again." } as any);
        }
        return { ...toResponseFromUserProfile(updated), lifetime_savings_inr: 0 };
        });
      } catch (err: any) {
        req.log?.error?.({ err }, "PATCH /profile failed");
        const message = err?.message || err?.code || "Could not save. Try again.";
        return reply.code(500).send({ message: String(message) } as any);
      }
    }
  );

  app.post(
    "/email-verification/send",
    {
      schema: {
        response: {
          200: z.object({ sent: z.boolean(), email: z.string() }),
          400: z.object({ message: z.string() }),
          401: z.object({ message: z.string() }),
          503: z.object({ message: z.string() }),
        },
      },
    },
    async (req, reply) => {
      const sub = req.auth!.sub;
      const role = req.auth!.role;
      const db = getDb();
      const customerId = await resolveCustomerId(db, sub, role, req.auth?.phone);
      if (!customerId) {
        return reply.code(401).send({ message: "Customer account required" });
      }

      const rows = await db
        .select()
        .from(customers)
        .where(eq(customers.customerId, customerId))
        .limit(1);
      if (rows.length === 0) {
        return reply.code(401).send({ message: "Customer not found" });
      }
      const row = rows[0]!;
      if (isCustomerEmailVerified(row)) {
        return reply.code(400).send({ message: "Email is already verified" });
      }
      const email = row.email?.trim().toLowerCase();
      if (!email) {
        return reply.code(400).send({ message: "Add an email to your profile first" });
      }

      const result = await sendCustomerEmailVerificationOtp({
        customerKey: customerId,
        email,
        log: req.log,
      });
      if (!result.sent) {
        return reply.code(503).send({
          message: result.error ?? "Could not send verification email. Try again later.",
        });
      }
      return { sent: true, email };
    }
  );

  app.post(
    "/email-verification/confirm",
    {
      schema: {
        body: z.object({ code: z.string().min(4).max(8) }),
        response: {
          200: z.object({ verified: z.boolean(), is_email_verified: z.boolean(), profile_image_url: z.string().nullable().optional() }),
          400: z.object({ message: z.string() }),
          401: z.object({ message: z.string() }),
        },
      },
    },
    async (req, reply) => {
      const sub = req.auth!.sub;
      const role = req.auth!.role;
      const body = z.object({ code: z.string().min(4).max(8) }).parse(req.body);
      const db = getDb();
      const customerId = await resolveCustomerId(db, sub, role, req.auth?.phone);
      if (!customerId) {
        return reply.code(401).send({ message: "Customer account required" });
      }

      const rows = await db
        .select()
        .from(customers)
        .where(eq(customers.customerId, customerId))
        .limit(1);
      if (rows.length === 0) {
        return reply.code(401).send({ message: "Customer not found" });
      }
      const row = rows[0]!;
      const email = row.email?.trim().toLowerCase();
      if (!email) {
        return reply.code(400).send({ message: "Add an email to your profile first" });
      }

      const result = await verifyCustomerEmailVerificationOtp({
        customerKey: customerId,
        email,
        code: body.code.trim(),
      });
      if (!result.ok) {
        return reply.code(400).send({ message: result.reason ?? "Invalid OTP. Please try again." });
      }

      let profileImageUrl = row.profileImageUrl?.trim() || null;
      if (!profileImageUrl || isGenericProfileImageUrl(profileImageUrl)) {
        try {
          profileImageUrl = await resolveEmailAvatarUrl(email);
        } catch (err) {
          req.log?.warn?.({ err, email }, "email avatar resolve failed on verify");
        }
      }

      await markCustomerEmailVerified(db, customerId, {
        profileImageUrl: profileImageUrl ?? undefined,
      });

      return { verified: true, is_email_verified: true, profile_image_url: profileImageUrl };
    }
  );

  app.post(
    "/logout-all",
    {
      schema: {
        response: { 200: z.object({ success: z.boolean() }) },
      },
    },
    async (req, reply) => {
      const sub = req.auth!.sub;
      const role = req.auth!.role;
      const db = getDb();
      const customerId = await resolveCustomerId(db, sub, role, req.auth?.phone);
      if (customerId) {
        await db
          .update(customers)
          .set({
            sessionsInvalidBefore: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(customers.customerId, customerId));
      } else {
        await db
          .update(userProfiles)
          .set({
            sessionsInvalidBefore: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(userProfiles.userId, sub));
      }

      if (role === "customer" || role === "merchant" || role === "rider") {
        try {
          const { purgeUserPushTokens } = await import("../../lib/purge-user-push-tokens.js");
          await purgeUserPushTokens({ userId: sub, role, log: req.log });
        } catch (pushErr) {
          req.log?.warn?.({ err: pushErr, userId: sub.slice(0, 8) }, "logout_all_push_purge_failed");
        }
      }

      return { success: true };
    }
  );

  /** POST /v1/me/logout — invalidate sessions + purge this device's push registration. */
  app.post(
    "/logout",
    {
      schema: {
        body: z
          .object({
            expo_push_token: z.string().optional().nullable(),
            native_push_token: z.string().optional().nullable(),
          })
          .optional(),
        response: {
          200: z.object({ success: z.boolean() }),
          403: z.object({ error: z.string() }),
        },
      },
    },
    async (req, reply) => {
      const sub = req.auth!.sub;
      const role = req.auth!.role;
      if (role !== "customer" && role !== "merchant" && role !== "rider") {
        return reply.code(403).send({ error: "unsupported_role" });
      }

      const body = (req.body ?? {}) as {
        expo_push_token?: string | null;
        native_push_token?: string | null;
      };

      try {
        const { purgeUserPushTokens } = await import("../../lib/purge-user-push-tokens.js");
        await purgeUserPushTokens({
          userId: sub,
          role,
          expoToken: body.expo_push_token,
          nativeToken: body.native_push_token,
          log: req.log,
        });
      } catch (pushErr) {
        req.log?.warn?.({ err: pushErr, userId: sub.slice(0, 8) }, "logout_push_purge_failed");
      }

      return { success: true };
    }
  );

  /**
   * Account deletion — request → review → deactivation (retain, no revive).
   *
   * The customer raises a request from the app with a reason. We:
   *   1. Record a review row in `account_deletion_requests` (the ops queue).
   *   2. Do NOT deactivate yet — an admin completes deletion from the Customers
   *      dashboard, which sets DEACTIVATED + sessionsInvalidBefore (app logout).
   *   3. RETAIN all identity data when closed (PMLA / GST / IT Act).
   *
   * Single canonical endpoint: POST /v1/me/account/deletion-request.
   * DELETE /v1/me/account is kept as an alias for older app builds.
   */
  const deletionRequestSchema = {
    body: z
      .object({
        reasonCode: z.string().max(64).nullish(),
        reason: z.string().max(1000).nullish(),
        phoneE164: z.string().max(20).optional(),
      })
      .nullish(),
    response: {
      200: z.object({ ok: z.literal(true), status: z.string() }),
      401: z.object({ error: z.string(), message: z.string() }),
      403: z.object({ error: z.string(), message: z.string() }),
      500: z.object({ error: z.string(), message: z.string() }),
    },
  } as const;

  const handleDeletionRequest = async (req: FastifyRequest, reply: FastifyReply) => {
    const sub = req.auth!.sub;
    const role = req.auth!.role;
    const db = getDb();

    // Customer accounts only — refuse riders, partners, system_users.
    if (role && role !== "customer") {
      return reply.code(403).send({
        error: "forbidden",
        message: "Only customer accounts can request deletion via this endpoint.",
      });
    }

    const customerId = await resolveCustomerId(db, sub, role, req.auth?.phone);
    if (!customerId) {
      // Not a customer at all — nothing to deactivate.
      return { ok: true as const, status: "not_found" };
    }

    const body = (req.body ?? {}) as {
      reasonCode?: string | null;
      reason?: string | null;
      phoneE164?: string;
    };
    const reasonCode = (body.reasonCode ?? "other").toString().slice(0, 64);
    const reasonText = (body.reason ?? "").toString().slice(0, 1000) || null;
    const source =
      (req.headers["x-deletion-source"] as string | undefined)?.slice(0, 32) || "app";

    const now = new Date();
    const customerRow = await db
      .select({
        id: customers.id,
        deletedAt: customers.deletedAt,
        primaryMobile: customers.primaryMobile,
      })
      .from(customers)
      .where(eq(customers.customerId, customerId))
      .limit(1);

    if (customerRow.length === 0) return { ok: true as const, status: "not_found" };

    const alreadyDeactivated = customerRow[0]!.deletedAt != null;
    const phoneE164 = body.phoneE164 || customerRow[0]!.primaryMobile || req.auth?.phone || null;

    // Queue for ops review only — do not deactivate until an admin completes deletion.
    // Idempotent: if a pending_review row already exists, reuse it.
    try {
      const existing = await db
        .select({ id: accountDeletionRequests.id })
        .from(accountDeletionRequests)
        .where(
          and(
            eq(accountDeletionRequests.customerId, customerId),
            eq(accountDeletionRequests.status, "pending_review"),
          ),
        )
        .limit(1);

      if (existing.length === 0) {
        await db.insert(accountDeletionRequests).values({
          customerId,
          phoneE164: phoneE164 ?? undefined,
          reasonCode,
          reasonText: reasonText ?? undefined,
          status: "pending_review",
          source,
          requestedAt: now,
        });
      }
    } catch (e) {
      req.log?.error?.({ err: e, customerId }, "[account-deletion] failed to record review request");
      return reply.code(500).send({
        error: "server_error",
        message: "Could not record your deletion request. Please try again.",
      });
    }

    // Mark intent on the customer row without closing the account yet.
    if (!alreadyDeactivated) {
      await db
        .update(customers)
        .set({
          statusReason: "account_deletion_requested",
          updatedAt: now,
        })
        .where(eq(customers.id, customerRow[0]!.id));
    }

    req.log?.info?.(
      { customerId, source, reasonCode, alreadyDeactivated },
      "[account-deletion] request queued for admin review (account still active until completed)",
    );

    return { ok: true as const, status: "pending_review" };
  };

  app.post("/account/deletion-request", { schema: deletionRequestSchema }, handleDeletionRequest);
  // Backward-compatible alias for older app builds.
  app.delete("/account", { schema: deletionRequestSchema }, handleDeletionRequest);

  app.get(
    "/service-blocks",
    {
      schema: {
        response: {
          200: z.object({
            blocks: z.array(
              z.object({
                service: z.enum([
                  "food",
                  "parcel",
                  "person_ride",
                  "ecommerce",
                  "vouchers",
                  "near_me",
                ]),
                reason: z.string(),
                blocked_at: z.string(),
              })
            ),
          }),
          401: z.object({ error: z.string(), message: z.string() }),
        },
      },
    },
    async (req, reply) => {
      const sub = req.auth!.sub;
      const role = req.auth!.role;
      return withSqlRetry(async () => {
        const db = getDb();
        const customerId = await resolveCustomerId(db, sub, role, req.auth?.phone);
        if (!customerId) {
          return reply.code(401).send({
            error: "session_revoked",
            message: "Please log in again.",
          });
        }
        const [row] = await db
          .select({ id: customers.id })
          .from(customers)
          .where(eq(customers.customerId, customerId))
          .limit(1);
        if (!row) {
          return reply.code(401).send({
            error: "user_deleted",
            message: "Your account is no longer available.",
          });
        }
        const { listActiveCustomerServiceBlocksForCustomer } = await import(
          "../../lib/customer-service-blocks.js"
        );
        const blocks = await listActiveCustomerServiceBlocksForCustomer(row.id);
        return {
          blocks: blocks.map((b) => ({
            service: b.serviceType,
            reason: b.reason,
            blocked_at: b.blockedAt,
          })),
        };
      });
    }
  );

  await app.register(multipart, { limits: { fileSize: 5 * 1024 * 1024 } });

  app.post(
    "/profile-image",
    {
      schema: {
        response: {
          201: z.object({
            profile_image_url: z.string(),
          }),
          400: z.object({ error: z.string(), message: z.string().optional() }),
          401: z.object({ error: z.string(), message: z.string() }),
          500: z.object({ error: z.string(), message: z.string() }),
        },
      },
    },
    async (req, reply) => {
      const sub = req.auth!.sub;
      const role = req.auth!.role;

      return withSqlRetry(async () => {
        const db = getDb();
        const customerId = await resolveCustomerId(db, sub, role, req.auth?.phone);
        if (!customerId) {
          return reply.code(401).send({
            error: "session_revoked",
            message: "Please log in again.",
          });
        }

        const [row] = await db
          .select()
          .from(customers)
          .where(eq(customers.customerId, customerId))
          .limit(1);
        if (!row) {
          return reply.code(401).send({
            error: "user_deleted",
            message: "Your account is no longer available.",
          });
        }

        const filePart = await (req as unknown as {
          file?: () => Promise<{
            filename?: string;
            mimetype?: string;
            toBuffer: () => Promise<Buffer>;
          } | undefined>;
        }).file?.();
        if (!filePart) {
          return reply.code(400).send({ error: "no_file", message: "No image provided." });
        }

        const buffer = await filePart.toBuffer();
        if (!buffer || buffer.length === 0) {
          return reply.code(400).send({ error: "empty_file", message: "Image is empty." });
        }
        if (buffer.length > 5 * 1024 * 1024) {
          return reply.code(400).send({ error: "file_too_large", message: "Max size is 5 MB." });
        }

        const originalName = String(filePart.filename || "profile.jpg");
        const safeName = originalName.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120) || "profile.jpg";
        const mime = String(filePart.mimetype || "image/jpeg");
        if (!/^image\/(jpeg|png|gif|webp)$/i.test(mime)) {
          return reply.code(400).send({
            error: "unsupported_mime_type",
            message: "Only JPEG, PNG, GIF, or WebP images are allowed.",
          });
        }

        const { randomUUID } = await import("crypto");
        const r2Key = `customers/profile-images/${customerId}/${randomUUID()}-${safeName}`;

        try {
          const { uploadToR2, deleteFromR2 } = await import("../../services/r2/r2Service.js");
          const uploaded = await uploadToR2(buffer, r2Key, mime);
          const proxyUrl = `/v1/attachments/proxy?key=${encodeURIComponent(uploaded.key)}`;

          const prevKey = extractProxyAttachmentKey(row.profileImageUrl);
          if (prevKey?.startsWith("customers/profile-images/")) {
            deleteFromR2(prevKey).catch(() => undefined);
          }

          const [updated] = await db
            .update(customers)
            .set({ profileImageUrl: proxyUrl, updatedAt: new Date() })
            .where(eq(customers.customerId, customerId))
            .returning();

          if (!updated) {
            await deleteFromR2(uploaded.key).catch(() => undefined);
            return reply.code(500).send({ error: "save_failed", message: "Could not save profile photo." });
          }

          return reply.code(201).send({ profile_image_url: proxyUrl });
        } catch (e) {
          req.log.error({ err: e }, "profile image upload failed");
          return reply.code(500).send({ error: "upload_failed", message: "Upload failed. Try again." });
        }
      });
    }
  );
}

function extractProxyAttachmentKey(stored: string | null | undefined): string | null {
  if (!stored?.trim()) return null;
  const u = stored.trim();
  try {
    const parsed = u.startsWith("http") ? new URL(u) : new URL(u, "https://local");
    if (parsed.pathname.includes("/attachments/proxy")) {
      return parsed.searchParams.get("key");
    }
  } catch {
    return null;
  }
  return null;
}
