import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireSuperAdminApi } from "@/lib/super-admin-api";
import { getSql } from "@/lib/db/client";
import { writeReferralAudit } from "@/lib/db/operations/referral-engine";

export const runtime = "nodejs";

const bodySchema = z.object({
  jobId: z.number().int().positive(),
  action: z.enum(["retry", "force", "mark_failed", "skip"]).default("retry"),
});

export async function POST(req: NextRequest) {
  const gate = await requireSuperAdminApi();
  if (!gate.ok) return gate.response;
  try {
    const body = bodySchema.parse(await req.json());
    const sql = getSql();

    if (body.action === "mark_failed") {
      await sql`
        UPDATE referral_reward_jobs
        SET status = 'dead', last_error = 'admin_mark_failed', updated_at = NOW(), completed_at = NOW()
        WHERE id = ${body.jobId}
      `;
    } else if (body.action === "skip") {
      await sql`
        UPDATE referral_reward_jobs
        SET status = 'skipped', last_error = 'admin_skip', updated_at = NOW(), completed_at = NOW()
        WHERE id = ${body.jobId}
      `;
    } else {
      await sql`
        UPDATE referral_reward_jobs
        SET status = 'queued',
            next_attempt_at = NOW(),
            max_attempts = CASE WHEN ${body.action === "force"} THEN GREATEST(max_attempts, attempts + 3) ELSE max_attempts END,
            updated_at = NOW()
        WHERE id = ${body.jobId}
      `;
    }

    await writeReferralAudit({
      action: `job.${body.action}`,
      entityType: "referral_reward_jobs",
      entityId: String(body.jobId),
      newValue: { action: body.action },
      ip: req.headers.get("x-forwarded-for"),
      userAgent: req.headers.get("user-agent"),
    });

    return NextResponse.json({ success: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Retry failed";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
