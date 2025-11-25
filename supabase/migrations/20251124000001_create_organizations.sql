-- Migration: Create organizations table
-- Description: Multi-tenant root table for clinic organizations
-- Author: AI-assisted (Claude Code)
-- Date: 2025-11-24

-- UP Migration
CREATE TABLE IF NOT EXISTS organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  tax_id text UNIQUE,
  npi text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Add comments for documentation
COMMENT ON TABLE organizations IS 'Multi-tenant root table containing clinic organizations';
COMMENT ON COLUMN organizations.id IS 'Primary key (UUID v4)';
COMMENT ON COLUMN organizations.name IS 'Legal name of the organization';
COMMENT ON COLUMN organizations.tax_id IS 'Employer Identification Number (EIN) - unique per organization';
COMMENT ON COLUMN organizations.npi IS 'National Provider Identifier for billing';

-- Create index for common queries
CREATE INDEX IF NOT EXISTS idx_organizations_tax_id ON organizations(tax_id) WHERE tax_id IS NOT NULL;

-- Enable Row Level Security (will be configured in separate migration)
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;

-- DOWN Migration (for rollback)
-- DROP TABLE IF EXISTS organizations CASCADE;
