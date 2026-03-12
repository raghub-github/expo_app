create table if not exists public.merchant_store_ratings (
  id bigserial not null,
  store_id bigint not null,
  order_id bigint null,
  customer_id bigint null,
  rating smallint not null,
  food_rating smallint null,
  service_rating smallint null,
  packaging_rating smallint null,
  review_text text null,
  review_title text null,
  review_images text[] null,
  helpful_count integer null default 0,
  not_helpful_count integer null default 0,
  merchant_response text null,
  merchant_responded_at timestamp with time zone null,
  is_verified boolean null default false,
  is_flagged boolean null default false,
  flag_reason text null,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  constraint merchant_store_ratings_pkey primary key (id),
  constraint merchant_store_ratings_order_id_fkey foreign KEY (order_id) references orders (id) on delete set null,
  constraint merchant_store_ratings_food_rating_check check (
    (
      (food_rating >= 1)
      and (food_rating <= 5)
    )
  ),
  constraint merchant_store_ratings_packaging_rating_check check (
    (
      (packaging_rating >= 1)
      and (packaging_rating <= 5)
    )
  ),
  constraint merchant_store_ratings_rating_check check (
    (
      (rating >= 1)
      and (rating <= 5)
    )
  ),
  constraint merchant_store_ratings_service_rating_check check (
    (
      (service_rating >= 1)
      and (service_rating <= 5)
    )
  )
) TABLESPACE pg_default;

create index IF not exists merchant_store_ratings_store_id_idx on public.merchant_store_ratings using btree (store_id) TABLESPACE pg_default;

create index IF not exists merchant_store_ratings_order_id_idx on public.merchant_store_ratings using btree (order_id) TABLESPACE pg_default;

create index IF not exists merchant_store_ratings_customer_id_idx on public.merchant_store_ratings using btree (customer_id) TABLESPACE pg_default;

create index IF not exists merchant_store_ratings_rating_idx on public.merchant_store_ratings using btree (rating) TABLESPACE pg_default;

create index IF not exists merchant_store_ratings_created_at_idx on public.merchant_store_ratings using btree (created_at) TABLESPACE pg_default;

create index IF not exists merchant_store_ratings_store_id_created_idx on public.merchant_store_ratings using btree (store_id, created_at desc) TABLESPACE pg_default;

create index IF not exists merchant_store_ratings_merchant_response_idx on public.merchant_store_ratings using btree (merchant_responded_at) TABLESPACE pg_default
where
  (merchant_responded_at is not null);



create table if not exists public.customer_ratings_given (
  id bigserial not null,
  customer_id bigint not null,
  order_id bigint null,
  service_type public.service_type not null,
  target_type text not null,
  target_id bigint null,
  overall_rating smallint not null,
  food_quality_rating smallint null,
  delivery_rating smallint null,
  packaging_rating smallint null,
  review_title text null,
  review_text text null,
  review_images text[] null,
  review_tags text[] null,
  helpful_count integer null default 0,
  not_helpful_count integer null default 0,
  merchant_response text null,
  merchant_responded_at timestamp with time zone null,
  is_verified boolean null default false,
  is_featured boolean null default false,
  is_flagged boolean null default false,
  flag_reason text null,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  constraint customer_ratings_given_pkey primary key (id),
  constraint customer_ratings_given_order_id_fkey foreign KEY (order_id) references orders (id) on delete set null,
  constraint customer_ratings_given_customer_id_fkey foreign KEY (customer_id) references customers (id) on delete CASCADE,
  constraint customer_ratings_given_food_quality_rating_check check (
    (
      (food_quality_rating >= 1)
      and (food_quality_rating <= 5)
    )
  ),
  constraint customer_ratings_given_overall_rating_check check (
    (
      (overall_rating >= 1)
      and (overall_rating <= 5)
    )
  ),
  constraint customer_ratings_given_overall_rating_range check (
    (
      (overall_rating >= 1)
      and (overall_rating <= 5)
    )
  ),
  constraint customer_ratings_given_packaging_rating_check check (
    (
      (packaging_rating >= 1)
      and (packaging_rating <= 5)
    )
  ),
  constraint customer_ratings_given_rating_range check (
    (
      (overall_rating >= 1)
      and (overall_rating <= 5)
    )
  ),
  constraint customer_ratings_given_delivery_rating_check check (
    (
      (delivery_rating >= 1)
      and (delivery_rating <= 5)
    )
  ),
  constraint customer_ratings_given_food_quality_range check (
    (
      (food_quality_rating is null)
      or (
        (food_quality_rating >= 1)
        and (food_quality_rating <= 5)
      )
    )
  )
) TABLESPACE pg_default;

create index IF not exists customer_ratings_given_customer_id_idx on public.customer_ratings_given using btree (customer_id) TABLESPACE pg_default;

create index IF not exists customer_ratings_given_order_id_idx on public.customer_ratings_given using btree (order_id) TABLESPACE pg_default;

create index IF not exists customer_ratings_given_target_idx on public.customer_ratings_given using btree (target_type, target_id) TABLESPACE pg_default;

create index IF not exists customer_ratings_given_service_type_idx on public.customer_ratings_given using btree (service_type) TABLESPACE pg_default;

create index IF not exists customer_ratings_given_overall_rating_idx on public.customer_ratings_given using btree (overall_rating) TABLESPACE pg_default;

create index IF not exists customer_ratings_given_created_at_idx on public.customer_ratings_given using btree (created_at) TABLESPACE pg_default;

create index IF not exists customer_ratings_given_target_merchant_idx on public.customer_ratings_given using btree (target_type, target_id) TABLESPACE pg_default
where
  (target_type = 'MERCHANT'::text);

create index IF not exists customer_ratings_given_merchant_response_idx on public.customer_ratings_given using btree (merchant_responded_at) TABLESPACE pg_default
where
  (merchant_responded_at is not null);

create index IF not exists customer_ratings_given_is_flagged_idx on public.customer_ratings_given using btree (is_flagged) TABLESPACE pg_default
where
  (is_flagged = true);

create index IF not exists customer_ratings_given_merchant_rating_idx on public.customer_ratings_given using btree (
  target_type,
  target_id,
  overall_rating,
  created_at desc
) TABLESPACE pg_default
where
  (target_type = 'MERCHANT'::text);


create table if not exists public.customer_ratings_received (
  id bigserial not null,
  customer_id bigint not null,
  order_id bigint null,
  rider_id integer null,
  rating smallint not null,
  comment text null,
  behavior_rating smallint null,
  punctuality_rating smallint null,
  created_at timestamp with time zone not null default now(),
  constraint customer_ratings_received_pkey primary key (id),
  constraint customer_ratings_received_customer_id_fkey foreign KEY (customer_id) references customers (id) on delete CASCADE,
  constraint customer_ratings_received_order_id_fkey foreign KEY (order_id) references orders (id) on delete set null,
  constraint customer_ratings_received_rider_id_fkey foreign KEY (rider_id) references riders (id) on delete set null,
  constraint customer_ratings_received_behavior_rating_check check (
    (
      (behavior_rating >= 1)
      and (behavior_rating <= 5)
    )
  ),
  constraint customer_ratings_received_punctuality_rating_check check (
    (
      (punctuality_rating >= 1)
      and (punctuality_rating <= 5)
    )
  ),
  constraint customer_ratings_received_rating_check check (
    (
      (rating >= 1)
      and (rating <= 5)
    )
  )
) TABLESPACE pg_default;

create index IF not exists customer_ratings_received_customer_id_idx on public.customer_ratings_received using btree (customer_id) TABLESPACE pg_default;

create index IF not exists customer_ratings_received_order_id_idx on public.customer_ratings_received using btree (order_id) TABLESPACE pg_default;

create index IF not exists customer_ratings_received_rider_id_idx on public.customer_ratings_received using btree (rider_id) TABLESPACE pg_default
where
  (rider_id is not null);

create index IF not exists customer_ratings_received_rating_idx on public.customer_ratings_received using btree (rating) TABLESPACE pg_default;


create table if not exists public.order_ratings (
  id bigserial not null,
  order_id bigint not null,
  rider_id integer not null,
  rated_by text not null,
  rated_by_id integer null,
  rating smallint not null,
  comment text null,
  rating_categories jsonb null default '{}'::jsonb,
  created_at timestamp with time zone not null default now(),
  constraint order_ratings_pkey primary key (id),
  constraint order_ratings_order_id_fkey foreign KEY (order_id) references orders (id) on delete CASCADE,
  constraint order_ratings_rider_id_fkey foreign KEY (rider_id) references riders (id) on delete CASCADE,
  constraint order_ratings_rating_range check (
    (
      (rating >= 1)
      and (rating <= 5)
    )
  )
) TABLESPACE pg_default;

create index IF not exists order_ratings_order_id_idx on public.order_ratings using btree (order_id) TABLESPACE pg_default;

create index IF not exists order_ratings_rider_id_idx on public.order_ratings using btree (rider_id) TABLESPACE pg_default;

create index IF not exists order_ratings_rated_by_idx on public.order_ratings using btree (rated_by) TABLESPACE pg_default;

create index IF not exists order_ratings_created_at_idx on public.order_ratings using btree (created_at) TABLESPACE pg_default;

create index IF not exists order_ratings_rating_idx on public.order_ratings using btree (rating) TABLESPACE pg_default;

create index IF not exists order_ratings_rated_by_id_idx on public.order_ratings using btree (rated_by_id) TABLESPACE pg_default
where
  (rated_by_id is not null);

