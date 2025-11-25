-- Migration: Create appointments table
-- Description: Stores scheduled appointments with conflict prevention
-- Author: AI-assisted (Claude Code)
-- Date: 2025-11-24

-- UP Migration
CREATE TABLE IF NOT EXISTS appointments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  patient_id uuid NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  provider_id uuid REFERENCES providers(id) ON DELETE SET NULL,
  authorization_id uuid REFERENCES authorizations(id),
  service_code text NOT NULL,
  start_time timestamptz NOT NULL,
  end_time timestamptz NOT NULL,
  status text CHECK (status IN ('SCHEDULED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'NO_SHOW')),
  location text CHECK (location IN ('HOME', 'CLINIC', 'SCHOOL', 'TELEHEALTH')),
  recurrence_rule text,
  created_at timestamptz DEFAULT now()
);

-- Add comments for documentation
COMMENT ON TABLE appointments IS 'Scheduled appointments with conflict prevention and recurrence support';
COMMENT ON COLUMN appointments.id IS 'Primary key (UUID v4)';
COMMENT ON COLUMN appointments.organization_id IS 'Foreign key to organizations table for multi-tenant isolation';
COMMENT ON COLUMN appointments.patient_id IS 'Foreign key to patients table';
COMMENT ON COLUMN appointments.provider_id IS 'Foreign key to providers table (nullable if provider unassigned)';
COMMENT ON COLUMN appointments.authorization_id IS 'Foreign key to authorizations table';
COMMENT ON COLUMN appointments.service_code IS 'CPT code (97153, 97155, 97156, etc.)';
COMMENT ON COLUMN appointments.start_time IS 'Appointment start time (with timezone)';
COMMENT ON COLUMN appointments.end_time IS 'Appointment end time (with timezone)';
COMMENT ON COLUMN appointments.status IS 'Current appointment status';
COMMENT ON COLUMN appointments.location IS 'Service delivery location (affects billing place of service code)';
COMMENT ON COLUMN appointments.recurrence_rule IS 'iCalendar RRULE format for recurring appointments';

-- Create indexes for conflict detection and calendar queries
CREATE INDEX IF NOT EXISTS idx_appointments_provider_time ON appointments(provider_id, start_time, end_time)
  WHERE status IN ('SCHEDULED', 'IN_PROGRESS');
CREATE INDEX IF NOT EXISTS idx_appointments_patient_time ON appointments(patient_id, start_time, end_time)
  WHERE status IN ('SCHEDULED', 'IN_PROGRESS');
CREATE INDEX IF NOT EXISTS idx_appointments_organization_time ON appointments(organization_id, start_time);

-- Enable Row Level Security
ALTER TABLE appointments ENABLE ROW LEVEL SECURITY;

-- DOWN Migration (for rollback)
-- DROP TABLE IF EXISTS appointments CASCADE;
