-- Migration 005: Authorization Tables
-- Sprint 4 Phase 1A: Database Foundation
-- Date: 2025-11-24

-- Authorizations (insurance-approved units)
-- Critical: Handles unit tracking with atomic operations
CREATE TABLE authorizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id uuid NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  insurance_id uuid REFERENCES patient_insurance(id) ON DELETE SET NULL,
  service_code text NOT NULL,
  total_units integer NOT NULL CHECK (total_units > 0),
  used_units integer DEFAULT 0 CHECK (used_units >= 0),
  start_date date NOT NULL,
  end_date date NOT NULL,
  status text NOT NULL CHECK (status IN ('ACTIVE', 'EXPIRED', 'EXHAUSTED', 'CANCELLED')),
  authorization_number text,

  -- Critical constraint: prevent negative balance
  CONSTRAINT positive_balance CHECK (total_units >= used_units),

  -- Ensure date validity
  CONSTRAINT valid_date_range CHECK (end_date >= start_date),

  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Indexes for authorizations
CREATE INDEX idx_auth_patient_service ON authorizations(patient_id, service_code, status);
CREATE INDEX idx_auth_dates ON authorizations(start_date, end_date);
CREATE INDEX idx_auth_status ON authorizations(status) WHERE status = 'ACTIVE';

-- Output confirmation
SELECT 'Authorization tables created successfully' AS status;
