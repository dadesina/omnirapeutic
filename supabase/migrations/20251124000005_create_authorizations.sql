-- Migration: Create authorizations table
-- Description: Stores insurance authorizations for ABA services with unit tracking
-- Author: AI-assisted (Claude Code)
-- Date: 2025-11-24

-- UP Migration
CREATE TABLE IF NOT EXISTS authorizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id uuid NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  insurance_id uuid REFERENCES patient_insurance(id),
  service_code text NOT NULL,
  total_units integer NOT NULL CHECK (total_units > 0),
  used_units integer DEFAULT 0 CHECK (used_units >= 0),
  start_date date NOT NULL,
  end_date date NOT NULL,
  status text CHECK (status IN ('ACTIVE', 'EXPIRED', 'EXHAUSTED')),
  authorization_number text,

  -- Critical constraint: prevent negative balance
  CONSTRAINT positive_balance CHECK (total_units >= used_units),

  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Add comments for documentation
COMMENT ON TABLE authorizations IS 'Insurance authorizations for ABA services with unit tracking (critical for billing compliance)';
COMMENT ON COLUMN authorizations.id IS 'Primary key (UUID v4)';
COMMENT ON COLUMN authorizations.patient_id IS 'Foreign key to patients table';
COMMENT ON COLUMN authorizations.insurance_id IS 'Foreign key to patient_insurance table';
COMMENT ON COLUMN authorizations.service_code IS 'CPT code for authorized service (97153, 97155, 97156, etc.)';
COMMENT ON COLUMN authorizations.total_units IS 'Total units approved by insurance (must be positive)';
COMMENT ON COLUMN authorizations.used_units IS 'Units consumed by completed sessions (updated atomically)';
COMMENT ON COLUMN authorizations.start_date IS 'Authorization effective start date';
COMMENT ON COLUMN authorizations.end_date IS 'Authorization expiration date';
COMMENT ON COLUMN authorizations.status IS 'ACTIVE (in use), EXPIRED (past end_date), EXHAUSTED (used_units = total_units)';
COMMENT ON COLUMN authorizations.authorization_number IS 'Insurance-provided authorization reference number';

-- Create indexes for common queries and authorization lookups
CREATE INDEX IF NOT EXISTS idx_auth_patient_service ON authorizations(patient_id, service_code, status);
CREATE INDEX IF NOT EXISTS idx_auth_dates ON authorizations(start_date, end_date);
CREATE INDEX IF NOT EXISTS idx_auth_status ON authorizations(status) WHERE status = 'ACTIVE';

-- Enable Row Level Security
ALTER TABLE authorizations ENABLE ROW LEVEL SECURITY;

-- DOWN Migration (for rollback)
-- DROP TABLE IF EXISTS authorizations CASCADE;
