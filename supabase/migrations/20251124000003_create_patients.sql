-- Migration: Create patients table
-- Description: Stores patient demographic and clinical information (PHI)
-- Author: AI-assisted (Claude Code)
-- Date: 2025-11-24

-- UP Migration
CREATE TABLE IF NOT EXISTS patients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  first_name text NOT NULL,
  last_name text NOT NULL,
  date_of_birth date NOT NULL,
  state text NOT NULL,
  primary_diagnosis_code text,
  guardian_email text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Add comments for documentation
COMMENT ON TABLE patients IS 'Patient demographic and clinical information (contains PHI - Protected Health Information)';
COMMENT ON COLUMN patients.id IS 'Primary key (UUID v4)';
COMMENT ON COLUMN patients.organization_id IS 'Foreign key to organizations table for multi-tenant isolation';
COMMENT ON COLUMN patients.first_name IS 'Patient first name (PHI)';
COMMENT ON COLUMN patients.last_name IS 'Patient last name (PHI)';
COMMENT ON COLUMN patients.date_of_birth IS 'Patient date of birth (PHI)';
COMMENT ON COLUMN patients.state IS 'US state code (e.g., TX, CA) - determines billing rules';
COMMENT ON COLUMN patients.primary_diagnosis_code IS 'ICD-10 code (e.g., F84.0 for Autism Spectrum Disorder)';
COMMENT ON COLUMN patients.guardian_email IS 'Parent/guardian email for communications';

-- Create indexes for common queries
CREATE INDEX IF NOT EXISTS idx_patients_organization ON patients(organization_id);
CREATE INDEX IF NOT EXISTS idx_patients_state ON patients(organization_id, state);
CREATE INDEX IF NOT EXISTS idx_patients_name ON patients(organization_id, last_name, first_name);

-- Enable Row Level Security (HIPAA critical)
ALTER TABLE patients ENABLE ROW LEVEL SECURITY;

-- DOWN Migration (for rollback)
-- DROP TABLE IF EXISTS patients CASCADE;
