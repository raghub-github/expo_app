import { getSql } from "@/lib/db/client";
import {
  parseYoutubeVideoId,
  youtubeWatchUrl,
} from "@/lib/learning-centre/youtube";
import {
  LEARNING_CENTRE_AUDIENCES,
  parseLearningCentreAudience,
  type LearningCentreAudience,
  type LearningCentreVideoRow,
} from "@/lib/learning-centre/shared";

export {
  LEARNING_CENTRE_AUDIENCES,
  parseLearningCentreAudience,
  type LearningCentreAudience,
  type LearningCentreVideoRow,
};

export type LearningCentreVideoInput = {
  audience: LearningCentreAudience;
  sectionTitle: string;
  videoTitle: string;
  youtubeUrl: string;
  durationLabel?: string | null;
  sectionNumber?: number | null;
  sortOrder?: number | null;
  thumbnailR2Key?: string | null;
  thumbnailProxyUrl?: string | null;
};

function mapRow(r: Record<string, unknown>): LearningCentreVideoRow {
  return {
    id: Number(r.id),
    audience: String(r.audience) as LearningCentreAudience,
    section_title: String(r.section_title ?? ""),
    video_title: String(r.video_title ?? ""),
    youtube_url: String(r.youtube_url ?? ""),
    thumbnail_r2_key: r.thumbnail_r2_key != null ? String(r.thumbnail_r2_key) : null,
    thumbnail_proxy_url: r.thumbnail_proxy_url != null ? String(r.thumbnail_proxy_url) : null,
    duration_label: r.duration_label != null ? String(r.duration_label) : null,
    section_number: Number(r.section_number ?? 1),
    sort_order: Number(r.sort_order ?? 0),
    created_at: r.created_at != null ? String(r.created_at) : null,
    updated_at: r.updated_at != null ? String(r.updated_at) : null,
  };
}

function safeTrim(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s || null;
}

export function normalizeYoutubeUrl(raw: unknown): string | null {
  const id = parseYoutubeVideoId(raw);
  return id ? youtubeWatchUrl(id) : null;
}

let ensured = false;

export async function ensureLearningCentreTable(): Promise<void> {
  if (ensured) return;
  const sql = getSql();
  await sql.unsafe(`
    CREATE TABLE IF NOT EXISTS public.learning_centre_videos (
      id bigserial PRIMARY KEY,
      audience text NOT NULL CHECK (audience IN ('customer', 'rider', 'merchant')),
      section_title text NOT NULL,
      video_title text NOT NULL,
      youtube_url text NOT NULL,
      thumbnail_r2_key text,
      thumbnail_proxy_url text,
      duration_label text,
      sort_order integer NOT NULL DEFAULT 0,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS idx_learning_centre_videos_audience_section
      ON public.learning_centre_videos (audience, section_title, sort_order, id);
    ALTER TABLE public.learning_centre_videos
      ADD COLUMN IF NOT EXISTS section_number integer NOT NULL DEFAULT 1;
    CREATE INDEX IF NOT EXISTS idx_learning_centre_videos_audience_section_number
      ON public.learning_centre_videos (audience, section_number, sort_order, id);

    CREATE TABLE IF NOT EXISTS public.learning_centre_signals (
      id          SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
      version     BIGINT NOT NULL DEFAULT 1,
      updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    INSERT INTO public.learning_centre_signals (id, version)
    VALUES (1, 1)
    ON CONFLICT (id) DO NOTHING;
    CREATE OR REPLACE FUNCTION public.learning_centre_bump_signal()
    RETURNS TRIGGER
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path = public, pg_temp
    AS $$
    BEGIN
      UPDATE public.learning_centre_signals
      SET version = version + 1, updated_at = NOW()
      WHERE id = 1;
      RETURN NULL;
    END;
    $$;
    DROP TRIGGER IF EXISTS trg_learning_centre_videos_signal ON public.learning_centre_videos;
    CREATE TRIGGER trg_learning_centre_videos_signal
      AFTER INSERT OR UPDATE OR DELETE ON public.learning_centre_videos
      FOR EACH ROW EXECUTE FUNCTION public.learning_centre_bump_signal();
    ALTER TABLE public.learning_centre_signals REPLICA IDENTITY FULL;
    ALTER TABLE public.learning_centre_signals ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS learning_centre_signals_public_read ON public.learning_centre_signals;
    CREATE POLICY learning_centre_signals_public_read
      ON public.learning_centre_signals
      FOR SELECT
      USING (true);
  `);
    try {
      await sql.unsafe(`GRANT SELECT ON TABLE public.learning_centre_signals TO anon, authenticated`);
    } catch {
      /* local Postgres may not have those roles */
    }
    try {
      await sql.unsafe(`
        DO $$
        BEGIN
          IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
            IF NOT EXISTS (
              SELECT 1 FROM pg_publication_tables
              WHERE pubname = 'supabase_realtime'
                AND schemaname = 'public'
                AND tablename = 'learning_centre_signals'
            ) THEN
              ALTER PUBLICATION supabase_realtime ADD TABLE public.learning_centre_signals;
            END IF;
          END IF;
        END $$;
      `);
    } catch {
      /* publication may already include the table */
    }
  ensured = true;
}

export async function listLearningCentreVideos(
  audience?: LearningCentreAudience | null
): Promise<LearningCentreVideoRow[]> {
  await ensureLearningCentreTable();
  const sql = getSql();
  const raw = audience
    ? await sql`
        SELECT *
        FROM learning_centre_videos
        WHERE audience = ${audience}
        ORDER BY audience ASC, section_number ASC, sort_order ASC, id ASC
      `
    : await sql`
        SELECT *
        FROM learning_centre_videos
        ORDER BY audience ASC, section_number ASC, sort_order ASC, id ASC
      `;
  const arr = Array.isArray(raw) ? raw : [];
  return arr.map((x) => mapRow(x as Record<string, unknown>));
}

export async function getLearningCentreVideoById(
  id: number
): Promise<LearningCentreVideoRow | null> {
  await ensureLearningCentreTable();
  const sql = getSql();
  const raw = await sql`
    SELECT *
    FROM learning_centre_videos
    WHERE id = ${id}
    LIMIT 1
  `;
  const arr = Array.isArray(raw) ? raw : [];
  const row = arr[0] as Record<string, unknown> | undefined;
  return row ? mapRow(row) : null;
}

function normalizeSectionNumber(n: number | null | undefined): number | null {
  if (n == null || !Number.isFinite(n)) return null;
  return Math.max(1, Math.round(n));
}

async function resolveSectionNumber(
  audience: LearningCentreAudience,
  sectionTitle: string,
  requested: number | null | undefined
): Promise<number> {
  const sql = getSql();
  const wanted = normalizeSectionNumber(requested);
  if (wanted != null) return wanted;

  const existing = await sql`
    SELECT MIN(section_number) AS n
    FROM learning_centre_videos
    WHERE audience = ${audience} AND lower(section_title) = lower(${sectionTitle})
  `;
  const existingN = Number((Array.isArray(existing) ? existing[0] : null)?.n);
  if (Number.isFinite(existingN) && existingN >= 1) return existingN;

  const maxRows = await sql`
    SELECT COALESCE(MAX(section_number), 0) AS max_n
    FROM learning_centre_videos
    WHERE audience = ${audience}
  `;
  return Number((Array.isArray(maxRows) ? maxRows[0] : null)?.max_n ?? 0) + 1;
}

async function syncSectionNumber(
  audience: LearningCentreAudience,
  sectionTitle: string,
  sectionNumber: number
): Promise<void> {
  const sql = getSql();
  await sql`
    UPDATE learning_centre_videos
    SET section_number = ${sectionNumber}, updated_at = now()
    WHERE audience = ${audience} AND lower(section_title) = lower(${sectionTitle})
  `;
}

export async function insertLearningCentreVideo(
  input: LearningCentreVideoInput
): Promise<LearningCentreVideoRow> {
  await ensureLearningCentreTable();
  const sql = getSql();
  const youtubeUrl = normalizeYoutubeUrl(input.youtubeUrl ?? "");
  if (!youtubeUrl) {
    throw new Error("Enter a valid YouTube link");
  }
  const sectionTitle = String(input.sectionTitle ?? "").trim();
  const videoTitle = String(input.videoTitle ?? "").trim();
  if (!sectionTitle) throw new Error("Section title is required");
  if (!videoTitle) throw new Error("Video title is required");

  let sortOrder = input.sortOrder;
  if (sortOrder == null || !Number.isFinite(sortOrder)) {
    const maxRows = await sql`
      SELECT COALESCE(MAX(sort_order), 0) AS max_sort
      FROM learning_centre_videos
      WHERE audience = ${input.audience} AND section_title = ${sectionTitle}
    `;
    const maxArr = Array.isArray(maxRows) ? maxRows : [];
    sortOrder = Number((maxArr[0] as { max_sort?: unknown } | undefined)?.max_sort ?? 0) + 10;
  }

  const sectionNumber = await resolveSectionNumber(
    input.audience,
    sectionTitle,
    input.sectionNumber
  );
  const durationLabel = safeTrim(input.durationLabel);
  const thumbKey = safeTrim(input.thumbnailR2Key);
  const thumbProxy = safeTrim(input.thumbnailProxyUrl);

  const raw = await sql`
    INSERT INTO learning_centre_videos (
      audience, section_title, video_title, youtube_url,
      thumbnail_r2_key, thumbnail_proxy_url, duration_label, section_number, sort_order
    )
    VALUES (
      ${input.audience}, ${sectionTitle}, ${videoTitle}, ${youtubeUrl},
      ${thumbKey}, ${thumbProxy}, ${durationLabel}, ${sectionNumber}, ${sortOrder}
    )
    RETURNING *
  `;
  const arr = Array.isArray(raw) ? raw : [];
  const row = arr[0] as Record<string, unknown> | undefined;
  if (!row) throw new Error("Failed to create video");
  if (normalizeSectionNumber(input.sectionNumber) != null) {
    await syncSectionNumber(input.audience, sectionTitle, sectionNumber);
  }
  return mapRow(row);
}

export async function updateLearningCentreVideo(
  id: number,
  input: Partial<LearningCentreVideoInput>
): Promise<LearningCentreVideoRow | null> {
  await ensureLearningCentreTable();
  const existing = await getLearningCentreVideoById(id);
  if (!existing) return null;

  const audience = input.audience ?? existing.audience;
  const sectionTitle = input.sectionTitle != null ? String(input.sectionTitle).trim() : existing.section_title;
  const videoTitle = input.videoTitle != null ? String(input.videoTitle).trim() : existing.video_title;
  if (!sectionTitle) throw new Error("Section title is required");
  if (!videoTitle) throw new Error("Video title is required");

  let youtubeUrl = existing.youtube_url;
  if (input.youtubeUrl != null) {
    const next = normalizeYoutubeUrl(input.youtubeUrl);
    if (!next) throw new Error("Enter a valid YouTube link");
    youtubeUrl = next;
  }

  const durationLabel =
    input.durationLabel !== undefined
      ? safeTrim(input.durationLabel)
      : existing.duration_label;
  const sortOrder =
    input.sortOrder != null && Number.isFinite(input.sortOrder)
      ? input.sortOrder
      : existing.sort_order;
  const thumbKey =
    input.thumbnailR2Key !== undefined
      ? safeTrim(input.thumbnailR2Key)
      : existing.thumbnail_r2_key;
  const thumbProxy =
    input.thumbnailProxyUrl !== undefined
      ? safeTrim(input.thumbnailProxyUrl)
      : existing.thumbnail_proxy_url;
  const sectionNumber = await resolveSectionNumber(
    audience,
    sectionTitle,
    input.sectionNumber !== undefined ? input.sectionNumber : existing.section_number
  );

  const sql = getSql();
  const raw = await sql`
    UPDATE learning_centre_videos
    SET
      audience = ${audience},
      section_title = ${sectionTitle},
      video_title = ${videoTitle},
      youtube_url = ${youtubeUrl},
      thumbnail_r2_key = ${thumbKey},
      thumbnail_proxy_url = ${thumbProxy},
      duration_label = ${durationLabel},
      section_number = ${sectionNumber},
      sort_order = ${sortOrder},
      updated_at = now()
    WHERE id = ${id}
    RETURNING *
  `;
  const arr = Array.isArray(raw) ? raw : [];
  const row = arr[0] as Record<string, unknown> | undefined;
  if (row && (input.sectionNumber !== undefined || input.sectionTitle != null)) {
    await syncSectionNumber(audience, sectionTitle, sectionNumber);
  }
  return row ? mapRow(row) : null;
}

export async function deleteLearningCentreVideo(
  id: number
): Promise<LearningCentreVideoRow | null> {
  await ensureLearningCentreTable();
  const sql = getSql();
  const raw = await sql`
    DELETE FROM learning_centre_videos
    WHERE id = ${id}
    RETURNING *
  `;
  const arr = Array.isArray(raw) ? raw : [];
  const row = arr[0] as Record<string, unknown> | undefined;
  return row ? mapRow(row) : null;
}
