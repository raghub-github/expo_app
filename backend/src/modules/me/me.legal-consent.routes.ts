import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { eq, sql } from "drizzle-orm";
import { getDb, withSqlRetry } from "../../db/client.js";
import { customers } from "../../db/schema.js";
import { auth } from "../../plugins/auth.js";

/** Must match apps/customer_app/lib/legal-registry.ts LEGAL_PACK_VERSION */
export const CURRENT_LEGAL_PACK_VERSION = "2026-06-21-v2.0";

const consentResponseSchema = z.object({
  pack_version: z.string().nullable(),
  accepted_at: z.string().nullable(),
  has_current_consent: z.boolean(),
  required_pack_version: z.string(),
});

const recordConsentBodySchema = z.object({
  pack_version: z.string().min(1),
  app_version: z.string().optional(),
  accepted_doc_ids: z.array(z.string()).optional(),
  device_id: z.string().optional(),
});

async function resolveCustomerRow(
  db: ReturnType<typeof getDb>,
  sub: string,
  role: string,
  phone: string | undefined,
) {
  let customerId = sub.startsWith("GM") ? sub : role === "customer" ? sub : null;
  if (!customerId && phone) {
    const rows = await db
      .select({ customerId: customers.customerId })
      .from(customers)
      .where(eq(customers.primaryMobile, phone))
      .limit(1);
    customerId = rows[0]?.customerId ?? null;
  }
  if (!customerId) return null;

  const rows = await db
    .select()
    .from(customers)
    .where(eq(customers.customerId, customerId))
    .limit(1);
  return rows[0] ?? null;
}

function consentPayload(row: typeof customers.$inferSelect | null) {
  const packVersion = row?.legalConsentPackVersion?.trim() || null;
  const acceptedAt = row?.legalConsentAt?.toISOString() ?? null;
  return {
    pack_version: packVersion,
    accepted_at: acceptedAt,
    has_current_consent: packVersion === CURRENT_LEGAL_PACK_VERSION,
    required_pack_version: CURRENT_LEGAL_PACK_VERSION,
  };
}

async function logConsentAudit(
  db: ReturnType<typeof getDb>,
  customerDbId: number,
  packVersion: string,
  deviceId?: string,
) {
  const types = ["TERMS_AND_CONDITIONS", "PRIVACY_POLICY"] as const;
  for (const consentType of types) {
    await db.execute(sql`
      INSERT INTO public.customer_consent_log (
        customer_id,
        consent_type,
        consent_version,
        consent_given,
        consent_date,
        device_id
      ) VALUES (
        ${customerDbId},
        ${consentType},
        ${packVersion},
        TRUE,
        NOW(),
        ${deviceId ?? null}
      )
    `);
  }
}

export async function meLegalConsentRoutes(app: FastifyInstance) {
  await app.register(auth, { required: true });

  app.get(
    "/legal-consent",
    {
      schema: {
        response: {
          200: consentResponseSchema,
          401: z.object({ error: z.string(), message: z.string() }),
        },
      },
    },
    async (req, reply) => {
      return withSqlRetry(async () => {
        const db = getDb();
        const row = await resolveCustomerRow(
          db,
          req.auth!.sub,
          req.auth!.role,
          req.auth?.phone,
        );
        if (!row) {
          return reply.code(401).send({
            error: "user_deleted",
            message: "Your account is no longer available. Please sign in again.",
          });
        }
        return consentPayload(row);
      });
    },
  );

  app.post(
    "/legal-consent",
    {
      schema: {
        body: recordConsentBodySchema,
        response: {
          200: consentResponseSchema,
          400: z.object({ message: z.string() }),
          401: z.object({ error: z.string(), message: z.string() }),
        },
      },
    },
    async (req, reply) => {
      const body = recordConsentBodySchema.parse(req.body);
      if (body.pack_version !== CURRENT_LEGAL_PACK_VERSION) {
        return reply.code(400).send({
          message: `Unsupported legal pack version. Expected ${CURRENT_LEGAL_PACK_VERSION}.`,
        });
      }

      return withSqlRetry(async () => {
        const db = getDb();
        const existing = await resolveCustomerRow(
          db,
          req.auth!.sub,
          req.auth!.role,
          req.auth?.phone,
        );
        if (!existing) {
          return reply.code(401).send({
            error: "user_deleted",
            message: "Your account is no longer available. Please sign in again.",
          });
        }

        const now = new Date();
        const [updated] = await db
          .update(customers)
          .set({
            legalConsentPackVersion: body.pack_version,
            legalConsentAt: now,
            updatedAt: now,
          })
          .where(eq(customers.id, existing.id))
          .returning();

        try {
          await logConsentAudit(db, existing.id, body.pack_version, body.device_id);
        } catch (e) {
          req.log?.warn?.({ err: e, customerId: existing.customerId }, "[legal-consent] audit log failed");
        }

        return consentPayload(updated ?? existing);
      });
    },
  );
}
