-- GatiMitra Database Schema for Supabase
-- Run this SQL in your Supabase SQL Editor

-- Users table
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  password TEXT NOT NULL,
  name TEXT,
  role TEXT NOT NULL CHECK (role IN ('super_admin', 'admin', 'agent')),
  "isApproved" BOOLEAN DEFAULT false,
  "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  "updatedAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Agents table
CREATE TABLE IF NOT EXISTS agents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "agentId" TEXT UNIQUE NOT NULL,
  email TEXT UNIQUE NOT NULL,
  password TEXT NOT NULL,
  name TEXT,
  "isActive" BOOLEAN DEFAULT true,
  "isApproved" BOOLEAN DEFAULT false,
  "createdBy" UUID REFERENCES users(id),
  "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  "updatedAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Roles table
CREATE TABLE IF NOT EXISTS roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT UNIQUE NOT NULL CHECK (name IN ('super_admin', 'admin', 'agent')),
  description TEXT,
  "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Permissions table
CREATE TABLE IF NOT EXISTS permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "userId" UUID REFERENCES users(id) ON DELETE CASCADE,
  "canAccessOrders" BOOLEAN DEFAULT false,
  "canCreateRefund" BOOLEAN DEFAULT false,
  "canAccessCancellation" BOOLEAN DEFAULT false,
  "canManageAgents" BOOLEAN DEFAULT false,
  "canManageDepartments" BOOLEAN DEFAULT false,
  "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  "updatedAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE("userId")
);

-- Departments table
CREATE TABLE IF NOT EXISTS departments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT UNIQUE NOT NULL CHECK (name IN ('food', 'parcel', 'person')),
  "isEnabled" BOOLEAN DEFAULT false,
  "enabledBy" UUID REFERENCES users(id),
  "enabledAt" TIMESTAMP WITH TIME ZONE,
  "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  "updatedAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Orders table
CREATE TABLE IF NOT EXISTS orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "orderId" TEXT NOT NULL,
  action TEXT,
  "routedTo" TEXT,
  "orderTime" TEXT,
  "updatedTime" TEXT,
  "customerName" TEXT,
  "customerMobile" TEXT,
  "merchantId" TEXT,
  "merchantMobile" TEXT,
  "merchantLocality" TEXT,
  "deliveryProvider" TEXT,
  status TEXT CHECK (status IN ('PAYMENT DONE', 'ACCEPTED', 'DESPATCH READY', 'DESPATCHED')),
  category TEXT CHECK (category IN ('Food', 'Fashion', 'Grocery', 'Pharma', 'Pickup')),
  "deliveryType" TEXT CHECK ("deliveryType" IN ('GatiMitra', 'Merchant')),
  "userType" TEXT CHECK ("userType" IN ('Premium', 'Very Good', 'Good', 'Bad')),
  "userId" UUID REFERENCES users(id),
  department TEXT CHECK (department IN ('food', 'parcel', 'person')),
  "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  "updatedAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Refunds table
CREATE TABLE IF NOT EXISTS refunds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "orderId" TEXT NOT NULL,
  amount DECIMAL(10, 2) NOT NULL,
  reason TEXT,
  status TEXT CHECK (status IN ('pending', 'approved', 'rejected')) DEFAULT 'pending',
  "createdBy" UUID REFERENCES users(id),
  "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  "updatedAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Cancellations table
CREATE TABLE IF NOT EXISTS cancellations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "orderId" TEXT NOT NULL,
  reason TEXT,
  status TEXT CHECK (status IN ('pending', 'approved', 'rejected')) DEFAULT 'pending',
  "createdBy" UUID REFERENCES users(id),
  "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  "updatedAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Insert default roles
INSERT INTO roles (name, description) VALUES
  ('super_admin', 'Super Administrator with full access'),
  ('admin', 'Administrator with management access'),
  ('agent', 'Agent with limited access')
ON CONFLICT (name) DO NOTHING;

-- Insert default departments
INSERT INTO departments (name, "isEnabled") VALUES
  ('food', false),
  ('parcel', false),
  ('person', false)
ON CONFLICT (name) DO NOTHING;

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_agents_agentId ON agents("agentId");
CREATE INDEX IF NOT EXISTS idx_agents_email ON agents(email);
CREATE INDEX IF NOT EXISTS idx_orders_orderId ON orders("orderId");
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_department ON orders(department);
CREATE INDEX IF NOT EXISTS idx_permissions_userId ON permissions("userId");

-- Insert sample orders data
INSERT INTO orders ("orderId", action, "routedTo", "orderTime", "updatedTime", "customerName", "customerMobile", "merchantId", "merchantMobile", "merchantLocality", "deliveryProvider", status, category, "deliveryType", "userType", department) VALUES
  ('GM1001', 'Check With the Store & DE', 'bhimpratap@gatimitra.in', '18:12:25 02:17 PM', '18:12:25 02:18 PM', 'Bhim Pratap', '9113194305', '7433577', '91790251003', 'Panipat City', 'SHIPROCKET_DIRECT', 'ACCEPTED', 'Food', 'GatiMitra', 'Premium', 'food'),
  ('GM1011', 'Verify Payment', 'raghubhunia@gatimitra.in', '18:12:25 11:30 AM', '18:12:25 11:35 AM', 'Rahul Sharma', '9876543210', '8899002', '91998877664', 'South Delhi', 'GATIMITRA_DIRECT', 'PAYMENT DONE', 'Food', 'Merchant', 'Very Good', 'food'),
  ('GM1021', 'Prepare Order', 'davidwilson@gatimitra.in', '18:12:25 03:45 PM', '18:12:25 03:50 PM', 'Priya Patel', '8765432109', '3344557', '91988776654', 'West Mumbai', 'DELHIVERY', 'DESPATCH READY', 'Food', 'GatiMitra', 'Good', 'food'),
  ('GM1031', 'Dispatch Order', 'roberttaylor@gatimitra.in', '18:12:25 05:20 PM', '18:12:25 05:25 PM', 'Ankit Verma', '7654321098', '4455668', '91977665543', 'East Bangalore', 'BLUEDART', 'DESPATCHED', 'Food', 'Merchant', 'Bad', 'food'),
  ('GM1002', 'Check With the Store & DE', 'raghubhunia@gatimitra.in', '18:12:25 02:28 PM', '18:12:25 02:28 PM', 'Sembak Kharka', '91600649431', '1772577', '+91970204534', 'Shawman Corner', 'PIDGE_DIRECT', 'ACCEPTED', 'Fashion', 'Merchant', 'Very Good', 'parcel'),
  ('GM1012', 'Process Payment', 'jenniferlee@gatimitra.in', '18:12:25 10:15 AM', '18:12:25 10:20 AM', 'Neha Gupta', '9123456789', '6677889', '91966554432', 'Central Kolkata', 'MERCHANT_DIRECT', 'PAYMENT DONE', 'Fashion', 'GatiMitra', 'Premium', 'parcel'),
  ('GM1003', 'Check With the Store & DE', 'christopherwhite@gatimitra.in', '18:12:25 02:42 PM', '18:12:25 02:42 PM', 'Babesh Cherry', '91984259849', '7660072', '91967604384', 'HITTO BA-GABA & BIRYAN', 'ONDC_LOGISTICS_BLYER_KETA', 'PAYMENT DONE', 'Grocery', 'GatiMitra', 'Good', 'food'),
  ('GM1013', 'Stock Check', 'swekshashree@gatimitra.in', '18:12:25 09:00 AM', '18:12:25 09:05 AM', 'Vikram Singh', '9456789012', '9900112', '91933221100', 'Pune Suburban', 'GATIMITRA_DIRECT', 'ACCEPTED', 'Grocery', 'Merchant', 'Premium', 'food')
ON CONFLICT DO NOTHING;

