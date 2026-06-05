-- Delivery proof images (R2 + proxy URL). Safe to re-run.

CREATE TABLE IF NOT EXISTS public.order_delivery_images (
  id BIGSERIAL PRIMARY KEY,
  order_id BIGINT NOT NULL REFERENCES public.orders_core(id) ON DELETE CASCADE,
  rider_assignment_id BIGINT,
  image_type TEXT NOT NULL DEFAULT 'delivery_proof',
  image_url TEXT NOT NULL DEFAULT '',
  r2_key TEXT,
  uploaded_by TEXT DEFAULT 'rider',
  uploaded_by_id BIGINT,
  image_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  taken_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'order_delivery_images' AND column_name = 'url'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'order_delivery_images' AND column_name = 'image_url'
  ) THEN
    UPDATE public.order_delivery_images SET url = '' WHERE url IS NULL;
    ALTER TABLE public.order_delivery_images RENAME COLUMN url TO image_url;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'order_delivery_images' AND column_name = 'image_url'
  ) THEN
    ALTER TABLE public.order_delivery_images ADD COLUMN image_url TEXT NOT NULL DEFAULT '';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'order_delivery_images' AND column_name = 'r2_key'
  ) THEN
    ALTER TABLE public.order_delivery_images ADD COLUMN r2_key TEXT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'order_delivery_images' AND column_name = 'uploaded_by'
  ) THEN
    ALTER TABLE public.order_delivery_images ADD COLUMN uploaded_by TEXT DEFAULT 'rider';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'order_delivery_images' AND column_name = 'uploaded_by_id'
  ) THEN
    ALTER TABLE public.order_delivery_images ADD COLUMN uploaded_by_id BIGINT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'order_delivery_images' AND column_name = 'image_metadata'
  ) THEN
    ALTER TABLE public.order_delivery_images ADD COLUMN image_metadata JSONB NOT NULL DEFAULT '{}'::jsonb;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'order_delivery_images' AND column_name = 'rider_assignment_id'
  ) THEN
    ALTER TABLE public.order_delivery_images ADD COLUMN rider_assignment_id BIGINT;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS order_delivery_images_order_id_idx ON public.order_delivery_images(order_id);
CREATE INDEX IF NOT EXISTS order_delivery_images_image_type_idx ON public.order_delivery_images(image_type);
CREATE INDEX IF NOT EXISTS order_delivery_images_taken_at_idx ON public.order_delivery_images(taken_at);

COMMENT ON COLUMN public.order_delivery_images.image_url IS 'Stable proxy path /v1/attachments/proxy?key=...';
COMMENT ON COLUMN public.order_delivery_images.r2_key IS 'R2 object key for delete/regenerate signed URL';
