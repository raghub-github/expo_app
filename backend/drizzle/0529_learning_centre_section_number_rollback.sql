DROP INDEX IF EXISTS public.idx_learning_centre_videos_audience_section_number;
ALTER TABLE public.learning_centre_videos DROP COLUMN IF EXISTS section_number;
