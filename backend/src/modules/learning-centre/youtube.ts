const YOUTUBE_ID_RE = /^[\w-]{11}$/;

/** Extract a YouTube video id from a watch / share / embed / shorts URL. */
export function parseYoutubeVideoId(raw: unknown): string | null {
  if (raw == null) return null;
  const s = String(raw).trim();
  if (!s) return null;
  if (YOUTUBE_ID_RE.test(s)) return s;

  try {
    const u = new URL(s.includes("://") ? s : `https://${s}`);
    const host = u.hostname.replace(/^www\./i, "").replace(/^m\./i, "").toLowerCase();

    if (host === "youtu.be") {
      const id = u.pathname.split("/").filter(Boolean)[0] ?? "";
      return YOUTUBE_ID_RE.test(id) ? id : null;
    }

    if (host.endsWith("youtube.com") || host === "youtube-nocookie.com") {
      const v = u.searchParams.get("v")?.trim() ?? "";
      if (YOUTUBE_ID_RE.test(v)) return v;
      const parts = u.pathname.split("/").filter(Boolean);
      if (
        parts[0] === "embed" ||
        parts[0] === "shorts" ||
        parts[0] === "live" ||
        parts[0] === "v"
      ) {
        const id = parts[1] ?? "";
        if (YOUTUBE_ID_RE.test(id)) return id;
      }
    }
  } catch {
    /* ignore */
  }
  return null;
}

export function youtubeWatchUrl(videoId: string): string {
  return `https://www.youtube.com/watch?v=${videoId}`;
}

export function youtubeThumbnailUrl(videoId: string): string {
  return `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
}
