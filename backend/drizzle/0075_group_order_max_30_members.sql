-- Enforce max 30 members per group order. Reject new member when count >= 30.
CREATE OR REPLACE FUNCTION public.check_group_order_member_limit()
RETURNS TRIGGER AS $$
DECLARE
  member_count integer;
BEGIN
  SELECT COUNT(*) INTO member_count
  FROM public.group_order_members
  WHERE group_order_id = NEW.group_order_id;
  IF member_count >= 30 THEN
    RAISE EXCEPTION 'Group limit reached (30 members max)'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS group_order_members_max_30 ON public.group_order_members;
CREATE TRIGGER group_order_members_max_30
  BEFORE INSERT ON public.group_order_members
  FOR EACH ROW EXECUTE FUNCTION public.check_group_order_member_limit();

COMMENT ON FUNCTION public.check_group_order_member_limit() IS 'Reject insert when group_order_members count for this group_order_id >= 30.';
