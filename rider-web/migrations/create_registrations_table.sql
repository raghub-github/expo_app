-- Create registrations table for Supabase PostgreSQL
-- Run this migration in your Supabase SQL editor or via psql

CREATE TABLE IF NOT EXISTS gatimitra_registrations (
  id SERIAL PRIMARY KEY,
  rider_name VARCHAR(255) NOT NULL,
  phone VARCHAR(50) NOT NULL,
  email VARCHAR(255) NOT NULL,
  location VARCHAR(500) NOT NULL,
  city VARCHAR(255) NOT NULL,
  message TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  status VARCHAR(50) DEFAULT 'pending' NOT NULL
);

-- Create index on email for faster lookups
CREATE INDEX IF NOT EXISTS registrations_email_idx ON gatimitra_registrations(email);

-- Create index on status for filtering
CREATE INDEX IF NOT EXISTS registrations_status_idx ON gatimitra_registrations(status);

-- Create index on created_at for sorting
CREATE INDEX IF NOT EXISTS registrations_created_at_idx ON gatimitra_registrations(created_at DESC);

-- Add comment to table
COMMENT ON TABLE gatimitra_registrations IS 'Partner registration applications from contact form';


