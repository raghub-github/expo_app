-- system_roles.role_type: store free-form text instead of system_user_role_type enum.
-- system_users.primary_role and other columns continue to use the enum.
-- created_by / updated_by already reference system_users(id); ensure they stay populated from the app on INSERT/UPDATE.

ALTER TABLE public.system_roles
  ALTER COLUMN role_type TYPE text USING (role_type::text);

COMMENT ON COLUMN public.system_roles.role_type IS 'Free-form category/label for this role row; not limited to system_user_role_type.';
COMMENT ON COLUMN public.system_roles.created_by IS 'system_users.id of the user who created this row.';
COMMENT ON COLUMN public.system_roles.updated_by IS 'system_users.id of the user who last updated this row.';
