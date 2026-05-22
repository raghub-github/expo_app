import crypto from "node:crypto";

const PROBE_TIMEOUT_MS = 8_000;

function md5Hex(value: string): string {
  return crypto.createHash("md5").update(value.trim().toLowerCase()).digest("hex");
}

export function isGmailEmail(email: string): boolean {
  const domain = email.split("@")[1]?.toLowerCase();
  return domain === "gmail.com" || domain === "googlemail.com";
}

export function getGravatarUrl(email: string, size = 256): string {
  const hash = md5Hex(email);
  return `https://www.gravatar.com/avatar/${hash}?s=${size}&d=mp&r=pg`;
}

async function probeImageUrl(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, {
      method: "HEAD",
      redirect: "follow",
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
    });
    if (!res.ok) return false;
    const contentType = res.headers.get("content-type") ?? "";
    return contentType.startsWith("image/");
  } catch {
    return false;
  }
}

/**
 * Resolve a profile photo URL for a verified email.
 * Tries Google (Gmail), unified unavatar, then Gravatar custom avatar.
 */
export async function resolveEmailAvatarUrl(email: string, size = 256): Promise<string> {
  const normalized = email.trim().toLowerCase();
  const hash = md5Hex(normalized);

  const candidates: string[] = [];
  if (isGmailEmail(normalized)) {
    candidates.push(`https://unavatar.io/google/${encodeURIComponent(normalized)}?fallback=false`);
  }
  candidates.push(`https://unavatar.io/${encodeURIComponent(normalized)}?fallback=false`);
  candidates.push(`https://www.gravatar.com/avatar/${hash}?s=${size}&d=404&r=pg`);

  for (const url of candidates) {
    if (!(await probeImageUrl(url))) continue;
    if (url.includes("gravatar.com")) {
      return `https://www.gravatar.com/avatar/${hash}?s=${size}&d=mp&r=pg`;
    }
    return url.replace("fallback=false", `size=${size}`);
  }

  return getGravatarUrl(normalized, size);
}
