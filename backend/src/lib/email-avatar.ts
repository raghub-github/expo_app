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

/** Stored or resolved URLs that are not a real user photo. */
export function isCustomProfileUploadUrl(url: string | null | undefined): boolean {
  if (!url?.trim()) return false;
  return url.trim().toLowerCase().includes("/attachments/proxy");
}

export function isGenericProfileImageUrl(url: string | null | undefined): boolean {
  if (!url?.trim()) return true;
  const u = url.trim().toLowerCase();
  if (u.includes("fallback.png")) return true;
  if (u.includes("api.unavatar.io/fallback")) return true;
  // Wrong API usage: /google/ is for domains, not Gmail addresses.
  if (u.includes("unavatar.io/google/") && u.includes("@")) return true;
  if (u.includes("gravatar.com/avatar/") && (u.includes("d=mp") || u.includes("d=404"))) return true;
  if (u.includes("avatars.githubusercontent.com/u/0")) return true;
  return false;
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

async function resolveUnavatarJsonUrl(endpoint: string): Promise<string | null> {
  try {
    const res = await fetch(endpoint, {
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { url?: string };
    const url = data?.url?.trim();
    if (!url || isGenericProfileImageUrl(url)) return null;
    return url;
  } catch {
    return null;
  }
}

/**
 * Resolve a profile photo URL for a verified email.
 * Order: unavatar (Gravatar → GitHub) → explicit GitHub → Gravatar custom → Gravatar mp.
 */
export async function resolveEmailAvatarUrl(email: string, size = 256): Promise<string> {
  const normalized = email.trim().toLowerCase();
  const encoded = encodeURIComponent(normalized);

  const jsonCandidates = [
    `https://unavatar.io/${encoded}?json`,
    `https://unavatar.io/github/${encoded}?json`,
    `https://unavatar.io/gravatar/${encoded}?json`,
  ];

  for (const endpoint of jsonCandidates) {
    const resolved = await resolveUnavatarJsonUrl(endpoint);
    if (resolved) return resolved;
  }

  const hash = md5Hex(normalized);
  const gravatarCustom = `https://www.gravatar.com/avatar/${hash}?s=${size}&d=404&r=pg`;
  if (await probeImageUrl(gravatarCustom)) {
    return `https://www.gravatar.com/avatar/${hash}?s=${size}&d=mp&r=pg`;
  }

  return getGravatarUrl(normalized, size);
}
