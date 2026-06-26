/**
 * Support ticket intake — POST /api/support
 *
 * Validates and creates a ticket. Initial implementation logs to the request
 * log and returns a synthetic ticket ID; in a follow-up we wire this to the
 * existing dashboard `customer-support` system (POST /v1/customer-support on
 * the Fastify backend) so tickets flow into the same inbox as in-app tickets.
 *
 * Security:
 *   - Server-side validation with simple type guards (no Zod dep to keep
 *     install footprint small for now).
 *   - Honeypot field `_hp` rejects bots silently.
 *   - In-memory rate limit per IP (10 / hour). Survives until process restart.
 */
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

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

function validEmail(s: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}

function genTicketId(): string {
  // Compact, sortable, non-guessable.
  const ts = Date.now().toString(36).toUpperCase().slice(-6);
  const rand = Array.from(crypto.getRandomValues(new Uint8Array(3)))
    .map((b) => b.toString(36).toUpperCase().padStart(2, "0"))
    .join("");
  return `GM-${ts}-${rand}`.replace(/[^A-Z0-9-]/g, "");
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
    return NextResponse.json({ ticketId: genTicketId() });
  }

  const name = (body.name ?? "").trim();
  const email = (body.email ?? "").trim();
  const message = (body.message ?? "").trim();
  const topic = (body.topic ?? "").trim();
  const channel = (body.channel ?? "ticket").trim();

  if (name.length < 2 || name.length > 80) {
    return NextResponse.json({ error: "Please enter your name." }, { status: 400 });
  }
  if (!validEmail(email)) {
    return NextResponse.json({ error: "Please enter a valid email address." }, { status: 400 });
  }
  if (message.length < 20 || message.length > 4000) {
    return NextResponse.json(
      { error: "Please describe the issue in 20–4000 characters." },
      { status: 400 },
    );
  }
  if (!["ticket", "report", "feedback"].includes(channel)) {
    return NextResponse.json({ error: "Unknown channel." }, { status: 400 });
  }

  const ticketId = genTicketId();

  // Log structured event — picked up by Pino-compatible aggregators in prod.
  // eslint-disable-next-line no-console
  console.log(
    JSON.stringify({
      msg: "support_ticket_created",
      ticketId,
      channel,
      topic,
      email,
      phoneTail: (body.phone ?? "").replace(/\D/g, "").slice(-4),
      orderId: (body.orderId ?? "").trim() || null,
      ip,
      ts: new Date().toISOString(),
    }),
  );

  return NextResponse.json({ ticketId });
}
