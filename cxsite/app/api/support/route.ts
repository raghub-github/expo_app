/**
 * Support ticket intake — POST /api/support
 *
 * Public forms on the customer website (ticket / report) insert into
 * the same `unified_tickets` inbox agents use at control.gatimitra.com/dashboard/tickets.
 * Source: CUSTOMER_WEBSITE; queue: GRP_CUSTOMER_WEBSITE (ticket_groups).
 *
 * Pattern mirrors /api/corporates/enquiry (Supabase service role, no customer JWT).
 */
import { NextRequest, NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseServiceRole } from "@/lib/supabaseServiceRole";
import { validateRealEmail } from "@/lib/emailValidation";

export const runtime = "nodejs";

const CUSTOMER_WEBSITE_GROUP_CODE = "GRP_CUSTOMER_WEBSITE";
const CUSTOMER_WEBSITE_GROUP_NAME = "Customer Website";
const ENV_GROUP_ID = Number.parseInt(
  process.env.CUSTOMER_WEBSITE_TICKET_GROUP_ID ?? "",
  10,
);

type Payload = {
  channel?: string;
  name?: string;
  email?: string;
  phone?: string;
  topic?: string;
  message?: string;
  orderId?: string;
  _hp?: string;
};

const RATE: Map<string, { count: number; resetAt: number }> = new Map();
const WINDOW_MS = 60 * 60 * 1000;
const LIMIT = 10;

const UNIFIED_TICKET_TITLE_ENUM = new Set([
  "OTHER",
  "FEEDBACK",
  "COMPLAINT",
  "SUGGESTION",
  "ACCOUNT_ISSUE",
  "PAYMENT_ISSUE",
  "REFUND_NOT_PROCESSED",
  "APP_TECHNICAL_ISSUE",
  "APP_CRASH_OR_BUG",
  "PAYMENT_METHOD_ISSUE",
  "WALLET_ISSUE",
]);

function rateLimit(ip: string): boolean {
  const now = Date.now();
  const cur = RATE.get(ip);
  if (!cur || cur.resetAt < now) {
    RATE.set(ip, { count: 1, resetAt: now + WINDOW_MS });
    return true;
  }
  cur.count++;
  return cur.count <= LIMIT;
}

function mapServiceType(topic: string): "FOOD" | "PARCEL" | "RIDE" | "GENERAL" {
  const t = topic.toLowerCase();
  if (t.includes("food")) return "FOOD";
  if (t.includes("parcel")) return "PARCEL";
  if (t.includes("ride")) return "RIDE";
  return "GENERAL";
}

function mapTitleAndCategory(channel: string, topic: string): {
  ticketTitle: string;
  ticketCategory: "FEEDBACK" | "COMPLAINT" | "PAYMENT" | "REFUND" | "ACCOUNT" | "TECHNICAL" | "OTHER";
} {
  const t = topic.toLowerCase();
  if (channel === "feedback" || t.includes("suggestion")) {
    return { ticketTitle: "FEEDBACK", ticketCategory: "FEEDBACK" };
  }
  if (channel === "report" || t.includes("safety") || t.includes("complaint")) {
    return { ticketTitle: "COMPLAINT", ticketCategory: "COMPLAINT" };
  }
  if (t.includes("refund")) {
    return { ticketTitle: "REFUND_NOT_PROCESSED", ticketCategory: "REFUND" };
  }
  if (t.includes("payment") || t.includes("wallet") || t.includes("gmitra money")) {
    return { ticketTitle: "PAYMENT_ISSUE", ticketCategory: "PAYMENT" };
  }
  if (t.includes("account") || t.includes("login") || t.includes("privacy")) {
    return { ticketTitle: "ACCOUNT_ISSUE", ticketCategory: "ACCOUNT" };
  }
  if (t.includes("bug") || t.includes("crash") || t.includes("app")) {
    return { ticketTitle: "APP_TECHNICAL_ISSUE", ticketCategory: "TECHNICAL" };
  }
  return { ticketTitle: "OTHER", ticketCategory: "OTHER" };
}

function coerceTitle(raw: string): string {
  const t = raw.trim().toUpperCase();
  return UNIFIED_TICKET_TITLE_ENUM.has(t) ? t : "OTHER";
}

function channelLabel(channel: string): string {
  if (channel === "report") return "Report an issue";
  if (channel === "feedback") return "Feedback";
  return "Support ticket";
}

function buildSubject(channel: string, topic: string, orderId: string): string {
  const base = `${channelLabel(channel)} — ${topic || "General"}`;
  const withOrder = orderId ? `${base} (${orderId})` : base;
  return withOrder.slice(0, 500);
}

function buildDescription(opts: {
  name: string;
  email: string;
  phone: string;
  topic: string;
  message: string;
  channel: string;
  orderId: string;
}): string {
  const lines = [
    `Source: Customer website (/support)`,
    `Channel: ${channelLabel(opts.channel)}`,
    "",
    "Name:",
    opts.name,
    "",
    "Email:",
    opts.email,
    "",
    "Phone:",
    opts.phone || "—",
    "",
    "Topic:",
    opts.topic || "—",
    "",
    "Order ID:",
    opts.orderId || "—",
    "",
    "Message:",
    opts.message,
  ];
  return lines.join("\n").slice(0, 12000);
}

/**
 * Resolve (or create) the Customer Website ticket queue so tickets land in a proper group.
 */
async function ensureCustomerWebsiteGroupId(
  admin: SupabaseClient,
): Promise<number | null> {
  if (Number.isFinite(ENV_GROUP_ID) && ENV_GROUP_ID > 0) {
    return ENV_GROUP_ID;
  }

  const existing = await admin
    .from("ticket_groups")
    .select("id")
    .eq("group_code", CUSTOMER_WEBSITE_GROUP_CODE)
    .maybeSingle();

  if (!existing.error && existing.data?.id != null) {
    return Number(existing.data.id);
  }

  const insert = await admin
    .from("ticket_groups")
    .insert({
      group_code: CUSTOMER_WEBSITE_GROUP_CODE,
      group_name: CUSTOMER_WEBSITE_GROUP_NAME,
      group_description:
        "Tickets raised from gatimitra.com /support (ticket + report). Agents reply via customer email.",
      parent_group_id: null,
      group_level: 1,
      display_order: 25,
      is_active: true,
      metadata: { source: "customer_website", channels: ["ticket", "report"] },
    })
    .select("id")
    .single();

  if (!insert.error && insert.data?.id != null) {
    return Number(insert.data.id);
  }

  // Race: another request created it
  const again = await admin
    .from("ticket_groups")
    .select("id")
    .eq("group_code", CUSTOMER_WEBSITE_GROUP_CODE)
    .maybeSingle();

  if (!again.error && again.data?.id != null) {
    return Number(again.data.id);
  }

  // eslint-disable-next-line no-console
  console.warn(
    JSON.stringify({
      msg: "customer_website_group_ensure_failed",
      error: insert.error?.message ?? existing.error?.message ?? again.error?.message,
    }),
  );
  return null;
}

export async function POST(req: NextRequest) {
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    "unknown";

  if (!rateLimit(ip)) {
    return NextResponse.json(
      { error: "Too many requests. Please try again in an hour." },
      { status: 429 },
    );
  }

  let body: Payload;
  try {
    body = (await req.json()) as Payload;
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  // Honeypot — silently accept and discard
  if (body._hp && body._hp.length > 0) {
    return NextResponse.json({ ticketId: "GM-OK", ok: true });
  }

  const name = (body.name ?? "").trim();
  const emailRaw = (body.email ?? "").trim();
  const message = (body.message ?? "").trim();
  const topic = (body.topic ?? "").trim();
  const channel = (body.channel ?? "ticket").trim();
  const phone = (body.phone ?? "").trim();
  const orderIdText = (body.orderId ?? "").trim();

  if (name.length < 2 || name.length > 80) {
    return NextResponse.json({ error: "Please enter your name." }, { status: 400 });
  }
  const emailCheck = await validateRealEmail(emailRaw);
  if (!emailCheck.ok) {
    return NextResponse.json(
      { error: emailCheck.reason ?? "Please enter a valid email address." },
      { status: 400 },
    );
  }
  const email = emailCheck.email;
  if (message.length < 20 || message.length > 4000) {
    return NextResponse.json(
      { error: "Please describe the issue in 20–4000 characters." },
      { status: 400 },
    );
  }
  if (!["ticket", "report", "feedback"].includes(channel)) {
    return NextResponse.json({ error: "Unknown channel." }, { status: 400 });
  }

  const admin = getSupabaseServiceRole();
  if (!admin) {
    return NextResponse.json(
      {
        error:
          "Server is not configured for ticket creation (Supabase service role).",
      },
      { status: 503 },
    );
  }

  const serviceType = mapServiceType(topic);
  const { ticketTitle, ticketCategory } = mapTitleAndCategory(channel, topic);
  const subject = buildSubject(channel, topic, orderIdText);
  const description = buildDescription({
    name,
    email,
    phone,
    topic,
    message,
    orderId: orderIdText,
    channel,
  });

  const groupId = await ensureCustomerWebsiteGroupId(admin);

  const row: Record<string, unknown> = {
    // Empty string triggers generate_ticket_id() (BEFORE INSERT) → TKT-YYYY-######.
    ticket_id: "",
    // Keep NON_ORDER_RELATED until we resolve a real orders_core id from free-text orderId.
    ticket_type: "NON_ORDER_RELATED",
    ticket_source: "CUSTOMER_WEBSITE",
    service_type: serviceType,
    ticket_title: coerceTitle(ticketTitle),
    ticket_category: ticketCategory,
    order_id: null,
    customer_id: null,
    rider_id: null,
    merchant_store_id: null,
    merchant_parent_id: null,
    // Badge source: ticket_source = CUSTOMER_WEBSITE (shown as section chip).
    // raised_by_type stays CUSTOMER_WEBSITE when DB check allows guest web;
    // SYSTEM is a safe fallback if the 0101 constraint migration is not applied yet.
    raised_by_type: "CUSTOMER_WEBSITE",
    raised_by_id: null,
    raised_by_name: name,
    raised_by_mobile: phone || null,
    raised_by_email: email,
    subject,
    description,
    attachments: null,
    priority: channel === "report" ? "HIGH" : "MEDIUM",
    status: "OPEN",
    auto_generated: false,
    metadata: {
      customer_help: {
        source_platform: "CUSTOMER_WEBSITE",
        channel,
        topic,
        order_id_text: orderIdText || null,
        ip,
        submitted_at: new Date().toISOString(),
      },
      source: "gatimitra_customer_website",
      ticket_group_code: CUSTOMER_WEBSITE_GROUP_CODE,
      ticket_group_id: groupId,
    },
    tags: ["customer-website", channel],
  };

  if (groupId != null && groupId > 0) {
    row.group_id = groupId;
  }

  let { data, error } = await admin
    .from("unified_tickets")
    .insert(row)
    .select("id, ticket_id")
    .single();

  // Pre-0101 DBs reject CUSTOMER_WEBSITE on raised_by_type — keep source chip, fall back to SYSTEM.
  if (
    error &&
    (error.message?.includes("unified_tickets_raised_by_check") ||
      error.code === "23514")
  ) {
    const fallback = { ...row, raised_by_type: "SYSTEM" };
    const retry = await admin
      .from("unified_tickets")
      .insert(fallback)
      .select("id, ticket_id")
      .single();
    data = retry.data;
    error = retry.error;
  }

  if (error) {
    const msg = error.message ?? "Insert failed";
    const hint =
      msg.includes("CUSTOMER_WEBSITE") || msg.includes("invalid input value for enum")
        ? " Run drizzle/0100_customer_website_ticket_source.sql and 0101_customer_website_raised_by_check.sql on the database."
        : "";
    // eslint-disable-next-line no-console
    console.error(
      JSON.stringify({
        msg: "support_ticket_insert_failed",
        error: msg,
        code: error.code,
        channel,
        email,
        ip,
        ts: new Date().toISOString(),
      }),
    );
    return NextResponse.json(
      { error: msg + hint, code: error.code },
      { status: 500 },
    );
  }

  const ticketId =
    data?.ticket_id != null && String(data.ticket_id).trim()
      ? String(data.ticket_id).trim()
      : `TKT-${data?.id ?? "NEW"}`;

  // eslint-disable-next-line no-console
  console.log(
    JSON.stringify({
      msg: "support_ticket_created",
      ticketId,
      id: data?.id ?? null,
      channel,
      topic,
      email,
      phoneTail: phone.replace(/\D/g, "").slice(-4),
      orderId: orderIdText || null,
      ip,
      ts: new Date().toISOString(),
    }),
  );

  // Seed conversation so agents can reply in the same thread as in-app tickets.
  if (data?.id != null) {
    const { error: msgError } = await admin.from("unified_ticket_messages").insert({
      ticket_id: data.id,
      sender_type: "CUSTOMER_WEBSITE",
      sender_id: null,
      sender_name: name,
      sender_email: email,
      message_type: "TEXT",
      message_text: message,
      is_internal_note: false,
    });
    if (msgError) {
      // Non-fatal — ticket row is enough for dashboard tracking/reply.
      // eslint-disable-next-line no-console
      console.warn(
        JSON.stringify({
          msg: "support_ticket_message_seed_failed",
          ticketId,
          error: msgError.message,
        }),
      );
    }
  }

  return NextResponse.json({
    ok: true,
    ticketId,
    ticket_id: ticketId,
    id: data?.id ?? null,
  });
}
