-- Admin dashboard: cancellation without customer refund (cancel_without_refund flow).
INSERT INTO public.order_cancellation_reason_catalog (attribute, label, reason_code, sort_order, channel, service_type)
VALUES ('OTHER', 'Cancelled without refund', 'cancelled_without_refund', 72, 'web', NULL)
ON CONFLICT (channel, attribute, label) DO NOTHING;
