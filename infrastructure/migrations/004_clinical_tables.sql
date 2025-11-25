-- Migration 004: Clinical Tables
-- Sprint 4 Phase 1A: Database Foundation
-- Date: 2025-11-24

-- Patients (clients receiving ABA therapy)
CREATE TABLE patients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  first_name text NOT NULL,
  last_name text NOT NULL,
  date_of_birth date NOT NULL,
  state text NOT NULL,
  primary_diagnosis_code text,
  guardian_name text,
  guardian_email text,
  guardian_phone text,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Indexes for patients
CREATE INDEX idx_patients_org ON patients(organization_id);
CREATE INDEX idx_patients_name ON patients(last_name, first_name);
CREATE INDEX idx_patients_active ON patients(organization_id, is_active);

-- Patient Insurance Information
CREATE TABLE patient_insurance (
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
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Indexes for patient_insurance
CREATE INDEX idx_insurance_patient ON patient_insurance(patient_id);
CREATE INDEX idx_insurance_active ON patient_insurance(patient_id, is_active);

-- Output confirmation
SELECT 'Clinical tables created successfully' AS status;
