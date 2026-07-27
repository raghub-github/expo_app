/** Public HTML Cashfree redirects to after DigiLocker — deep-links back into Rider. */

export const RIDER_DIGILOCKER_DEEP_LINK = "gatimitra-rider://digilocker-return";

/** Dedicated DigiLocker return (not payment / razorpay-checkout). */
export const RIDER_DIGILOCKER_HTTPS_RETURN =
  "https://api.gatimitra.com/v1/onboarding/digilocker-return";

export type RiderDigilockerReturnPageKind =
  | "success"
  | "pending"
  | "failed"
  | "unknown";

export function buildRiderDigilockerReturnHtml(opts?: {
  kind?: RiderDigilockerReturnPageKind;
  verificationId?: string | null;
  status?: string | null;
}): string {
  const kind: RiderDigilockerReturnPageKind = opts?.kind ?? "pending";
  const verificationId = String(opts?.verificationId || "").trim();
  const status = String(opts?.status || "").trim();

  const deepParams = new URLSearchParams();
  if (verificationId) deepParams.set("verification_id", verificationId);
  if (status) deepParams.set("status", status);
  deepParams.set("source", "digilocker-return");
  const qs = deepParams.toString();
  const deepLink = qs ? `${RIDER_DIGILOCKER_DEEP_LINK}?${qs}` : RIDER_DIGILOCKER_DEEP_LINK;

  const copy =
    kind === "success"
      ? {
          title: "Aadhaar verified",
          body: "DigiLocker verification succeeded. Return to the Rider app to continue onboarding.",
          accent: "#059669",
          bg: "#ecfdf5",
          border: "#a7f3d0",
        }
      : kind === "failed"
        ? {
            title: "Verification did not complete",
            body: "DigiLocker consent was denied or expired. Return to the Rider app to try again or use photo upload if available.",
            accent: "#b45309",
            bg: "#fffbeb",
            border: "#fde68a",
          }
        : kind === "unknown"
          ? {
              title: "Return to Rider app",
              body: "We could not match this DigiLocker session. Open the Rider app — if verification finished, it will update automatically.",
              accent: "#475569",
              bg: "#f8fafc",
              border: "#e2e8f0",
            }
          : {
              title: "Returning to Aadhaar verification",
              body: "DigiLocker step finished. You will return to the same Rider onboarding screen.",
              accent: "#059669",
              bg: "#ecfdf5",
              border: "#a7f3d0",
            };

  const safeTitle = escapeHtml(copy.title);
  const safeBody = escapeHtml(copy.body);
  const safeDeep = escapeHtml(deepLink);
  const safeDeepJs = JSON.stringify(deepLink);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <meta http-equiv="refresh" content="0;url=${safeDeep}"/>
  <title>${safeTitle}</title>
  <style>
    body { font-family: system-ui, sans-serif; margin: 0; min-height: 100vh; display: flex;
      align-items: center; justify-content: center; background: ${copy.bg}; padding: 24px; box-sizing: border-box; }
    .card { max-width: 360px; width: 100%; background: #fff; border: 1px solid ${copy.border};
      border-radius: 16px; padding: 24px; text-align: center; box-shadow: 0 4px 16px rgba(0,0,0,.06); }
    h1 { font-size: 17px; margin: 0 0 8px; color: ${copy.accent}; }
    p { font-size: 14px; line-height: 1.45; color: #475569; margin: 0 0 16px; }
    a { display: inline-block; background: #059669; color: #fff; text-decoration: none;
      font-weight: 700; font-size: 14px; padding: 12px 18px; border-radius: 12px; }
  </style>
</head>
<body>
  <div class="card">
    <h1>${safeTitle}</h1>
    <p>${safeBody}</p>
    <a href="${safeDeep}">Back to Rider app</a>
  </div>
  <script>
    try { window.location.replace(${safeDeepJs}); } catch (e) {}
    setTimeout(function () { try { window.close(); } catch (e) {} }, 1200);
  </script>
</body>
</html>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
