-- Customer store bookmarks (customer app). customer_id = customers.id from main app DB (no FK; cross-DB).
-- Check: SELECT EXISTS (SELECT 1 FROM customer_store_bookmarks WHERE customer_id = :customer_id AND store_id = :store_id);

CREATE TABLE IF NOT EXISTS public.customer_store_bookmarks (
    id BIGSERIAL PRIMARY KEY,
    customer_id BIGINT NOT NULL,
    store_id BIGINT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now(),

    CONSTRAINT unique_customer_store UNIQUE (customer_id, store_id),
    CONSTRAINT fk_customer_store_bookmarks_store
        FOREIGN KEY (store_id)
        REFERENCES public.merchant_stores (id)
        ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS customer_store_bookmarks_customer_id_idx
    ON public.customer_store_bookmarks (customer_id);
CREATE INDEX IF NOT EXISTS customer_store_bookmarks_store_id_idx
    ON public.customer_store_bookmarks (store_id);

COMMENT ON TABLE public.customer_store_bookmarks IS 'Customer saved/favourite stores. customer_id = main app customers.id (numeric).';
