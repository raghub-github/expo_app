DELETE FROM public.notification_templates
WHERE code LIKE 'ADMIN_CX_%' AND locale = 'en';

DELETE FROM public.notification_settings
WHERE key = 'admin_cx_template_labels';
