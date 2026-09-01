-- Auto-generate public_slug for every live (APPROVED + ACTIVE + is_active) store.
-- Slugs are set once on first publish; existing non-null slugs are never overwritten.

CREATE OR REPLACE FUNCTION gatimitra_slugify(txt TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT trim(both '-' FROM regexp_replace(
    regexp_replace(
      lower(regexp_replace(COALESCE(txt, ''), '[^a-zA-Z0-9\s-]', ' ', 'g')),
      '\s+',
      '-',
      'g'
    ),
    '-+',
    '-',
    'g'
  ));
$$;

CREATE OR REPLACE FUNCTION merchant_stores_build_public_slug(
  p_name TEXT,
  p_city TEXT,
  p_landmark TEXT DEFAULT NULL
)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  cleaned TEXT;
  words TEXT[];
  name_part TEXT;
  city_part TEXT;
  slug TEXT;
  stop_words TEXT[] := ARRAY[
    'a','an','and','the','veg','non','pure','restaurant','restaurants',
    'food','foods','cafe','kitchen','north','south','east','west',
    'indian','chinese','italian','continental','fast','joint','eatery',
    'dhaba','hotel','inn','bar','grill','bistro'
  ];
  w TEXT;
  picked TEXT[] := ARRAY[]::TEXT[];
BEGIN
  cleaned := lower(regexp_replace(COALESCE(p_name, ''), '[^a-zA-Z0-9\s]', ' ', 'g'));
  words := regexp_split_to_array(btrim(cleaned), '\s+');
  IF words IS NOT NULL THEN
    FOREACH w IN ARRAY words LOOP
      IF w IS NULL OR length(w) < 2 THEN CONTINUE; END IF;
      IF w = ANY (stop_words) THEN CONTINUE; END IF;
      picked := array_append(picked, w);
      EXIT WHEN array_length(picked, 1) >= 3;
    END LOOP;
  END IF;

  name_part := array_to_string(picked, '-');
  city_part := gatimitra_slugify(COALESCE(p_city, ''));
  slug := trim(both '-' FROM concat_ws('-', NULLIF(name_part, ''), NULLIF(city_part, '')));

  IF slug IS NULL OR slug = '' THEN
    slug := COALESCE(NULLIF(city_part, ''), 'store');
  END IF;

  IF length(slug) > 80 THEN
    slug := left(slug, 80);
    slug := regexp_replace(slug, '-[^-]*$', '');
  END IF;

  RETURN slug;
END;
$$;

CREATE OR REPLACE FUNCTION merchant_stores_ensure_public_slug_trigger()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  base_slug TEXT;
  candidate TEXT;
  loc_slug TEXT;
  n INT := 2;
BEGIN
  IF NEW.public_slug IS NOT NULL AND btrim(NEW.public_slug) <> '' THEN
    RETURN NEW;
  END IF;

  IF NEW.deleted_at IS NOT NULL
     OR COALESCE(NEW.is_active, FALSE) IS NOT TRUE
     OR upper(COALESCE(NEW.status::text, '')) <> 'ACTIVE'
     OR upper(COALESCE(NEW.approval_status::text, '')) <> 'APPROVED' THEN
    RETURN NEW;
  END IF;

  base_slug := merchant_stores_build_public_slug(
    COALESCE(NEW.store_display_name, NEW.store_name, ''),
    COALESCE(NEW.city, ''),
    NEW.landmark
  );

  candidate := base_slug;
  loc_slug := gatimitra_slugify(COALESCE(NEW.landmark, ''));

  WHILE EXISTS (
    SELECT 1
    FROM merchant_stores ms
    WHERE ms.public_slug = candidate
      AND ms.id IS DISTINCT FROM NEW.id
  ) LOOP
    IF loc_slug <> ''
       AND candidate = base_slug
       AND NOT EXISTS (
         SELECT 1 FROM merchant_stores ms
         WHERE ms.public_slug = base_slug || '-' || loc_slug
           AND ms.id IS DISTINCT FROM NEW.id
       ) THEN
      candidate := base_slug || '-' || loc_slug;
    ELSE
      candidate := base_slug || '-' || n::text;
      n := n + 1;
    END IF;
  END LOOP;

  NEW.public_slug := candidate;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS merchant_stores_public_slug_before_write ON merchant_stores;

CREATE TRIGGER merchant_stores_public_slug_before_write
  BEFORE INSERT OR UPDATE ON merchant_stores
  FOR EACH ROW
  EXECUTE FUNCTION merchant_stores_ensure_public_slug_trigger();

UPDATE merchant_stores
SET updated_at = NOW()
WHERE deleted_at IS NULL
  AND is_active IS TRUE
  AND upper(COALESCE(status::text, '')) = 'ACTIVE'
  AND upper(COALESCE(approval_status::text, '')) = 'APPROVED'
  AND (public_slug IS NULL OR btrim(public_slug) = '');

ALTER TABLE merchant_stores
  DROP CONSTRAINT IF EXISTS merchant_stores_public_slug_required_when_live;

ALTER TABLE merchant_stores
  ADD CONSTRAINT merchant_stores_public_slug_required_when_live
  CHECK (
    NOT (
      deleted_at IS NULL
      AND is_active IS TRUE
      AND upper(COALESCE(status::text, '')) = 'ACTIVE'
      AND upper(COALESCE(approval_status::text, '')) = 'APPROVED'
    )
    OR (public_slug IS NOT NULL AND btrim(public_slug) <> '')
  );

COMMENT ON CONSTRAINT merchant_stores_public_slug_required_when_live ON merchant_stores IS
  'Every live public store must have a non-empty public_slug for SEO URLs.';
