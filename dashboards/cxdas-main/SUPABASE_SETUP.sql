-- Drop enum type if it exists (to avoid conflicts)
DROP TYPE IF EXISTS user_category_enum CASCADE;

-- Create enum type for user_category
CREATE TYPE user_category_enum AS ENUM ('food', 'parcel', 'person');

-- Create users table with all required fields
CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  user_number TEXT,
  email TEXT,
  user_category user_category_enum NOT NULL DEFAULT 'food',
  user_type TEXT DEFAULT 'STANDARD',
  gatimitra_status TEXT DEFAULT 'Not Active',
  referral_code TEXT,
  app_installed_with_referral INTEGER DEFAULT 0,
  account_status TEXT DEFAULT 'active',
  account_balance DECIMAL DEFAULT 0,
  account_creation_date TIMESTAMP WITH TIME ZONE,
  account_remark TEXT,
  device_id TEXT,
  phone_model TEXT,
  brand TEXT,
  app_download_date TIMESTAMP WITH TIME ZONE,
  sms_permission BOOLEAN DEFAULT false,
  score_actual INTEGER,
  score_predicted INTEGER,
  percentile INTEGER,
  user_cft_segment TEXT,
  approval_rate_bill INTEGER DEFAULT 0,
  total_transaction INTEGER DEFAULT 0,
  total_approved INTEGER DEFAULT 0,
  total_disapproved INTEGER DEFAULT 0,
  total_fraud INTEGER DEFAULT 0,
  total_grace INTEGER DEFAULT 0,
  total_pending INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- Insert dummy data
INSERT INTO users (user_id, name, user_number, email, user_category, user_type, gatimitra_status, referral_code, app_installed_with_referral, account_status, account_balance, account_creation_date, account_remark, device_id, phone_model, brand, app_download_date, sms_permission, score_actual, score_predicted, percentile, user_cft_segment, approval_rate_bill, total_transaction, total_approved, total_disapproved, total_fraud, total_grace, total_pending)
VALUES
  ('2978015', 'Pratap', '9191131943', 'bhimpratap08@gmail.com', 'food', 'STANDARD', 'Not Active', 'ONE4305', 0, 'active', 4590.31, '2022-02-09 02:37:00+00', 'PLEASE CLAIM A DEAL (WITH BILL) FIRST TO ACTIVATE YOUR GATIMITRA POINTS', '0edfa881lc389435', 'SM-A336E', 'samsung', '2022-06-26 14:36:52+00', false, -111, -299, 1520, 'HIGH', 0, 0, 0, 0, 0, 0, 0),
  ('2978016', 'Rajesh Kumar', '9876543210', 'rajesh.kumar@gmail.com', 'food', 'PREMIUM', 'Active', 'GATI2024', 5, 'active', 8500.50, '2023-01-15 10:20:00+00', 'Good standing member', '0edfa881lc389436', 'Pixel 7', 'google', '2023-01-15 10:20:00+00', true, 450, 480, 85, 'MEDIUM', 85, 42, 35, 5, 0, 2, 0),
  ('2978017', 'Neha Singh', '8765432109', 'neha.singh@outlook.com', 'parcel', 'STANDARD', 'Active', 'NEHE123', 2, 'active', 2300.75, '2023-06-22 15:45:00+00', 'New user verification pending', '0edfa881lc389437', 'iPhone 13', 'apple', '2023-06-22 15:45:00+00', true, 200, 220, 45, 'LOW', 60, 15, 9, 3, 0, 1, 2),
  ('2978018', 'Amit Patel', '7654321098', 'amit.patel@domain.com', 'parcel', 'PREMIUM', 'Not Active', 'AMIT456', 0, 'suspended', 1500.00, '2022-12-01 08:15:00+00', 'Account under review', '0edfa881lc389438', 'MI 12', 'xiaomi', '2022-12-01 08:15:00+00', false, -50, 0, 25, 'HIGH', 30, 8, 2, 4, 1, 0, 1),
  ('2978019', 'Priya Sharma', '9123456789', 'priya.sharma@gmail.com', 'person', 'STANDARD', 'Active', 'PRIYA789', 3, 'active', 5200.00, '2023-03-10 12:30:00+00', 'Active member with good history', '0edfa881lc389439', 'OnePlus 11', 'oneplus', '2023-03-10 12:30:00+00', true, 350, 380, 70, 'MEDIUM', 75, 28, 21, 4, 0, 2, 1);
