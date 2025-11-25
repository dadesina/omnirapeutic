-- Migration: Create patient_insurance table
-- Description: Stores insurance information and eligibility verification data
-- Author: AI-assisted (Claude Code)
-- Date: 2025-11-24

-- UP Migration
CREATE TABLE IF NOT EXISTS patient_insurance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id uuid NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  payer_name text NOT NULL,
  payer_id text,
  member_id text NOT NULL,
  group_number text,
  plan_name text,
  effective_date date,
  termination_date date,
  is_active boolean DEFAULT true,
  eligibility_verification jsonb,
  last_verified_at timestamptz,
  created_at timestamptz DEFAULT now()
);

-- Add comments for documentation
COMMENT ON TABLE patient_insurance IS 'Patient insurance information and eligibility verification records';
COMMENT ON COLUMN patient_insurance.id IS 'Primary key (UUID v4)';
COMMENT ON COLUMN patient_insurance.patient_id IS 'Foreign key to patients table';
COMMENT ON COLUMN patient_insurance.payer_name IS 'Insurance company name (e.g., Medicaid Texas, BCBS California)';
COMMENT ON COLUMN patient_insurance.payer_id IS 'EDI payer identifier for claims submission';
COMMENT ON COLUMN patient_insurance.member_id IS 'Insurance member/subscriber ID';
COMMENT ON COLUMN patient_insurance.group_number IS 'Insurance group number (if applicable)';
COMMENT ON COLUMN patient_insurance.plan_name IS 'Specific plan name (e.g., STAR Health, HMO Gold)';
COMMENT ON COLUMN patient_insurance.effective_date IS 'Coverage start date';
COMMENT ON COLUMN patient_insurance.termination_date IS 'Coverage end date (if terminated)';
COMMENT ON COLUMN patient_insurance.is_active IS 'Whether this is the currently active insurance';
COMMENT ON COLUMN patient_insurance.eligibility_verification IS 'JSON object storing manual eligibility check results';
COMMENT ON COLUMN patient_insurance.last_verified_at IS 'Timestamp of most recent eligibility verification';

-- Create indexes for common queries
CREATE INDEX IF NOT EXISTS idx_insurance_patient ON patient_insurance(patient_id);
CREATE INDEX IF NOT EXISTS idx_insurance_active ON patient_insurance(patient_id, is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_insurance_payer ON patient_insurance(payer_id);

-- Enable Row Level Security
ALTER TABLE patient_insurance ENABLE ROW LEVEL SECURITY;

-- DOWN Migration (for rollback)
-- DROP TABLE IF EXISTS patient_insurance CASCADE;
