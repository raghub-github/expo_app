/**
 * Public feedback — customer_reviews
 * GET  /api/feedback  — list recent reviews
 * POST /api/feedback  — submit name, email, review, stars
 */
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServiceRole } from "@/lib/supabaseServiceRole";
import { validateRealEmail } from "@/lib/emailValidation";

export const runtime = "nodejs";

const RATE: Map<string, { count: number; resetAt: number }> = new Map();
const WINDOW_MS = 60 * 60 * 1000;
const LIMIT = 8;

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

function mapReview(row: Record<string, unknown>) {
  return {
    id: Number(row.id),
    name: row.name != null ? String(row.name) : null,
    review: row.review != null ? String(row.review) : null,
    stars: row.stars != null ? Number(row.stars) : null,
    status: row.status != null ? String(row.status) : "pending",
    response_message:
      row.response_message != null ? String(row.response_message) : null,
    created_at: row.created_at != null ? String(row.created_at) : null,
  };
}

export async function GET(req: NextRequest) {
  const admin = getSupabaseServiceRole();
  if (!admin) {
    return NextResponse.json(
      { ok: false, error: "Server not configured.", reviews: [] },
      { status: 503 },
    );
  }

  // Live check: format + MX + duplicate — GET /api/feedback?checkEmail=user@example.com
  const checkEmail = (req.nextUrl.searchParams.get("checkEmail") ?? "")
    .trim()
    .toLowerCase();
  if (checkEmail) {
    const real = await validateRealEmail(checkEmail);
    if (!real.ok) {
      return NextResponse.json({
        ok: true,
        valid: false,
        exists: false,
        reason: real.reason,
      });
    }
    const existing = await admin
      .from("customer_reviews")
      .select("id")
      .ilike("email", real.email)
      .limit(1)
      .maybeSingle();
    if (existing.error) {
      return NextResponse.json(
        { ok: false, error: existing.error.message, exists: false, valid: false },
        { status: 500 },
      );
    }
    return NextResponse.json({
      ok: true,
      valid: true,
      exists: existing.data?.id != null,
    });
  }

  // My reviews: GET /api/feedback?mine=1&email=user@example.com
  const mine = req.nextUrl.searchParams.get("mine") === "1";
  const mineEmail = (req.nextUrl.searchParams.get("email") ?? "")
    .trim()
    .toLowerCase();

  if (mine) {
    if (!mineEmail || !mineEmail.includes("@")) {
      return NextResponse.json(
        { ok: false, error: "email required", reviews: [] },
        { status: 400 },
      );
    }
    const { data, error } = await admin
      .from("customer_reviews")
      .select("id, name, email, review, stars, status, response_message, created_at")
      .ilike("email", mineEmail)
      .order("created_at", { ascending: false })
      .limit(100);

    if (error) {
      return NextResponse.json(
        { ok: false, error: error.message, reviews: [] },
        { status: 500 },
      );
    }

    const reviews = (data ?? [])
      .filter((r) => String(r.review ?? "").trim().length > 0)
      .map((r) => mapReview(r as Record<string, unknown>));

    return NextResponse.json({ ok: true, reviews, mine: true });
  }

  const { data, error } = await admin
    .from("customer_reviews")
    .select("id, name, review, stars, status, response_message, created_at")
    .not("review", "is", null)
    .neq("status", "rejected")
    .neq("status", "hidden")
    .order("created_at", { ascending: false })
    .limit(40);

  if (error) {
    return NextResponse.json(
      { ok: false, error: error.message, reviews: [] },
      { status: 500 },
    );
  }

  const reviews = (data ?? [])
    .filter((r) => String(r.review ?? "").trim().length > 0)
    .map((r) => mapReview(r as Record<string, unknown>));

  return NextResponse.json({ ok: true, reviews });
}

type Body = {
  name?: string;
  email?: string;
  review?: string;
  stars?: number | string;
  _hp?: string;
};

export async function POST(req: NextRequest) {
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    "unknown";

  if (!rateLimit(ip)) {
    return NextResponse.json(
      { ok: false, error: "Too many requests. Try again later." },
      { status: 429 },
    );
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid body." }, { status: 400 });
  }

  if (body._hp && body._hp.length > 0) {
    return NextResponse.json({ ok: true, id: 0 });
  }

  const name = (body.name ?? "").trim();
  const emailRaw = (body.email ?? "").trim();
  const review = (body.review ?? "").trim();
  const starsRaw = typeof body.stars === "string" ? Number(body.stars) : body.stars;
  const stars = Number.isFinite(starsRaw) ? Math.round(Number(starsRaw)) : 0;

  if (name.length < 2 || name.length > 80) {
    return NextResponse.json({ ok: false, error: "Please enter your name." }, { status: 400 });
  }

  const emailCheck = await validateRealEmail(emailRaw);
  if (!emailCheck.ok) {
    return NextResponse.json(
      {
        ok: false,
        error: emailCheck.reason ?? "Please enter a valid email address.",
        code: "INVALID_EMAIL",
      },
      { status: 400 },
    );
  }
  const email = emailCheck.email;

  if (review.length < 10 || review.length > 2000) {
    return NextResponse.json(
      { ok: false, error: "Feedback must be 10–2000 characters." },
      { status: 400 },
    );
  }
  if (stars < 1 || stars > 5) {
    return NextResponse.json(
      { ok: false, error: "Please select a star rating (1–5)." },
      { status: 400 },
    );
  }

  const admin = getSupabaseServiceRole();
  if (!admin) {
    return NextResponse.json(
      { ok: false, error: "Server is not configured for feedback." },
      { status: 503 },
    );
  }

  // One feedback per email (case-insensitive)
  const existing = await admin
    .from("customer_reviews")
    .select("id")
    .ilike("email", email)
    .limit(1)
    .maybeSingle();

  if (existing.error) {
    return NextResponse.json(
      { ok: false, error: existing.error.message, code: existing.error.code },
      { status: 500 },
    );
  }
  if (existing.data?.id != null) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "You have already submitted feedback with this email. Duplicate submissions are not allowed.",
        code: "DUPLICATE_EMAIL",
      },
      { status: 409 },
    );
  }

  const { data, error } = await admin
    .from("customer_reviews")
    .insert({
      name,
      email,
      review,
      stars,
      status: "pending",
      is_read: false,
    })
    .select("id, created_at")
    .single();

  if (error) {
    // Unique index race / constraint
    if (error.code === "23505") {
      return NextResponse.json(
        {
          ok: false,
          error:
            "You have already submitted feedback with this email. Duplicate submissions are not allowed.",
          code: "DUPLICATE_EMAIL",
        },
        { status: 409 },
      );
    }
    return NextResponse.json(
      { ok: false, error: error.message, code: error.code },
      { status: 500 },
    );
  }

  return NextResponse.json({
    ok: true,
    id: data?.id ?? null,
    created_at: data?.created_at ?? null,
  });
}
