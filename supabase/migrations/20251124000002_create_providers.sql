-- Migration: Create providers table
-- Description: Stores RBTs, BCBAs, and administrative staff
-- Author: AI-assisted (Claude Code)
-- Date: 2025-11-24

-- UP Migration
CREATE TABLE IF NOT EXISTS providers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  email text UNIQUE NOT NULL,
  full_name text NOT NULL,
  role text NOT NULL CHECK (role IN ('RBT', 'BCBA', 'ADMIN')),
  npi text,
  credentials jsonb,
  created_at timestamptz DEFAULT now()
);

-- Add comments for documentation
COMMENT ON TABLE providers IS 'Healthcare providers (RBTs, BCBAs, admins) associated with organizations';
COMMENT ON COLUMN providers.id IS 'Primary key (UUID v4)';
COMMENT ON COLUMN providers.organization_id IS 'Foreign key to organizations table';
COMMENT ON COLUMN providers.email IS 'Unique email address for authentication';
COMMENT ON COLUMN providers.role IS 'Provider role: RBT (Registered Behavior Technician), BCBA (Board Certified Behavior Analyst), or ADMIN';
COMMENT ON COLUMN providers.npi IS 'National Provider Identifier for individual billing';
COMMENT ON COLUMN providers.credentials IS 'JSON object storing certifications, licenses, and expiration dates';

-- Create indexes for common queries
CREATE INDEX IF NOT EXISTS idx_providers_organization ON providers(organization_id);
CREATE INDEX IF NOT EXISTS idx_providers_email ON providers(email);
CREATE INDEX IF NOT EXISTS idx_providers_role ON providers(organization_id, role);

-- Enable Row Level Security
ALTER TABLE providers ENABLE ROW LEVEL SECURITY;

-- DOWN Migration (for rollback)
-- DROP TABLE IF EXISTS providers CASCADE;
