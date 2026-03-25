-- user_app_category: display_order + full FOOD sheet seed (three reference grids combined).
-- Lower display_order appears first in the app. Replaces all FOOD rows for a clean one-shot seed.

ALTER TABLE public.user_app_category
  ADD COLUMN IF NOT EXISTS display_order INTEGER NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.user_app_category.display_order IS
  'Ascending sort in customer app (1 first).';

CREATE INDEX IF NOT EXISTS user_app_category_store_display_idx
  ON public.user_app_category (store_type, display_order, id)
  WHERE status = 'active';

-- Replace FOOD vertical only (rerun-safe for this migration’s seed list).
DELETE FROM public.user_app_category
WHERE store_type = 'FOOD'::store_type;

INSERT INTO public.user_app_category (name, image_url, store_type, status, display_order)
VALUES
  -- Grid A (16)
  ('Cheesecake', NULL, 'FOOD', 'active', 1),
  ('Shake', NULL, 'FOOD', 'active', 2),
  ('Patty', NULL, 'FOOD', 'active', 3),
  ('South Indian', NULL, 'FOOD', 'active', 4),
  ('Asian', NULL, 'FOOD', 'active', 5),
  ('Tea', NULL, 'FOOD', 'active', 6),
  ('Poha', NULL, 'FOOD', 'active', 7),
  ('Vada', NULL, 'FOOD', 'active', 8),
  ('Falooda', NULL, 'FOOD', 'active', 9),
  ('Kheer', NULL, 'FOOD', 'active', 10),
  ('Mushroom Masala', NULL, 'FOOD', 'active', 11),
  ('Paneer Pakoda', NULL, 'FOOD', 'active', 12),
  ('Pancake', NULL, 'FOOD', 'active', 13),
  ('Mousse', NULL, 'FOOD', 'active', 14),
  ('Sabudana Khichdi', NULL, 'FOOD', 'active', 15),
  ('Mutton Handi', NULL, 'FOOD', 'active', 16),
  -- Grid B (28)
  ('Biryani', NULL, 'FOOD', 'active', 17),
  ('Pizza', NULL, 'FOOD', 'active', 18),
  ('Chicken', NULL, 'FOOD', 'active', 19),
  ('Hyderabadi', NULL, 'FOOD', 'active', 20),
  ('Chilli Chicken', NULL, 'FOOD', 'active', 21),
  ('Mutton', NULL, 'FOOD', 'active', 22),
  ('Fried Rice', NULL, 'FOOD', 'active', 23),
  ('Cake', NULL, 'FOOD', 'active', 24),
  ('Chicken Biryani', NULL, 'FOOD', 'active', 25),
  ('Paneer', NULL, 'FOOD', 'active', 26),
  ('Burger', NULL, 'FOOD', 'active', 27),
  ('North Indian', NULL, 'FOOD', 'active', 28),
  ('Chinese', NULL, 'FOOD', 'active', 29),
  ('Thali', NULL, 'FOOD', 'active', 30),
  ('Chicken Fried Rice', NULL, 'FOOD', 'active', 31),
  ('Mutton Curries', NULL, 'FOOD', 'active', 32),
  ('Chicken Lollipop', NULL, 'FOOD', 'active', 33),
  ('Chicken Curries', NULL, 'FOOD', 'active', 34),
  ('Rolls', NULL, 'FOOD', 'active', 35),
  ('Noodles', NULL, 'FOOD', 'active', 36),
  ('Rice', NULL, 'FOOD', 'active', 37),
  ('Butter Chicken', NULL, 'FOOD', 'active', 38),
  ('Tandoori Chicken', NULL, 'FOOD', 'active', 39),
  ('Veg Meal', NULL, 'FOOD', 'active', 40),
  ('Momos', NULL, 'FOOD', 'active', 41),
  ('Egg Curries', NULL, 'FOOD', 'active', 42),
  ('Sandwich', NULL, 'FOOD', 'active', 43),
  ('Wings', NULL, 'FOOD', 'active', 44),
  -- Grid C (28)
  ('Waffles', NULL, 'FOOD', 'active', 45),
  ('Chilli Paneer', NULL, 'FOOD', 'active', 46),
  ('Manchurian', NULL, 'FOOD', 'active', 47),
  ('Fish Curries', NULL, 'FOOD', 'active', 48),
  ('Sweets', NULL, 'FOOD', 'active', 49),
  ('Chicken 65', NULL, 'FOOD', 'active', 50),
  ('Dosa', NULL, 'FOOD', 'active', 51),
  ('Desserts', NULL, 'FOOD', 'active', 52),
  ('Chicken Bowl', NULL, 'FOOD', 'active', 53),
  ('Paneer Butter Masala', NULL, 'FOOD', 'active', 54),
  ('Non Veg Meal', NULL, 'FOOD', 'active', 55),
  ('Pasta', NULL, 'FOOD', 'active', 56),
  ('Rasmalai', NULL, 'FOOD', 'active', 57),
  ('Ice Cream', NULL, 'FOOD', 'active', 58),
  ('Italian', NULL, 'FOOD', 'active', 59),
  ('Fries', NULL, 'FOOD', 'active', 60),
  ('Tacos', NULL, 'FOOD', 'active', 61),
  ('Bowl', NULL, 'FOOD', 'active', 62),
  ('Chole Bhature', NULL, 'FOOD', 'active', 63),
  ('Paratha', NULL, 'FOOD', 'active', 64),
  ('White Sauce Pasta', NULL, 'FOOD', 'active', 65),
  ('Rasgulla', NULL, 'FOOD', 'active', 66),
  ('Milkshake', NULL, 'FOOD', 'active', 67),
  ('Paneer Biryani', NULL, 'FOOD', 'active', 68),
  ('Kebabs', NULL, 'FOOD', 'active', 69),
  ('Paneer Tikka', NULL, 'FOOD', 'active', 70),
  ('Cold Coffee', NULL, 'FOOD', 'active', 71),
  ('Sundae', NULL, 'FOOD', 'active', 72);
