-- Learning Centre: Super Admin YouTube videos per audience (customer / rider / merchant).
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

COMMENT ON TABLE public.learning_centre_videos IS
  'CMS YouTube videos for Learning Centre. Apps open youtube_url in the YouTube player.';
