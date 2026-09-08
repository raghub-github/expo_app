/**
 * Native deep-link URL rewriter (Expo Router).
 *
 * FCM / Android often launches the Rider app as `gatimitra-rider:///`
 * (empty path) when a dispatch notification is tapped. Without this rewriter
 * Expo Router can land on the Unmatched Route screen.
 *
 * Empty launcher URLs MUST land on `/` so Index can wait for session
 * validation. Dispatch taps go to `/(tabs)/orders`.
 *
 * Razorpay hosted checkout returns `gatimitra-rider://pay-success|pay-cancel`
 * (also `exp://…/--/pay-cancel` in Expo Go). WebBrowser already consumes the
 * URL for verification — Expo Router must NOT navigate to those paths or the
 * user sees "This screen doesn't exist" / gets bounced through Index → login.
 *
 * See: https://docs.expo.dev/router/advanced/native-intent/
 */

function stripScheme(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  try {
    if (trimmed.includes("://")) {
      const normalized = trimmed.replace(/^gatimitra-rider:\/\//i, "https://gatimitra.local/");
      const u = new URL(normalized);
      const host = u.hostname === "gatimitra.local" ? "" : u.hostname;
      const pathPart = u.pathname && u.pathname !== "/" ? u.pathname : "";
      const combined = `/${host}${pathPart}`.replace(/\/+/g, "/");
      const path = `${combined === "/" && !host ? "/" : combined}${u.search || ""}`;
      return path;
    }
  } catch {
    /* fall through */
  }
  return trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
}

const AUTH_ENTRY = "/";

function isRazorpayCheckoutReturn(pathOrUrl: string): boolean {
  return /pay-success/i.test(pathOrUrl) || /pay-cancel/i.test(pathOrUrl);
}

function isDigilockerReturn(pathOrUrl: string): boolean {
  return /digilocker-return/i.test(pathOrUrl);
}

export function redirectSystemPath({
  path,
  initial,
}: {
  path: string;
  initial: boolean;
}): string {
  try {
    const raw = path ?? "";
    const p = stripScheme(raw);

    // Hosted Razorpay auth-session callbacks — land on real routes (not Unmatched)
    // then bounce to payment without going through Index (avoids false logout).
    if (isRazorpayCheckoutReturn(p) || isRazorpayCheckoutReturn(raw)) {
      if (/pay-success/i.test(raw) || /pay-success/i.test(p)) return "/pay-success";
      return "/pay-cancel";
    }

    // DigiLocker return — in-app browser already handles; avoid Unmatched route.
    if (isDigilockerReturn(p) || isDigilockerReturn(raw)) {
      return AUTH_ENTRY;
    }

    if (
      /dispatch_offer/i.test(p) ||
      /RIDER_DISPATCH_OFFER/i.test(p) ||
      /(^|\/)orders(\/|\?|$)/i.test(p)
    ) {
      return "/(tabs)/orders";
    }

    const empty =
      !p ||
      p === "/" ||
      p === "/--" ||
      p === "/index" ||
      /^\/?\?/.test(p) ||
      /^\/+$/.test(p);
    if (empty) return AUTH_ENTRY;

    void initial;

    // Prefer the stripped path for real app routes (referral host, etc.).
    if (p.startsWith("/") && p !== raw) {
      return p;
    }
  } catch {
    void initial;
    return AUTH_ENTRY;
  }
  return path;
}
