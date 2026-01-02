import { z } from "zod";

function emptyToUndefined(v: unknown) {
  if (typeof v !== "string") return v;
  const s = v.trim();
  return s.length === 0 ? undefined : s;
}

const EnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(3000),

  // Public
  API_BASE_URL: z.preprocess(emptyToUndefined, z.string().url().optional()),

  // Database
  DATABASE_URL: z.string().min(10),

  // Supabase
  SUPABASE_URL: z.string().url(),
  SUPABASE_ANON_KEY: z.string().min(10),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(10),
  SUPABASE_JWT_SECRET: z.string().min(20),

  // MSG91 (backend-only)
  MSG91_AUTH_KEY: z.preprocess(emptyToUndefined, z.string().min(10).optional()),
  MSG91_TEMPLATE_ID: z.preprocess(emptyToUndefined, z.string().min(3).optional()),
  MSG91_OTP_EXPIRY_SEC: z.preprocess(emptyToUndefined, z.coerce.number().int().positive().default(300)),

  // Firebase Admin (backend-only; used to verify Firebase ID tokens in dev flow)
  FIREBASE_PROJECT_ID: z.preprocess(emptyToUndefined, z.string().min(3).optional()),
  FIREBASE_CLIENT_EMAIL: z.preprocess(emptyToUndefined, z.string().min(3).optional()),
  FIREBASE_PRIVATE_KEY: z.preprocess(emptyToUndefined, z.string().min(30).optional()),

  // Webhook signature secrets (backend-only)
  WEBHOOK_SIGNING_SECRET: z.preprocess(emptyToUndefined, z.string().min(16).optional()),

  // Cloudflare R2 (backend-only)
  R2_TOKEN_VALUE: z.preprocess(emptyToUndefined, z.string().min(10).optional()),
  R2_BUCKET_NAME: z.preprocess(emptyToUndefined, z.string().min(3).optional()),
  R2_ACCESS_KEY: z.preprocess(emptyToUndefined, z.string().min(10).optional()),
  R2_SECRET_KEY: z.preprocess(emptyToUndefined, z.string().min(10).optional()),
  R2_REGION: z.preprocess(emptyToUndefined, z.string().default("auto")),
  R2_ENDPOINT: z.preprocess(emptyToUndefined, z.string().url().optional()),
  R2_ACCOUNT_ID: z.preprocess(emptyToUndefined, z.string().min(10).optional()),
  R2_PUBLIC_BASE_URL: z.preprocess(emptyToUndefined, z.string().url().optional()),

  // Razorpay (backend-only)
  RAZORPAY_KEY_ID: z.preprocess(emptyToUndefined, z.string().min(10).optional()),
  RAZORPAY_KEY_SECRET: z.preprocess(emptyToUndefined, z.string().min(10).optional()),
  RAZORPAY_WEBHOOK_SECRET: z.preprocess(emptyToUndefined, z.string().min(10).optional()),
});

export type Env = z.infer<typeof EnvSchema>;

export function getEnv(): Env {
  const parsed = EnvSchema.safeParse(process.env);
  if (!parsed.success) {
    // Keep the output readable and actionable in production logs.
    // Never print secrets; zod error output is safe.
    // eslint-disable-next-line no-console
    console.error(parsed.error.flatten().fieldErrors);
    throw new Error("Invalid environment variables");
  }
  return parsed.data;
}


