/**
 * Send transactional email via Resend API.
 * Set RESEND_API_KEY and RESEND_FROM_EMAIL in env. If not set, logs and returns false (no throw).
 */
export async function sendEmail(params: {
  to: string;
  subject: string;
  text: string;
  from?: string;
}): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from =
    params.from ??
    process.env.RESEND_FROM_EMAIL?.trim() ??
    "GatiMitra <noreply@gatimitra.com>";

  if (!apiKey) {
    console.warn("[email] RESEND_API_KEY not set; skipping send.", {
      to: params.to,
      subject: params.subject,
    });
    return false;
  }

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [params.to],
        subject: params.subject,
        text: params.text,
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error("[email] Resend error:", res.status, err);
      return false;
    }
    return true;
  } catch (e) {
    console.error("[email] Send failed:", e);
    return false;
  }
}
