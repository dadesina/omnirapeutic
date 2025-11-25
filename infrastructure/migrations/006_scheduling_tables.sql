-- Migration 006: Scheduling Tables
-- Sprint 4 Phase 1A: Database Foundation
-- Date: 2025-11-24

-- Appointments (scheduled therapy sessions)
CREATE TABLE appointments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  patient_id uuid NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  provider_id uuid REFERENCES staff_members(id) ON DELETE SET NULL,
  authorization_id uuid REFERENCES authorizations(id) ON DELETE SET NULL,
  service_code text NOT NULL,
  start_time timestamptz NOT NULL,
  end_time timestamptz NOT NULL,
  status text NOT NULL CHECK (status IN ('SCHEDULED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'NO_SHOW')),
  location text CHECK (location IN ('HOME', 'CLINIC', 'SCHOOL', 'TELEHEALTH')),
  recurrence_rule text,
  notes text,

  -- Ensure time validity
  CONSTRAINT valid_time_range CHECK (end_time > start_time),

  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Indexes for appointments (critical for conflict detection)
CREATE INDEX idx_appointments_provider_time ON appointments(provider_id, start_time, end_time)
  WHERE status IN ('SCHEDULED', 'IN_PROGRESS');
CREATE INDEX idx_appointments_patient_time ON appointments(patient_id, start_time, end_time)
  WHERE status IN ('SCHEDULED', 'IN_PROGRESS');
CREATE INDEX idx_appointments_org ON appointments(organization_id, start_time);

-- Output confirmation
SELECT 'Scheduling tables created successfully' AS status;
