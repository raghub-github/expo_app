import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { fetchBackend } from "@/lib/fetch-backend";

const COOKIE = "gm_pending_merchant_referral_v1";

export default async function MerchantRefLandingPage({
  params,
  searchParams,
}: {
  params: Promise<{ code: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { code: rawCode } = await params;
  const q = await searchParams;
  const code = String(rawCode ?? "").trim().toUpperCase();
  const clickRaw = q.click;
  const click = Array.isArray(clickRaw) ? clickRaw[0] : clickRaw;

  if (code.length < 3) {
    redirect("/auth/register");
  }

  let merchantReferralOn = true;
  try {
    const res = await fetchBackend("/v1/referral/config?userType=merchant", {
      timeoutMs: 6_000,
    });
    if (res) {
      const body = (await res.json().catch(() => ({}))) as { referralEnabled?: boolean };
      merchantReferralOn = body.referralEnabled === true;
    }
  } catch {
    merchantReferralOn = true;
  }

  if (!merchantReferralOn) {
    redirect("/auth/register?referralUnavailable=1");
  }

  const jar = await cookies();
  jar.set(
    COOKIE,
    JSON.stringify({
      code,
      clickToken: click || null,
      source: "deep_link",
      savedAt: new Date().toISOString(),
    }),
    {
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
      sameSite: "lax",
      httpOnly: false,
    },
  );

  const dest = new URLSearchParams();
  dest.set("ref", code);
  if (click) dest.set("click", click);
  redirect(`/auth/register?${dest.toString()}`);
}
