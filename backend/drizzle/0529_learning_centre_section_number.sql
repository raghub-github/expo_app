-- Learning Centre: section_number controls section order in apps (1 = first).
ALTER TABLE public.learning_centre_videos
  ADD COLUMN IF NOT EXISTS section_number integer NOT NULL DEFAULT 1;

CREATE INDEX IF NOT EXISTS idx_learning_centre_videos_audience_section_number
  ON public.learning_centre_videos (audience, section_number, sort_order, id);

COMMENT ON COLUMN public.learning_centre_videos.section_number IS
  'Display order of the section in the app. Same number for every video in that section.';
