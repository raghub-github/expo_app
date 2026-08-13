import { getSql } from "../../db/client.js";
import { toAbsoluteClientMediaUrl } from "../../utils/publicAttachmentUrl.js";
import { getR2SignedUrl } from "../../services/r2/r2Service.js";
import {
  parseYoutubeVideoId,
  youtubeThumbnailUrl,
  youtubeWatchUrl,
} from "./youtube.js";

export const LEARNING_CENTRE_AUDIENCES = ["customer", "rider", "merchant"] as const;
export type LearningCentreAudience = (typeof LEARNING_CENTRE_AUDIENCES)[number];

export type LearningCentreVideoRow = {
  id: number;
  audience: LearningCentreAudience;
  sectionTitle: string;
  videoTitle: string;
  youtubeUrl: string;
  thumbnailR2Key: string | null;
  thumbnailProxyUrl: string | null;
  durationLabel: string | null;
  sectionNumber: number;
  sortOrder: number;
};

export type LearningCentreClientVideo = {
  id: number;
  sectionTitle: string;
  videoTitle: string;
  youtubeUrl: string;
  youtubeId: string;
  thumbnailUrl: string | null;
  durationLabel: string | null;
  sectionNumber: number;
  sortOrder: number;
};

export type LearningCentreSection = {
  title: string;
  sectionNumber: number;
  videos: LearningCentreClientVideo[];
};

const CLIENT_SIGNED_URL_TTL_SEC = 60 * 60 * 24 * 6;

function mapRow(r: Record<string, unknown>): LearningCentreVideoRow {
  return {
    id: Number(r.id),
    audience: String(r.audience) as LearningCentreAudience,
    sectionTitle: String(r.section_title ?? ""),
    videoTitle: String(r.video_title ?? ""),
    youtubeUrl: String(r.youtube_url ?? ""),
    thumbnailR2Key: r.thumbnail_r2_key != null ? String(r.thumbnail_r2_key) : null,
    thumbnailProxyUrl: r.thumbnail_proxy_url != null ? String(r.thumbnail_proxy_url) : null,
    durationLabel: r.duration_label != null ? String(r.duration_label) : null,
    sectionNumber: Number(r.section_number ?? 1),
    sortOrder: Number(r.sort_order ?? 0),
  };
}

export function parseLearningCentreAudience(value: string): LearningCentreAudience | null {
  const v = String(value ?? "").trim().toLowerCase();
  return LEARNING_CENTRE_AUDIENCES.includes(v as LearningCentreAudience)
    ? (v as LearningCentreAudience)
    : null;
}

async function toClientVideo(row: LearningCentreVideoRow): Promise<LearningCentreClientVideo | null> {
  const youtubeId = parseYoutubeVideoId(row.youtubeUrl);
  if (!youtubeId) return null;

  let thumbnailUrl: string | null = null;
  const r2Key = row.thumbnailR2Key?.trim() || null;
  if (r2Key) {
    try {
      thumbnailUrl = await getR2SignedUrl(r2Key, CLIENT_SIGNED_URL_TTL_SEC);
    } catch {
      thumbnailUrl = null;
    }
  }
  if (!thumbnailUrl) {
    thumbnailUrl = toAbsoluteClientMediaUrl(row.thumbnailProxyUrl);
  }
  if (!thumbnailUrl) {
    thumbnailUrl = youtubeThumbnailUrl(youtubeId);
  }

  return {
    id: row.id,
    sectionTitle: row.sectionTitle,
    videoTitle: row.videoTitle,
    youtubeUrl: youtubeWatchUrl(youtubeId),
    youtubeId,
    thumbnailUrl,
    durationLabel: row.durationLabel?.trim() || null,
    sectionNumber: row.sectionNumber,
    sortOrder: row.sortOrder,
  };
}

export type LearningCentreClientPayload = {
  sections: LearningCentreSection[];
  revision: string;
};

async function computeRevision(audience: LearningCentreAudience): Promise<string> {
  const sql = getSql();
  const rows = await sql`
    SELECT
      COUNT(*)::int AS n,
      COALESCE(MAX(id), 0) AS max_id,
      COALESCE(MAX(updated_at), TIMESTAMPTZ '1970-01-01') AS rev
    FROM learning_centre_videos
    WHERE audience = ${audience}
  `;
  const r = (Array.isArray(rows) ? rows[0] : null) as
    | { n?: unknown; max_id?: unknown; rev?: unknown }
    | undefined;
  const rev =
    r?.rev instanceof Date ? r.rev.toISOString() : r?.rev != null ? String(r.rev) : "";
  return `${Number(r?.n ?? 0)}:${Number(r?.max_id ?? 0)}:${rev}`;
}

export async function listLearningCentreVideosForClient(
  audience: LearningCentreAudience
): Promise<LearningCentreClientPayload> {
  const sql = getSql();
  const rows = await sql`
    SELECT
      id, audience, section_title, video_title, youtube_url,
      thumbnail_r2_key, thumbnail_proxy_url, duration_label, section_number, sort_order
    FROM learning_centre_videos
    WHERE audience = ${audience}
    ORDER BY section_number ASC, sort_order ASC, id ASC
  `;
  const mapped = (rows as Record<string, unknown>[]).map(mapRow);
  const videos = (await Promise.all(mapped.map(toClientVideo))).filter(
    (v): v is LearningCentreClientVideo => v != null
  );

  const sections: LearningCentreSection[] = [];
  const indexByTitle = new Map<string, number>();
  for (const video of videos) {
    const key = String(video.sectionTitle ?? "").trim() || "More";
    let idx = indexByTitle.get(key.toLowerCase());
    if (idx == null) {
      idx = sections.length;
      indexByTitle.set(key.toLowerCase(), idx);
      sections.push({ title: key, sectionNumber: video.sectionNumber, videos: [] });
    } else {
      const current = sections[idx]!;
      if (video.sectionNumber < current.sectionNumber) {
        current.sectionNumber = video.sectionNumber;
      }
    }
    sections[idx]!.videos.push(video);
  }
  sections.sort(
    (a, b) => a.sectionNumber - b.sectionNumber || a.title.localeCompare(b.title)
  );
  const revision = await computeRevision(audience);
  return { sections, revision };
}
