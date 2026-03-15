-- Ensure merchant_store_operating_hours table matches the required schema
-- This migration ensures all columns, constraints, indexes, and triggers are in place
-- Updated to match exact schema specification with proper toggle support

-- Drop table if exists to recreate with exact schema
DROP TABLE IF EXISTS public.merchant_store_operating_hours CASCADE;

-- Create table with exact schema as specified
CREATE TABLE public.merchant_store_operating_hours (
  id bigserial not null,
  store_id bigint not null,
  monday_open boolean not null default false,
  monday_slot1_start time without time zone null,
  monday_slot1_end time without time zone null,
  monday_slot2_start time without time zone null,
  monday_slot2_end time without time zone null,
  monday_total_duration_minutes integer null default 0,
  tuesday_open boolean not null default false,
  tuesday_slot1_start time without time zone null,
  tuesday_slot1_end time without time zone null,
  tuesday_slot2_start time without time zone null,
  tuesday_slot2_end time without time zone null,
  tuesday_total_duration_minutes integer null default 0,
  wednesday_open boolean not null default false,
  wednesday_slot1_start time without time zone null,
  wednesday_slot1_end time without time zone null,
  wednesday_slot2_start time without time zone null,
  wednesday_slot2_end time without time zone null,
  wednesday_total_duration_minutes integer null default 0,
  thursday_open boolean not null default false,
  thursday_slot1_start time without time zone null,
  thursday_slot1_end time without time zone null,
  thursday_slot2_start time without time zone null,
  thursday_slot2_end time without time zone null,
  thursday_total_duration_minutes integer null default 0,
  friday_open boolean not null default false,
  friday_slot1_start time without time zone null,
  friday_slot1_end time without time zone null,
  friday_slot2_start time without time zone null,
  friday_slot2_end time without time zone null,
  friday_total_duration_minutes integer null default 0,
  saturday_open boolean not null default false,
  saturday_slot1_start time without time zone null,
  saturday_slot1_end time without time zone null,
  saturday_slot2_start time without time zone null,
  saturday_slot2_end time without time zone null,
  saturday_total_duration_minutes integer null default 0,
  sunday_open boolean not null default false,
  sunday_slot1_start time without time zone null,
  sunday_slot1_end time without time zone null,
  sunday_slot2_start time without time zone null,
  sunday_slot2_end time without time zone null,
  sunday_total_duration_minutes integer null default 0,
  is_24_hours boolean null default false,
  same_for_all_days boolean null default false,
  closed_days text[] null,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  updated_by_email text null,
  updated_by_at timestamp with time zone null default now(),
  constraint merchant_store_operating_hours_new_pkey1 primary key (id),
  constraint merchant_store_operating_hours_new_store_id_key1 unique (store_id),
  constraint merchant_store_operating_hours_new_store_id_fkey1 foreign KEY (store_id) references merchant_stores (id) on delete CASCADE,
  constraint merchant_store_operating_hours_slot_order_chk check (
    (
      (
        (monday_slot1_start is null)
        or (monday_slot1_end is null)
        or (monday_slot1_end > monday_slot1_start)
      )
      and (
        (tuesday_slot1_start is null)
        or (tuesday_slot1_end is null)
        or (tuesday_slot1_end > tuesday_slot1_start)
      )
      and (
        (wednesday_slot1_start is null)
        or (wednesday_slot1_end is null)
        or (wednesday_slot1_end > wednesday_slot1_start)
      )
      and (
        (thursday_slot1_start is null)
        or (thursday_slot1_end is null)
        or (thursday_slot1_end > thursday_slot1_start)
      )
      and (
        (friday_slot1_start is null)
        or (friday_slot1_end is null)
        or (friday_slot1_end > friday_slot1_start)
      )
      and (
        (saturday_slot1_start is null)
        or (saturday_slot1_end is null)
        or (saturday_slot1_end > saturday_slot1_start)
      )
      and (
        (sunday_slot1_start is null)
        or (sunday_slot1_end is null)
        or (sunday_slot1_end > sunday_slot1_start)
      )
      and (
        (monday_slot2_start is null)
        or (monday_slot2_end is null)
        or (monday_slot2_end > monday_slot1_start)
      )
      and (
        (tuesday_slot2_start is null)
        or (tuesday_slot2_end is null)
        or (tuesday_slot2_end > tuesday_slot1_start)
      )
      and (
        (wednesday_slot2_start is null)
        or (wednesday_slot2_end is null)
        or (wednesday_slot2_end > wednesday_slot1_start)
      )
      and (
        (thursday_slot2_start is null)
        or (thursday_slot2_end is null)
        or (thursday_slot2_end > thursday_slot1_start)
      )
      and (
        (friday_slot2_start is null)
        or (friday_slot2_end is null)
        or (friday_slot2_end > friday_slot1_start)
      )
      and (
        (saturday_slot2_start is null)
        or (saturday_slot2_end is null)
        or (saturday_slot2_end > saturday_slot1_start)
      )
      and (
        (sunday_slot2_start is null)
        or (sunday_slot2_end is null)
        or (sunday_slot2_end > sunday_slot1_start)
      )
    )
  ) not VALID,
  constraint merchant_store_operating_hours_slot_overlap_chk check (
    (
      (
        (monday_slot2_start is null)
        or (monday_slot1_end is null)
        or (monday_slot2_start > monday_slot1_end)
      )
      and (
        (tuesday_slot2_start is null)
        or (tuesday_slot1_end is null)
        or (tuesday_slot2_start > tuesday_slot1_end)
      )
      and (
        (wednesday_slot2_start is null)
        or (wednesday_slot1_end is null)
        or (wednesday_slot2_start > wednesday_slot1_end)
      )
      and (
        (thursday_slot2_start is null)
        or (thursday_slot1_end is null)
        or (thursday_slot2_start > thursday_slot1_end)
      )
      and (
        (friday_slot2_start is null)
        or (friday_slot1_end is null)
        or (friday_slot2_start > friday_slot1_end)
      )
      and (
        (saturday_slot2_start is null)
        or (saturday_slot1_end is null)
        or (saturday_slot2_start > saturday_slot1_end)
      )
      and (
        (sunday_slot2_start is null)
        or (sunday_slot1_end is null)
        or (sunday_slot2_start > sunday_slot1_end)
      )
    )
  ) not VALID,
  constraint merchant_store_operating_hours_slot_pair_chk check (
    (
      (
        (monday_slot2_start is null) = (monday_slot2_end is null)
      )
      and (
        (tuesday_slot2_start is null) = (tuesday_slot2_end is null)
      )
      and (
        (wednesday_slot2_start is null) = (wednesday_slot2_end is null)
      )
      and (
        (thursday_slot2_start is null) = (thursday_slot2_end is null)
      )
      and (
        (friday_slot2_start is null) = (friday_slot2_end is null)
      )
      and (
        (saturday_slot2_start is null) = (saturday_slot2_end is null)
      )
      and (
        (sunday_slot2_start is null) = (sunday_slot2_end is null)
      )
    )
  ) not VALID
) TABLESPACE pg_default;

-- Create indexes
create index IF not exists merchant_store_operating_hours_store_id_idx on public.merchant_store_operating_hours using btree (store_id) TABLESPACE pg_default;

create index IF not exists merchant_store_operating_hours_monday_open_idx on public.merchant_store_operating_hours using btree (store_id) TABLESPACE pg_default
where
  (monday_open = true);

create index IF not exists merchant_store_operating_hours_tuesday_open_idx on public.merchant_store_operating_hours using btree (store_id) TABLESPACE pg_default
where
  (tuesday_open = true);

create index IF not exists merchant_store_operating_hours_wednesday_open_idx on public.merchant_store_operating_hours using btree (store_id) TABLESPACE pg_default
where
  (wednesday_open = true);

create index IF not exists merchant_store_operating_hours_thursday_open_idx on public.merchant_store_operating_hours using btree (store_id) TABLESPACE pg_default
where
  (thursday_open = true);

create index IF not exists merchant_store_operating_hours_friday_open_idx on public.merchant_store_operating_hours using btree (store_id) TABLESPACE pg_default
where
  (friday_open = true);

create index IF not exists merchant_store_operating_hours_saturday_open_idx on public.merchant_store_operating_hours using btree (store_id) TABLESPACE pg_default
where
  (saturday_open = true);

create index IF not exists merchant_store_operating_hours_sunday_open_idx on public.merchant_store_operating_hours using btree (store_id) TABLESPACE pg_default
where
  (sunday_open = true);

create index IF not exists merchant_store_operating_hours_24_hours_idx on public.merchant_store_operating_hours using btree (store_id) TABLESPACE pg_default
where
  (is_24_hours = true);

-- Create trigger function for deriving total_duration_minutes
-- NOTE: This function does NOT override the *_open fields - toggles work independently
CREATE OR REPLACE FUNCTION public.merchant_store_operating_hours_derive_fields()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  -- Only calculate total_duration_minutes, do NOT override *_open fields
  -- The *_open fields are controlled by user toggles and should remain independent
  
  -- Calculate Monday total duration
  NEW.monday_total_duration_minutes := COALESCE(
    CASE WHEN NEW.monday_slot1_start IS NOT NULL AND NEW.monday_slot1_end IS NOT NULL AND NEW.monday_slot1_end > NEW.monday_slot1_start
      THEN EXTRACT(EPOCH FROM (NEW.monday_slot1_end - NEW.monday_slot1_start)) / 60
      ELSE 0
    END, 0
  )::integer + COALESCE(
    CASE WHEN NEW.monday_slot2_start IS NOT NULL AND NEW.monday_slot2_end IS NOT NULL AND NEW.monday_slot2_end > NEW.monday_slot2_start
      THEN EXTRACT(EPOCH FROM (NEW.monday_slot2_end - NEW.monday_slot2_start)) / 60
      ELSE 0
    END, 0
  )::integer;

  -- Calculate Tuesday total duration
  NEW.tuesday_total_duration_minutes := COALESCE(
    CASE WHEN NEW.tuesday_slot1_start IS NOT NULL AND NEW.tuesday_slot1_end IS NOT NULL AND NEW.tuesday_slot1_end > NEW.tuesday_slot1_start
      THEN EXTRACT(EPOCH FROM (NEW.tuesday_slot1_end - NEW.tuesday_slot1_start)) / 60
      ELSE 0
    END, 0
  )::integer + COALESCE(
    CASE WHEN NEW.tuesday_slot2_start IS NOT NULL AND NEW.tuesday_slot2_end IS NOT NULL AND NEW.tuesday_slot2_end > NEW.tuesday_slot2_start
      THEN EXTRACT(EPOCH FROM (NEW.tuesday_slot2_end - NEW.tuesday_slot2_start)) / 60
      ELSE 0
    END, 0
  )::integer;

  -- Calculate Wednesday total duration
  NEW.wednesday_total_duration_minutes := COALESCE(
    CASE WHEN NEW.wednesday_slot1_start IS NOT NULL AND NEW.wednesday_slot1_end IS NOT NULL AND NEW.wednesday_slot1_end > NEW.wednesday_slot1_start
      THEN EXTRACT(EPOCH FROM (NEW.wednesday_slot1_end - NEW.wednesday_slot1_start)) / 60
      ELSE 0
    END, 0
  )::integer + COALESCE(
    CASE WHEN NEW.wednesday_slot2_start IS NOT NULL AND NEW.wednesday_slot2_end IS NOT NULL AND NEW.wednesday_slot2_end > NEW.wednesday_slot2_start
      THEN EXTRACT(EPOCH FROM (NEW.wednesday_slot2_end - NEW.wednesday_slot2_start)) / 60
      ELSE 0
    END, 0
  )::integer;

  -- Calculate Thursday total duration
  NEW.thursday_total_duration_minutes := COALESCE(
    CASE WHEN NEW.thursday_slot1_start IS NOT NULL AND NEW.thursday_slot1_end IS NOT NULL AND NEW.thursday_slot1_end > NEW.thursday_slot1_start
      THEN EXTRACT(EPOCH FROM (NEW.thursday_slot1_end - NEW.thursday_slot1_start)) / 60
      ELSE 0
    END, 0
  )::integer + COALESCE(
    CASE WHEN NEW.thursday_slot2_start IS NOT NULL AND NEW.thursday_slot2_end IS NOT NULL AND NEW.thursday_slot2_end > NEW.thursday_slot2_start
      THEN EXTRACT(EPOCH FROM (NEW.thursday_slot2_end - NEW.thursday_slot2_start)) / 60
      ELSE 0
    END, 0
  )::integer;

  -- Calculate Friday total duration
  NEW.friday_total_duration_minutes := COALESCE(
    CASE WHEN NEW.friday_slot1_start IS NOT NULL AND NEW.friday_slot1_end IS NOT NULL AND NEW.friday_slot1_end > NEW.friday_slot1_start
      THEN EXTRACT(EPOCH FROM (NEW.friday_slot1_end - NEW.friday_slot1_start)) / 60
      ELSE 0
    END, 0
  )::integer + COALESCE(
    CASE WHEN NEW.friday_slot2_start IS NOT NULL AND NEW.friday_slot2_end IS NOT NULL AND NEW.friday_slot2_end > NEW.friday_slot2_start
      THEN EXTRACT(EPOCH FROM (NEW.friday_slot2_end - NEW.friday_slot2_start)) / 60
      ELSE 0
    END, 0
  )::integer;

  -- Calculate Saturday total duration
  NEW.saturday_total_duration_minutes := COALESCE(
    CASE WHEN NEW.saturday_slot1_start IS NOT NULL AND NEW.saturday_slot1_end IS NOT NULL AND NEW.saturday_slot1_end > NEW.saturday_slot1_start
      THEN EXTRACT(EPOCH FROM (NEW.saturday_slot1_end - NEW.saturday_slot1_start)) / 60
      ELSE 0
    END, 0
  )::integer + COALESCE(
    CASE WHEN NEW.saturday_slot2_start IS NOT NULL AND NEW.saturday_slot2_end IS NOT NULL AND NEW.saturday_slot2_end > NEW.saturday_slot2_start
      THEN EXTRACT(EPOCH FROM (NEW.saturday_slot2_end - NEW.saturday_slot2_start)) / 60
      ELSE 0
    END, 0
  )::integer;

  -- Calculate Sunday total duration
  NEW.sunday_total_duration_minutes := COALESCE(
    CASE WHEN NEW.sunday_slot1_start IS NOT NULL AND NEW.sunday_slot1_end IS NOT NULL AND NEW.sunday_slot1_end > NEW.sunday_slot1_start
      THEN EXTRACT(EPOCH FROM (NEW.sunday_slot1_end - NEW.sunday_slot1_start)) / 60
      ELSE 0
    END, 0
  )::integer + COALESCE(
    CASE WHEN NEW.sunday_slot2_start IS NOT NULL AND NEW.sunday_slot2_end IS NOT NULL AND NEW.sunday_slot2_end > NEW.sunday_slot2_start
      THEN EXTRACT(EPOCH FROM (NEW.sunday_slot2_end - NEW.sunday_slot2_start)) / 60
      ELSE 0
    END, 0
  )::integer;

  RETURN NEW;
END;
$$;

-- Create trigger for derive fields
DROP TRIGGER IF EXISTS merchant_store_operating_hours_derive_fields_trigger
ON public.merchant_store_operating_hours;

CREATE TRIGGER merchant_store_operating_hours_derive_fields_trigger BEFORE INSERT
OR
update on merchant_store_operating_hours for EACH row
execute FUNCTION merchant_store_operating_hours_derive_fields ();

-- Create trigger function for updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for updated_at
DROP TRIGGER IF EXISTS merchant_store_operating_hours_updated_at_trigger
ON public.merchant_store_operating_hours;

create trigger merchant_store_operating_hours_updated_at_trigger BEFORE
update on merchant_store_operating_hours for EACH row
execute FUNCTION update_updated_at_column ();
