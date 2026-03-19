import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { getDb } from "../../db/client.js";
import { userProfiles, customers } from "../../db/schema.js";
import { eq, and, ne } from "drizzle-orm";
import { auth } from "../../plugins/auth.js";

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

const profileResponseSchema = z.object({
  profile_completed: z.boolean(),
  customer_id: z.string().nullable().optional(),
  user_id: z.string().optional(),
  mobile_number: z.string().optional(),
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
});

function toResponseFromUserProfile(row: typeof userProfiles.$inferSelect) {
  return {
    profile_completed: row.profileCompleted,
    user_id: row.userId,
    mobile_number: row.mobileNumber,
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

function toResponseFromCustomer(row: typeof customers.$inferSelect) {
  const profileCompleted = row.profileCompleted ?? !!(row.fullName && row.email && row.fullName !== "Pending");
  return {
    profile_completed: profileCompleted,
    customer_id: row.customerId,
    user_id: row.customerId,
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
    is_email_verified: row.isEmailVerified ?? false,
    address_line1: row.addressLine1 ?? null,
    address_line2: row.addressLine2 ?? null,
    city: row.city ?? null,
    state: row.state ?? null,
    pincode: row.pincode ?? null,
    country: row.country ?? null,
    latitude: row.latitude != null ? Number(row.latitude) : null,
    longitude: row.longitude != null ? Number(row.longitude) : null,
    created_at: row.createdAt?.toISOString(),
    updated_at: row.updatedAt?.toISOString(),
  };
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
        return toResponseFromCustomer(rows[0]!);
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
      return toResponseFromUserProfile(rows[0]!);
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
          const genderVal = body.gender != null ? (body.gender.toUpperCase() as "MALE" | "FEMALE" | "PREFER_NOT_TO_SAY" | "OTHER") : undefined;
          const newProfileCompleted = body.profile_completed !== undefined ? body.profile_completed : existing.profileCompleted;
          const effectiveFullName = body.full_name !== undefined ? body.full_name : existing.fullName ?? "";

          // Auto-generate unique referral code when user completes profile (redirect to home) and doesn't have one yet
          let referralCodeToSet: string | null = existing.referralCode ?? null;
          if (newProfileCompleted && !existing.referralCode && effectiveFullName && effectiveFullName.trim().toLowerCase() !== "pending") {
            referralCodeToSet = await generateUniqueReferralCode(db, effectiveFullName.trim(), customerId);
          }

          const [updated] = await db
            .update(customers)
            .set({
              fullName: body.full_name !== undefined ? body.full_name : existing.fullName,
              email: body.email !== undefined ? (emailNorm ?? body.email) : existing.email,
              ageGroup: body.age_group !== undefined ? body.age_group : existing.ageGroup,
              gender: genderVal !== undefined ? genderVal : existing.gender,
              profileCompleted: newProfileCompleted,
              referralCode: referralCodeToSet !== null ? referralCodeToSet.toUpperCase() : existing.referralCode,
              smsPermission: body.sms_permission !== undefined ? body.sms_permission : existing.smsPermission,
              locationPermission: body.location_permission !== undefined ? body.location_permission : existing.locationPermission,
              contactsPermission: body.contacts_permission !== undefined ? body.contacts_permission : existing.contactsPermission,
              referredBy: body.referred_by !== undefined ? (body.referred_by.trim().toUpperCase() || null) : existing.referredBy,
              addressLine1: body.address_line1 !== undefined ? body.address_line1 : existing.addressLine1,
              addressLine2: body.address_line2 !== undefined ? body.address_line2 : existing.addressLine2,
              city: body.city !== undefined ? body.city : existing.city,
              state: body.state !== undefined ? body.state : existing.state,
              pincode: body.pincode !== undefined ? body.pincode : existing.pincode,
              country: body.country !== undefined ? body.country : existing.country,
              latitude: body.latitude !== undefined ? String(body.latitude) : existing.latitude,
              longitude: body.longitude !== undefined ? String(body.longitude) : existing.longitude,
              updatedAt: new Date(),
            })
            .where(eq(customers.customerId, customerId))
            .returning();
          if (!updated) {
            return reply.code(500).send({ message: "Could not save. Try again." } as any);
          }
          return toResponseFromCustomer(updated);
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
          return toResponseFromUserProfile(inserted);
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
        return toResponseFromUserProfile(updated);
      } catch (err: any) {
        req.log?.error?.({ err }, "PATCH /profile failed");
        const message = err?.message || err?.code || "Could not save. Try again.";
        return reply.code(500).send({ message: String(message) } as any);
      }
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
      return { success: true };
    }
  );
}
