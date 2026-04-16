import { NextRequest, NextResponse } from "next/server";
import { requireSuperAdminApi } from "@/lib/super-admin-api";
import { z } from "zod";
import { getSql } from "@/lib/db/client";

export const runtime = "nodejs";

/**
 * Sends Expo push notifications directly (no backend proxy).
 * This avoids dashboard ↔ backend port conflicts in local dev.
 */
export async function POST(req: NextRequest) {
  const gate = await requireSuperAdminApi();
  if (!gate.ok) return gate.response;

  const secret = process.env.PUSH_NOTIFICATION_ADMIN_SECRET;
  if (!secret) {
    const missing: string[] = [];
    if (!secret) missing.push("PUSH_NOTIFICATION_ADMIN_SECRET");
    return NextResponse.json(
      {
        error: "Push admin not configured",
        message:
          "Set PUSH_NOTIFICATION_ADMIN_SECRET in dashboard .env.local.",
        missing,
      },
      { status: 503 }
    );
  }

  const sendBodySchema = z.object({
    title: z.string().min(1).max(200),
    message: z.string().min(1).max(2000),
    type: z.enum(["BASIC", "RICH", "ACTIONABLE"]),
    image: z.union([z.string().url(), z.literal(""), z.null()]).optional(),
    emoji: z.union([z.string().max(32), z.literal(""), z.null()]).optional(),
    target_role: z.enum(["customer", "merchant", "rider"]),
    target_user_ids: z.array(z.string().min(1)).max(5000).optional().nullable(),
    notification_icon: z.union([z.string().max(200), z.literal(""), z.null()]).optional(),
    deep_link: z.union([z.string().max(2000), z.literal(""), z.null()]).optional(),
    screen: z.union([z.string().max(500), z.literal(""), z.null()]).optional(),
  });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  try {
    const input = sendBodySchema.parse(body);

    const sql = getSql();
    const ids = (input.target_user_ids ?? []).map((s) => String(s).trim()).filter(Boolean);

    let rows: Array<{ expo_push_token: string }> = [];
    if (ids.length > 0) {
      rows = (await sql`
        SELECT expo_push_token
        FROM expo_push_tokens
        WHERE role = ${input.target_role}
          AND user_id = ANY(${ids}::text[])
      `) as any;
    } else {
      rows = (await sql`
        SELECT expo_push_token
        FROM expo_push_tokens
        WHERE role = ${input.target_role}
      `) as any;
    }

    const tokens = [...new Set(rows.map((r) => String((r as any)?.expo_push_token ?? "")).filter(Boolean))];

    const PUSH_TOKEN_CHUNK = 100;
    const emojiRaw = typeof input.emoji === "string" ? input.emoji.trim() : "";
    const title = emojiRaw ? `${emojiRaw} ${input.title}`.trim() : input.title;
    const image = typeof input.image === "string" && input.image.trim() ? input.image.trim() : undefined;
    const deepLink = typeof input.deep_link === "string" ? input.deep_link.trim() : "";
    const screen = typeof input.screen === "string" ? input.screen.trim() : "";
    const icon = typeof input.notification_icon === "string" ? input.notification_icon.trim() : "";

    const data: Record<string, string> = {
      gmType: input.type,
      gmTitle: input.title,
      gmMessage: input.message,
      imageUrl: image ?? "",
      emoji: emojiRaw,
      icon,
      deepLink,
      screen,
    };

    let expoOk = 0;
    let expoErr = 0;
    let batches = 0;

    for (let i = 0; i < tokens.length; i += PUSH_TOKEN_CHUNK) {
      const chunk = tokens.slice(i, i + PUSH_TOKEN_CHUNK);
      if (chunk.length === 0) continue;
      batches += 1;

      const messages = chunk.map((to) => ({
        to,
        title,
        body: input.message,
        data,
        sound: "default",
        priority: "high",
        mutableContent: input.type === "RICH" && !!image,
        ...(input.type === "RICH" && image ? { richContent: { image } } : {}),
      }));

      const expoRes = await fetch("https://exp.host/--/api/v2/push/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(messages),
      });
      const expoJson = (await expoRes.json().catch(() => null)) as any;
      const ticketData: any[] = Array.isArray(expoJson?.data) ? expoJson.data : [];

      for (const t of ticketData) {
        if (t?.status === "ok") expoOk += 1;
        else expoErr += 1;
      }

      // If Expo returned nothing usable, count whole chunk as error.
      if (ticketData.length === 0) {
        expoErr += chunk.length;
      }
    }

    // Best-effort log insert (table exists if migration was run).
    try {
      await sql`
        INSERT INTO expo_push_notification_logs
          (title, message, notification_type, target_role, target_user_ids, tokens_targeted, expo_tickets_ok, expo_tickets_error, detail)
        VALUES
          (${input.title}, ${input.message}, ${input.type}, ${input.target_role}, ${ids.length > 0 ? ids : null}, ${tokens.length}, ${expoOk}, ${expoErr}, ${JSON.stringify({ batches, deep_link: input.deep_link ?? null, screen: input.screen ?? null })}::jsonb)
      `;
    } catch {
      // ignore
    }

    return NextResponse.json(
      {
        ok: true,
        tokens_targeted: tokens.length,
        batches,
        expo_tickets_ok: expoOk,
        expo_tickets_error: expoErr,
      },
      { status: 200 }
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Proxy failed";
    // zod validation errors are readable; treat all as bad request unless it looks like infra.
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
