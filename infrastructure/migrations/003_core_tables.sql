-- Migration 003: Core Identity Tables
-- Sprint 4 Phase 1A: Database Foundation
-- Date: 2025-11-24

-- Organizations (multi-tenant root)
CREATE TABLE organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  tax_id text UNIQUE,
  npi text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Users (authentication and authorization)
-- Replaces Supabase Auth with custom authentication
CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  email text UNIQUE NOT NULL,
  password_hash text NOT NULL,
  full_name text NOT NULL,
  role text NOT NULL CHECK (role IN ('RBT', 'BCBA', 'ADMIN')),
  npi text,
  credentials jsonb,
  is_active boolean DEFAULT true,
  last_login_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Indexes for users
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_org ON users(organization_id);
CREATE INDEX idx_users_role ON users(role) WHERE is_active = true;

-- Staff Members (clinical staff with licensing info)
-- Separate from users to allow one user to have multiple staff roles
CREATE TABLE staff_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  npi text,
  license_number text,
  license_state text,
  license_expiration date,
  credentials jsonb,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Indexes for staff_members
CREATE INDEX idx_staff_user ON staff_members(user_id);
CREATE INDEX idx_staff_org ON staff_members(organization_id);

-- Output confirmation
SELECT 'Core tables created successfully' AS status;
